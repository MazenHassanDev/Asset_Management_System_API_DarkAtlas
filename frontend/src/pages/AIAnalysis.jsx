import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { typeMeta, statusMeta, sevColor } from '../lib/meta.js';

const EXAMPLES = [
  'Show expired certificates',
  'Production subdomains',
  'Exposed sensitive services',
  'End-of-life technologies',
  'Stale assets',
  'Generate full inventory report',
];

const REPORT_RE = /report|inventory|summar|overview of/i;

export default function AIAnalysis() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log, busy]);

  const ask = async (text) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setLog((l) => [...l, { role: 'user', text: q }]);
    setInput('');
    setBusy(true);

    const wantsReport = REPORT_RE.test(q) && !/show|list|which|find/i.test(q);

    try {
      if (wantsReport) {
        const stats = await api.stats();
        setLog((l) => [...l, { role: 'system', kind: 'report', stats }]);
      } else {
        const res = await api.aiQuery(q);
        if (!res.chips || res.chips.length === 0) {
          setLog((l) => [
            ...l,
            {
              role: 'system',
              kind: 'unmapped',
              answer: "I couldn't map that to the asset schema. I only answer over assets actually in the dataset.",
              suggestText: 'expired certificates · production subdomains · exposed sensitive services',
            },
          ]);
        } else {
          setLog((l) => [...l, { role: 'system', kind: 'query', ...res }]);
        }
      }
    } catch (e) {
      setLog((l) => [...l, { role: 'system', kind: 'unmapped', answer: String(e.message || e), suggestText: '' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-fadeIn max-w-[900px] mx-auto flex flex-col h-full">
      {/* example chips */}
      <div className="flex gap-2 flex-wrap mb-[18px]">
        {EXAMPLES.map((ex) => (
          <div
            key={ex}
            onClick={() => ask(ex)}
            className="text-xs text-soft bg-panel border border-line2 rounded-[20px] px-3.5 py-[7px] cursor-pointer hover:border-violet hover:text-[#cdc4f5]"
          >
            {ex}
          </div>
        ))}
      </div>

      {/* conversation */}
      <div ref={scrollRef} className="flex-1 overflow-auto scroll-dark flex flex-col gap-4 pr-1">
        {log.length === 0 && <EmptyState />}
        {log.map((m, i) =>
          m.role === 'user' ? (
            <div
              key={i}
              className="self-end max-w-[70%] bg-[#1b2740] border border-[#2c3a58] rounded-[12px_12px_3px_12px] px-3.5 py-2.5 text-[13px] text-text"
            >
              {m.text}
            </div>
          ) : m.kind === 'query' ? (
            <QueryCard key={i} card={m} navigate={navigate} />
          ) : m.kind === 'report' ? (
            <ReportCard key={i} stats={m.stats} />
          ) : (
            <UnmappedCard key={i} card={m} />
          )
        )}
        {busy && <div className="self-start text-muted font-mono text-xs px-2">analyzing…</div>}
      </div>

      {/* composer */}
      <div className="flex items-center gap-2.5 mt-4 bg-panel border border-line2 rounded-[10px] p-2 pl-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask()}
          placeholder="e.g. show me expired certificates on production subdomains"
          className="flex-1 bg-transparent border-none text-text text-[13.5px] placeholder:text-muted"
        />
        <button
          onClick={() => ask()}
          className="bg-gradient-to-br from-violet to-accent text-[#06121a] font-semibold text-[13px] rounded-[7px] px-4.5 py-2.5 cursor-pointer hover:brightness-[1.08]"
        >
          Ask
        </button>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center text-[#5a6883] py-16 px-5">
      <div className="w-[46px] h-[46px] rounded-[11px] bg-gradient-to-br from-violet to-accent flex items-center justify-center mx-auto mb-4 text-ink text-[22px]">
        ✦
      </div>
      <div className="text-sm text-soft font-medium">Ask about your attack surface</div>
      <div className="text-[12.5px] mt-1.5 leading-relaxed max-w-[420px] mx-auto">
        Natural-language queries are translated to structured filters and answered <em>only</em> from assets in the
        dataset — no invented results.
      </div>
    </div>
  );
}

function QueryCard({ card, navigate }) {
  return (
    <div className="self-start max-w-[88%] bg-panel border border-line rounded-[12px_12px_12px_3px] p-4">
      <div className="text-[10.5px] text-violet font-semibold tracking-[0.5px] mb-2.5">⟶ TRANSLATED QUERY</div>
      <div className="flex gap-1.5 flex-wrap mb-3">
        {card.chips.map((ch, i) => (
          <span
            key={i}
            className="text-[11px] font-mono rounded-[5px] px-2.5 py-[3px]"
            style={{ color: ch.color, border: `1px solid ${ch.color}` }}
          >
            {ch.label}
          </span>
        ))}
      </div>
      <div className="text-[13px] text-[#d4dbe9] leading-relaxed mb-3">{card.answer}</div>
      <div className="flex flex-col gap-0.5">
        {card.results.slice(0, 8).map((r) => {
          const sm = statusMeta(r.status);
          return (
            <div
              key={r.id}
              onClick={() => navigate(`/assets/${r.id}`)}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-md cursor-pointer bg-panel2 hover:bg-[#11182a]"
            >
              <span
                className="font-mono text-[9px] rounded px-1.5 py-0.5 w-[38px] text-center"
                style={{ color: typeMeta(r.type).color, border: `1px solid ${typeMeta(r.type).color}` }}
              >
                {typeMeta(r.type).abbr}
              </span>
              <span className="text-[12.5px] font-mono text-[#d4dbe9]">{r.value}</span>
              <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-subtle">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: sm.color }} />
                {sm.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReportCard({ stats }) {
  return (
    <div className="self-start max-w-[88%] bg-panel border border-line rounded-[12px_12px_12px_3px] p-5">
      <div className="text-[10.5px] text-accent font-semibold tracking-[0.5px] mb-3">⊞ INVENTORY &amp; RISK REPORT</div>
      <div className="text-[13px] text-[#d4dbe9] leading-relaxed mb-4">
        Attack-surface snapshot across <b className="text-white">{stats.total}</b> tracked assets.
      </div>
      <div className="grid grid-cols-2 gap-[18px] mb-4">
        <div>
          <div className="text-[11px] text-subtle font-semibold mb-2 tracking-[0.3px]">BY TYPE</div>
          {stats.by_type.map((t) => (
            <Row key={t.type} label={t.label} count={t.count} />
          ))}
        </div>
        <div>
          <div className="text-[11px] text-subtle font-semibold mb-2 tracking-[0.3px]">BY STATUS</div>
          {stats.by_status.map((s) => (
            <Row key={s.status} label={s.status} count={s.count} cap />
          ))}
        </div>
      </div>
      <div className="text-[11px] text-subtle font-semibold mb-2 tracking-[0.3px]">TOP RISKS</div>
      <div className="flex flex-col gap-1.5">
        {stats.risks.slice(0, 5).map((r, i) => (
          <div key={i} className="flex gap-3 items-baseline text-[12.5px]">
            <span
              className="font-mono text-[9.5px] font-semibold uppercase w-[54px] flex-shrink-0"
              style={{ color: sevColor(r.sev) }}
            >
              {r.sev}
            </span>
            <span className="text-[#d4dbe9]">{r.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, count, cap }) {
  return (
    <div className={`flex justify-between text-xs font-mono py-[3px] text-soft ${cap ? 'capitalize' : ''}`}>
      <span>{label}</span>
      <span className="text-subtle">{count}</span>
    </div>
  );
}

function UnmappedCard({ card }) {
  return (
    <div className="self-start max-w-[80%] bg-panel border border-[#3a261c] rounded-[12px_12px_12px_3px] px-4 py-3.5">
      <div className="text-[13px] text-warn leading-snug mb-2">{card.answer}</div>
      {card.suggestText && (
        <div className="text-[11.5px] text-subtle">
          Try: <span className="font-mono text-soft">{card.suggestText}</span>
        </div>
      )}
    </div>
  );
}
