from django.db import connection
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from drf_spectacular.utils import extend_schema, OpenApiResponse

@extend_schema(
    responses={
        200: OpenApiResponse(description="API and database are healthy"),
        503: OpenApiResponse(description="Database connection failed"),
    },
    description="Health check - API is running & database connection is healthy.",
)
@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    "Health check endpoint - (API is running & database connection is healthy.)"
    try:
        connection.ensure_connection()
        return Response({"status": "healthy"}, status=status.HTTP_200_OK)
    except Exception:
        return Response({"status": "unhealthy"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    