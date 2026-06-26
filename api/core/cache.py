"""
Tenant-aware read caching for assets.

Strategy: a per-organization **version counter**. Every cache key embeds the
org's current version, and any write (create/update/delete/import) bumps that
version — instantly orphaning every old key for that org (they fall out by TTL).
This invalidates all of an org's list + detail reads in one move without
tracking individual keys, and is safe across tenants (the org id is in the key)
and across backends (Redis in prod, LocMemCache in tests).

Set ``ASSET_CACHE_TTL = 0`` to disable caching (done in the test settings).
"""
import hashlib

from django.conf import settings
from django.core.cache import cache


def _ttl():
    # Read dynamically (not a module constant) so test settings / overrides apply.
    return getattr(settings, "ASSET_CACHE_TTL", 300)


def _version_key(org_id):
    return f"assets:{org_id}:version"


def _version(org_id):
    key = _version_key(org_id)
    version = cache.get(key)
    if version is None:
        version = 1
        cache.set(key, version, None)  # never expires; bumped on write
    return version


def bump_version(org_id):
    """Invalidate every cached asset read for an org by advancing its version."""
    try:
        cache.incr(_version_key(org_id))
    except ValueError:
        # Key absent/expired — start a fresh version line.
        cache.set(_version_key(org_id), 1, None)


def list_key(org_id, querystring):
    digest = hashlib.md5(querystring.encode()).hexdigest()
    return f"assets:{org_id}:v{_version(org_id)}:list:{digest}"


def detail_key(org_id, pk):
    return f"assets:{org_id}:v{_version(org_id)}:detail:{pk}"


def get_cached(key):
    """Return the cached payload, or None when caching is disabled / a miss."""
    if _ttl() <= 0:
        return None
    return cache.get(key)


def set_cached(key, payload):
    if _ttl() > 0:
        cache.set(key, payload, _ttl())
