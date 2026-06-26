import { typeMeta, statusMeta } from '../lib/meta.js';

// Small monospace type pill, e.g. SUB / IP / CRT
export function TypeBadge({ type, className = '' }) {
  const tm = typeMeta(type);
  return (
    <span
      className={`font-mono text-[9px] tracking-wide rounded px-1.5 py-0.5 ${className}`}
      style={{ color: tm.color, border: `1px solid ${tm.color}` }}
    >
      {tm.abbr}
    </span>
  );
}

// Colored-dot status label, e.g. ● Active
export function StatusDot({ status, className = '' }) {
  const sm = statusMeta(status);
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs text-soft ${className}`}>
      <span className="w-[7px] h-[7px] rounded-full" style={{ background: sm.color }} />
      {sm.label}
    </span>
  );
}

export function Tag({ children }) {
  return (
    <span className="font-mono text-[10.5px] text-subtle bg-[#161d2b] rounded px-1.5 py-0.5">
      {children}
    </span>
  );
}

export function Panel({ children, className = '' }) {
  return (
    <div className={`bg-panel border border-line rounded-[10px] ${className}`}>{children}</div>
  );
}
