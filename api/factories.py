"""
factory_boy factories for the test suite.

Kept deliberately small: just enough to mint Organizations, Assets and
Relationships with sensible defaults. Anything an individual test cares about
(type, value, status, metadata, …) is overridden at call time.
"""

import factory

from assets.models import Asset, Relationship
from tenants.models import Organization


class OrganizationFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Organization

    name = factory.Sequence(lambda n: f"Org {n}")


class AssetFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Asset

    organization = factory.SubFactory(OrganizationFactory)
    type = Asset.AssetType.DOMAIN
    # Sequence keeps values unique so they don't trip the
    # (organization, type, value) dedup constraint by accident.
    value = factory.Sequence(lambda n: f"example{n}.com")
    status = Asset.Status.ACTIVE
    source = Asset.Source.SCAN


class RelationshipFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Relationship

    # Default both endpoints into the relationship's own org so the row is valid
    # out of the box. Tests that exercise cross-tenant rules pass assets explicitly.
    organization = factory.SubFactory(OrganizationFactory)
    from_asset = factory.SubFactory(
        AssetFactory, organization=factory.SelfAttribute("..organization")
    )
    to_asset = factory.SubFactory(
        AssetFactory, organization=factory.SelfAttribute("..organization")
    )
    relationship_type = Relationship.RelationshipType.BELONGS_TO
