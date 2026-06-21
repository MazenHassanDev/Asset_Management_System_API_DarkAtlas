from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from rest_framework.pagination import PageNumberPagination

from .models import Asset
from .serializers import AssetSerializer
# Create your views here.

@api_view(['GET'])
@permission_classes([AllowAny])
def list_assets(request):
    queryset = Asset.objects.all()

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

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_asset(request):
    serializer = AssetSerializer(data=request.data)
    if serializer.is_valid():
        asset = serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
@permission_classes([AllowAny])
def asset_detail(request, pk):
    try:
        asset = Asset.objects.get(pk=pk)
    except Asset.DoesNotExist:
        return Response({'message': 'Asset not found.'}, status=status.HTTP_404_NOT_FOUND)

    # GET single asset details (public)
    if request.method == 'GET':
        serializer = AssetSerializer(asset)
        return Response(serializer.data, status=status.HTTP_200_OK)
    

    # Check for authentication
    if not request.user.is_authenticated:
        return Response({'message': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
    
    # PUT/PATCH to update asset (authenticated users only)
    if request.method in ['PUT', 'PATCH']:
        partial = request.method == 'PATCH'
        serializer = AssetSerializer(asset, data=request.data, partial=partial)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    # DELETE asset (authenticated users only)
    if request.method == 'DELETE':
        asset.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    
    