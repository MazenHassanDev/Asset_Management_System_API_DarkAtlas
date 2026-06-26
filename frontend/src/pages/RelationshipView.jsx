import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Panel, TypeBadge } from '../components/ui.jsx';
import RelationshipGraph from '../components/RelationshipGraph.jsx';
import { api } from '../api/client.js';
import { typeMeta, statusMeta, relLabel } from '../lib/meta.js';

export default function RelationshipView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [asset, setAsset] = useState(null);
  const [related, setRelated] = useState([]);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let alive = true;
    setAsset(null);
    setNotFound(false);
    Promise.all([api.getAsset(id), api.relationships(id)])
      .then(([a, rels]) => {
        if (!alive) return;
        setAsset(a);
        setRelated(rels);
      })
      .catch(() => alive && setNotFound(true));
    return () => {
      alive = false;
    };
  }, [id]);

  if (notFound)
    return (
      <div className="animate-fadeIn text-subtle">
        Asset not found.{' '}
        <span className="text-accent cursor-pointer" onClick={() => navigate('/relationships')}>
          Back to relationships
        </span>
      </div>
    );
  if (!asset) return <div className="text-muted font-mono text-[13px]">loading…</div>;

  const tm = typeMeta(asset.type);
  const sm = statusMeta(asset.status);

  return (
    <div className="animate-fadeIn max-w-[840px]">
      <div
        onClick={() => navigate('/relationships')}
        className="inline-flex items-center gap-1.5 text-[12.5px] text-subtle cursor-pointer mb-4 hover:text-soft"
      >
        ← Back to relationships
      </div>

      {/* asset header */}
      <div className="flex items-center gap-3 mb-4">
        <TypeBadge type={asset.type} className="!px-[7px] !py-[3px] !text-[9.5px]" />
        <span className="font-mono text-[18px] font-medium text-[#eef2f8] break-all">{asset.value}</span>
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-soft ml-1">
          <span className="w-2 h-2 rounded-full" style={{ background: sm.color }} />
          {sm.label}
        </span>
        <span className="text-xs text-subtle ml-1">{tm.label}</span>
        <button
          onClick={() => navigate(`/assets/${asset.id}`)}
          className="ml-auto text-[12.5px] text-soft border border-line2 rounded-[7px] px-3 py-1.5 cursor-pointer hover:border-accent hover:text-accent"
        >
          Open asset →
        </button>
      </div>

      {/* graph */}
      <Panel className="p-[18px_20px] overflow-auto scroll-dark">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[13px] font-semibold">Relationship graph</div>
          <div className="text-[11px] text-muted font-mono">{related.length} linked assets</div>
        </div>
        {related.length === 0 ? (
          <div className="text-xs text-[#5a6883] py-16 text-center font-mono">
            No relationships recorded for this asset.
          </div>
        ) : (
          <RelationshipGraph asset={asset} related={related} />
        )}
      </Panel>

      {/* related assets underneath */}
      <Panel className="p-[18px_20px] mt-4">
        <div className="text-[13px] font-semibold mb-3.5">Related assets</div>
        {related.length === 0 ? (
          <div className="text-xs text-[#5a6883] font-mono">None.</div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {related.map((r) => {
              const rsm = statusMeta(r.asset.status);
              return (
                <div
                  key={r.asset.id}
                  onClick={() => navigate(`/relationships/${r.asset.id}`)}
                  className="flex items-center gap-2.5 px-2 py-2.5 rounded-[7px] cursor-pointer hover:bg-panel2"
                >
                  <TypeBadge type={r.asset.type} className="w-10 text-center" />
                  <span className="text-[12.5px] font-mono text-[#d4dbe9]">{r.asset.value}</span>
                  <span className="text-[11px] text-[#5a6883] font-mono bg-[#11182a] px-2 py-0.5 rounded">
                    {relLabel(r.relation)}
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] text-subtle">
                    <span className="w-[7px] h-[7px] rounded-full" style={{ background: rsm.color }} />
                    {rsm.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
