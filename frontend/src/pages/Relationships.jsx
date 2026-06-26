import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Panel, TypeBadge, StatusDot } from '../components/ui.jsx';
import { api } from '../api/client.js';
import { typeMeta, TYPE_ORDER } from '../lib/meta.js';

// Server-side pagination, mirroring the Assets list: the API returns one page
// at a time and we only fetch link-counts for the rows actually on screen.
const PAGE_SIZE = 8;

export default function Relationships() {
  const navigate = useNavigate();
  const [data, setData] = useState({ items: [], count: 0 });
  const [linkCounts, setLinkCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);

  // reset to first page whenever the filter changes
  useEffect(() => {
    setPage(1);
  }, [typeFilter]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .listAssets({ type: typeFilter, ordering: 'value', page, pageSize: PAGE_SIZE })
      .then(async ({ items, count }) => {
        if (!alive) return;
        setData({ items, count });
        setLoading(false);
        // fetch link counts for just this page, in the background
        const counts = {};
        await Promise.all(
          items.map(async (a) => {
            try {
              counts[a.id] = (await api.relationships(a.id)).length;
            } catch {
              counts[a.id] = 0;
            }
          })
        );
        if (alive) setLinkCounts((prev) => ({ ...prev, ...counts }));
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [typeFilter, page]);

  const totalPages = Math.max(1, Math.ceil(data.count / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = data.items;

  const selectCls =
    'bg-panel text-[#d4dbe9] border border-line2 rounded-[7px] px-3 py-2 text-[12.5px] cursor-pointer';

  return (
    <div className="animate-fadeIn max-w-[820px]">
      <div className="flex items-center gap-2.5 mb-4">
        <select className={selectCls} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All types</option>
          {TYPE_ORDER.map((t) => (
            <option key={t} value={t}>
              {typeMeta(t).label}
            </option>
          ))}
        </select>
        <div className="ml-auto text-xs text-muted font-mono">
          {data.count === 0
            ? '0 assets'
            : `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, data.count)} of ${data.count}`}
        </div>
      </div>

      <Panel className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted text-[13px] font-mono">loading…</div>
        ) : data.count === 0 ? (
          <div className="p-12 text-center text-[#5a6883] text-[13px]">No assets of this type.</div>
        ) : (
          <div className="flex flex-col">
            {pageItems.map((a, i) => (
              <div
                key={a.id}
                onClick={() => navigate(`/relationships/${a.id}`)}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#0e1521] ${
                  i !== pageItems.length - 1 ? 'border-b border-[#161d2b]' : ''
                }`}
              >
                <TypeBadge type={a.type} className="w-10 text-center" />
                <span className="font-mono text-[13px] text-[#dbe2ef]">{a.value}</span>
                <StatusDot status={a.status} className="ml-1" />
                <span className="ml-auto inline-flex items-center gap-2">
                  <span className="font-mono text-[12px] text-soft">
                    {linkCounts[a.id] === undefined ? '·' : linkCounts[a.id]}
                  </span>
                  <span className="text-[11px] text-muted">linked</span>
                  <span className="text-muted text-sm ml-1">→</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* pagination */}
      {!loading && data.count > 0 && (
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
      )}
    </div>
  );
}
