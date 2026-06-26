# DarkAtlas — Asset Management Console

A React + Tailwind frontend for the DarkAtlas Attack Surface Monitoring **Asset
Management** module. Ships with an in-memory mock backend so it runs with zero
setup, and a thin API layer designed to drop straight onto a **Django REST
Framework** API.

## Stack

- **Vite** + **React 18** (`react-router-dom`)
- **Tailwind CSS** v3
- No component library — everything is plain JSX + Tailwind classes

## Quick start

```bash
npm install
cp .env.example .env     # defaults to mock mode
npm run dev              # http://localhost:5173
```

Out of the box it runs on mock data (the `MOCK DATA` chip shows in the top bar).
Flip to your real API by editing `.env`:

```ini
VITE_API_URL=http://localhost:8000/api
VITE_USE_MOCK=false
```

## How it's wired

Every page talks to **one** module: `src/api/client.js`. It exports `api`, which
is either the mock implementation (`src/api/mockApi.js`) or the HTTP
implementation, chosen by `VITE_USE_MOCK`. Both expose the identical surface, so
no page knows or cares which backend is live:

```
api.listAssets({ type, status, tag, search, ordering, page, pageSize }) -> { items, count }
api.getAsset(id)            -> asset
api.createAsset(payload)    -> asset      // dedup-aware (type+value)
api.updateAsset(id, patch)  -> asset
api.deleteAsset(id)         -> null
api.relationships(id)       -> [{ asset, relation }]
api.bulkImport(records)     -> { created, updated, skipped, log }
api.stats()                 -> { total, by_type, by_status, risks, recent }
api.aiQuery(q)              -> { chips, answer, results }
```

To wire your Django API you only touch **`src/api/client.js`** (the `httpApi`
object) — the pages, components, and helpers stay untouched.

## Expected Django REST endpoints

Base URL = `VITE_API_URL`. Adjust paths in `httpApi` if yours differ.

| Method | Path | Notes |
|---|---|---|
| GET | `/assets/` | query params: `type`, `status`, `tag`, `search`, `ordering`, `page`, `page_size` |
| POST | `/assets/` | create; should dedup on `type`+`value` and update instead |
| GET | `/assets/{id}/` | retrieve |
| PATCH | `/assets/{id}/` | partial update |
| DELETE | `/assets/{id}/` | delete |
| GET | `/assets/{id}/relationships/` | `[{ asset: {...}, relation: "subdomain_of" }]` |
| POST | `/assets/import/` | body = JSON array; returns `{created, updated, skipped, log}` |
| GET | `/stats/` | dashboard aggregates (see shape below) |
| POST | `/ai/query/` | body `{ q }`; returns `{ chips, answer, results }` |

The client already handles DRF's paginated list shape
(`{ count, next, previous, results }`) — it normalises to `{ items, count }`.

### Asset shape

```jsonc
{
  "id": "a2",
  "type": "subdomain",          // domain|subdomain|ip_address|service|certificate|technology
  "value": "api.example.com",
  "status": "active",           // active|stale|archived
  "source": "scan",             // manual|scan|import
  "tags": ["prod"],
  "metadata": { "http_status": 200 },   // free-form JSON
  "first_seen": "2024-03-14",
  "last_seen": "2026-06-25"
}
```

### `/stats/` shape

```jsonc
{
  "total": 26,
  "by_type":   [{ "type": "subdomain", "label": "Subdomain", "count": 8 }],
  "by_status": [{ "status": "active", "count": 21 }],
  "risks":     [{ "sev": "critical", "title": "...", "detail": "...", "id": "a21" }],
  "recent":    [ /* up to 6 most-recently-seen asset objects */ ]
}
```

If you don't build `/stats/` server-side yet, you can compute it from a plain
asset list — see `mockApi.stats()` and `src/lib/risk.js` for a reference
implementation you can port to Python.

## Suggested Django models & serializer

```python
# models.py
class Asset(models.Model):
    TYPE_CHOICES = [("domain","domain"),("subdomain","subdomain"),
                    ("ip_address","ip_address"),("service","service"),
                    ("certificate","certificate"),("technology","technology")]
    STATUS_CHOICES = [("active","active"),("stale","stale"),("archived","archived")]

    type       = models.CharField(max_length=20, choices=TYPE_CHOICES)
    value      = models.CharField(max_length=255)
    status     = models.CharField(max_length=12, choices=STATUS_CHOICES, default="active")
    source     = models.CharField(max_length=20, default="manual")
    tags       = models.JSONField(default=list)
    metadata   = models.JSONField(default=dict)
    first_seen = models.DateField(auto_now_add=True)
    last_seen  = models.DateField(auto_now=True)

    class Meta:
        unique_together = ("type", "value")   # enforces dedup at the DB level


class Relationship(models.Model):
    from_asset = models.ForeignKey(Asset, related_name="rel_out", on_delete=models.CASCADE)
    to_asset   = models.ForeignKey(Asset, related_name="rel_in",  on_delete=models.CASCADE)
    type       = models.CharField(max_length=32)   # subdomain_of|resolves_to|runs_on|secures|detected_on
```

```python
# views.py — list filtering matches the query params the client sends
class AssetViewSet(viewsets.ModelViewSet):
    queryset = Asset.objects.all()
    serializer_class = AssetSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["type", "status"]
    search_fields = ["value", "tags"]
    ordering_fields = ["value", "type", "status", "last_seen"]

    def get_queryset(self):
        qs = super().get_queryset()
        tag = self.request.query_params.get("tag")
        if tag and tag != "all":
            qs = qs.filter(tags__contains=[tag])
        return qs

    @action(detail=True, methods=["get"])
    def relationships(self, request, pk=None):
        ...   # return [{ "asset": AssetSerializer(other).data, "relation": rel.type }]

    @action(detail=False, methods=["post"])
    def import_(self, request):   # route as /assets/import/
        ...   # upsert on (type, value); tally created/updated/skipped
```

## Auth

`src/api/client.js` sends the session cookie (`credentials: "include"`) and
echoes Django's `csrftoken` as `X-CSRFToken` on unsafe methods. If you use
Token/JWT instead, set `Authorization` in `authHeaders()` and remove the CSRF
bits. For cross-origin dev, either enable `django-cors-headers` or use the Vite
proxy already configured in `vite.config.js` (set `VITE_API_URL=/api`).

## Project layout

```
src/
  api/
    client.js        # the only file you edit to wire Django
    mockApi.js       # in-memory backend (mirrors the HTTP surface)
  components/
    Sidebar.jsx  Topbar.jsx  RelationshipGraph.jsx  ui.jsx
  pages/
    Dashboard.jsx  Inventory.jsx  AssetDetail.jsx
    AssetForm.jsx  BulkImport.jsx  AIAnalysis.jsx
  lib/
    meta.js          # type/status metadata + date helpers
    risk.js          # risk derivation (port to Python for /stats/)
    aiQuery.js       # NL→filter translation (or call /ai/query/)
  data/mock.js       # seed dataset
```

## Notes

- The AI panel is intentionally **grounded**: it only ever returns assets present
  in the data. The mock translator lives in `src/lib/aiQuery.js`; to use a real
  LLM-backed endpoint, set `VITE_USE_MOCK=false` and implement `/ai/query/`.
- Dates use a fixed "now" (`NOW` in `src/lib/meta.js`) so the seeded data reads
  consistently. Relative times come from the server's real dates once live.
