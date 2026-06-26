from django.urls import path
from . import views

urlpatterns = [
    path('', views.list_assets, name='list_assets'),
    path('<uuid:pk>/', views.asset_detail, name='asset_detail'),
    path('<uuid:pk>/graph/', views.asset_relationships_detail, name='asset_graph'),
    path('create/', views.create_asset, name='create_asset'),
    path('import/', views.import_assets, name='import_assets'),
    path('import/batches/', views.list_batches, name='list_batches'),
    path('import/<uuid:batch_id>/rejects/', views.list_rejects, name='list_rejects'),
]