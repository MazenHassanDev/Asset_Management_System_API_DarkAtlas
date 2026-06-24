from datetime import date, timedelta

from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from drf_spectacular.types import OpenApiTypes
from .models import Asset, Relationship, RejectedRecord

# A certificate is "expiring soon" if it expires within this many days from now.
# Shared with the list endpoint's ?cert_status= filter so the field and the
# filter always agree on the threshold.
EXPIRING_SOON_DAYS = 30


def cert_status_for(metadata, asset_type):
    """Retrieve a certificate's expiry state from metadata['expires'] (an ISO date).

    Returns one of: 'expired', 'expiring_soon', 'valid', 'unknown', or None for
    non-certificates / certs without an expiry. Handles malformed dates
    (returns 'unknown' rather than raising).
    """
    if asset_type != Asset.AssetType.CERTIFICATE:
        return None
    expires = metadata.get('expires') if isinstance(metadata, dict) else None
    if not expires:
        return None
    try:
        # Accept a plain ISO date or the date portion of an ISO datetime.
        expires_date = date.fromisoformat(str(expires)[:10])
    except (ValueError, TypeError):
        return 'unknown'

    today = date.today()
    if expires_date < today:
        return 'expired'
    if expires_date <= today + timedelta(days=EXPIRING_SOON_DAYS):
        return 'expiring_soon'
    return 'valid'


class AssetSerializer(serializers.ModelSerializer):
    # Read-only field: expiry state for certificates (None for other types).
    cert_status = serializers.SerializerMethodField()

    class Meta:
        model = Asset
        fields = [
            'id', 'type', 'value', 'status',
            'first_seen', 'last_seen', 'source',
            'tags', 'metadata', 'cert_status',
        ]
        read_only_fields = ['id', 'first_seen', 'last_seen']

    @extend_schema_field(OpenApiTypes.STR)
    def get_cert_status(self, obj):
        return cert_status_for(obj.metadata, obj.type)

class RejectedRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = RejectedRecord
        fields = ['index', 'record', 'reason', 'created_at']
        read_only_fields = fields


class RelationshipSerializer(serializers.ModelSerializer):
    class Meta:
        model = Relationship
        fields = [
            'id', 'from_asset', 'to_asset',
            'relationship_type', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']
        # Drop the auto UniqueTogetherValidator so a duplicate falls through to the DB
        # constraint -> IntegrityError -> Conflict (409), consistent with create_asset.
        validators = []