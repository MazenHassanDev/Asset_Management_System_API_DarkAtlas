"""
Rate limiting for the Asset Management API.

Throttling is **per tenant**, not per IP: a single organization hammering the
API shouldn't be able to exhaust another tenant's budget, and an org behind a
shared NAT shouldn't be penalised for its neighbours. We key the throttle on
``request.organization`` (set by ``ApiKeyAuthentication``), falling back to the
client IP only for unauthenticated callers so anonymous traffic stays bounded.

Counters live in the configured cache backend (Redis in prod, LocMemCache under
tests), so this works the same in both environments.
"""
from rest_framework.throttling import SimpleRateThrottle


class OrganizationRateThrottle(SimpleRateThrottle):
    """
    Global throttle applied to every endpoint by default.

    Bucket key = the caller's organization id when authenticated, else the
    client IP. Rate is read from ``DEFAULT_THROTTLE_RATES['organization']``.
    """

    scope = "organization"

    def get_cache_key(self, request, view):
        organization = getattr(request, "organization", None)
        if organization is not None:
            ident = f"org:{organization.id}"
        else:
            # Unauthenticated (or JWT-only) caller — fall back to IP so anon
            # traffic is still rate-limited.
            ident = self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


class ImportRateThrottle(OrganizationRateThrottle):
    """
    Tighter, separate bucket for the bulk-import endpoint, which is far heavier
    than a normal read/write. Applied explicitly on the import view (it replaces
    the default org throttle there) so a burst of large imports can be capped
    independently of ordinary traffic.
    """

    scope = "imports"
