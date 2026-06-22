from django.apps import AppConfig


class TenantsConfig(AppConfig):
    name = 'tenants'

    def ready(self):
        # Importing the module registers the OpenAPI auth extension with
        # drf-spectacular (registration is a side effect of defining the class).
        from . import schema  # noqa: F401
