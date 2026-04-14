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
    <header className="flex items-center justify-between mb-4 shrink-0">
      <div className="flex items-center gap-3">
        <button
          className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/[0.05]"
          onClick={toggleSidebar}
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">{title}</h1>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
          <span className="font-mono">{timeStr}</span>
          <span className="text-slate-700">·</span>
          <span>{dateStr}</span>
        </div>
      </div>
    </header>
  );
};
