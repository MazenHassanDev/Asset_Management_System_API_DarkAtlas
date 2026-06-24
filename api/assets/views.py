import uuid

from django.db import IntegrityError
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from drf_spectacular.utils import extend_schema, OpenApiResponse, OpenApiParameter
from drf_spectacular.types import OpenApiTypes

from core.exceptions import Conflict
from core.pagination import StandardPagination
from tenants.permissions import HasOrganization
from .models import Asset, RejectedRecord, Relationship
from .serializers import AssetSerializer, RejectedRecordSerializer, RelationshipSerializer
from .services.ingest import ingest

# -------------------------------------------------
#                ASSET API VIEWS
# -------------------------------------------------


# List assets with filtering, ordering and pagination.
# -------------------------------------------------
DUPLICATE_MESSAGE = "An asset with this type and value already exists for your organization."

@extend_schema(
    parameters=[
        OpenApiParameter("type", OpenApiTypes.STR, description="Filter by asset type (domain, subdomain, ip_address, service, certificate, technology)."),
        OpenApiParameter("status", OpenApiTypes.STR, description="Filter by status (active, stale, archived)."),
        OpenApiParameter("tag", OpenApiTypes.STR, description="Return only assets carrying this tag."),
        OpenApiParameter("value", OpenApiTypes.STR, description="Case-insensitive partial match on the asset value."),
        OpenApiParameter("ordering", OpenApiTypes.STR, description="Sort field: one of last_seen, -last_seen, first_seen, -first_seen, value, -value (default -last_seen)."),
        OpenApiParameter("page", OpenApiTypes.INT, description="1-based page number."),
        OpenApiParameter("page_size", OpenApiTypes.INT, description="Items per page (default 20, max 100)."),
    ],
    responses={200: AssetSerializer(many=True)},
    description="List the caller's organization assets with filtering, ordering and pagination.",
)
@api_view(['GET'])
@permission_classes([HasOrganization])
def list_assets(request):
    # Tenant scope (get this org's assets only)
    queryset = Asset.objects.filter(organization=request.organization)

    # Filter: type
    asset_type = request.GET.get('type')
    if asset_type:
        queryset = queryset.filter(type=asset_type)

    # Filter: status
    asset_status = request.GET.get('status')
    if asset_status:
        queryset = queryset.filter(status=asset_status)

    # Filter: tag
    asset_tag = request.GET.get('tag')
    if asset_tag:
        queryset = queryset.filter(tags__contains=[asset_tag])

    # Filter: contains value (partial match)
    asset_value = request.GET.get('value')
    if asset_value:
        queryset = queryset.filter(value__icontains=asset_value)

    # Sorting
    ordering = request.GET.get('ordering', '-last_seen')
    allowed_ordering = {'last_seen', '-last_seen', 'first_seen', '-first_seen', 'value', '-value'}
    if ordering in allowed_ordering:
        queryset = queryset.order_by(ordering)
    else:
        queryset = queryset.order_by('-last_seen')

    # Pagination (default 20/page, client may override via ?page_size=, capped at max_page_size)
    paginator = StandardPagination()
    asset_page = paginator.paginate_queryset(queryset, request)
    serializer = AssetSerializer(asset_page, many=True)
    return paginator.get_paginated_response(serializer.data)


# Import a batch of asset records. Each record is validated and either created or merged with an existing asset.
# -------------------------------------------------
@extend_schema(
    request=AssetSerializer(many=True),
    responses={200: OpenApiResponse(description="Ingest summary"),
                400: OpenApiResponse(description="Validation error"),
    },
    description="Ingest a batch of asset records. Each record is validated and either created or merged with an existing asset. Returns a summary of the operation.",
)
@api_view(['POST'])
@permission_classes([HasOrganization])
def import_assets(request):
    records = request.data
    if not isinstance(records, list):
        raise ValidationError("Request body must be a JSON array of asset records.")
    
    summary = ingest(request.organization, records)
    return Response(summary, status=status.HTTP_200_OK)


# Create a new single asset for the caller's organization. Returns 409 if an asset with the same type/value already exists.
# -------------------------------------------------
@extend_schema(
        request=AssetSerializer,
        responses={
            201: AssetSerializer,
            400: OpenApiResponse(description="Validation error"),
            409: OpenApiResponse(description="Asset with this type/value already exists for this organization"),
        },
        description="Create a new asset for the caller's organization."
)
@api_view(['POST'])
@permission_classes([HasOrganization])
def create_asset(request):
    serializer = AssetSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        # Org comes from the API key, never from the request body.
        serializer.save(organization=request.organization)
    except IntegrityError:
        raise Conflict(DUPLICATE_MESSAGE)
    return Response(serializer.data, status=status.HTTP_201_CREATED)

# Retrieve, replace (PUT), partially update (PATCH) or delete a single asset owned by the caller's organization.
# -------------------------------------------------
@extend_schema(
    request=AssetSerializer,
    responses={
        200: AssetSerializer,
        204: OpenApiResponse(description="Deleted."),
        404: OpenApiResponse(description="No such asset in your organization."),
        409: OpenApiResponse(description="Update would collide with an existing asset (type/value)."),
    },
    description="Retrieve, replace (PUT), partially update (PATCH) or delete a single asset "
                "owned by the caller's organization. Returns 404 if the asset belongs to another org.",
)
@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
@permission_classes([HasOrganization])
def asset_detail(request, pk):
    # Look up is locked to org's scope: calling an asset outside the org will 404, not 403 for security purposes.
    try:
        asset = Asset.objects.get(pk=pk, organization=request.organization)
    except Asset.DoesNotExist:
        raise NotFound("Asset not found.")

    if request.method == 'GET':
        serializer = AssetSerializer(asset)
        return Response(serializer.data, status=status.HTTP_200_OK)

    if request.method in ['PUT', 'PATCH']:
        partial = request.method == 'PATCH'
        serializer = AssetSerializer(asset, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        try:
            serializer.save()
        except IntegrityError:
            raise Conflict(DUPLICATE_MESSAGE)
        return Response(serializer.data, status=status.HTTP_200_OK)

    if request.method == 'DELETE':
        asset.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# List the rejected (quarantined) rows from a single import batch, scoped to the caller's organization.
# -------------------------------------------------
@extend_schema(
    parameters=[
        OpenApiParameter("batch_id", OpenApiTypes.UUID, location=OpenApiParameter.PATH,
                         description="The import batch to inspect."),
        OpenApiParameter("page", OpenApiTypes.INT, description="1-based page number."),
        OpenApiParameter("page_size", OpenApiTypes.INT, description="Items per page (default 20, max 100)."),
    ],
    responses={
        200: RejectedRecordSerializer(many=True),
        404: OpenApiResponse(description="No such import batch for this organization."),
    },
    description="List the rejected (quarantined) rows from a single import batch, scoped to the caller's organization.",
)
@api_view(['GET'])
@permission_classes([HasOrganization])
def list_rejects(request, batch_id):
    # Tenant guard: filtering on org first means a foreign batch_id simply yields nothing.
    queryset = RejectedRecord.objects.filter(
        organization=request.organization, batch_id=batch_id
    )
    if not queryset.exists():
        raise NotFound("Import batch not found.")

    paginator = StandardPagination()
    page = paginator.paginate_queryset(queryset, request)
    serializer = RejectedRecordSerializer(page, many=True)
    return paginator.get_paginated_response(serializer.data)


# -------------------------------------------------
#                RELATIONSHIPS API VIEWS
# -------------------------------------------------

# GET lists relationships (optionally filtered by from_asset/to_asset, paginated);
# POST creates a relationship between two assets owned by the caller's organization.
# -------------------------------------------------
@extend_schema(
    methods=['POST'],
    request=RelationshipSerializer,
    responses={
        201: RelationshipSerializer,
        400: OpenApiResponse(description="Validation error, or a referenced asset does not exist in your organization."),
        409: OpenApiResponse(description="A relationship with this from_asset, to_asset and type already exists."),
    },
    description="Create a relationship between two assets owned by the caller's organization. "
                "Both assets must belong to the caller's org; cross-tenant links are rejected.",
)
@extend_schema(
    methods=['GET'],
    parameters=[
        OpenApiParameter("from_asset", OpenApiTypes.UUID, description="Filter by source asset id."),
        OpenApiParameter("to_asset", OpenApiTypes.UUID, description="Filter by target asset id."),
        OpenApiParameter("page", OpenApiTypes.INT, description="1-based page number."),
        OpenApiParameter("page_size", OpenApiTypes.INT, description="Items per page (default 20, max 100)."),
    ],
    responses={200: RelationshipSerializer(many=True)},
    description="List the caller's organization relationships, optionally filtered by from_asset / to_asset.",
)
@api_view(['GET', 'POST'])
@permission_classes([HasOrganization])
def relationships(request):
    if request.method == 'POST':
        relationship = RelationshipSerializer(data=request.data)
        relationship.is_valid(raise_exception=True)

        org_id = request.organization.id
        data = relationship.validated_data
        if data['from_asset'].organization_id != org_id or data['to_asset'].organization_id != org_id:
            raise ValidationError("Asset does not exist.")

        try:
            relationship.save(organization=request.organization)
        except IntegrityError:
            raise Conflict("A relationship with this from_asset, to_asset and type already exists for your organization.")
        return Response(relationship.data, status=status.HTTP_201_CREATED)

    # GET — list with optional filtering + pagination.
    queryset = Relationship.objects.filter(organization=request.organization)

    from_asset = request.GET.get('from_asset')
    if from_asset:
        try:
            uuid.UUID(from_asset)  # Validate UUID format
        except ValueError:
            raise ValidationError("from_asset must be a valid UUID.")
        queryset = queryset.filter(from_asset=from_asset)

    to_asset = request.GET.get('to_asset')
    if to_asset:
        try:
            uuid.UUID(to_asset)  # Validate UUID format
        except ValueError:
            raise ValidationError("to_asset must be a valid UUID.")
        queryset = queryset.filter(to_asset=to_asset)

    paginator = StandardPagination()
    page = paginator.paginate_queryset(queryset, request)
    serializer = RelationshipSerializer(page, many=True)
    return paginator.get_paginated_response(serializer.data)

# Retrieve the relationships of a specific asset, including both outgoing and incoming relationships, with details about the related assets.
# -------------------------------------------------
@extend_schema(
    responses={
        200: OpenApiResponse(description="The asset together with its related assets — both outgoing and "
                                         "incoming neighbors, each tagged with relationship_type and direction."),
        404: OpenApiResponse(description="No such asset in your organization."),
    },
    description="Retrieve a single asset (owned by the caller's organization) together with its 1-hop "
                "relationship graph: incoming and outgoing neighbors.",
)
@api_view(['GET'])
@permission_classes([HasOrganization])
def asset_relationships_detail(request, pk):
    try:
        asset = Asset.objects.get(pk=pk, organization=request.organization)
    except Asset.DoesNotExist:
        raise NotFound("Asset not found.")
    
    outgoing = Relationship.objects.filter(from_asset=asset, organization=request.organization).select_related('to_asset')
    incoming = Relationship.objects.filter(to_asset=asset, organization=request.organization).select_related('from_asset')

    related_assets = []

    for rel in outgoing:
        related_assets.append({
            'asset': AssetSerializer(rel.to_asset).data,
            'relationship_type': rel.relationship_type,
            'direction': 'outgoing'
        })

    for rel in incoming:
        related_assets.append({
            'asset': AssetSerializer(rel.from_asset).data,
            'relationship_type': rel.relationship_type,
            'direction': 'incoming'
        })
    
    return Response({'asset': AssetSerializer(asset).data, 'related_assets': related_assets}, status=status.HTTP_200_OK)

# Delete an exisiting relationship per org, return 404 if not found.
# -------------------------------------------------
@extend_schema(
      responses={204: OpenApiResponse(description="Deleted."),
                 404: OpenApiResponse(description="No such relationship in your organization.")},
      description="Delete a relationship owned by the caller's organization.",
)
@api_view(['DELETE'])
@permission_classes([HasOrganization])
def delete_relationship(request, pk):
    try:
        relationship = Relationship.objects.get(pk=pk, organization=request.organization)
    except Relationship.DoesNotExist:
        raise NotFound("Relationship not found.")
    
    relationship.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
     