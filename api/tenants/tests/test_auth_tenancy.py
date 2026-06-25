"""
Authentication, multi-tenant isolation, and error-envelope tests.

This is a security product, so tenant isolation is treated as critical: one
organization must never read, list, mutate or link another organization's data.
Also asserts the consistent ``{"error": {...}}`` envelope shape.
"""

import uuid

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from tenants.models import ApiKey
from factories import AssetFactory, OrganizationFactory

pytestmark = pytest.mark.django_db


# --------------------------------------------------------------------------- #
#  Authentication
# --------------------------------------------------------------------------- #

def test_unauthenticated_request_is_401(api_client):
    resp = api_client.get(reverse("list_assets"))
    assert resp.status_code == 401
    assert resp.data["error"]["code"] == "not_authenticated"


def test_invalid_api_key_is_401(api_client):
    api_client.credentials(HTTP_X_API_KEY="dk_live_totally-bogus")
    resp = api_client.get(reverse("list_assets"))
    assert resp.status_code == 401


def test_inactive_api_key_is_401(api_client, org):
    api_key, raw = ApiKey.generate(org)
    api_key.is_active = False
    api_key.save()

    api_client.credentials(HTTP_X_API_KEY=raw)
    resp = api_client.get(reverse("list_assets"))
    assert resp.status_code == 401


def test_writes_require_authentication(api_client):
    """Write operations are rejected without a key (per the task's auth requirement)."""
    resp = api_client.post(
        reverse("create_asset"),
        {"type": "domain", "value": "x.com", "source": "manual"},
        format="json",
    )
    assert resp.status_code == 401


def test_valid_api_key_grants_access(client):
    resp = client.get(reverse("list_assets"))
    assert resp.status_code == 200


def test_raw_api_key_is_never_stored(org):
    """Defense in depth: only the SHA-256 hash is persisted, never the raw key."""
    _, raw = ApiKey.generate(org)
    assert not ApiKey.objects.filter(key_hash=raw).exists()
    from tenants.models import hash_key

    assert ApiKey.objects.filter(key_hash=hash_key(raw)).exists()


# --------------------------------------------------------------------------- #
#  Multi-tenant isolation
# --------------------------------------------------------------------------- #

def test_list_is_scoped_to_caller_org(make_client):
    org_a = OrganizationFactory()
    org_b = OrganizationFactory()
    AssetFactory(organization=org_a, value="a-owned.com")
    AssetFactory(organization=org_b, value="b-owned.com")

    client_a = make_client(org_a)
    resp = client_a.get(reverse("list_assets"))
    values = [r["value"] for r in resp.data["results"]]
    assert values == ["a-owned.com"]  # B's asset is invisible


def test_cannot_read_other_orgs_asset(make_client):
    org_b = OrganizationFactory()
    b_asset = AssetFactory(organization=org_b)

    client_a = make_client(OrganizationFactory())
    resp = client_a.get(reverse("asset_detail", kwargs={"pk": b_asset.id}))
    # 404 (not 403) so we don't even confirm the asset exists to another tenant.
    assert resp.status_code == 404


def test_cannot_update_other_orgs_asset(make_client):
    org_b = OrganizationFactory()
    b_asset = AssetFactory(organization=org_b, status="active")

    client_a = make_client(OrganizationFactory())
    resp = client_a.patch(
        reverse("asset_detail", kwargs={"pk": b_asset.id}),
        {"status": "archived"},
        format="json",
    )
    assert resp.status_code == 404
    b_asset.refresh_from_db()
    assert b_asset.status == "active"  # untouched


def test_cannot_delete_other_orgs_asset(make_client):
    org_b = OrganizationFactory()
    b_asset = AssetFactory(organization=org_b)

    client_a = make_client(OrganizationFactory())
    resp = client_a.delete(reverse("asset_detail", kwargs={"pk": b_asset.id}))
    assert resp.status_code == 404
    from assets.models import Asset

    assert Asset.objects.filter(id=b_asset.id).exists()  # still there


def test_cannot_read_other_orgs_import_rejects(make_client, org):
    """Reject batches are tenant-scoped too — a foreign batch_id just 404s."""
    from assets.services.ingest import ingest

    summary = ingest(org, [{"bad": "row"}])
    batch_id = summary["batch_id"]

    client_b = make_client(OrganizationFactory())
    resp = client_b.get(reverse("list_rejects", kwargs={"batch_id": batch_id}))
    assert resp.status_code == 404


# --------------------------------------------------------------------------- #
#  Error envelope shape
# --------------------------------------------------------------------------- #

def test_envelope_shape_on_404(client):
    resp = client.get(reverse("asset_detail", kwargs={"pk": uuid.uuid4()}))
    assert resp.status_code == 404
    assert set(resp.data["error"]) == {"code", "message"}
    assert resp.data["error"]["code"] == "not_found"


def test_envelope_shape_on_validation_error(client):
    resp = client.post(reverse("create_asset"), {"type": "bogus", "value": "x", "source": "manual"}, format="json")
    assert resp.status_code == 400
    error = resp.data["error"]
    assert error["code"] == "validation_error"
    # Validation errors carry a per-field details map; simple errors don't.
    assert "details" in error
    assert "type" in error["details"]


def test_envelope_shape_on_conflict(client, org):
    AssetFactory(organization=org, type="domain", value="dup.com")
    resp = client.post(
        reverse("create_asset"),
        {"type": "domain", "value": "dup.com", "source": "manual"},
        format="json",
    )
    assert resp.status_code == 409
    assert resp.data["error"]["code"] == "conflict"
    assert "details" not in resp.data["error"]
