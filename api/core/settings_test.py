"""
Test settings: inherit everything from the real settings, then swap the Redis
cache for a local in-memory one so the suite doesn't need a running Redis.

The database settings are reused as-is — pytest-django creates an isolated
`test_<DB_NAME>` database from them and tears it down afterwards.
"""

from .settings import *  # noqa: F401,F403

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}

# Disable read caching for the suite so factory-created rows are never served
# from a stale cache. The dedicated cache tests turn it back on per-test.
ASSET_CACHE_TTL = 0

# Disable throttling for the suite: setting the rates to None makes DRF skip
# throttling entirely, so the tests can't trip the per-org limit and get 429s.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,  # noqa: F405
    "DEFAULT_THROTTLE_RATES": {"organization": None, "imports": None},
}
