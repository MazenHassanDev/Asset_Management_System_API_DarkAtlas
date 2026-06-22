from django.db import IntegrityError
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from drf_spectacular.utils import extend_schema, OpenApiResponse

from tenants.permissions import HasOrganization
from .models import Asset
from .serializers import AssetSerializer
# Create your views here.

@api_view(['GET'])
@permission_classes([HasOrganization])
def list_assets(request):
    # Tenant scope: only ever this org's assets.
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

    # Pagination
    paginator = PageNumberPagination()
    paginator.page_size = 20
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

@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
@permission_classes([HasOrganization])
def asset_detail(request, pk):
    # Scoped lookup: an asset outside the caller's org is a 404, not a 403 —
    # the caller can't even tell it exists.
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
