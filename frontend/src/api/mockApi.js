// In-memory backend implementing the same surface as httpApi.
// Lets the whole app run with VITE_USE_MOCK=true and no Django server.
// Mutations persist for the browser session (module-level arrays).
import { MOCK_ASSETS, MOCK_RELATIONSHIPS } from '../data/mock.js';
import { deriveRisks } from '../lib/risk.js';
import { parseQuery } from '../lib/aiQuery.js';
import { typeMeta, TYPE_ORDER, todayISO } from '../lib/meta.js';

let assets = MOCK_ASSETS.map((a) => ({ ...a, tags: [...a.tags], metadata: { ...a.metadata } }));
let rels = MOCK_RELATIONSHIPS.map((r) => ({ ...r }));
// Persisted quarantine, keyed by batch id — mirrors the backend RejectedRecord table.
let rejectBatches = {};

const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const clone = (x) => JSON.parse(JSON.stringify(x));

function nextId() {
  const n = Math.max(0, ...assets.map((x) => parseInt((x.id || '').replace(/\D/g, '')) || 0));
  return 'a' + (n + 1);
}

function applyFilters(arr, { type, status, tag, search }) {
  return arr.filter((a) => {
    if (type && type !== 'all' && a.type !== type) return false;
    if (status && status !== 'all' && a.status !== status) return false;
    if (tag && tag !== 'all' && !(a.tags || []).includes(tag)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !a.value.toLowerCase().includes(q) &&
        !(a.tags || []).some((t) => t.toLowerCase().includes(q))
      )
        return false;
    }
    return true;
  });
}

// ordering: "value" asc, "-last_seen" desc (DRF convention)
function applyOrdering(arr, ordering) {
  if (!ordering) return arr;
  const dir = ordering.startsWith('-') ? -1 : 1;
  const key = ordering.replace(/^-/, '');
  return arr.slice().sort((x, y) => {
    const xv = x[key], yv = y[key];
    if (xv < yv) return -1 * dir;
    if (xv > yv) return 1 * dir;
    return 0;
  });
}

export const mockApi = {
  async me() {
    await wait(40);
    return { id: 'mock-org', name: 'Acme Corp' };
  },

  async listAssets({ type, status, tag, search, ordering, page = 1, pageSize = 8 } = {}) {
    await wait();
    let arr = applyFilters(assets, { type, status, tag, search });
    arr = applyOrdering(arr, ordering);
    const count = arr.length;
    const start = (page - 1) * pageSize;
    return { items: clone(arr.slice(start, start + pageSize)), count };
  },

  async getAsset(id) {
    await wait(80);
    const a = assets.find((x) => x.id === id);
    if (!a) throw new Error('404 not found');
    return clone(a);
  },

  // dedup-aware create: same type+value updates instead of duplicating
  async createAsset(payload) {
    await wait();
    const val = (payload.value || '').trim();
    const today = todayISO();
    const existing = assets.find(
      (x) => x.type === payload.type && x.value.toLowerCase() === val.toLowerCase()
    );
    if (existing) {
      existing.last_seen = today;
      existing.status = 'active';
      existing.tags = Array.from(new Set([...(existing.tags || []), ...(payload.tags || [])]));
      existing.metadata = { ...existing.metadata, ...(payload.metadata || {}) };
      return clone(existing);
    }
    const a = {
      id: nextId(),
      type: payload.type,
      value: val,
      status: payload.status || 'active',
      source: payload.source || 'manual',
      tags: payload.tags || [],
      metadata: payload.metadata || {},
      first_seen: today,
      last_seen: today,
    };
    assets.push(a);
    return clone(a);
  },

  async updateAsset(id, payload) {
    await wait();
    const a = assets.find((x) => x.id === id);
    if (!a) throw new Error('404 not found');
    Object.assign(a, payload, { last_seen: todayISO() });
    return clone(a);
  },

  async deleteAsset(id) {
    await wait();
    assets = assets.filter((a) => a.id !== id);
    rels = rels.filter((r) => r.from !== id && r.to !== id);
    return null;
  },

  async relationships(id) {
    await wait(80);
    const byId = Object.fromEntries(assets.map((a) => [a.id, a]));
    const out = [];
    const seen = new Set();
    for (const r of rels) {
      let other = null;
      if (r.from === id && byId[r.to]) other = byId[r.to];
      else if (r.to === id && byId[r.from]) other = byId[r.from];
      if (other && !seen.has(other.id)) {
        seen.add(other.id);
        out.push({ asset: clone(other), relation: r.type });
      }
    }
    return out;
  },

  async bulkImport(records) {
    await wait(250);
    const valid = TYPE_ORDER;
    const today = todayISO();
    const batchId = 'batch-' + Math.random().toString(36).slice(2, 10);
    let created = 0, updated = 0, skipped = 0;
    const log = [];
    const rejects = [];
    const reject = (i, rec, reason) => {
      skipped++;
      rejects.push({ index: i, record: rec, reason, created_at: new Date().toISOString() });
    };
    if (!Array.isArray(records)) {
      return {
        created: 0, updated: 0, skipped: 0, batchId, rejects: [],
        log: [{ value: 'Expected a JSON array', status: 'ERROR', color: '#ec6a5e' }],
      };
    }
    records.forEach((rec, i) => {
      // Validate with the same reasons the backend ingest reports.
      if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
        return reject(i, rec, 'record is not a JSON object');
      }
      if (!rec.type || !valid.includes(rec.type)) {
        return reject(i, rec, `invalid or missing type: ${JSON.stringify(rec.type ?? null)}`);
      }
      if (!rec.value || !String(rec.value).trim()) {
        return reject(i, rec, 'missing or empty value');
      }
      const val = String(rec.value).trim();
      const existing = assets.find(
        (x) => x.type === rec.type && x.value.toLowerCase() === val.toLowerCase()
      );
      if (existing) {
        existing.last_seen = today;
        existing.status = 'active';
        existing.tags = Array.from(new Set([...(existing.tags || []), ...(rec.tags || [])]));
        existing.metadata = { ...existing.metadata, ...(rec.metadata || {}) };
        updated++;
        log.push({ value: val, status: 'UPDATED', color: '#57c7e8' });
      } else {
        assets.push({
          id: nextId(), type: rec.type, value: val, status: rec.status || 'active',
          source: rec.source || 'import', tags: rec.tags || [], metadata: rec.metadata || {},
          first_seen: today, last_seen: today,
        });
        created++;
        log.push({ value: val, status: 'CREATED', color: '#46c66a' });
      }
    });
    rejectBatches[batchId] = rejects;
    return { created, updated, skipped, batchId, rejects, log };
  },

  async rejectBatches({ page = 1, pageSize = 20 } = {}) {
    await wait(80);
    // Aggregate the in-memory batches, newest first.
    const all = Object.entries(rejectBatches)
      .map(([batch_id, items]) => ({
        batch_id,
        count: items.length,
        created_at: items.length ? items[items.length - 1].created_at : null,
      }))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const start = (page - 1) * pageSize;
    return { items: clone(all.slice(start, start + pageSize)), count: all.length };
  },

  async rejects(batchId, { page = 1, pageSize = 50 } = {}) {
    await wait(80);
    const all = rejectBatches[batchId] || [];
    const start = (page - 1) * pageSize;
    return { items: clone(all.slice(start, start + pageSize)), count: all.length };
  },

  async stats() {
    await wait(80);
    const byType = {}, byStatus = {};
    assets.forEach((a) => {
      byType[a.type] = (byType[a.type] || 0) + 1;
      byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    });
    return {
      total: assets.length,
      by_type: TYPE_ORDER.filter((t) => byType[t]).map((t) => ({ type: t, label: typeMeta(t).label, count: byType[t] })),
      by_status: ['active', 'stale', 'archived'].filter((s) => byStatus[s]).map((s) => ({ status: s, count: byStatus[s] })),
      risks: deriveRisks(assets),
      recent: clone(
        assets.slice().sort((a, b) => b.last_seen.localeCompare(a.last_seen)).slice(0, 6)
      ),
    };
  },

  async aiQuery(q) {
    await wait(220);
    const { chips, results, answer } = parseQuery(q, assets);
    return { chips, answer, results: clone(results) };
  },
};
