// ───────────────────────────────────────────────────────────────────────────
// API client
//
// One module that the whole UI talks to. It has two backends:
//   • mock   — in-memory, no server (VITE_USE_MOCK=true)
//   • http   — the DarkAtlas Django REST API (VITE_USE_MOCK=false)
//
// Every function returns a Promise and resolves to the same shape regardless
// of backend, so pages never need to know which one is active.
//
// This http backend is wired to the *actual* Django endpoints in this repo:
//   GET    /assets/?type=&status=&tag=&q=&ordering=&page=&page_size=
//   POST   /assets/create/                  -> created asset (409 on dup -> dedup-merge)
//   GET    /assets/{id}/
//   PATCH  /assets/{id}/
//   DELETE /assets/{id}/
//   GET    /assets/{id}/graph/              -> { asset, related_assets:[{asset, relationship_type, direction}] }
//   POST   /assets/import/                  -> { batch_id, created, updated, skipped, errors, warnings }
//
// Auth is by organization API key (X-API-Key header), set via VITE_API_KEY.
// `stats()` and `ai/query` are derived client-side from the asset list (the
// backend is the Track A engineering API and exposes no /stats or /ai endpoint),
// reusing the same grounded helpers the mock backend uses.
// ───────────────────────────────────────────────────────────────────────────
import { mockApi } from './mockApi.js';
import { deriveRisks } from '../lib/risk.js';
import { parseQuery } from '../lib/aiQuery.js';
import { typeMeta, TYPE_ORDER } from '../lib/meta.js';

const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const USE_MOCK = String(import.meta.env.VITE_USE_MOCK ?? 'true') !== 'false';
const API_KEY = import.meta.env.VITE_API_KEY || '';

// ---- Auth -------------------------------------------------------------------
// The backend authenticates the tenant from an X-API-Key header (see
// tenants/authentication.py). Mint one with:
//   python manage.py create_org "Acme Corp"
// and put the printed key in frontend/.env as VITE_API_KEY.
function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (API_KEY) h['X-API-Key'] = API_KEY;
  return h;
}

async function http(path, { method = 'GET', body, params } = {}) {
  let url = BASE + path;
  if (params) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '' && v !== 'all') qs.append(k, v);
    });
    const s = qs.toString();
    if (s) url += '?' + s;
  }
  const res = await fetch(url, {
    method,
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    // The API returns a consistent envelope: { error: { code, message, details } }.
    // Surface the human-readable message; fall back to status text.
    let message = res.statusText;
    try {
      const data = await res.json();
      message = data?.error?.message || data?.detail || JSON.stringify(data);
    } catch {
      /* ignore */
    }
    const err = new Error(`${res.status} ${message}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

// DRF list responses are paginated: { count, next, previous, results }.
// Normalise to { items, count }.
function normalizeList(data) {
  if (Array.isArray(data)) return { items: data, count: data.length };
  return { items: data.results ?? [], count: data.count ?? 0 };
}

// Page through the whole inventory (used by client-side stats / AI grounding).
// The dataset is small and page_size is capped at 100 server-side.
async function fetchAllAssets() {
  const pageSize = 100;
  let page = 1;
  let all = [];
  let count = Infinity;
  while (all.length < count) {
    const { items, count: c } = normalizeList(
      await http('/assets/', { params: { page, page_size: pageSize } })
    );
    count = c;
    all = all.concat(items);
    if (items.length === 0) break;
    page += 1;
  }
  return all;
}

// Find an existing asset by exact (type, value) — used to honour the
// "creating a duplicate updates instead" UX when the backend returns 409.
async function findExisting(type, value) {
  const v = value.trim().toLowerCase();
  const { items } = await httpApi.listAssets({ type, search: value, pageSize: 100 });
  return items.find((a) => a.type === type && (a.value || '').toLowerCase() === v) || null;
}

// ---- HTTP backend -----------------------------------------------------------
const httpApi = {
  async listAssets({ type, status, tag, search, ordering, page = 1, pageSize = 8 } = {}) {
    // The backend's combined search param is `q` (value contains OR exact tag).
    const data = await http('/assets/', {
      params: { type, status, tag, q: search, ordering, page, page_size: pageSize },
    });
    return normalizeList(data);
  },

  me: () => http('/me/'),

  getAsset: (id) => http(`/assets/${id}/`),

  // Create is dedup-aware: the backend rejects a duplicate (type, value) with
  // 409, so we fall back to merging into the existing asset — matching the
  // mock backend and the form's "updates instead of duplicating" promise.
  async createAsset(payload) {
    try {
      return await http('/assets/create/', { method: 'POST', body: payload });
    } catch (e) {
      if (e.status !== 409) throw e;
      const existing = await findExisting(payload.type, payload.value || '');
      if (!existing) throw e;
      return http(`/assets/${existing.id}/`, {
        method: 'PATCH',
        body: {
          status: 'active',
          tags: Array.from(new Set([...(existing.tags || []), ...(payload.tags || [])])),
          metadata: { ...(existing.metadata || {}), ...(payload.metadata || {}) },
        },
      });
    }
  },

  updateAsset: (id, payload) => http(`/assets/${id}/`, { method: 'PATCH', body: payload }),
  deleteAsset: (id) => http(`/assets/${id}/`, { method: 'DELETE' }),

  // The backend's per-asset graph endpoint returns both directions with
  // `relationship_type`; flatten to the [{ asset, relation }] the UI expects,
  // de-duplicated by neighbour (one row per related asset).
  async relationships(id) {
    const data = await http(`/assets/${id}/graph/`);
    const out = [];
    const seen = new Set();
    for (const r of data.related_assets || []) {
      const a = r.asset;
      if (a && !seen.has(a.id)) {
        seen.add(a.id);
        out.push({ asset: a, relation: r.relationship_type });
      }
    }
    return out;
  },

  // The backend ingest summary uses { created, updated, skipped, errors[],
  // warnings[] }. Map it to the { created, updated, skipped, log } the import
  // page renders. Per-row "created/updated" detail isn't returned, so the log
  // surfaces the import totals plus every rejected/warned row.
  async bulkImport(records) {
    const s = await http('/assets/import/', { method: 'POST', body: records });
    const log = [];
    if (s.created || s.updated) {
      const parts = [];
      if (s.created) parts.push(`${s.created} created`);
      if (s.updated) parts.push(`${s.updated} updated`);
      log.push({ value: parts.join(', '), status: 'IMPORTED', color: '#46c66a' });
    }
    for (const w of s.warnings || []) {
      log.push({ value: w.reason, status: 'WARN', color: '#57c7e8' });
    }
    // Rejected rows are returned inline AND persisted under batch_id; surface
    // both the structured rejects and the batch id so the UI can re-fetch them.
    return {
      created: s.created || 0,
      updated: s.updated || 0,
      skipped: s.skipped || 0,
      batchId: s.batch_id,
      rejects: (s.errors || []).map((e) => ({ index: e.index, reason: e.reason, record: e.record })),
      log,
    };
  },

  // Recent import batches that produced quarantined rows (aggregated by batch).
  async rejectBatches({ page = 1, pageSize = 20 } = {}) {
    const data = await http('/assets/import/batches/', {
      params: { page, page_size: pageSize },
    });
    return normalizeList(data);
  },

  // Persisted quarantine for one import batch (survives the import response).
  async rejects(batchId, { page = 1, pageSize = 50 } = {}) {
    const data = await http(`/assets/import/${batchId}/rejects/`, {
      params: { page, page_size: pageSize },
    });
    return normalizeList(data);
  },

  // Derived client-side from the asset list — the backend has no /stats endpoint.
  async stats() {
    const assets = await fetchAllAssets();
    const byType = {};
    const byStatus = {};
    assets.forEach((a) => {
      byType[a.type] = (byType[a.type] || 0) + 1;
      byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    });
    return {
      total: assets.length,
      by_type: TYPE_ORDER.filter((t) => byType[t]).map((t) => ({
        type: t,
        label: typeMeta(t).label,
        count: byType[t],
      })),
      by_status: ['active', 'stale', 'archived']
        .filter((s) => byStatus[s])
        .map((s) => ({ status: s, count: byStatus[s] })),
      risks: deriveRisks(assets),
      recent: assets
        .slice()
        .sort((a, b) => String(b.last_seen).localeCompare(String(a.last_seen)))
        .slice(0, 6),
    };
  },

  // Grounded NL query: translate to filters and apply them to the real,
  // fetched dataset so the answer can only ever contain assets that exist.
  async aiQuery(q) {
    const assets = await fetchAllAssets();
    const { chips, results, answer } = parseQuery(q, assets);
    return { chips, answer, results };
  },
};

export const api = USE_MOCK ? mockApi : httpApi;
export const IS_MOCK = USE_MOCK;
