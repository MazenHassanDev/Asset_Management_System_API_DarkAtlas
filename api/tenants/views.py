from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status
from drf_spectacular.utils import extend_schema, OpenApiResponse

from .permissions import HasOrganization


@extend_schema(
    responses={
        200: OpenApiResponse(description="The organization the supplied API key belongs to."),
        401: OpenApiResponse(description="Missing or invalid API key."),
    },
    description="Return the caller's organization (resolved from the X-API-Key header).",
)
@api_view(['GET'])
@permission_classes([HasOrganization])
def current_org(request):
    org = request.organization
    return Response({"id": str(org.id), "name": org.name}, status=status.HTTP_200_OK)
