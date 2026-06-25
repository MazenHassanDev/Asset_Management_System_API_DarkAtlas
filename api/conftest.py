"""
Shared pytest fixtures.

The whole suite authenticates the way real callers do: an Organization owns an
API key, and the raw key travels in the ``X-API-Key`` header. We never fake
``request.organization`` directly — the auth layer is part of what we're testing.
"""

import pytest
from rest_framework.test import APIClient

from tenants.models import ApiKey
from factories import OrganizationFactory


@pytest.fixture
def api_client():
    """An unauthenticated DRF test client."""
    return APIClient()


@pytest.fixture
def make_client(db):
    """
    Factory fixture: ``make_client(org)`` returns an APIClient authenticated as
    that organization (mints a fresh API key and sets the header).
    """

    def _make(organization):
        _, raw_key = ApiKey.generate(organization)
        client = APIClient()
        client.credentials(HTTP_X_API_KEY=raw_key)
        return client

    return _make


@pytest.fixture
def org(db):
    """A default organization for single-tenant tests."""
    return OrganizationFactory()


@pytest.fixture
def client(make_client, org):
    """A client authenticated as the default ``org``."""
    return make_client(org)
