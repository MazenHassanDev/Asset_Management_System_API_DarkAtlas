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
