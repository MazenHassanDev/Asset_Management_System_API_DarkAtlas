import uuid
from django.db import models
from django.contrib.postgres.fields import ArrayField
from tenants.models import Organization

# Create your models here.
class Asset(models.Model):
    class AssetType(models.TextChoices):
        DOMAIN = 'domain', 'Domain'
        SUBDOMAIN = 'subdomain', 'Subdomain'
        IP_ADDRESS = 'ip_address', 'IP Address'
        SERVICE = 'service', 'Service'
        CERTIFICATE = 'certificate', 'Certificate'
        TECHNOLOGY = 'technology', 'Technology'

    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        STALE = 'stale', 'Stale'
        ARCHIVED = 'archived', 'Archived'

    class Source(models.TextChoices):
        IMPORT = 'import', 'Import'
        SCAN = 'scan', 'Scan'
        MANUAL = 'manual', 'Manual'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(Organization, related_name='assets', on_delete=models.CASCADE, db_index=True)
    type = models.CharField(max_length=20, choices=AssetType.choices, db_index=True)
    value = models.CharField(max_length=500, db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    first_seen = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)
    source = models.CharField(max_length=20, choices=Source.choices)
    tags = ArrayField(models.CharField(max_length=50), blank=True, default=list)
    metadata = models.JSONField(blank=True, default=dict)

    class Meta:
        constraints = [
            # Dedup is per-tenant because the same (type, value) may exist in different orgs.
            models.UniqueConstraint(fields=['organization', 'type', 'value'], name='unique_org_type_value')
        ]

        indexes = [
            models.Index(fields=['organization', 'type', 'status']),
        ]

    def __str__(self):
        return f"{self.type}: {self.value}"
    
class Relationship(models.Model):
    class RelationshipType(models.TextChoices):
        RESOLVES_TO = 'resolves_to', 'Resolves To'
        BELONGS_TO = 'belongs_to', 'Belongs To'
        RUNS_SERVICE = 'runs_service', 'Runs Service'
        COVERS = 'covers', 'Covers'
        DETECTED_ON = 'detected_on', 'Detected On'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(Organization, related_name='relationships', on_delete=models.CASCADE, db_index=True)
    from_asset = models.ForeignKey(Asset, related_name='relationships_from', on_delete=models.CASCADE)
    to_asset = models.ForeignKey(Asset, related_name='relationships_to', on_delete=models.CASCADE)
    relationship_type = models.CharField(max_length=20, choices=RelationshipType.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['from_asset', 'to_asset', 'relationship_type'], name='unique_relationship')
        ]
 
    def __str__(self):
        return f"{self.from_asset} - {self.relationship_type} - {self.to_asset}"