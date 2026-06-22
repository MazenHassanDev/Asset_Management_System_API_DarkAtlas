from django.db import IntegrityError
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status
from drf_spectacular.utils import extend_schema, OpenApiResponse, OpenApiParameter
from drf_spectacular.types import OpenApiTypes

from core.pagination import StandardPagination
from tenants.permissions import HasOrganization
from .models import Asset
from .serializers import AssetSerializer
# Create your views here.

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
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    try:
        # Org comes from the API key, never from the request body.
        serializer.save(organization=request.organization)
    except IntegrityError:
        return Response(
            {'message': 'An asset with this type and value already exists for your organization.'},
            status=status.HTTP_409_CONFLICT,
        )
    return Response(serializer.data, status=status.HTTP_201_CREATED)

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
        return Response({'message': 'Asset not found.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        serializer = AssetSerializer(asset)
        return Response(serializer.data, status=status.HTTP_200_OK)

    if request.method in ['PUT', 'PATCH']:
        partial = request.method == 'PATCH'
        serializer = AssetSerializer(asset, data=request.data, partial=partial)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            serializer.save()
        except IntegrityError:
            return Response(
                {'message': 'An asset with this type and value already exists for your organization.'},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(serializer.data, status=status.HTTP_200_OK)

    if request.method == 'DELETE':
        asset.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
