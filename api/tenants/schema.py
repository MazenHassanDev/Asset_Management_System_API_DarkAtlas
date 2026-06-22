from drf_spectacular.extensions import OpenApiAuthenticationExtension


class ApiKeyAuthenticationScheme(OpenApiAuthenticationExtension):
    """
    Teaches drf-spectacular how to document our custom `ApiKeyAuthentication`.

    Without this, spectacular sees a generic `BaseAuthentication` subclass it
    doesn't recognise and emits no security scheme, so Swagger shows no way to
    send the key. This registers an `apiKey`-in-header scheme named `ApiKeyAuth`,
    which makes the "Authorize" button render an `X-API-Key` field.
    """

    target_class = "tenants.authentication.ApiKeyAuthentication"
    name = "ApiKeyAuth"

    def get_security_definition(self, auto_schema):
        return {
            "type": "apiKey",
            "in": "header",
            "name": "X-API-Key",
        }
