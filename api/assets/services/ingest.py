"""
Bulk import + deduplication — the core ASM ingest logic.

Lives here (not in the view) so it can be unit-tested and reused by both the
import endpoint and the `seed` management command. Callers parse the JSON and
give back parsed list of records; we never read files here.

Dedup key: (organization, type, value). Re-importing the same asset updates the
existing row instead of creating a duplicate.

Merge strategy:
  - tags: union (merge both, keep old, append new)
  - metadata: simple merge, (last-write-wins) - NEEDS IMPROVEMENT
  - status: a stale/archived asset seen again flips back to active
  - last_seen: changes automatically to now (model uses auto_now)

The record's own `id` is not the primary key (we use UUIDs for primary key) 
— it's only a local label used to wire `parent`/`covers` relationships.
"""

import uuid

from django.db import IntegrityError, transaction
from assets.models import Asset, Relationship, RejectedRecord

VALID_TYPES = set(Asset.AssetType.values)
VALID_STATUSES = set(Asset.Status.values)

# Relationship hint field on a record -> the Relationship type it creates.
#   "parent": this asset (e.g. subdomain) belongs_to the referenced asset (domain)
#   "covers": this asset (e.g. certificate) covers the referenced asset
RELATIONSHIP_HINTS = {
    "parent": Relationship.RelationshipType.BELONGS_TO,
    "covers": Relationship.RelationshipType.COVERS,
}


def _validate(record):
    # Validate one raw record. Returns (cleaned or error) — exactly one is set.
    if not isinstance(record, dict):
        return None, "record is not a JSON object"

    asset_type = record.get("type")
    if asset_type not in VALID_TYPES:
        return None, f"invalid or missing type: {asset_type!r}"

    value = record.get("value")
    if not isinstance(value, str) or not value.strip():
        return None, "missing or empty value"

    asset_status = record.get("status", Asset.Status.ACTIVE)
    if asset_status not in VALID_STATUSES:
        return None, f"invalid status: {asset_status!r}"

    tags = record.get("tags", [])
    if not isinstance(tags, list) or not all(isinstance(t, str) for t in tags):
        return None, "tags must be a list of strings"

    metadata = record.get("metadata", {})
    if not isinstance(metadata, dict):
        return None, "metadata must be an object"

    cleaned = {
        "type": asset_type,
        "value": value.strip(),
        "status": asset_status,
        "source": record.get("source", Asset.Source.IMPORT),
        "tags": tags,
        "metadata": metadata,
        "ref_id": record.get("id"),  # batch-local label, for relationship hints only
        "hints": {f: record[f] for f in RELATIONSHIP_HINTS if record.get(f)},
    }
    return cleaned, None


def _merge_tags(existing, incoming):
    # Union the two tag lists, avoid duplicates.
    merged = list(existing)
    for tag in incoming:
        if tag not in merged:
            merged.append(tag)
    return merged


def _upsert(organization, cleaned):
    # Create or update one asset by (organization, type, value). Returns (asset, created).
    try:
        asset = Asset.objects.get(
            organization=organization, type=cleaned["type"], value=cleaned["value"]
        )
    except Asset.DoesNotExist:
        asset = Asset.objects.create(
            organization=organization,
            type=cleaned["type"],
            value=cleaned["value"],
            status=cleaned["status"],
            source=cleaned["source"],
            tags=cleaned["tags"],
            metadata=cleaned["metadata"],
        )
        return asset, True

    # Re-appearing: merge, and change a stale/archived asset to active.
    asset.tags = _merge_tags(asset.tags, cleaned["tags"])
    asset.metadata = {**asset.metadata, **cleaned["metadata"]}
    if asset.status != Asset.Status.ACTIVE:
        asset.status = Asset.Status.ACTIVE
    asset.save()  # auto_now updates last_seen
    return asset, False


def ingest(organization, records):
    """
    Import a list of raw asset records for one organization.

    Bad rows are quarantined into RejectedRecord (never failing the batch) and
    grouped under one batch_id; each upsert runs in its own savepoint so a DB
    error on one row can't roll back the good ones. Relationship hints are wired
    in a second pass, once every asset exists.
    """
    batch_id = uuid.uuid4()  # groups every reject from this one import call
    summary = {"batch_id": str(batch_id), "created": 0, "updated": 0,
               "skipped": 0, "relationships_created": 0, "errors": []}
    ref_map = {}        # record id -> current Asset
    pending_hints = []  # (from_asset, target_ref_id, relationship_type)

    def reject(index, record, reason):
        # Quarantine a bad row: keep it for the Reject model and note it in the summary.
        RejectedRecord.objects.create(
            organization=organization, batch_id=batch_id,
            index=index, record=record, reason=reason,
        )
        summary["errors"].append({"index": index, "reason": reason, "record": record})
        summary["skipped"] += 1

    # Stage 1 — validate + upsert assets.
    for index, record in enumerate(records):
        cleaned, error = _validate(record)
        if error:
            reject(index, record, error)
            continue

        try:
            with transaction.atomic():
                asset, created = _upsert(organization, cleaned)
        except IntegrityError:
            reject(index, record, "database conflict")
            continue

        summary["created" if created else "updated"] += 1
        if cleaned["ref_id"] is not None:
            ref_map[cleaned["ref_id"]] = asset
        for field, rel_type in RELATIONSHIP_HINTS.items():
            if field in cleaned["hints"]:
                pending_hints.append((asset, cleaned["hints"][field], rel_type))

    # Stage 2 — turn parent/covers hints into Relationship rows.
    for from_asset, target_ref, rel_type in pending_hints:
        to_asset = ref_map.get(target_ref)
        if to_asset is None:
            summary["errors"].append(
                {"index": None, "reason": f"relationship target {target_ref!r} not found in batch"}
            )
            continue
        _, created = Relationship.objects.get_or_create(
            organization=organization,
            from_asset=from_asset,
            to_asset=to_asset,
            relationship_type=rel_type,
        )
        if created:
            summary["relationships_created"] += 1

    return summary
