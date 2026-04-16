import React from 'react';
import { useLocation } from 'react-router-dom';

interface HeaderProps {
  toggleSidebar: () => void;
}

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Real-time surveillance overview' },
  '/cameras': { title: 'Camera Grid', subtitle: 'Live feeds from all stations' },
  '/employees': { title: 'Employees', subtitle: 'Registered personnel' },
  '/visitors': { title: 'Visitors', subtitle: 'Guest visit history' },
  '/attendance': { title: 'Attendance', subtitle: 'Clock in/out tracking' },
};

export const Header: React.FC<HeaderProps> = ({ toggleSidebar }) => {
  const location = useLocation();
  const page = Object.entries(pageTitles).find(([path]) =>
    location.pathname === path || location.pathname.startsWith(path + '/')
  );
  const { title, subtitle } = page?.[1] ?? { title: 'SecureSight', subtitle: '' };

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <header className="glass-card rounded-2xl px-5 py-3 mb-4 shrink-0 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-[var(--text-primary)] transition-colors rounded-lg hover:bg-white/10"
          onClick={toggleSidebar}
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">{title}</h1>
          {subtitle && <p className="text-[11px] text-[var(--text-muted)]">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.08] border border-[var(--glass-border)] text-xs text-[var(--text-secondary)]">
          <span className="material-symbols-outlined text-sm text-[var(--accent)]">schedule</span>
          <span className="font-mono font-medium">{timeStr}</span>
          <span className="opacity-40">|</span>
          <span>{dateStr}</span>
        </div>
      </div>
    </header>
  );
};
