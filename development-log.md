# Development Log

This is the story of how I built the DarkAtlas Asset Management API, phase by phase.
For each phase I wrote down **what I built**, **why I made the choices I made**, and
**what I checked to confirm it worked**. It's based on the notes I kept after every work
session (the originals live in `docs/`). The language here is kept simple, but the
technical terms are kept as-is.

The stack is **Python · Django 6 · Django REST Framework · PostgreSQL · Redis**. I kept
all the views as **function-based views (FBVs)** the whole way through instead of
switching to DRF ViewSets — the useful parts of each phase (error format, pagination cap,
caching) don't depend on that choice.

---

## Infrastructure — Docker setup

**What I built**

A small Docker setup for the API: an `api/Dockerfile`, a `.dockerignore` to keep the
build lean, and a `docker-compose.yml` at the repo root with a `db` (Postgres) service
and an `app` (Django) service.

**Why**

- **The compose file lives at the repo root, not inside `api/`.** The `.env` file is at
  the root, and the `frontend/` folder is too. Compose wires up *all* the services, so it
  belongs at the level that owns them. Rule I followed: the Dockerfile lives with the
  thing it builds; the compose file lives at the level that owns every service it
  connects.
- **The container runs Django's dev server (`runserver`), not gunicorn.** This is a
  one-week take-home, so I picked dev speed and "easy to explain in an interview" over
  production hardening. Startup order is handled by compose itself — the `app` service
  waits for the database to be healthy (`depends_on` + a Postgres `pg_isready`
  healthcheck) — so I didn't need a wait-for-db script.
- **`DB_HOST` is overridden to `db` inside compose.** The `.env` file keeps
  `DB_HOST=localhost` so I can also run the app directly on my machine. Compose injects
  `DB_HOST=db` (the service name) so both ways of running work without editing `.env`.
- **The source code is bind-mounted (`./api:/app`)** so `runserver` auto-reloads on edits
  with no rebuild. The catch: changing `requirements.txt` needs a
  `docker compose up --build`, but normal code edits don't.
- **Migrations run automatically on startup**
  (`migrate && runserver`). This is safe because the database is already healthy and
  `migrate` is idempotent (running it twice does nothing extra).

**Known gap at this point:** Redis was configured in settings (`CACHES` points at
`REDIS_URL`) but had no compose service yet. `django_redis` connects lazily, so the app
still boots — only a request that actually touches the cache would fail. This got fixed
later in Phase 7.

---

## Phase 2 — Error format, pagination, Swagger, Docker/.env

**What I built**

- A consistent **error envelope** for every API error.
- A shared **pagination** class.
- **Swagger / OpenAPI** docs at `/api/docs/`.
- Fixed several Docker / `.env` problems so the stack runs with one command.

**The error envelope**

Every error now comes back in one shape:

```json
{ "error": { "code": "...", "message": "...", "details": { } } }
```

`details` only shows up on validation errors (the per-field messages). It's built in
`core/exceptions.py`: a `custom_exception_handler` wraps DRF's default handler and
reshapes the response, plus a `Conflict` exception class for `409` (DRF has no built-in
409). It's wired in through `REST_FRAMEWORK['EXCEPTION_HANDLER']`. The views were
refactored to **raise** errors (`is_valid(raise_exception=True)`, `NotFound`, `Conflict`)
instead of hand-building error dictionaries, which also made the views shorter.

One thing I learned and documented: the envelope only catches errors at the **DRF
layer**. A badly-formatted URL (like `/assets/99/` where `99` isn't a UUID) fails at
Django's **router**, before the view runs, so it returns Django's plain HTML 404 instead.
Fixing that would need Django's `handler404`/`handler500`, which I deferred.

**Pagination**

Pagination is one shared class (`core/pagination.py::StandardPagination`) rather than
copy-pasted into each view, because a second list endpoint was coming (relationships in
Phase 4). Default page size 20, client can override with `?page_size=`, capped at 100.
One caveat I noted: DRF's default pagination doesn't auto-apply to plain `@api_view`
functions, so `list_assets` creates the paginator by hand.

**Swagger**

drf-spectacular didn't recognize my custom API-key authentication, so at first the docs
showed no "Authorize" button. I added a small extension (`tenants/schema.py`) that
registers the `X-API-Key` header as a security scheme. After that the schema generates
with 0 errors and the Authorize button appears.

**The Docker / .env problems (this took the most time)**

Three separate issues were making the stack look broken:

1. **A stale `postgres_data` volume** held migration history from *before* the `tenants`
   app existed, which caused an `InconsistentMigrationHistory` error. The fix was a
   one-time `docker compose down -v` to drop the dev volume.
2. **A `$` inside `SECRET_KEY` was being silently corrupted.** This version of compose
   treats `$...` in env values as a variable reference, so part of the key was stripped
   and the app ran with a *different* key than the file. I regenerated the dev
   `SECRET_KEY` to a `$`-free value. (Only side effect: any old JWTs become invalid.
   API-key auth is unaffected because it hashes with SHA-256, which doesn't use
   `SECRET_KEY`.)
3. **The `.env` location was settled at the repo root.** One `.env` there works for both
   cases: compose reads it automatically, and `python-decouple` finds it when running the
   app locally. So plain `docker compose up` works with no extra flags.

**What I verified:** health 200, create→201, duplicate→409, tenant-scoped list,
no-key→401, and `/api/docs/` loads.

---

## Phase 3 — Bulk import & deduplication

This is the core ASM feature and the highest-weighted part of the task.

**What I built**

- `POST /api/assets/import/` — takes a JSON array of asset records and ingests them.
- An **ingest service** (`assets/services/ingest.py`) that does the real work.
- A **`RejectedRecord`** model so bad rows are saved, not thrown away.
- `GET /api/assets/import/{batch_id}/rejects/` — look at the bad rows from one import.
- A `seed` management command that imports a file using the same ingest service.
- `api/sample_data.json` — a sample dataset (good rows covering all six asset types,
  plus deliberately broken rows and a dangling relationship hint).

**How dedup works**

The ingest is **two passes**:

- **Pass 1** validates each record and does an **upsert**: it matches on
  `(organization, type, value)`. If the asset already exists it **merges** instead of
  creating a duplicate — tags are **unioned**, metadata is **shallow-merged
  (last-write-wins per key)**, `last_seen` is bumped, and a `stale` asset is flipped back
  to `active`. While doing this it builds a map of "record id → real asset" so Pass 2 can
  resolve relationships.
- **Pass 2** turns the `parent` / `covers` hints in the data into `Relationship` rows.

Each row runs inside its own savepoint (`transaction.atomic()`), so one bad row can't
roll back the good ones. The ingest returns a summary:
`{ batch_id, created, updated, skipped, relationships_created, errors, warnings }`.

**Key decisions**

- **The record's `id` (like `"a1"`) is not our primary key.** We mint our own UUIDs. The
  `id` in the file is just a label used to wire up relationships within that one batch.
- **Timestamps are server-managed.** `first_seen` is set once; `last_seen` updates on
  every re-sighting. Any timestamps in the uploaded data are ignored.
- **Bad rows are quarantined, not dropped** (the "dead-letter" pattern). Each goes into
  the `RejectedRecord` table with the raw row, the reason, its position in the batch, and
  a `batch_id`. This means a bad import can be inspected and fixed later instead of
  vanishing.
- **The summary splits `errors` from `warnings`.** `errors` are real rejected rows (and
  are saved to `RejectedRecord`); `warnings` are non-fatal issues like a relationship hint
  that couldn't be resolved. This keeps the counts honest — the number of `errors`
  matches the number of quarantined rows.
- **A clean import leaves no `RejectedRecord` rows.** A side effect of having a
  `RejectedRecord` table but no `ImportBatch` table: a fully successful batch leaves no
  trace, so its rejects URL returns 404 — the same as an unknown batch id. The documented
  future fix is an `ImportBatch` table, which would let a clean batch return `200 []`.

---

## Phase 4 — Relationships graph

**What I built**

- `GET/POST /api/relationships/` — list (with filters + pagination) and create.
- `DELETE /api/relationships/{id}/` — delete an edge.
- `GET /api/assets/{id}/graph/` — an asset together with its related assets.

**Key decisions**

- **Relationships are a top-level resource** (`/api/relationships/`), because an edge
  connects two assets and doesn't belong to just one. The **graph** endpoint stays under
  the asset (`/api/assets/{id}/graph/`) because it genuinely belongs to that one asset.
- **One view handles both GET-list and POST-create**, branching on `request.method`
  (same pattern as `asset_detail`). Swagger still documents them as two separate
  operations using stacked `@extend_schema(methods=[...])`.
- **The graph is 1-hop and shows both directions.** Each neighbor is tagged with its
  `relationship_type` and its `direction` (incoming or outgoing). I used
  `select_related` so there's no N+1 query problem. Going deeper (`?depth=`) was deferred
  because it needs BFS, a visited-set, and a hard cap to avoid abuse.
- **Relationships are create / read / delete only — no update.** An edge is fully
  identified by `(from, to, type)`, so "updating" it is just delete + create. An update
  endpoint would only make sense if edges had their own attributes (like confidence or
  source).
- **A duplicate relationship returns 409, not 400.** A `ModelSerializer` would normally
  auto-add a validator that reports duplicates as a 400. I cleared the serializer's
  validators so the duplicate instead hits the database constraint → `IntegrityError` →
  `Conflict` (409), keeping it consistent with `create_asset`.
- **Cross-tenant links are rejected.** Before saving, the view checks both assets belong
  to the caller's org. I used `organization_id` for the check to avoid extra database
  fetches.
- **Relationship types are free-form.** I designed a rule for which types may connect
  which asset types, then deliberately did **not** build it — kept relationships simple
  and documented this as an assumption.

**What I verified:** create→201, cross-tenant→400, duplicate→409, list count correct, and
the graph returning both directions.

---

## Phase 5 — Lifecycle, tagging & search

**What I built (after re-scoping)**

I first checked the plan against the actual task. The task only requires *"expose a way to
mark assets stale"*, *"tagging and search"*, and the *expired vs. expiring-soon* edge
case. So I dropped the extra dedicated endpoints I'd originally planned (separate
stale/archive/tag endpoints) and built only what's required plus what's genuinely useful:

1. **`last_seen` on re-sighting** — already handled by ingest; I confirmed PATCH bumps it
   too.
2. **Mark stale** — a `mark_stale --days N` management command, plus the existing
   `PATCH {"status": "stale"}` for marking a single asset by hand.
3. **`?q=` search** on the list endpoint — partial match on value **or** an exact tag
   match, in one query.
4. **Certificate expiry** — a read-only `cert_status` field (`expired` / `expiring_soon` /
   `valid` / `unknown`) plus a `?cert_status=` filter.

**Key decisions**

- **`last_seen` tracks discovery events, not reads.** A `GET` does **not** bump
  `last_seen` — only import, scan, or a manual edit does. "Re-sighting" means the asset
  was actually seen again on the attack surface; just browsing the inventory isn't a
  sighting. If reads bumped it, `mark_stale` would never fire.
- **Staleness is a command, not a built-in scheduler.** The command holds the *rule*; the
  *cadence* (cron / Celery Beat) is an ops concern, documented rather than built. Adding
  Celery just for this would be over-engineering for the task.
- **`mark_stale --org` is optional, default all orgs.** A management command is run by a
  trusted operator, not a tenant, so "all orgs" matches the real cron use case. `--org`
  just narrows the blast radius and `--dry-run` is the safety net. (By contrast `seed`
  *requires* `--org` because seeding is always for one tenant.)
- **The bulk update in `mark_stale` skips `auto_now` on purpose.** Marking something stale
  is not a re-sighting, so `last_seen` should stay put. Django's bulk `.update()` not
  firing `auto_now` is exactly what I want here.
- **Sticky archived.** Re-sighting returns a **stale** asset to active, but leaves an
  **archived** asset alone. Archiving is a deliberate human retirement; an automated scan
  shouldn't silently undo it. The task only asks for `stale → active`.
- **`?q=` matches exact tags, not partial-within-tag.** Postgres `ArrayField` supports
  membership (`__contains`) but not per-element partial matching without extra work. So
  `q=foo` finds the tag `foo`, not `foobar` — consistent with the existing `?tag=` filter.
- **`cert_status` compares the expiry date as a string, with no date cast.** ISO dates
  (`YYYY-MM-DD`) sort the same lexicographically as chronologically, so string comparison
  is correct **and** crash-safe — a real date cast would crash the whole query on one
  malformed date. The "expiring soon" threshold (`EXPIRING_SOON_DAYS = 30`) lives in one
  place so the field and the filter can't drift apart.
- **Malformed dates handled consistently.** The filter is gated by a regex that only lets
  well-formed ISO dates through, so a malformed `expires` is excluded from every bucket —
  matching what the field reports (`unknown`). Still pure string comparison, still
  crash-safe.

**What I verified:** `?q=` by value and by tag; the three `cert_status` buckets; invalid
`cert_status`→400; CRUD (201/409/400/404); PATCH bumping `last_seen`; the graph; rejects;
`mark_stale` with `--days 0` and `--dry-run`; cross-tenant isolation; and Swagger loading.
I also expanded `sample_data.json` to cover all five certificate cases, including a
malformed date and a no-expiry cert.

---

## Phase 6 — Tests

**What I built**

A full **pytest** suite — **70 tests, all passing** in about a second — covering every
item on the test checklist. Two small production fixes also came out of writing the tests.

**Test setup**

- `pytest.ini` points at a test settings module.
- `core/settings_test.py` inherits the real settings but swaps Redis for Django's
  in-memory `LocMemCache`, so **the tests need no Redis**. The test database is
  auto-created by pytest-django.
- `conftest.py` has fixtures, including `make_client(org)` which mints a **real API key**
  and sets the `X-API-Key` header.
- `factories.py` uses **factory_boy** for Organization / Asset / Relationship objects.

**The test modules (70 tests)** cover: dedup and idempotency, tag-union and
metadata last-write-wins merge, stale→active and sticky-archived, malformed-row
quarantine, all the list filters, ordering whitelist, pagination (default/custom/cap/
out-of-range), `cert_status`, relationship CRUD and graph in both directions, cross-tenant
isolation, auth (no/invalid/inactive key → 401), API-key hashing, and the error-envelope
shapes.

**Key decisions**

- **Tests authenticate the real way, with an API key** — never by faking
  `request.organization`. The auth and tenant-resolution layer is part of what's being
  tested, so the isolation tests are meaningful instead of tautological.
- **factory_boy for fixtures** because Phase 6 needs a lot of multi-record, multi-tenant
  setup. The factory's `value` uses a sequence so generated values never accidentally trip
  the dedup constraint.
- **Multi-tenant isolation is treated as critical** (this is a security product). Beyond
  read/list, I added cross-tenant update/delete/import-rejects tests. They all assert
  **404, not 403** — we don't even confirm another tenant's resource exists.
- **JWT is deliberately not tested, and that's a design point.** Asset endpoints authorize
  through `HasOrganization`, which reads `request.organization` — and that's only set by
  the API-key auth. A JWT alone sets `request.user` but no organization, so it can't reach
  asset endpoints. So "writes need an API key; JWT is wired but not used for asset
  authorization" is intentional, not a gap.

**Two production fixes that came from writing tests**

1. **Import batch-size cap.** `import_assets` now rejects an array longer than Django's
   `DATA_UPLOAD_MAX_NUMBER_FIELDS` (default 1000) with a 400. That Django setting doesn't
   *natively* cover a JSON array, so I enforce it myself over `len(records)` — one knob for
   "max items per request", no magic number. It stops an unbounded array from exhausting
   memory. Bigger inventories are split client-side (each import is idempotent), and
   async/Celery is the documented path for very large imports.
2. **Default ordering on relationships.** `Relationship.Meta.ordering = ['-created_at']`
   (migration `0003`) so paginated relationship lists are stable and don't raise an
   unordered-queryset warning.

**Future idea I noted (not built):** a `mark_archived` command (stale-for-N-days →
archived) that would mirror `mark_stale`. Since the model has no `status_changed_at`
field, the simplest version archives where `status == stale AND last_seen < now - N days`
(works because `last_seen` freezes once an asset goes stale). The two commands share most
of their code and could be refactored into one helper.

---

## Phase 7 — Caching, rate limiting & CI

The three "ops polish" bonus items. All built, lint clean, 70 tests still green.

**Rate limiting (per tenant)**

In `core/throttling.py`:

- **`OrganizationRateThrottle`** is the global default. It keys the throttle bucket on
  `request.organization`, **not** on IP. So one org can't use up another's budget, and
  orgs behind shared NAT aren't punished for each other. For unauthenticated callers it
  falls back to client IP.
- **`ImportRateThrottle`** is a separate, tighter bucket just for the heavy import
  endpoint, applied with a decorator that replaces the default throttle there.

Rates are env-tunable (`THROTTLE_ORG_RATE` default `1000/hour`, `THROTTLE_IMPORT_RATE`
default `60/hour`). The counters live in the cache backend. A 429 flows through the same
error envelope (`code: "throttled"`). **`/api/health/` is exempt** — the Docker/CI
healthcheck polls it about 720 times an hour and must never be limited. Throttling is
turned off in the test settings so the suite can't trip the limit.

**Read caching (tenant-aware, version-stamped)**

In `core/cache.py`:

- **Strategy: a per-org version counter.** Every cache key includes the org id and that
  org's current version number — `assets:{org}:v{n}:list:{querystring-hash}` and
  `...:detail:{pk}`. Any write (`create_asset`, `asset_detail` PUT/PATCH/DELETE,
  `import_assets`) calls `bump_version(org_id)`, which advances the counter and instantly
  orphans all of that org's old keys (they fall out by TTL).
- **Why this instead of `delete_pattern`:** it's O(1), atomic, race-free, and works on any
  backend — Redis in production and LocMemCache in tests. `django-redis`'s
  `delete_pattern` is Redis-only and scans the keyspace. The only trade-off is that old
  keys linger until they expire instead of being deleted, which is harmless.
- **Tenant-safe by construction**, because the org id is baked into every key — no
  cross-tenant leakage is possible.

`list_assets` caches the whole paginated response keyed on the querystring (so each
filter/page combination caches independently); `asset_detail` GET caches the serialized
row. TTL is `ASSET_CACHE_TTL` (default 300s; `0` disables it, which is what the test
settings use so tests never see stale data).

**CI (GitHub Actions)**

`.github/workflows/ci.yml` runs on push to `main` and every PR. It spins up a Postgres 16
service, installs the requirements, then runs three gates:

1. **ruff lint** (`ruff check .`).
2. **`makemigrations --check --dry-run`** — fails if a model change is missing its
   migration.
3. **`pytest`** — the 70-test suite, which uses LocMemCache, so **CI needs no Redis**.

`ruff` is pinned in requirements and configured in `api/ruff.toml` (line length 120,
migrations excluded). I fixed the 4 pre-existing lint issues and added a CI badge to the
README.

**docker-compose**

Added a health-gated `redis:7` service and wired the `app` service to it
(`REDIS_URL=redis://redis:6379/0` + `depends_on: redis`), so caching and throttling
counters work under `docker compose up`. This finally closed the "Redis configured but no
service" gap that had been carried since the very first infra session.

---

## Where things stand

The mandatory Track A work (CRUD, filtering/sorting/pagination, bulk import with dedup,
lifecycle, relationships graph, tagging and search, auth, validation, consistent errors,
tests, and docker-compose docs) is complete, plus the bonus items: multi-tenancy, caching,
rate limiting, and CI. The remaining bonus — a LangChain analysis feature — is noted in
the README as future work.
