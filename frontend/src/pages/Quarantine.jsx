import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Panel } from '../components/ui.jsx';
import RejectList from '../components/RejectList.jsx';
import { api } from '../api/client.js';
import { relTime } from '../lib/meta.js';

export default function Quarantine() {
  const navigate = useNavigate();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [rejects, setRejects] = useState([]);
  const [rejectsBusy, setRejectsBusy] = useState(false);

  // Load the batch history once; auto-select the most recent.
  useEffect(() => {
    let alive = true;
    api
      .rejectBatches()
      .then(({ items }) => {
        if (!alive) return;
        setBatches(items);
        setLoading(false);
        if (items.length) setSelected(items[0].batch_id);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // Load the selected batch's quarantined rows.
  useEffect(() => {
    if (!selected) {
      setRejects([]);
      return;
    }
    let alive = true;
    setRejectsBusy(true);
    api
      .rejects(selected)
      .then(({ items }) => alive && setRejects(items))
      .catch(() => alive && setRejects([]))
      .finally(() => alive && setRejectsBusy(false));
    return () => {
      alive = false;
    };
  }, [selected]);

  if (loading) return <div className="text-muted font-mono text-[13px]">loading…</div>;

  if (batches.length === 0)
    return (
      <div className="animate-fadeIn">
        <Panel className="p-12 text-center">
          <div className="text-[15px] font-semibold mb-1.5">No quarantine yet</div>
          <div className="text-[12.5px] text-muted mb-5">
            Imports with malformed rows will show up here. Every rejected row is kept so you can review and re-import it.
          </div>
          <button
            onClick={() => navigate('/import')}
            className="bg-accent text-[#06121a] font-semibold text-[12.5px] rounded-[7px] px-4 py-2 cursor-pointer hover:bg-[#6fd2ee]"
          >
            Go to Bulk Import
          </button>
        </Panel>
      </div>
    );

  const total = batches.reduce((n, b) => n + (b.count || 0), 0);

  return (
    <div className="animate-fadeIn grid grid-cols-[340px_1fr] gap-4 items-start">
      {/* batch history */}
      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-panel2">
          <span className="text-[13px] font-semibold">Recent batches</span>
          <span className="text-[11px] text-muted font-mono">{total} rejected</span>
        </div>
        <div className="flex flex-col max-h-[calc(100vh-200px)] overflow-auto scroll-dark">
          {batches.map((b) => {
            const active = b.batch_id === selected;
            return (
              <div
                key={b.batch_id}
                onClick={() => setSelected(b.batch_id)}
                className={`flex items-center gap-2.5 px-4 py-3 cursor-pointer border-b border-[#161d2b] ${
                  active ? 'bg-accent/[0.08]' : 'hover:bg-[#0e1521]'
                }`}
                style={active ? { borderLeft: '3px solid #57c7e8' } : { borderLeft: '3px solid transparent' }}
              >
                <span className="font-mono text-[11.5px] text-[#d4dbe9] whitespace-nowrap overflow-hidden text-ellipsis flex-1">
                  {b.batch_id}
                </span>
                <span className="font-mono text-[10.5px] text-warn border border-warn/40 rounded px-1.5 py-0.5">
                  {b.count}
                </span>
                <span className="text-[11px] text-[#5a6883] whitespace-nowrap w-[58px] text-right">
                  {relTime(b.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* selected batch detail */}
      <Panel className="p-[18px_20px]">
        <div className="flex items-center justify-between mb-3.5 gap-3 flex-wrap">
          <div className="text-[13px] font-semibold">
            Quarantined records{' '}
            <span className="text-muted font-mono text-[12px]">({rejects.length})</span>
          </div>
          {selected && <span className="text-[10.5px] font-mono text-muted">batch {selected}</span>}
        </div>
        {rejectsBusy ? (
          <div className="text-muted font-mono text-[12.5px] py-8 text-center">loading…</div>
        ) : (
          <RejectList items={rejects} />
        )}
      </Panel>
    </div>
  );
}
