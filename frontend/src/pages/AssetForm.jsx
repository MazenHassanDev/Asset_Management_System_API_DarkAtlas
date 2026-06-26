import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Panel } from '../components/ui.jsx';
import { api } from '../api/client.js';
import { typeMeta, TYPE_ORDER, STATUS_OPTIONS, SOURCE_OPTIONS } from '../lib/meta.js';

const EMPTY = { type: 'subdomain', value: '', status: 'active', source: 'manual', tagsText: '', metaText: '{}' };

export default function AssetForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = !!id;
  const [draft, setDraft] = useState(EMPTY);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    api.getAsset(id).then((a) => {
      setDraft({
        type: a.type,
        value: a.value,
        status: a.status,
        source: a.source,
        tagsText: (a.tags || []).join(', '),
        metaText: JSON.stringify(a.metadata || {}, null, 2),
      });
      setLoading(false);
    });
  }, [id, editing]);

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    if (!draft.value.trim()) return setError('Value is required.');
    let metadata;
    try {
      metadata = JSON.parse(draft.metaText || '{}');
    } catch {
      return setError('Metadata must be valid JSON.');
    }
    const payload = {
      type: draft.type,
      value: draft.value.trim(),
      status: draft.status,
      source: draft.source,
      tags: draft.tagsText.split(',').map((t) => t.trim()).filter(Boolean),
      metadata,
    };
    setSaving(true);
    setError('');
    try {
      const saved = editing ? await api.updateAsset(id, payload) : await api.createAsset(payload);
      navigate(`/assets/${saved.id}`);
    } catch (e) {
      setError(String(e.message || e));
      setSaving(false);
    }
  };

  if (loading) return <div className="text-muted font-mono text-[13px]">loading…</div>;

  const labelCls = 'block text-[11.5px] text-subtle mb-1.5 font-medium';
  const inputCls =
    'w-full bg-panel2 text-text border border-line2 rounded-[7px] px-3 py-2.5 text-[13px] font-mono';
  const selectCls =
    'w-full bg-panel2 text-[#d4dbe9] border border-line2 rounded-[7px] px-3 py-2.5 text-[13px] cursor-pointer';

  return (
    <div className="animate-fadeIn max-w-[680px]">
      <Panel className="p-[26px_28px]">
        <div className="text-[17px] font-semibold mb-1">{editing ? 'Edit asset' : 'New asset'}</div>
        <div className="text-[12.5px] text-muted mb-[22px]">
          Re-importing an existing type+value updates it instead of creating a duplicate.
        </div>

        {error && (
          <div className="bg-[#2a1416] border border-danger rounded-[7px] px-3 py-2.5 text-[12.5px] text-[#f3a39b] mb-[18px] font-mono">
            ⚠ {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Type</label>
            <select className={selectCls} value={draft.type} onChange={(e) => set('type', e.target.value)}>
              {TYPE_ORDER.map((t) => (
                <option key={t} value={t}>
                  {typeMeta(t).label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select className={selectCls} value={draft.status} onChange={(e) => set('status', e.target.value)}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <label className={labelCls}>Value</label>
          <input
            className={inputCls}
            value={draft.value}
            onChange={(e) => set('value', e.target.value)}
            placeholder="api.example.com"
          />
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className={labelCls}>Source</label>
            <select className={selectCls} value={draft.source} onChange={(e) => set('source', e.target.value)}>
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>
              Tags <span className="text-[#4d5a73]">(comma separated)</span>
            </label>
            <input
              className={inputCls}
              value={draft.tagsText}
              onChange={(e) => set('tagsText', e.target.value)}
              placeholder="prod, sensitive"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className={labelCls}>
            Metadata <span className="text-[#4d5a73]">(JSON)</span>
          </label>
          <textarea
            rows={5}
            value={draft.metaText}
            onChange={(e) => set('metaText', e.target.value)}
            className="w-full bg-panel2 text-[#9be0d4] border border-line2 rounded-[7px] px-3 py-2.5 text-[12.5px] font-mono resize-y leading-relaxed"
          />
        </div>

        <div className="flex gap-2.5 mt-6">
          <button
            onClick={save}
            disabled={saving}
            className="bg-accent text-[#06121a] font-semibold text-[13px] rounded-[7px] px-5 py-2.5 cursor-pointer hover:bg-[#6fd2ee] disabled:opacity-60"
          >
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create asset'}
          </button>
          <button
            onClick={() => navigate(-1)}
            className="border border-line2 text-soft text-[13px] rounded-[7px] px-5 py-2.5 cursor-pointer hover:border-[#34425c]"
          >
            Cancel
          </button>
        </div>
      </Panel>
    </div>
  );
}
