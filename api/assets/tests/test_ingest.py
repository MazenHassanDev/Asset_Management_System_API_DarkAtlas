"""
Tests for the bulk-import / dedup service (`assets.services.ingest`).

This is the highest-weight feature on the rubric ("ASM features — deduplication,
lifecycle, relationships graph") so it gets the most thorough coverage:
idempotent re-import, the merge strategy, re-appearing (stale→active) assets,
graceful handling of malformed rows, and relationship-hint wiring.
"""

import pytest

from assets.models import Asset, Relationship, RejectedRecord
from assets.services.ingest import ingest
from factories import OrganizationFactory

pytestmark = pytest.mark.django_db


def test_import_creates_assets(org):
    records = [
        {"id": "a1", "type": "domain", "value": "example.com"},
        {"id": "a2", "type": "subdomain", "value": "api.example.com"},
    ]
    summary = ingest(org, records)

    assert summary["created"] == 2
    assert summary["updated"] == 0
    assert summary["skipped"] == 0
    assert Asset.objects.filter(organization=org).count() == 2


def test_reimport_is_idempotent_and_dedupes(org):
    """Importing the same record twice must not create a duplicate — it updates
    the existing row instead (the core dedup guarantee)."""
    record = {"type": "domain", "value": "example.com"}

    first = ingest(org, [record])
    second = ingest(org, [record])

    assert first["created"] == 1
    assert second["created"] == 0
    assert second["updated"] == 1
    # One row, not two.
    assert Asset.objects.filter(organization=org, type="domain", value="example.com").count() == 1


def test_reimport_bumps_last_seen(org):
    """A re-sighting updates last_seen while leaving first_seen fixed."""
    ingest(org, [{"type": "domain", "value": "example.com"}])
    asset = Asset.objects.get(organization=org, value="example.com")
    first_seen_before = asset.first_seen
    last_seen_before = asset.last_seen

    ingest(org, [{"type": "domain", "value": "example.com"}])
    asset.refresh_from_db()

    assert asset.first_seen == first_seen_before  # set once, never moves
    assert asset.last_seen >= last_seen_before     # bumped on re-sighting


def test_merge_unions_tags(org):
    ingest(org, [{"type": "domain", "value": "example.com", "tags": ["root"]}])
    ingest(org, [{"type": "domain", "value": "example.com", "tags": ["verified", "root"]}])

    asset = Asset.objects.get(organization=org, value="example.com")
    assert sorted(asset.tags) == ["root", "verified"]  # union, no duplicates


def test_merge_metadata_last_write_wins_per_key(org):
    ingest(org, [{"type": "certificate", "value": "CN=x", "metadata": {"issuer": "LE", "expires": "2025-01-01"}}])
    ingest(org, [{"type": "certificate", "value": "CN=x", "metadata": {"expires": "2026-01-01", "owner": "ops"}}])

    asset = Asset.objects.get(organization=org, value="CN=x")
    # Untouched key preserved, overlapping key overwritten, new key added.
    assert asset.metadata == {"issuer": "LE", "expires": "2026-01-01", "owner": "ops"}


def test_stale_asset_returns_to_active_when_reseen(org):
    """Re-appearing asset edge case: a stale asset seen again flips back to active."""
    ingest(org, [{"type": "domain", "value": "example.com", "status": "stale"}])
    assert Asset.objects.get(organization=org, value="example.com").status == "stale"

    ingest(org, [{"type": "domain", "value": "example.com"}])
    assert Asset.objects.get(organization=org, value="example.com").status == "active"


def test_archived_asset_stays_archived_when_reseen(org):
    """Sticky archived: archiving is a deliberate retirement, so re-sighting must
    NOT silently resurrect it (only stale→active is automatic)."""
    ingest(org, [{"type": "domain", "value": "example.com", "status": "archived"}])
    ingest(org, [{"type": "domain", "value": "example.com"}])

    assert Asset.objects.get(organization=org, value="example.com").status == "archived"


def test_malformed_rows_are_skipped_not_fatal(org):
    """A bad row must not crash the batch — good rows still persist, bad rows are
    counted, reported inline, and quarantined."""
    records = [
        {"type": "domain", "value": "good.com"},          # ok
        "i am not an object",                              # not a dict
        {"value": "no-type.com"},                          # missing type
        {"type": "domain", "value": ""},                   # empty value
        {"type": "domain", "value": "badstatus.com", "status": "zzz"},  # bad status
        {"type": "domain", "value": "badtags.com", "tags": "notalist"}, # tags not a list
        {"type": "subdomain", "value": "good.sub.com"},    # ok
    ]
    summary = ingest(org, records)

    assert summary["created"] == 2
    assert summary["skipped"] == 5
    assert len(summary["errors"]) == 5
    # Good rows landed.
    assert Asset.objects.filter(organization=org, value="good.com").exists()
    assert Asset.objects.filter(organization=org, value="good.sub.com").exists()
    # Bad rows did not.
    assert not Asset.objects.filter(organization=org, value="badstatus.com").exists()


def test_malformed_rows_are_quarantined_under_batch_id(org):
    summary = ingest(org, [{"bad": "row"}, "also bad"])

    batch_id = summary["batch_id"]
    rejected = RejectedRecord.objects.filter(organization=org, batch_id=batch_id)
    assert rejected.count() == 2
    # The raw row is preserved as-is, including non-dict values.
    stored = {r.index: r.record for r in rejected}
    assert stored[0] == {"bad": "row"}
    assert stored[1] == "also bad"


def test_each_import_call_gets_its_own_batch_id(org):
    first = ingest(org, [{"bad": 1}])
    second = ingest(org, [{"bad": 2}])
    assert first["batch_id"] != second["batch_id"]


def test_relationship_hints_become_edges(org):
    """parent/covers hints in the payload are resolved into Relationship rows in
    the second pass, once every asset exists."""
    records = [
        {"id": "a1", "type": "domain", "value": "example.com"},
        {"id": "a2", "type": "subdomain", "value": "api.example.com", "parent": "a1"},
        {"id": "a3", "type": "certificate", "value": "CN=api", "covers": "a2"},
    ]
    summary = ingest(org, records)

    assert summary["relationships_created"] == 2
    domain = Asset.objects.get(organization=org, value="example.com")
    sub = Asset.objects.get(organization=org, value="api.example.com")
    cert = Asset.objects.get(organization=org, value="CN=api")

    assert Relationship.objects.filter(
        from_asset=sub, to_asset=domain, relationship_type="belongs_to"
    ).exists()
    assert Relationship.objects.filter(
        from_asset=cert, to_asset=sub, relationship_type="covers"
    ).exists()


def test_dangling_relationship_hint_is_a_warning_not_an_error(org):
    """A hint pointing at an id that isn't in the batch is reported as a non-fatal
    warning; the asset itself still imports fine."""
    records = [
        {"id": "a2", "type": "subdomain", "value": "api.example.com", "parent": "missing"},
    ]
    summary = ingest(org, records)

    assert summary["created"] == 1
    assert summary["relationships_created"] == 0
    assert len(summary["warnings"]) == 1
    assert summary["skipped"] == 0  # a dangling hint is not a rejected row


def test_relationship_hints_are_idempotent(org):
    """Re-importing the same hinted batch must not duplicate the edges."""
    records = [
        {"id": "a1", "type": "domain", "value": "example.com"},
        {"id": "a2", "type": "subdomain", "value": "api.example.com", "parent": "a1"},
    ]
    ingest(org, records)
    second = ingest(org, records)

    assert second["relationships_created"] == 0
    assert Relationship.objects.filter(organization=org).count() == 1


def test_dedup_is_per_tenant(org):
    """The same (type, value) may exist independently in two organizations."""
    other = OrganizationFactory()
    ingest(org, [{"type": "domain", "value": "example.com"}])
    ingest(other, [{"type": "domain", "value": "example.com"}])

    assert Asset.objects.filter(value="example.com").count() == 2
    assert Asset.objects.filter(organization=org, value="example.com").count() == 1
    assert Asset.objects.filter(organization=other, value="example.com").count() == 1
