import { useNavigate } from 'react-router-dom';
import { typeMeta, relLabel } from '../lib/meta.js';

// Radial relationship graph: center node = current asset, spokes = related.
// Pure SVG + absolutely-positioned label cards. No layout library needed.
export default function RelationshipGraph({ asset, related, showLabels = true }) {
  const navigate = useNavigate();
  const W = 780;
  const H = 470;
  const cx = 390;
  const cy = 235;
  const R = related.length > 6 ? 188 : 165;
  const center = typeMeta(asset.type);

  const truncate = (v) => (v.length > 18 ? v.slice(0, 17) + '…' : v);

  const nodes = related.map((r, i) => {
    const ang = -Math.PI / 2 + i * ((2 * Math.PI) / Math.max(1, related.length));
    return {
      ...r,
      x: Math.round(cx + R * Math.cos(ang)),
      y: Math.round(cy + R * Math.sin(ang)),
      tm: typeMeta(r.asset.type),
    };
  });

  return (
    <div className="relative mx-auto" style={{ width: W, height: H }}>
      <svg width={W} height={H} className="absolute left-0 top-0 overflow-visible">
        {nodes.map((n, i) => (
          <line key={i} x1={cx} y1={cy} x2={n.x} y2={n.y} stroke="#2c3a52" strokeWidth="1.5" />
        ))}
      </svg>

      {showLabels &&
        nodes.map((n, i) => (
          <div
            key={`l${i}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 font-mono text-[9.5px] text-subtle bg-panel2 px-1.5 py-px rounded whitespace-nowrap"
            style={{ left: Math.round((cx + n.x) / 2), top: Math.round((cy + n.y) / 2) }}
          >
            {relLabel(n.relation)}
          </div>
        ))}

      {/* center node */}
      <GraphNode
        left={cx}
        top={cy}
        abbr={center.abbr}
        color={center.color}
        bg="rgba(87,199,232,0.10)"
        label={truncate(asset.value)}
      />

      {/* spokes */}
      {nodes.map((n, i) => (
        <GraphNode
          key={i}
          left={n.x}
          top={n.y}
          abbr={n.tm.abbr}
          color={n.tm.color}
          bg="#0c111b"
          label={truncate(n.asset.value)}
          onClick={() => navigate(`/assets/${n.asset.id}`)}
        />
      ))}
    </div>
  );
}

function GraphNode({ left, top, abbr, color, bg, label, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col gap-[3px] items-center px-3 py-2.5 min-w-[96px] rounded-[9px] border-[1.5px] shadow-[0_5px_16px_rgba(0,0,0,0.4)] ${
        onClick ? 'cursor-pointer hover:brightness-125' : ''
      }`}
      style={{ left, top, borderColor: color, background: bg }}
    >
      <span className="font-mono text-[9px] tracking-[1px]" style={{ color }}>
        {abbr}
      </span>
      <span className="font-mono text-[11px] text-[#eef2f8] whitespace-nowrap">{label}</span>
    </div>
  );
}
