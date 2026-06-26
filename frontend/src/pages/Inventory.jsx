import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Panel, TypeBadge, StatusDot, Tag } from '../components/ui.jsx';
import { api } from '../api/client.js';
import { typeMeta, statusMeta, relTime, TYPE_ORDER, STATUS_OPTIONS } from '../lib/meta.js';

const PAGE_SIZE = 8;

// known tags for the filter dropdown (in mock mode the API has no tag facet endpoint)
const KNOWN_TAGS = ['prod', 'staging', 'dev', 'infra', 'legacy', 'sensitive', 'db', 'external', 'root'];

export default function Inventory({ search, setSearch }) {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ type: 'all', status: 'all', tag: 'all' });
  const [sort, setSort] = useState({ key: 'last_seen', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], count: 0 });
  const [loading, setLoading] = useState(true);

  const ordering = (sort.dir === 'desc' ? '-' : '') + sort.key;

  const load = useCallback(() => {
    setLoading(true);
    api
      .listAssets({
        type: filters.type,
        status: filters.status,
        tag: filters.tag,
        search,
        ordering,
        page,
        pageSize: PAGE_SIZE,
      })
      .then(setData)
      .finally(() => setLoading(false));
  }, [filters, search, ordering, page]);

  useEffect(() => {
    load();
  }, [load]);

  // reset to page 1 whenever filters/search/sort change
  useEffect(() => {
    setPage(1);
  }, [filters, search, sort]);

  const totalPages = Math.max(1, Math.ceil(data.count / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;

  const toggleSort = (key) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
  const arrow = (key) => (sort.key === key ? (sort.dir === 'asc' ? '↑' : '↓') : '');

  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const clearFilters = () => {
    setFilters({ type: 'all', status: 'all', tag: 'all' });
    setSearch('');
  };

  const selectCls =
    'bg-panel text-[#d4dbe9] border border-line2 rounded-[7px] px-3 py-2 text-[12.5px] cursor-pointer';
  const thCls =
    'text-left px-4 py-[11px] text-[11px] font-semibold tracking-[0.5px] text-subtle cursor-pointer select-none';

  return (
    <div className="animate-fadeIn">
      {/* filter bar */}
      <div className="flex items-center gap-2.5 mb-4 flex-wrap">
        <select className={selectCls} value={filters.type} onChange={(e) => setFilter('type', e.target.value)}>
          <option value="all">All types</option>
          {TYPE_ORDER.map((t) => (
            <option key={t} value={t}>
              {typeMeta(t).label}
            </option>
          ))}
        </select>
        <select className={selectCls} value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
        <select className={selectCls} value={filters.tag} onChange={(e) => setFilter('tag', e.target.value)}>
          <option value="all">All tags</option>
          {KNOWN_TAGS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <div onClick={clearFilters} className="text-xs text-subtle cursor-pointer px-2.5 py-2 hover:text-soft">
          Clear
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted font-mono">
            {data.count === 0
              ? '0 assets'
              : `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, data.count)} of ${data.count}`}
          </span>
          <button
            onClick={() => navigate('/assets/new')}
            className="flex items-center gap-1.5 bg-accent text-[#06121a] font-semibold text-[12.5px] rounded-[7px] px-3.5 py-2 cursor-pointer hover:bg-[#6fd2ee]"
          >
            + New asset
          </button>
        </div>
      </div>

      {/* table */}
      <Panel className="overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-panel2 border-b border-line">
              <th className={`${thCls} w-[84px]`} onClick={() => toggleSort('type')}>
                TYPE {arrow('type')}
              </th>
              <th className={thCls} onClick={() => toggleSort('value')}>
                VALUE {arrow('value')}
              </th>
              <th className={`${thCls} w-[110px]`} onClick={() => toggleSort('status')}>
                STATUS {arrow('status')}
              </th>
              <th className={`${thCls} cursor-default`}>TAGS</th>
              <th className={`${thCls} cursor-default w-[90px]`}>SOURCE</th>
              <th className={`${thCls} w-[110px]`} onClick={() => toggleSort('last_seen')}>
                LAST SEEN {arrow('last_seen')}
              </th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {data.items.map((a) => (
              <tr
                key={a.id}
                onClick={() => navigate(`/assets/${a.id}`)}
                className="border-b border-[#161d2b] cursor-pointer hover:bg-[#0e1521]"
              >
                <td className="px-4 py-[11px]">
                  <TypeBadge type={a.type} />
                </td>
                <td className="px-4 py-[11px] font-mono text-[13px] text-[#dbe2ef]">{a.value}</td>
                <td className="px-4 py-[11px]">
                  <StatusDot status={a.status} />
                </td>
                <td className="px-4 py-[11px]">
                  <span className="inline-flex gap-1.5 flex-wrap">
                    {(a.tags || []).map((t) => (
                      <Tag key={t}>{t}</Tag>
                    ))}
                  </span>
                </td>
                <td className="px-4 py-[11px] text-xs text-subtle font-mono">{a.source}</td>
                <td className="px-4 py-[11px] text-xs text-soft">{relTime(a.last_seen)}</td>
                <td className="px-4 py-[11px]">
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/assets/${a.id}/edit`);
                    }}
                    className="text-[#5a6883] text-sm cursor-pointer hover:text-accent"
                  >
                    ✎
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && data.items.length === 0 && (
          <div className="p-12 text-center text-[#5a6883] text-[13px]">
            No assets match the current filters.
          </div>
        )}
        {loading && <div className="p-12 text-center text-muted text-[13px] font-mono">loading…</div>}
      </Panel>

      {/* pagination */}
      <div className="flex items-center justify-end gap-2 mt-3.5">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="text-[12.5px] px-3 py-[7px] border border-line2 rounded-[7px] cursor-pointer enabled:hover:border-[#34425c] disabled:text-[#3a4660] disabled:cursor-default"
        >
          ← Prev
        </button>
        <span className="text-xs text-subtle font-mono px-1.5">
          page {page} / {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="text-[12.5px] px-3 py-[7px] border border-line2 rounded-[7px] cursor-pointer enabled:hover:border-[#34425c] disabled:text-[#3a4660] disabled:cursor-default"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
