import hashlib
import secrets
import uuid

from django.db import models

# Prefix all raw keys so they're recognizable in logs/headers and easy to revoke by family.
API_KEY_PREFIX = "dk_live_"


def hash_key(raw_key: str) -> str:
    """Return the SHA-256 hex digest we store instead of the raw API key."""
    return hashlib.sha256(raw_key.encode()).hexdigest()


class Organization(models.Model):
    """A tenant. Every asset/relationship belongs to exactly one Organization."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class ApiKey(models.Model):
    """
    An API key bound to one Organization. We persist only the hash of the key,
    never the raw value. The raw key is shown once, at creation time.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, related_name="api_keys", on_delete=models.CASCADE
    )
    # Lookup is by hash; index it. The raw key is never stored.
    key_hash = models.CharField(max_length=64, unique=True, db_index=True)
    # First chars of the raw key, for display/identification only (not a secret).
    prefix = models.CharField(max_length=20)
    name = models.CharField(max_length=255, blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.organization.name} · {self.prefix}… ({'active' if self.is_active else 'revoked'})"

    @classmethod
    def generate(cls, organization: Organization, name: str = ""):
        """
        Create a new key for an org. Returns (api_key_instance, raw_key).
        The raw_key is the ONLY time the secret is available — surface it to the
        caller immediately and never persist it.
        """
        raw_key = API_KEY_PREFIX + secrets.token_urlsafe(32)
        api_key = cls.objects.create(
            organization=organization,
            key_hash=hash_key(raw_key),
            prefix=raw_key[: len(API_KEY_PREFIX) + 4],
            name=name,
        )
        return api_key, raw_key
