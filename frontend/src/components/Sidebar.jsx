import { NavLink } from 'react-router-dom';

const linkBase =
  'flex items-center gap-3 px-[11px] py-[9px] rounded-[7px] cursor-pointer font-medium text-[13.5px] transition-colors';

function navClass({ isActive }) {
  return isActive
    ? `${linkBase} bg-accent/[0.12] text-accent`
    : `${linkBase} text-soft hover:bg-white/[0.045]`;
}

const Icon = ({ children }) => (
  <span className="flex w-[18px] justify-center">{children}</span>
);

export default function Sidebar({ assetCount }) {
  return (
    <aside className="w-[236px] flex-shrink-0 bg-panel2 border-r border-line flex flex-col p-[18px_14px]">
      <div className="flex items-center gap-2.5 px-2 pt-1.5 pb-5">
        <div className="w-[30px] h-[30px] rounded-[7px] bg-gradient-to-br from-accent to-violet flex items-center justify-center text-ink font-bold text-[15px]">
          ◆
        </div>
        <div className="leading-tight">
          <div className="font-bold text-[15px] tracking-[0.3px]">DarkAtlas</div>
          <div className="text-[10.5px] text-muted font-mono tracking-[0.5px]">ASSET MGMT</div>
        </div>
      </div>

      <div className="text-[10px] text-[#4d5a73] font-semibold tracking-[1.2px] px-2.5 pt-1.5 pb-2">
        CONSOLE
      </div>
      <nav className="flex flex-col gap-[3px]">
        <NavLink to="/" end className={navClass}>
          <Icon>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1.3" />
              <rect x="14" y="3" width="7" height="7" rx="1.3" />
              <rect x="3" y="14" width="7" height="7" rx="1.3" />
              <rect x="14" y="14" width="7" height="7" rx="1.3" />
            </svg>
          </Icon>
          <span>Overview</span>
        </NavLink>

        <NavLink to="/assets" className={navClass}>
          <Icon>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="9" y1="6" x2="21" y2="6" />
              <line x1="9" y1="12" x2="21" y2="12" />
              <line x1="9" y1="18" x2="21" y2="18" />
              <circle cx="4" cy="6" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="4" cy="12" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="4" cy="18" r="1.4" fill="currentColor" stroke="none" />
            </svg>
          </Icon>
          <span>Assets</span>
          <span className="ml-auto font-mono text-[11px] text-[#4d5a73]">{assetCount ?? ''}</span>
        </NavLink>

        <NavLink to="/relationships" className={navClass}>
          <Icon>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="5" cy="6" r="2.4" />
              <circle cx="19" cy="6" r="2.4" />
              <circle cx="12" cy="18" r="2.4" />
              <line x1="6.9" y1="7.4" x2="10.4" y2="16" />
              <line x1="17.1" y1="7.4" x2="13.6" y2="16" />
              <line x1="7.4" y1="6" x2="16.6" y2="6" />
            </svg>
          </Icon>
          <span>Relationships</span>
        </NavLink>

        <NavLink to="/import" className={navClass}>
          <Icon>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v11" />
              <path d="M8 10l4 4 4-4" />
              <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
            </svg>
          </Icon>
          <span>Bulk Import</span>
        </NavLink>

        <NavLink to="/quarantine" className={navClass}>
          <Icon>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.3 3.6L2.5 17a1.6 1.6 0 0 0 1.4 2.4h16.2A1.6 1.6 0 0 0 21.5 17L13.7 3.6a1.6 1.6 0 0 0-2.8 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12" y2="17" />
            </svg>
          </Icon>
          <span>Quarantine</span>
        </NavLink>

        <NavLink to="/ai" className={navClass}>
          <Icon>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5 10.1 11.9 4.5 10l5.6-1.4z" />
            </svg>
          </Icon>
          <span>AI Analysis</span>
        </NavLink>
      </nav>

      <div className="mt-auto px-[11px] py-3 border-t border-line">
        <div className="flex items-center gap-2 text-[11.5px] text-subtle">
          <span className="w-[7px] h-[7px] rounded-full bg-ok animate-blink" />
          <span className="font-mono">scan engine online</span>
        </div>
        <div className="text-[10.5px] text-[#4d5a73] mt-1.5 font-mono">last sweep · 2h ago</div>
      </div>
    </aside>
  );
}
