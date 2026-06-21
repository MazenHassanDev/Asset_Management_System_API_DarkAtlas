from rest_framework import serializers
from .models import Asset, Relationship

class AssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Asset
        fields = [
            'id', 'type', 'value', 'status',
            'first_seen', 'last_seen', 'source',
            'tags', 'metadata',
        ]
        read_only_fields = ['id', 'first_seen', 'last_seen']


class RelationshipSerializer(serializers.ModelSerializer):
    class Meta:
        model = Relationship
        fields = [
            'id', 'from_asset', 'to_asset',
            'relationship_type', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']