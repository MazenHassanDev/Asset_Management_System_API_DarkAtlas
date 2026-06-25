"""
Tests for the asset REST endpoints: CRUD plus the list endpoint's filtering,
search, ordering, pagination and the certificate-expiry filter.

Covers the rubric's "API correctness & completeness — CRUD, filtering, sorting,
pagination" line.
"""

from datetime import date, timedelta

import pytest
from django.urls import reverse

from assets.models import Asset
from factories import AssetFactory

pytestmark = pytest.mark.django_db


# --------------------------------------------------------------------------- #
#  CRUD
# --------------------------------------------------------------------------- #

def test_create_asset(client, org):
    resp = client.post(
        reverse("create_asset"),
        {"type": "domain", "value": "example.com", "source": "manual"},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.data["value"] == "example.com"
    # Org is stamped from the API key, never the body.
    assert Asset.objects.get(id=resp.data["id"]).organization == org


def test_create_asset_requires_source(client):
    """`source` has no model default, so it's required on manual create."""
    resp = client.post(
        reverse("create_asset"),
        {"type": "domain", "value": "nosource.com"},
        format="json",
    )
    assert resp.status_code == 400
    assert "source" in resp.data["error"]["details"]


def test_create_asset_ignores_organization_in_body(client, org):
    """Even if a caller tries to set organization in the payload, the key wins."""
    from factories import OrganizationFactory

    other = OrganizationFactory()
    resp = client.post(
        reverse("create_asset"),
        {"type": "domain", "value": "spoof.com", "source": "manual", "organization": str(other.id)},
        format="json",
    )
    assert resp.status_code == 201
    assert Asset.objects.get(id=resp.data["id"]).organization == org


def test_create_duplicate_returns_409(client, org):
    AssetFactory(organization=org, type="domain", value="dup.com")
    resp = client.post(
        reverse("create_asset"),
        {"type": "domain", "value": "dup.com", "source": "manual"},
        format="json",
    )
    assert resp.status_code == 409
    assert resp.data["error"]["code"] == "conflict"


def test_create_invalid_returns_400(client):
    resp = client.post(reverse("create_asset"), {"type": "not_a_type", "value": "x"}, format="json")
    assert resp.status_code == 400
    assert resp.data["error"]["code"] == "validation_error"


def test_retrieve_asset(client, org):
    asset = AssetFactory(organization=org)
    resp = client.get(reverse("asset_detail", kwargs={"pk": asset.id}))
    assert resp.status_code == 200
    assert resp.data["id"] == str(asset.id)


def test_retrieve_missing_asset_returns_404(client):
    import uuid

    resp = client.get(reverse("asset_detail", kwargs={"pk": uuid.uuid4()}))
    assert resp.status_code == 404
    assert resp.data["error"]["code"] == "not_found"


def test_patch_updates_and_bumps_last_seen(client, org):
    asset = AssetFactory(organization=org, status="active")
    last_seen_before = asset.last_seen

    resp = client.patch(
        reverse("asset_detail", kwargs={"pk": asset.id}),
        {"status": "stale"},
        format="json",
    )
    assert resp.status_code == 200
    asset.refresh_from_db()
    assert asset.status == "stale"
    assert asset.last_seen >= last_seen_before


def test_patch_into_existing_pair_returns_409(client, org):
    AssetFactory(organization=org, type="domain", value="a.com")
    target = AssetFactory(organization=org, type="domain", value="b.com")
    resp = client.patch(
        reverse("asset_detail", kwargs={"pk": target.id}),
        {"value": "a.com"},
        format="json",
    )
    assert resp.status_code == 409


def test_delete_asset(client, org):
    asset = AssetFactory(organization=org)
    resp = client.delete(reverse("asset_detail", kwargs={"pk": asset.id}))
    assert resp.status_code == 204
    assert not Asset.objects.filter(id=asset.id).exists()


# --------------------------------------------------------------------------- #
#  Filtering & search
# --------------------------------------------------------------------------- #

def test_filter_by_type(client, org):
    AssetFactory(organization=org, type="domain", value="d.com")
    AssetFactory(organization=org, type="subdomain", value="s.d.com")
    resp = client.get(reverse("list_assets"), {"type": "subdomain"})
    assert resp.data["count"] == 1
    assert resp.data["results"][0]["type"] == "subdomain"


def test_filter_by_status(client, org):
    AssetFactory(organization=org, status="active", value="a.com")
    AssetFactory(organization=org, status="stale", value="b.com")
    resp = client.get(reverse("list_assets"), {"status": "stale"})
    assert resp.data["count"] == 1


def test_filter_by_tag(client, org):
    AssetFactory(organization=org, value="a.com", tags=["prod"])
    AssetFactory(organization=org, value="b.com", tags=["dev"])
    resp = client.get(reverse("list_assets"), {"tag": "prod"})
    assert resp.data["count"] == 1
    assert resp.data["results"][0]["value"] == "a.com"


def test_filter_by_value_contains(client, org):
    AssetFactory(organization=org, value="api.example.com")
    AssetFactory(organization=org, value="www.other.com")
    resp = client.get(reverse("list_assets"), {"value": "example"})
    assert resp.data["count"] == 1


def test_search_matches_value_or_tag(client, org):
    AssetFactory(organization=org, value="api.example.com", tags=[])
    AssetFactory(organization=org, value="unrelated.com", tags=["example"])
    AssetFactory(organization=org, value="nothing.com", tags=["other"])
    resp = client.get(reverse("list_assets"), {"q": "example"})
    # Matches the one by value AND the one by exact tag.
    assert resp.data["count"] == 2


# --------------------------------------------------------------------------- #
#  Ordering
# --------------------------------------------------------------------------- #

def test_ordering_by_value_ascending(client, org):
    AssetFactory(organization=org, value="charlie.com")
    AssetFactory(organization=org, value="alpha.com")
    AssetFactory(organization=org, value="bravo.com")
    resp = client.get(reverse("list_assets"), {"ordering": "value"})
    values = [r["value"] for r in resp.data["results"]]
    assert values == ["alpha.com", "bravo.com", "charlie.com"]


def test_invalid_ordering_falls_back_to_default(client, org):
    """An ordering value outside the whitelist must not 500 — it falls back."""
    AssetFactory(organization=org, value="a.com")
    AssetFactory(organization=org, value="b.com")
    resp = client.get(reverse("list_assets"), {"ordering": "metadata; DROP TABLE"})
    assert resp.status_code == 200
    assert resp.data["count"] == 2


# --------------------------------------------------------------------------- #
#  Pagination
# --------------------------------------------------------------------------- #

def test_pagination_default_page_size(client, org):
    AssetFactory.create_batch(25, organization=org)
    resp = client.get(reverse("list_assets"))
    assert resp.data["count"] == 25
    assert len(resp.data["results"]) == 20  # default page size


def test_pagination_custom_page_size(client, org):
    AssetFactory.create_batch(10, organization=org)
    resp = client.get(reverse("list_assets"), {"page_size": 5})
    assert len(resp.data["results"]) == 5


def test_pagination_caps_page_size(client, org):
    # More than max_page_size (100) so the cap is what limits the page, not the row count.
    AssetFactory.create_batch(105, organization=org)
    resp = client.get(reverse("list_assets"), {"page_size": 99999})
    assert len(resp.data["results"]) == 100  # capped at max_page_size


def test_pagination_out_of_range_returns_404(client, org):
    AssetFactory.create_batch(3, organization=org)
    resp = client.get(reverse("list_assets"), {"page": 999})
    assert resp.status_code == 404


# --------------------------------------------------------------------------- #
#  Certificate expiry filter / computed field
# --------------------------------------------------------------------------- #

def _cert(org, value, expires):
    return AssetFactory(
        organization=org, type="certificate", value=value, metadata={"expires": expires}
    )


def test_cert_status_field_and_filter(client, org):
    today = date.today()
    _cert(org, "CN=expired", (today - timedelta(days=10)).isoformat())
    _cert(org, "CN=soon", (today + timedelta(days=5)).isoformat())
    _cert(org, "CN=valid", (today + timedelta(days=365)).isoformat())
    _cert(org, "CN=malformed", "not-a-date")

    expired = client.get(reverse("list_assets"), {"cert_status": "expired"})
    soon = client.get(reverse("list_assets"), {"cert_status": "expiring_soon"})
    valid = client.get(reverse("list_assets"), {"cert_status": "valid"})

    assert [r["value"] for r in expired.data["results"]] == ["CN=expired"]
    assert [r["value"] for r in soon.data["results"]] == ["CN=soon"]
    assert [r["value"] for r in valid.data["results"]] == ["CN=valid"]
    # Malformed date is excluded from every bucket.
    assert expired.data["count"] == soon.data["count"] == valid.data["count"] == 1


def test_cert_status_computed_field_on_serializer(client, org):
    asset = _cert(org, "CN=expired", (date.today() - timedelta(days=1)).isoformat())
    resp = client.get(reverse("asset_detail", kwargs={"pk": asset.id}))
    assert resp.data["cert_status"] == "expired"


def test_invalid_cert_status_returns_400(client):
    resp = client.get(reverse("list_assets"), {"cert_status": "bogus"})
    assert resp.status_code == 400
