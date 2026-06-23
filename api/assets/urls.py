from django.urls import path
from . import views

urlpatterns = [
    path('', views.list_assets, name='list_assets'),
    path('<uuid:pk>/', views.asset_detail, name='asset_detail'),
    path('create/', views.create_asset, name='create_asset'),
    path('import/', views.import_assets, name='import_assets'),
    path('import/<uuid:batch_id>/rejects/', views.list_rejects, name='list_rejects'),
]