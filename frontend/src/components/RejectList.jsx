// Renders quarantined (rejected) import rows: reason + the raw record that failed.
// Shared by the Bulk Import result panel and the Quarantine page.
export default function RejectList({ items }) {
  if (!items || items.length === 0) {
    return <div className="text-xs text-[#5a6883] font-mono py-6 text-center">No quarantined records in this batch.</div>;
  }
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((r, i) => (
        <div
          key={i}
          className="bg-panel2 border border-line rounded-[8px] p-3"
          style={{ borderLeft: '3px solid #e0ad3f' }}
        >
          <div className="flex items-center gap-2.5 mb-2 flex-wrap">
            <span className="font-mono text-[9.5px] text-warn border border-warn/40 rounded px-1.5 py-0.5 tracking-[0.5px]">
              REJECTED
            </span>
            <span className="text-[11.5px] text-subtle font-mono">row #{(r.index ?? 0) + 1}</span>
            <span className="text-[12.5px] text-[#f0c674]">{r.reason}</span>
          </div>
          <pre className="text-[11px] font-mono text-soft bg-ink rounded p-2.5 overflow-auto scroll-dark whitespace-pre-wrap break-all m-0">
            {JSON.stringify(r.record, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}
