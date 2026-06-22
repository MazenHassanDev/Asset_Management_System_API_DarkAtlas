from django.utils import timezone
from rest_framework import authentication, exceptions

from .models import ApiKey, hash_key

API_KEY_HEADER = "X-API-Key"


class ApiKeyAuthentication(authentication.BaseAuthentication):
    """
    Authenticates the caller's Organization from an ``X-API-Key`` header.

    On success it attaches ``request.organization`` and returns the ApiKey as
    the authenticated "user", DRF is happy with authentication. This
    is where a tenant is established. All views use
    ``request.organization`` for simplicity and to scope it to per organization data. The API key itself is not used for authorization, but
    """

    def authenticate(self, request):
        raw_key = request.headers.get(API_KEY_HEADER)
        if not raw_key:
            # If there is no API key present -> let other authenticators (e.g. JWT) try.
            return None

        try:
            api_key = ApiKey.objects.select_related("organization").get(
                key_hash=hash_key(raw_key), is_active=True
            )
        except ApiKey.DoesNotExist:
            raise exceptions.AuthenticationFailed("Invalid or inactive API key.")

        # Track last used time. No need to update the model.
        ApiKey.objects.filter(pk=api_key.pk).update(last_used_at=timezone.now())

        request.organization = api_key.organization
        return (api_key, None)

    def authenticate_header(self, request):
        # Response header = WWW-Authenticate : X-API-Key -- so failures return 401 (not 403).
        return API_KEY_HEADER
