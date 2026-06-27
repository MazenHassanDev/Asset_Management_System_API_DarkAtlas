# DarkAtlas — Asset Management API

[![CI](https://github.com/MazenHassanDev/Asset_Management_System_API_DarkAtlas/actions/workflows/ci.yml/badge.svg)](https://github.com/MazenHassanDev/Asset_Management_System_API_DarkAtlas/actions/workflows/ci.yml)

A multi-tenant REST API for the **Asset Management** module of DarkAtlas, Buguard's
Attack Surface Monitoring (ASM) platform. It is the system of record that ingests
discovered assets — domains, subdomains, IPs, services, certificates, technologies —
deduplicates them, tracks each asset's lifecycle and relationships, and exposes
everything for querying, filtering, and reporting.

This is **Track A — Backend Engineering**. No scanners or live integrations are
included; the focus is modeling, storing, and working with asset data well.

---

## Table of contents

- [Stack & why Django (not FastAPI)](#stack--why-django-not-fastapi)
- [Quick start](#quick-start)
- [Authentication](#authentication)
- [Environment variables](#environment-variables)
- [API reference](#api-reference)
- [Data model](#data-model)
- [Multi-tenancy](#multi-tenancy)
- [Design decisions & assumptions](#design-decisions--assumptions)
- [Edge cases handled](#edge-cases-handled)
- [Running the tests](#running-the-tests)
- [Seeding & management commands](#seeding--management-commands)
- [Caching, rate limiting & CI](#caching-rate-limiting--ci)
- [Frontend](#frontend)
- [Project structure](#project-structure)
- [What I'd do next](#what-id-do-next)
- [Development log](#development-log)

---

## Stack & why Django (not FastAPI)

**Python · Django 6 · Django REST Framework · PostgreSQL · Redis**

The task suggests FastAPI but allows a justified deviation. I went with **Django + DRF**
for two honest reasons: I don't yet know FastAPI, and within the one-week window I
couldn't have learned it and shipped a complete API on top — so I built in the stack I
know well rather than risk a weaker result. I'm keen to learn FastAPI going forward.

Django also happens to fit this problem well: the domain is data-modeling-heavy (dedup
constraints, per-tenant uniqueness, `ArrayField`/`JSONField`, indexing, migrations), DRF's
auth/permission layer makes the cross-cutting multi-tenancy clean, and `drf-spectacular`
still gives the auto-generated Swagger docs at `/api/docs/` that FastAPI is praised for.

---

## Quick start

**Prerequisites:** Docker + Docker Compose.

```bash
# 1. Configure environment
cp .env.example .env
# Open .env and fill in: SECRET_KEY, DB_NAME, DB_USER, DB_PASSWORD, DB_PORT
#   (DB_HOST and REDIS_URL are overridden for you inside compose)

# 2. Bring up the whole stack (Postgres + Redis + API + frontend)
docker compose up --build
```

This starts four services with health-gated startup ordering:

| Service    | Port   | What it is                                  |
|------------|--------|---------------------------------------------|
| `db`       | 5432   | PostgreSQL 16                               |
| `redis`    | 6379   | Redis 7 (cache + throttle counters)         |
| `app`      | 8000   | Django/DRF API (runs migrations on boot)    |
| `frontend` | 5173   | React/Vite prototype UI                     |

Then:

- **API root / docs:** http://localhost:8000/api/docs/ (Swagger UI)
- **Health check:** http://localhost:8000/api/health/
- **Frontend UI:** http://localhost:5173/

To use the API you need an organization and an API key — see
[Authentication](#authentication) below.

> **Running locally without Docker** is also supported: create a virtualenv,
> `pip install -r api/requirements.txt`, point `.env` at a local Postgres/Redis
> (`DB_HOST=localhost`), then `python api/manage.py migrate && python api/manage.py runserver`.

---

## Authentication

The API is **machine-to-machine** and authenticates with an **API key** sent in the
`X-API-Key` header. Each key belongs to exactly one organization (tenant); the key
resolves `request.organization`, and every asset/relationship endpoint is scoped to it.

**Mint an organization + key** (inside the running `app` container, or locally):

```bash
docker compose exec app python manage.py create_org "Acme Corp"
```

This prints a raw key **once** (it is stored only as a SHA-256 hash and never shown
again):

```
Created organization 'Acme Corp' (…uuid…)

API key created. Store it now — it will NOT be shown again:

  dk_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

**Use it:**

```bash
curl -H "X-API-Key: dk_live_XXXX…" http://localhost:8000/api/me/
# → {"id": "…", "name": "Acme Corp"}
```

> **JWT** (`/api/token/`, `/api/token/refresh/`) is wired and available, but the asset
> endpoints authorize via the API key → organization. JWT is kept for a future
> user-facing login flow; see [Design decisions](#design-decisions--assumptions).

---

## Environment variables

All configuration is read from `.env` via `python-decouple`. Secrets are never
committed — `.env.example` documents every variable:

| Variable              | Required | Default            | Description                                              |
|-----------------------|----------|--------------------|----------------------------------------------------------|
| `SECRET_KEY`          | ✅       | —                  | Django secret key.                                       |
| `DEBUG`               |          | `False`            | Never run with `True` in production.                     |
| `ALLOWED_HOSTS`       |          | `127.0.0.1,localhost` | Comma-separated allowed hosts.                        |
| `DB_NAME`             | ✅       | —                  | PostgreSQL database name.                                |
| `DB_USER`             | ✅       | —                  | PostgreSQL user.                                         |
| `DB_PASSWORD`         | ✅       | —                  | PostgreSQL password.                                     |
| `DB_HOST`             |          | `localhost`        | Overridden to `db` inside compose.                       |
| `DB_PORT`             |          | `5432`             | PostgreSQL port.                                         |
| `REDIS_URL`           |          | `redis://localhost:6379/0` | Cache + throttle backend. Overridden to `redis://redis:6379/0` in compose. |
| `ASSET_CACHE_TTL`     |          | `300`              | Seconds to cache asset reads. `0` disables caching.      |
| `THROTTLE_ORG_RATE`   |          | `1000/hour`        | Per-organization request budget.                         |
| `THROTTLE_IMPORT_RATE`|          | `60/hour`          | Tighter budget for the bulk-import endpoint.             |

---

## API reference

Base URL: `http://localhost:8000`. All `/api/assets/...` and `/api/relationships/...`
endpoints require the `X-API-Key` header. Interactive docs: **`/api/docs/`**
(OpenAPI schema at `/api/schema/`).

### Meta / auth

| Method | Path                  | Description                                  |
|--------|-----------------------|----------------------------------------------|
| GET    | `/api/health/`        | Liveness check (throttle-exempt).            |
| GET    | `/api/me/`            | The org the API key belongs to.              |
| POST   | `/api/token/`         | Obtain JWT (dormant; see auth notes).        |
| POST   | `/api/token/refresh/` | Refresh JWT.                                 |

### Assets

| Method            | Path                                   | Description                                              |
|-------------------|----------------------------------------|----------------------------------------------------------|
| GET               | `/api/assets/`                         | List with filtering, search, sorting, pagination.        |
| POST              | `/api/assets/create/`                  | Create a single asset (`409` on dup type+value).         |
| GET               | `/api/assets/{id}/`                    | Retrieve one asset.                                      |
| PUT / PATCH       | `/api/assets/{id}/`                    | Replace / partially update.                              |
| DELETE            | `/api/assets/{id}/`                    | Delete.                                                  |
| GET               | `/api/assets/{id}/graph/`              | Asset + its 1-hop relationship graph (both directions).  |
| POST              | `/api/assets/import/`                  | Bulk import (dedup + merge + quarantine).                |
| GET               | `/api/assets/import/batches/`          | Import batches that produced rejected rows.              |
| GET               | `/api/assets/import/{batch_id}/rejects/` | Quarantined rows from one import batch.               |

**List query parameters** (`GET /api/assets/`):

| Param         | Description                                                              |
|---------------|--------------------------------------------------------------------------|
| `type`        | Filter by asset type (`domain`, `subdomain`, `ip_address`, `service`, `certificate`, `technology`). |
| `status`      | Filter by status (`active`, `stale`, `archived`).                        |
| `tag`         | Return assets carrying this exact tag.                                   |
| `value`       | Case-insensitive partial match on the value.                            |
| `q`           | Search: partial value match **or** exact tag match.                      |
| `cert_status` | Certificates only: `expired`, `expiring_soon`, `valid`.                  |
| `ordering`    | One of `last_seen`, `-last_seen`, `first_seen`, `-first_seen`, `value`, `-value` (default `-last_seen`). |
| `page`        | 1-based page number.                                                     |
| `page_size`   | Items per page (default 20, max 100).                                    |

### Relationships

| Method | Path                          | Description                                                   |
|--------|-------------------------------|---------------------------------------------------------------|
| GET    | `/api/relationships/`         | List (optional `from_asset` / `to_asset` filters, paginated). |
| POST   | `/api/relationships/`         | Create an edge between two assets in your org.                |
| DELETE | `/api/relationships/{id}/`    | Delete an edge.                                               |

### Error format

Every error uses one consistent envelope:

```json
{ "error": { "code": "validation_error", "message": "…", "details": { } } }
```

`details` appears only for validation errors. Codes include `validation_error` (400),
`authentication_failed` (401), `not_found` (404), `conflict` (409), `throttled` (429).

> **Cross-tenant reads return `404`, not `403`** — an org cannot even confirm the
> existence of another org's asset.

---

## Data model

**`Asset`** — UUID PK, `organization` FK, `type`/`status`/`source` enums, `value`,
server-managed `first_seen` (`auto_now_add`) and `last_seen` (`auto_now`), `tags`
(Postgres `ArrayField`), `metadata` (`JSONField`).
Dedup is enforced by a **per-tenant** unique constraint `(organization, type, value)`,
plus a composite index `(organization, type, status)` for the common filtered list.

**`Relationship`** — UUID PK, `organization` FK, `from_asset`/`to_asset` FKs,
`relationship_type` enum, `created_at`. Unique triple `(from_asset, to_asset,
relationship_type)`. Models the ASM graph: subdomain→domain, service→ip, cert→domain,
tech→service, etc.

**`RejectedRecord`** — quarantine table for import rows that fail validation: stores
the raw row (even non-dicts), the failure `reason`, its `index` in the batch, and a
`batch_id` so a bad import can be inspected and replayed rather than silently dropped.

**`Organization`** / **`ApiKey`** (tenants app) — a tenant and its keys. Keys are stored
as **SHA-256 hashes** (`key_hash`); the raw key is shown once at creation and never
persisted.

---

## Multi-tenancy

Multi-tenant isolation is a bonus, but it's foundational here — every model carries an
`organization` FK and every query is scoped to `request.organization`, which is resolved
from the API key by a custom DRF authentication class. The org is **stamped from the key
at save time, never read from the request body**, so a caller cannot write into another
tenant. Cross-tenant reads return `404`. Dedup is per-tenant, so the same
`(type, value)` can legitimately exist in two different organizations.

---

## Design decisions & assumptions

> The task asks to "state any assumptions you make." These are the load-bearing ones;
> the full reasoning lives in the [development log](#development-log).

- **Import record `id`s are batch-local labels, not our PKs.** We mint UUID primary
  keys. The `"id"` / `parent` / `covers` fields in the import payload are used only to
  wire up relationships within that batch.
- **Timestamps are server-managed.** `first_seen` is set once on creation; `last_seen`
  is bumped on every re-sighting (import or manual edit). Any timestamps in the payload
  are ignored. **Reads (`GET`) do not bump `last_seen`** — only discovery/edit events do.
- **Merge strategy on dedup:** tags = **union**; metadata = **shallow merge,
  last-write-wins per key**. A re-imported asset updates rather than duplicates.
- **Reactivation is for `stale` only.** A re-sighted `stale` asset returns to `active`;
  an `archived` asset stays archived (archival is a deliberate retirement).
- **Marking stale** is exposed via `PATCH /api/assets/{id}/ {"status": "stale"}` for a
  single asset, and via the `mark_stale` management command (intended for a cron) for
  bulk aging by a staleness window. No dedicated `/stale` endpoint — it would duplicate
  the existing PATCH.
- **Relationships are create/read/delete only.** An edge is fully identified by
  `(from, to, type)`, so "updating" one is just delete + create. An update endpoint
  would only be warranted if edges gained their own attributes (confidence, source).
- **Graph depth is 1 hop**, both directions. Deep traversal (`?depth=`) is a documented
  future extension.
- **Relationship types are free-form** between any two assets (no semantic validation of
  which types may connect which asset types) — kept simple by design.
- **Import batch size is capped** at `DATA_UPLOAD_MAX_NUMBER_FIELDS` (default 1000) to
  prevent an unbounded array from exhausting memory. Larger inventories are split
  client-side; async/Celery is the documented path for very large imports.
- **A clean import leaves no `RejectedRecord`s**, so the rejects endpoint for a fully
  successful batch returns `404` (indistinguishable from an unknown batch id). A
  dedicated `ImportBatch` table would let it return `200 []`; deferred as a scope choice.
- **Auth model:** API keys for machine-to-machine ingest now; JWT is wired for a future
  user login/RBAC layer (User ↔ Organization membership with roles) but dormant.

### Security posture

This is a security product, so: inputs are validated everywhere; API keys are stored
hashed and never logged; `DEBUG` defaults to `False`; secrets stay in `.env`
(`.env.example` is the template); cross-tenant access is impossible by construction; and
the import endpoint is size-capped and rate-limited as an abuse guard.

---

## Edge cases handled

Mapped to the task's §7 list:

| Edge case                         | How it's handled                                                       |
|-----------------------------------|------------------------------------------------------------------------|
| Idempotent imports                | Re-importing the same data updates `last_seen`/merges; no duplicates.  |
| Conflicting data from two sources | Tags unioned, metadata shallow-merged last-write-wins.                 |
| Re-appearing assets               | `stale` → `active` on re-sighting; `archived` stays archived.          |
| Malformed / partial records       | Per-row validation; bad rows quarantined to `RejectedRecord`, batch continues. |
| Large lists                       | Pagination with sane default (20) and hard cap (100); import size cap. |
| Certificate lifecycle dates       | `cert_status` (`expired`/`expiring_soon`/`valid`/`unknown`), crash-safe on malformed dates. |
| Multi-tenant isolation            | Org-scoped queries; cross-tenant reads `404`; org stamped from key.    |

---

## Running the tests

71 tests (`pytest` + `pytest-django` + `factory_boy`) cover dedup, filtering/sorting/
pagination, relationships/graph, multi-tenant isolation, auth, the error envelope, and
import edge cases.

```bash
# Inside the container
docker compose exec app python -m pytest

# Or locally (from api/)
cd api && python -m pytest
```

The suite runs under `core.settings_test`, which swaps Redis for Django's in-memory
cache — **no Redis needed to run the tests** — and disables throttling/read-caching so
fixtures are never served stale or rate-limited.

---

## Seeding & management commands

A sample dataset lives at `api/sample_data.json` (37 valid records spanning all six
asset types + 5 deliberately malformed rows to exercise the quarantine path).

```bash
# Create an org (prints an API key)
docker compose exec app python manage.py create_org "Acme Corp"

# Seed the sample data into that org
docker compose exec app python manage.py seed sample_data.json --org "Acme Corp"

# Or import over HTTP
curl -X POST http://localhost:8000/api/assets/import/ \
  -H "X-API-Key: dk_live_XXXX…" -H "Content-Type: application/json" \
  --data-binary @api/sample_data.json

# Age out assets not seen in N days (intended for a cron)
docker compose exec app python manage.py mark_stale --days 30 --dry-run
```

Both seed and import return the same summary:
`{ created, updated, skipped, relationships_created, batch_id, errors, warnings }`.

---

## Caching, rate limiting & CI

- **Caching** — asset list/detail reads are cached in Redis with a **per-org version
  counter**: every cache key embeds the org id and a version number, and any write bumps
  the counter, atomically orphaning that org's stale keys (O(1), backend-agnostic,
  tenant-safe). TTL via `ASSET_CACHE_TTL` (`0` disables).
- **Rate limiting** — throttling is keyed on the **organization** (the API key), not IP,
  so one tenant can't exhaust another's budget and tenants behind shared NAT aren't
  penalized. The bulk-import endpoint gets a separate, tighter bucket. Both rates are
  env-tunable; `/api/health/` is exempt.
- **CI** — GitHub Actions runs on push to `main` and every PR: `ruff` lint,
  `makemigrations --check` (catches model/migration drift), and the full `pytest` suite
  against a Postgres service. No Redis needed (tests use the in-memory cache).

---

## Frontend

`frontend/` contains a small React/Vite prototype UI wired to the live API (sends
`X-API-Key`, proxies `/api` to the backend). It comes up automatically at
http://localhost:5173 with `docker compose up`. Paste an API key in the UI to browse the
seeded inventory. It's a convenience/demo layer, not part of the Track A deliverable.

---

## Project structure

```
api/
  core/        # settings, urls, pagination, error envelope, cache, throttling, health
  assets/      # Asset/Relationship/RejectedRecord models, views, serializers,
               #   ingest service, seed/mark_stale commands, tests
  tenants/     # Organization/ApiKey models, API-key auth, permissions, create_org
  sample_data.json
docker-compose.yml   # db + redis + app + frontend
frontend/            # React/Vite prototype UI
docs/                # dated per-phase development log (decision history)
PROJECT_PLAN.md      # internal phased build tracker
```

---

## What I'd do next

In priority order, given more time:

1. **LangChain analysis feature (Track B bonus)** — e.g. a natural-language →
   validated-filter query endpoint, grounded in the DB so the model can't invent assets.
   I haven't worked with LangChain and wouldn't know how to implement it today, so this is
   something I'd need to learn first — it's the main thing I'd reach for next.
2. **`ImportBatch` table** — so clean batches are queryable (`200 []`) and 404 is reserved
   for genuinely unknown ids.
3. **User login + RBAC** — activate the dormant JWT layer with User ↔ Organization
   membership and roles.
4. **Graph depth** — optional `?depth=` traversal beyond 1 hop.

---

## Development log

For the full story behind this project — my thinking, the decisions I made, the
alternatives I weighed, and what I verified at each step — see the combined
**[development log](development-log.md)**. It walks through the build phase by phase,
from the Docker skeleton through multi-tenancy, bulk import/dedup, the relationships
graph, lifecycle/search, the test suite, and the caching/throttling/CI bonuses.
