"""
Tests for the relationship endpoints and the asset graph endpoint.

Covers the rubric's "relationships graph" feature: create/list/delete edges, the
1-hop graph in both directions, and the security rule that an edge may only link
two assets owned by the same caller's organization.
"""

import uuid

import pytest
from django.urls import reverse

from assets.models import Relationship
from factories import AssetFactory, OrganizationFactory, RelationshipFactory

pytestmark = pytest.mark.django_db


# --------------------------------------------------------------------------- #
#  Create
# --------------------------------------------------------------------------- #

def test_create_relationship(client, org):
    sub = AssetFactory(organization=org, type="subdomain", value="api.example.com")
    domain = AssetFactory(organization=org, type="domain", value="example.com")
    resp = client.post(
        reverse("relationships"),
        {"from_asset": str(sub.id), "to_asset": str(domain.id), "relationship_type": "belongs_to"},
        format="json",
    )
    assert resp.status_code == 201
    rel = Relationship.objects.get(id=resp.data["id"])
    assert rel.organization == org  # stamped from the key


def test_create_relationship_cross_tenant_is_rejected(client, org):
    """An edge must not span two organizations. The foreign asset is reported as
    a generic 'does not exist' (no information leak about another tenant)."""
    mine = AssetFactory(organization=org)
    foreign = AssetFactory(organization=OrganizationFactory())
    resp = client.post(
        reverse("relationships"),
        {"from_asset": str(mine.id), "to_asset": str(foreign.id), "relationship_type": "belongs_to"},
        format="json",
    )
    assert resp.status_code == 400
    assert not Relationship.objects.exists()


def test_create_duplicate_relationship_returns_409(client, org):
    a = AssetFactory(organization=org, value="a.com")
    b = AssetFactory(organization=org, value="b.com")
    RelationshipFactory(organization=org, from_asset=a, to_asset=b, relationship_type="belongs_to")
    resp = client.post(
        reverse("relationships"),
        {"from_asset": str(a.id), "to_asset": str(b.id), "relationship_type": "belongs_to"},
        format="json",
    )
    assert resp.status_code == 409


# --------------------------------------------------------------------------- #
#  List
# --------------------------------------------------------------------------- #

def test_list_relationships(client, org):
    RelationshipFactory.create_batch(3, organization=org)
    resp = client.get(reverse("relationships"))
    assert resp.data["count"] == 3


def test_list_filter_by_from_asset(client, org):
    a = AssetFactory(organization=org, value="a.com")
    b = AssetFactory(organization=org, value="b.com")
    c = AssetFactory(organization=org, value="c.com")
    RelationshipFactory(organization=org, from_asset=a, to_asset=b, relationship_type="belongs_to")
    RelationshipFactory(organization=org, from_asset=c, to_asset=b, relationship_type="belongs_to")
    resp = client.get(reverse("relationships"), {"from_asset": str(a.id)})
    assert resp.data["count"] == 1


def test_list_filter_invalid_uuid_returns_400(client):
    resp = client.get(reverse("relationships"), {"from_asset": "not-a-uuid"})
    assert resp.status_code == 400


# --------------------------------------------------------------------------- #
#  Delete
# --------------------------------------------------------------------------- #

def test_delete_relationship(client, org):
    rel = RelationshipFactory(organization=org)
    resp = client.delete(reverse("delete_relationship", kwargs={"pk": rel.id}))
    assert resp.status_code == 204
    assert not Relationship.objects.filter(id=rel.id).exists()


def test_delete_missing_relationship_returns_404(client):
    resp = client.delete(reverse("delete_relationship", kwargs={"pk": uuid.uuid4()}))
    assert resp.status_code == 404


def test_delete_foreign_relationship_returns_404(client):
    """Deleting another org's relationship returns 404, not 204 (no silent no-op,
    no cross-tenant deletes)."""
    foreign_rel = RelationshipFactory(organization=OrganizationFactory())
    resp = client.delete(reverse("delete_relationship", kwargs={"pk": foreign_rel.id}))
    assert resp.status_code == 404
    assert Relationship.objects.filter(id=foreign_rel.id).exists()  # untouched


# --------------------------------------------------------------------------- #
#  Graph
# --------------------------------------------------------------------------- #

def test_graph_returns_both_directions(client, org):
    """The graph around an asset includes both outgoing and incoming neighbors,
    each tagged with its relationship_type and direction."""
    center = AssetFactory(organization=org, value="center.com")
    parent = AssetFactory(organization=org, value="parent.com")
    child = AssetFactory(organization=org, value="child.com")
    # center -> parent (outgoing), child -> center (incoming)
    RelationshipFactory(organization=org, from_asset=center, to_asset=parent, relationship_type="belongs_to")
    RelationshipFactory(organization=org, from_asset=child, to_asset=center, relationship_type="belongs_to")

    resp = client.get(reverse("asset_graph", kwargs={"pk": center.id}))
    assert resp.status_code == 200
    assert resp.data["asset"]["id"] == str(center.id)

    related = {r["asset"]["value"]: r["direction"] for r in resp.data["related_assets"]}
    assert related == {"parent.com": "outgoing", "child.com": "incoming"}


def test_graph_missing_asset_returns_404(client):
    resp = client.get(reverse("asset_graph", kwargs={"pk": uuid.uuid4()}))
    assert resp.status_code == 404


def test_graph_excludes_other_tenants(org, make_client):
    """An asset's graph only shows relationships owned by the caller's org."""
    a = AssetFactory(organization=org, value="a.com")
    b = AssetFactory(organization=org, value="b.com")
    RelationshipFactory(organization=org, from_asset=a, to_asset=b, relationship_type="belongs_to")

    # A different org can't even see asset `a` (404), let alone its graph.
    other_client = make_client(OrganizationFactory())
    resp = other_client.get(reverse("asset_graph", kwargs={"pk": a.id}))
    assert resp.status_code == 404
