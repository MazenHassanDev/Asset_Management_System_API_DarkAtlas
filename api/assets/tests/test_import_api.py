"""
HTTP-layer tests for the bulk-import and rejects endpoints.

The dedup/merge logic itself is unit-tested in test_ingest.py; here we just
verify the endpoint wiring: array validation, the returned summary, and the
paginated rejects endpoint.
"""

import pytest
from django.urls import reverse

from assets.models import Asset

pytestmark = pytest.mark.django_db


def test_import_endpoint_creates_and_reports(client, org):
    resp = client.post(
        reverse("import_assets"),
        [
            {"id": "a1", "type": "domain", "value": "example.com"},
            {"id": "a2", "type": "subdomain", "value": "api.example.com", "parent": "a1"},
            {"type": "domain", "value": ""},  # malformed -> skipped
        ],
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["created"] == 2
    assert resp.data["skipped"] == 1
    assert resp.data["relationships_created"] == 1
    assert "batch_id" in resp.data
    assert Asset.objects.filter(organization=org).count() == 2


def test_import_non_array_body_returns_400(client):
    resp = client.post(reverse("import_assets"), {"not": "an array"}, format="json")
    assert resp.status_code == 400
    assert resp.data["error"]["code"] == "validation_error"


def test_rejects_endpoint_lists_quarantined_rows(client):
    resp = client.post(
        reverse("import_assets"),
        [{"type": "domain", "value": "good.com"}, "bad-row"],
        format="json",
    )
    batch_id = resp.data["batch_id"]

    rejects = client.get(reverse("list_rejects", kwargs={"batch_id": batch_id}))
    assert rejects.status_code == 200
    assert rejects.data["count"] == 1
    assert rejects.data["results"][0]["record"] == "bad-row"


def test_rejects_endpoint_unknown_batch_returns_404(client):
    import uuid

    resp = client.get(reverse("list_rejects", kwargs={"batch_id": uuid.uuid4()}))
    assert resp.status_code == 404


def test_import_batch_too_large_returns_400(client, settings):
    """An oversized batch is rejected up front (400), matching Django's own
    request-item limit. The cap is lowered here so we needn't POST 1001 rows."""
    settings.DATA_UPLOAD_MAX_NUMBER_FIELDS = 5
    records = [{"type": "domain", "value": f"e{i}.com"} for i in range(6)]
    resp = client.post(reverse("import_assets"), records, format="json")
    assert resp.status_code == 400
    assert resp.data["error"]["code"] == "validation_error"
    # Rejected up front — nothing ingested.
    assert Asset.objects.count() == 0


def test_import_at_limit_succeeds(client, settings):
    """A batch exactly at the cap is accepted (off-by-one guard)."""
    settings.DATA_UPLOAD_MAX_NUMBER_FIELDS = 5
    records = [{"type": "domain", "value": f"e{i}.com"} for i in range(5)]
    resp = client.post(reverse("import_assets"), records, format="json")
    assert resp.status_code == 200
    assert resp.data["created"] == 5
