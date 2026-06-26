import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, IS_MOCK } from '../api/client.js';

export default function Topbar({ title, subtitle, search, onSearch }) {
  const navigate = useNavigate();
  const [org, setOrg] = useState('');

  // Resolve the organization the current API key belongs to.
  useEffect(() => {
    let alive = true;
    api.me().then((o) => alive && setOrg(o?.name || '')).catch(() => alive && setOrg(''));
    return () => {
      alive = false;
    };
  }, []);

  const orgName = org || 'Organization';
  const orgInitial = (org || 'O').trim().charAt(0).toUpperCase();
  return (
    <header className="h-[62px] flex-shrink-0 border-b border-line flex items-center justify-between px-7 bg-surface">
      <div className="leading-tight">
        <div className="font-semibold text-[16px]">{title}</div>
        <div className="text-[11.5px] text-muted">{subtitle}</div>
      </div>
      <div className="flex items-center gap-3.5">
        {IS_MOCK && (
          <span className="font-mono text-[10.5px] text-warn border border-warn/40 rounded px-2 py-1">
            MOCK DATA
          </span>
        )}
        <div className="flex items-center gap-2 border border-line2 rounded-[7px] px-[11px] py-[7px] w-[248px] focus-within:border-accent">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#61708c" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.5" y2="16.5" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => {
              onSearch(e.target.value);
              navigate('/assets');
            }}
            placeholder="Search assets…"
            className="bg-transparent border-none text-text text-[13px] w-full font-mono placeholder:text-muted"
          />
        </div>
        <div className="flex items-center gap-2 border border-line2 rounded-[7px] px-[11px] py-1.5 cursor-pointer hover:border-[#34425c]">
          <span className="w-5 h-5 rounded-[5px] bg-violet text-ink flex items-center justify-center font-bold text-[11px]">
            {orgInitial}
          </span>
          <span className="text-[12.5px] text-soft">{orgName}</span>
          <span className="text-muted text-[10px]">▾</span>
        </div>
      </div>
    </header>
  );
}
