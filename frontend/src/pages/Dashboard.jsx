import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Panel, TypeBadge } from '../components/ui.jsx';
import { api } from '../api/client.js';
import { typeMeta, statusMeta, sevColor, relTime } from '../lib/meta.js';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.stats().then(setStats).catch(() => setStats(null));
  }, []);

  if (!stats) return <Skeleton />;

  const active = stats.by_status.find((s) => s.status === 'active')?.count || 0;
  const stale = stats.by_status.find((s) => s.status === 'stale')?.count || 0;
  const critHigh = stats.risks.filter((r) => r.sev === 'critical' || r.sev === 'high').length;

  const cards = [
    { label: 'Total assets', value: stats.total, sub: 'across 6 asset types', color: '#57c7e8' },
    { label: 'Active', value: active, sub: 'currently re-sighted', color: '#46c66a' },
    { label: 'Stale', value: stale, sub: 'need review', color: '#e0ad3f' },
    { label: 'Risk findings', value: critHigh, sub: 'critical / high severity', color: '#ec6a5e' },
  ];

  const maxType = Math.max(1, ...stats.by_type.map((t) => t.count));
  const totalStatus = stats.by_status.reduce((n, s) => n + s.count, 0) || 1;

  return (
    <div className="animate-fadeIn max-w-[1180px]">
      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        {cards.map((c) => (
          <Panel key={c.label} className="p-[17px_18px]">
            <div className="flex items-center justify-between">
              <div className="text-[11.5px] text-subtle font-medium tracking-[0.3px]">{c.label}</div>
              <span className="w-2 h-2 rounded-sm" style={{ background: c.color }} />
            </div>
            <div className="text-[30px] font-semibold mt-2.5 font-mono" style={{ color: c.color }}>
              {c.value}
            </div>
            <div className="text-[11.5px] text-[#5a6883] mt-0.5">{c.sub}</div>
          </Panel>
        ))}
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-4 mt-4">
        {/* by type */}
        <Panel className="p-[18px_20px]">
          <div className="text-[13px] font-semibold mb-4">Assets by type</div>
          <div className="flex flex-col gap-[13px]">
            {stats.by_type.map((b) => (
              <div key={b.type} className="flex items-center gap-3">
                <div className="w-24 text-xs text-soft">{b.label}</div>
                <div className="flex-1 h-2 bg-[#161d2b] rounded overflow-hidden">
                  <div
                    className="h-full rounded"
                    style={{ width: `${Math.round((b.count / maxType) * 100)}%`, background: typeMeta(b.type).color }}
                  />
                </div>
                <div className="w-[26px] text-right font-mono text-[12.5px] text-soft">{b.count}</div>
              </div>
            ))}
          </div>
        </Panel>

        {/* status */}
        <Panel className="p-[18px_20px] flex flex-col">
          <div className="text-[13px] font-semibold mb-4">Lifecycle status</div>
          <div className="flex h-[11px] rounded-md overflow-hidden gap-0.5">
            {stats.by_status.map((s) => (
              <div
                key={s.status}
                style={{ width: `${Math.round((s.count / totalStatus) * 100)}%`, background: statusMeta(s.status).color }}
              />
            ))}
          </div>
          <div className="flex flex-col gap-[11px] mt-[18px]">
            {stats.by_status.map((s) => (
              <div key={s.status} className="flex items-center gap-2.5 text-[12.5px]">
                <span className="w-[9px] h-[9px] rounded-sm" style={{ background: statusMeta(s.status).color }} />
                <span className="text-soft capitalize">{s.status}</span>
                <span className="ml-auto font-mono text-soft">{s.count}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-4 mt-4">
        {/* risks */}
        <Panel className="p-[18px_20px]">
          <div className="flex items-center justify-between mb-3.5">
            <div className="text-[13px] font-semibold">Risk findings</div>
            <div className="text-[11px] text-muted font-mono">{stats.risks.length} open</div>
          </div>
          <div className="flex flex-col gap-2.5">
            {stats.risks.map((r, i) => (
              <div
                key={i}
                onClick={() => (r.id ? navigate(`/assets/${r.id}`) : navigate('/assets'))}
                className="flex items-center gap-3 px-3 py-2.5 bg-panel2 border border-line rounded-[7px] cursor-pointer hover:bg-[#11182a]"
                style={{ borderLeft: `3px solid ${sevColor(r.sev)}` }}
              >
                <span className="font-mono text-[9.5px] font-semibold tracking-[0.5px] uppercase w-[54px]" style={{ color: sevColor(r.sev) }}>
                  {r.sev}
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">{r.title}</div>
                  <div className="text-[11.5px] text-subtle font-mono whitespace-nowrap overflow-hidden text-ellipsis">
                    {r.detail}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* recent */}
        <Panel className="p-[18px_20px]">
          <div className="text-[13px] font-semibold mb-3.5">Recently seen</div>
          <div className="flex flex-col gap-0.5">
            {stats.recent.map((a) => (
              <div
                key={a.id}
                onClick={() => navigate(`/assets/${a.id}`)}
                className="flex items-center gap-2.5 px-2 py-2 rounded-md cursor-pointer hover:bg-panel2"
              >
                <TypeBadge type={a.type} className="w-[38px] text-center" />
                <span className="text-[12.5px] font-mono text-[#d4dbe9] whitespace-nowrap overflow-hidden text-ellipsis">
                  {a.value}
                </span>
                <span className="ml-auto text-[11px] text-[#5a6883] whitespace-nowrap">{relTime(a.last_seen)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-4 gap-4 max-w-[1180px]">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="bg-panel border border-line rounded-[10px] h-[104px] animate-pulse" />
      ))}
    </div>
  );
}
