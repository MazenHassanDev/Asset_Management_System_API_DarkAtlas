import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Panel, TypeBadge, Tag } from '../components/ui.jsx';
import { api } from '../api/client.js';
import { typeMeta, statusMeta, fmtDate } from '../lib/meta.js';

export default function AssetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [asset, setAsset] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let alive = true;
    setAsset(null);
    setNotFound(false);
    api
      .getAsset(id)
      .then((a) => alive && setAsset(a))
      .catch(() => alive && setNotFound(true));
    return () => {
      alive = false;
    };
  }, [id]);

  if (notFound)
    return (
      <div className="animate-fadeIn text-subtle">
        Asset not found.{' '}
        <span className="text-accent cursor-pointer" onClick={() => navigate('/assets')}>
          Back to assets
        </span>
      </div>
    );
  if (!asset) return <div className="text-muted font-mono text-[13px]">loading…</div>;

  const tm = typeMeta(asset.type);
  const sm = statusMeta(asset.status);
  const metaEntries = Object.entries(asset.metadata || {}).map(([k, v]) => ({
    k,
    v: typeof v === 'object' ? JSON.stringify(v) : String(v),
  }));

  const markStale = async () => {
    const updated = await api.updateAsset(asset.id, { status: 'stale' });
    setAsset(updated);
  };
  const remove = async () => {
    await api.deleteAsset(asset.id);
    navigate('/assets');
  };

  return (
    <div className="animate-fadeIn max-w-[680px]">
      <div className="flex items-center justify-between mb-4">
        <div
          onClick={() => navigate('/assets')}
          className="inline-flex items-center gap-1.5 text-[12.5px] text-subtle cursor-pointer hover:text-soft"
        >
          ← Back to assets
        </div>
        <button
          onClick={() => navigate(`/relationships/${asset.id}`)}
          className="text-[12.5px] text-soft border border-line2 rounded-[7px] px-3 py-1.5 cursor-pointer hover:border-accent hover:text-accent"
        >
          View relationships →
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 items-start">
        {/* asset info */}
        <Panel className="p-5">
          <div className="flex items-center gap-2.5 mb-3.5">
            <TypeBadge type={asset.type} className="!px-[7px] !py-[3px] !text-[9.5px]" />
            <span className="text-xs text-subtle">{tm.label}</span>
          </div>
          <div className="font-mono text-[18px] font-medium text-[#eef2f8] break-all leading-snug">
            {asset.value}
          </div>
          <div className="inline-flex items-center gap-1.5 mt-3 text-[12.5px] text-soft">
            <span className="w-2 h-2 rounded-full" style={{ background: sm.color }} />
            {sm.label}
          </div>
          <div className="flex gap-1.5 flex-wrap mt-3.5">
            {(asset.tags || []).map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
          </div>

          <div className="h-px bg-line my-[18px]" />

          <div className="grid grid-cols-2 gap-x-3 gap-y-3.5 text-xs">
            <Field label="First seen" value={fmtDate(asset.first_seen)} />
            <Field label="Last seen" value={fmtDate(asset.last_seen)} />
            <Field label="Source" value={asset.source} />
            <Field label="Asset ID" value={asset.id} />
          </div>

          <div className="flex gap-2 mt-5">
            <button
              onClick={() => navigate(`/assets/${asset.id}/edit`)}
              className="flex-1 text-center text-[12.5px] font-medium py-2.5 border border-line2 rounded-[7px] cursor-pointer text-soft hover:border-accent hover:text-accent"
            >
              Edit
            </button>
            <button
              onClick={markStale}
              className="flex-1 text-center text-[12.5px] font-medium py-2.5 border border-line2 rounded-[7px] cursor-pointer text-soft hover:border-warn hover:text-warn"
            >
              Mark stale
            </button>
            <button
              onClick={remove}
              aria-label="Delete asset"
              className="flex items-center justify-center text-[12.5px] py-2.5 px-3 border border-line2 rounded-[7px] cursor-pointer text-subtle hover:border-danger hover:text-danger"
            >
              <TrashIcon />
            </button>
          </div>
        </Panel>

        {/* metadata */}
        <Panel className="p-[18px_20px]">
          <div className="text-[13px] font-semibold mb-3.5">Metadata</div>
          {metaEntries.length === 0 ? (
            <div className="text-xs text-[#5a6883] font-mono">{'{ }'} no metadata recorded</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {metaEntries.map((m) => (
                <div key={m.k} className="flex justify-between gap-3.5 text-xs font-mono">
                  <span className="text-subtle">{m.k}</span>
                  <span className="text-[#d4dbe9] text-right break-all">{m.v}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-[#5a6883] mb-0.5">{label}</div>
      <div className="font-mono text-soft">{value}</div>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}
