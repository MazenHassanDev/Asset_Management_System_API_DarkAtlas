import { useState } from 'react';
import { Panel } from '../components/ui.jsx';
import RejectList from '../components/RejectList.jsx';
import { api } from '../api/client.js';
import { IMPORT_SAMPLE } from '../data/mock.js';

export default function BulkImport() {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  // Quarantine view: { batchId, items: [{ index, reason, record }] } | null
  const [quarantine, setQuarantine] = useState(null);
  const [qid, setQid] = useState('');
  const [qBusy, setQBusy] = useState(false);
  const [qError, setQError] = useState('');

  const loadSample = () => {
    setText(JSON.stringify(IMPORT_SAMPLE, null, 2));
    setResult(null);
    setQuarantine(null);
  };

  const run = async () => {
    let records;
    try {
      records = JSON.parse(text || '[]');
    } catch (e) {
      setResult({ created: 0, updated: 0, skipped: 0, rejects: [], log: [{ value: 'Invalid JSON — ' + e.message, status: 'ERROR', color: '#ec6a5e' }] });
      setQuarantine(null);
      return;
    }
    setRunning(true);
    setQError('');
    try {
      const res = await api.bulkImport(records);
      setResult(res);
      setQuarantine(res.rejects?.length ? { batchId: res.batchId, items: res.rejects } : null);
    } catch (e) {
      setResult({ created: 0, updated: 0, skipped: 0, rejects: [], log: [{ value: String(e.message || e), status: 'ERROR', color: '#ec6a5e' }] });
      setQuarantine(null);
    } finally {
      setRunning(false);
    }
  };

  const clear = () => {
    setText('');
    setResult(null);
    setQuarantine(null);
    setQError('');
    setQid('');
  };

  // Pull a batch's quarantined rows straight from the server (proves persistence).
  const loadQuarantine = async (batchId) => {
    if (!batchId) return;
    setQBusy(true);
    setQError('');
    try {
      const { items } = await api.rejects(batchId);
      setQuarantine({ batchId, items });
    } catch (e) {
      setQError(String(e.message || e));
    } finally {
      setQBusy(false);
    }
  };

  return (
    <div className="animate-fadeIn">
      <div className="grid grid-cols-[1fr_380px] gap-4 items-start">
        {/* editor */}
        <Panel className="p-[20px_22px]">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-sm font-semibold">Bulk import — JSON</div>
            <div onClick={loadSample} className="text-xs text-accent cursor-pointer hover:underline">
              Load sample dataset
            </div>
          </div>
          <div className="text-xs text-muted mb-3.5">
            Paste an array of asset objects. Idempotent — existing assets are merged, malformed records are quarantined.
          </div>
          <textarea
            rows={16}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'[ { "type": "subdomain", "value": "api.example.com", "status": "active", "tags": ["prod"] } ]'}
            className="w-full bg-ink text-[#9be0d4] border border-line2 rounded-lg p-3.5 text-[12.5px] font-mono leading-relaxed resize-y"
          />
          <div className="flex gap-2.5 mt-4">
            <button
              onClick={run}
              disabled={running}
              className="bg-accent text-[#06121a] font-semibold text-[13px] rounded-[7px] px-5 py-2.5 cursor-pointer hover:bg-[#6fd2ee] disabled:opacity-60"
            >
              {running ? 'Importing…' : 'Run import'}
            </button>
            <button
              onClick={clear}
              className="border border-line2 text-soft text-[13px] rounded-[7px] px-5 py-2.5 cursor-pointer hover:border-[#34425c]"
            >
              Clear
            </button>
          </div>

          {/* reopen a past quarantine batch by id */}
          <div className="mt-4 pt-4 border-t border-line">
            <div className="text-[11.5px] text-subtle mb-2 font-medium">Reopen a past quarantine batch</div>
            <div className="flex gap-2">
              <input
                value={qid}
                onChange={(e) => setQid(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadQuarantine(qid.trim())}
                placeholder="batch id"
                className="flex-1 bg-panel2 text-text border border-line2 rounded-[7px] px-3 py-2 text-[12px] font-mono"
              />
              <button
                onClick={() => loadQuarantine(qid.trim())}
                disabled={qBusy || !qid.trim()}
                className="border border-line2 text-soft text-[12.5px] rounded-[7px] px-4 py-2 cursor-pointer hover:border-accent hover:text-accent disabled:opacity-50"
              >
                {qBusy ? 'Loading…' : 'Load'}
              </button>
            </div>
            {qError && <div className="text-[11px] text-danger mt-1.5 font-mono">⚠ {qError}</div>}
          </div>
        </Panel>

        {/* result */}
        <Panel className="p-[20px_22px]">
          <div className="text-sm font-semibold mb-4">Import result</div>
          {!result ? (
            <div className="text-[12.5px] text-[#5a6883] text-center py-10 leading-relaxed font-mono">
              No import run yet.
              <br />
              Load the sample and hit Run import.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2.5 mb-[18px]">
                <Stat n={result.created} label="created" bg="#0c1a12" border="#1f3a2a" color="#46c66a" />
                <Stat n={result.updated} label="updated" bg="#0e1622" border="#24344a" color="#57c7e8" />
                <Stat n={result.skipped} label="quarantined" bg="#1f1410" border="#3a261c" color="#e0ad3f" />
              </div>
              {result.log.length > 0 && (
                <div className="flex flex-col gap-1.5 max-h-[300px] overflow-auto scroll-dark">
                  {result.log.map((l, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2.5 text-[11.5px] font-mono px-2.5 py-1.5 bg-panel2 rounded-md"
                    >
                      <span className="font-semibold w-[64px]" style={{ color: l.color }}>
                        {l.status}
                      </span>
                      <span className="text-soft whitespace-nowrap overflow-hidden text-ellipsis">{l.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Panel>
      </div>

      {/* quarantine detail — persisted rejected rows */}
      {quarantine && (
        <Panel className="p-[20px_22px] mt-4">
          <div className="flex items-center justify-between mb-3.5 gap-3 flex-wrap">
            <div className="text-sm font-semibold">
              Quarantined records <span className="text-muted font-mono text-[12px]">({quarantine.items.length})</span>
            </div>
            <div className="flex items-center gap-3">
              {quarantine.batchId && (
                <span className="text-[10.5px] font-mono text-muted">
                  batch <span className="text-subtle">{quarantine.batchId}</span>
                </span>
              )}
              {quarantine.batchId && (
                <button
                  onClick={() => loadQuarantine(quarantine.batchId)}
                  disabled={qBusy}
                  className="text-[12px] text-soft border border-line2 rounded-[7px] px-3 py-1.5 cursor-pointer hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  {qBusy ? 'Loading…' : '↻ Reload from server'}
                </button>
              )}
            </div>
          </div>
          <div className="text-xs text-muted mb-3.5">
            These rows failed validation and were stored in quarantine instead of crashing the batch — review and re-import once fixed.
          </div>
          <RejectList items={quarantine.items} />
        </Panel>
      )}
    </div>
  );
}

function Stat({ n, label, bg, border, color }) {
  return (
    <div className="text-center rounded-lg py-3.5 px-2" style={{ background: bg, border: `1px solid ${border}` }}>
      <div className="font-mono text-[24px] font-semibold" style={{ color }}>
        {n}
      </div>
      <div className="text-[10.5px] text-subtle mt-0.5">{label}</div>
    </div>
  );
}
