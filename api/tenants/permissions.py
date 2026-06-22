from rest_framework.permissions import BasePermission


class HasOrganization(BasePermission):
    """
    Allows the request only if authenticated Organization meaning (an API key was provided). 
    This is what makes reads tenant-scoped too: without an org we don't know whose data to return.
    """

    message = "A valid API key (X-API-Key header) is required."

    def has_permission(self, request, view):
        return getattr(request, "organization", None) is not None
