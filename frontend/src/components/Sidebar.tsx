import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clearToken } from '../auth';
import { useTheme } from '../ThemeContext';

interface SidebarProps {
  isOpen: boolean;
  isCollapsed: boolean;
  toggleMobile: () => void;
  toggleCollapse: () => void;
  onSettingsClick?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  isCollapsed,
  toggleMobile,
  toggleCollapse,
  onSettingsClick,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggle: toggleTheme } = useTheme();

  const handleLogout = () => { clearToken(); navigate('/login', { replace: true }); };

  const mainLinks = [
    { path: '/dashboard', label: 'Dashboard', icon: 'grid_view' },
    { path: '/cameras', label: 'Cameras', icon: 'videocam' },
    { path: '/employees', label: 'Employees', icon: 'group' },
    { path: '/visitors', label: 'Visitors', icon: 'person_search' },
    { path: '/attendance', label: 'Attendance', icon: 'schedule' },
  ];

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  // Text fades + collapses via max-width so icons stay left-aligned
  const textCls = `whitespace-nowrap overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
    isCollapsed ? 'lg:max-w-0 lg:opacity-0 lg:ml-0' : 'max-w-[160px] opacity-100 ml-0'
  }`;

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-md transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={toggleMobile}
      />

      <aside
        className={`
          flex flex-col shrink-0 fixed inset-y-0 left-0 z-50 overflow-hidden
          transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          border-r
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:static lg:h-full
          ${isCollapsed ? 'lg:w-[72px]' : 'lg:w-60'}
          w-60
        `}
        style={{
          background: 'var(--bg-sidebar)',
          borderColor: 'var(--sidebar-border)',
          boxShadow: '4px 0 24px rgba(0, 0, 0, 0.12)',
        }}
      >
        {/* Logo — always left-aligned, icon stays put */}
        <div
          className="flex items-center shrink-0 h-16 px-[18px] cursor-pointer"
          onClick={isCollapsed ? toggleCollapse : undefined}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0 border border-white/20 shadow-lg shadow-black/10">
              <span className="material-symbols-outlined text-white text-lg">shield</span>
            </div>
            <div className={textCls}>
              <h1 className="font-bold text-sm text-white tracking-wide">FSUU</h1>
              <p className="text-[9px] text-white/40 uppercase tracking-[0.15em] font-semibold">SecureSight</p>
            </div>
          </div>

          <button className="lg:hidden ml-auto p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/60" onClick={toggleMobile}>
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Navigation — icons always at left, text slides away */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 no-scrollbar">
          <div className="space-y-1">
            {mainLinks.map((link) => {
              const active = isActive(link.path);
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => { if (window.innerWidth < 1024) toggleMobile(); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors duration-200 group relative"
                  style={active ? {
                    background: 'var(--sidebar-active)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 8px rgba(43,14,114,0.25)',
                    color: 'var(--sidebar-text-active)',
                  } : undefined}
                  title={isCollapsed ? link.label : ""}
                  onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'var(--sidebar-hover)'; e.currentTarget.style.color = 'var(--sidebar-text-active)'; } }}
                  onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = ''; } }}
                >
                  {active && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-white rounded-r-full shadow-[0_0_8px_rgba(255,255,255,0.4)]" />
                  )}
                  <span className={`material-symbols-outlined text-[20px] shrink-0 transition-colors ${active ? 'text-white' : 'text-white/50 group-hover:text-white'}`}>
                    {link.icon}
                  </span>
                  <span className={`text-[13px] ${textCls} ${active ? 'font-semibold text-white' : 'font-medium text-white/55 group-hover:text-white'}`}>{link.label}</span>
                </Link>
              );
            })}
          </div>

          {/* System */}
          <div className="mt-6 pt-4 border-t border-white/[0.08]">
            <div className={`px-3 mb-2 ${textCls}`}>
              <h2 className="text-[10px] font-semibold text-white/30 tracking-widest uppercase">System</h2>
            </div>
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors duration-200 group text-white/50 hover:text-white"
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sidebar-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              title={isCollapsed ? (theme === 'dark' ? 'Light mode' : 'Dark mode') : ""}
            >
              <span className="material-symbols-outlined text-[20px] shrink-0 text-white/50 group-hover:text-white transition-colors">
                {theme === 'dark' ? 'light_mode' : 'dark_mode'}
              </span>
              <span className={`text-[13px] font-medium ${textCls}`}>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
            <button
              onClick={onSettingsClick}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors duration-200 group text-white/50 hover:text-white"
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sidebar-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              title={isCollapsed ? "Settings" : ""}
            >
              <span className="material-symbols-outlined text-[20px] shrink-0 text-white/50 group-hover:text-white transition-colors">settings</span>
              <span className={`text-[13px] font-medium ${textCls}`}>Settings</span>
            </button>
          </div>
        </div>

        {/* User + Collapse */}
        <div className="px-3 pb-3 pt-2 mt-auto border-t border-white/[0.08]">
          <div className="flex items-center gap-3 px-2 py-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center border border-white/15 shrink-0">
              <svg className="w-4 h-4 text-white/80" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
            </div>
            <div className={`${textCls} flex-1 min-w-0`}>
              <h3 className="text-white text-xs font-semibold truncate">Admin</h3>
              <p className="text-white/35 text-[10px] truncate">admin@fsuu.edu</p>
            </div>
            <button onClick={handleLogout} className={`text-white/30 hover:text-red-400 shrink-0 p-1 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${isCollapsed ? 'lg:max-w-0 lg:opacity-0 lg:p-0' : 'max-w-[40px] opacity-100'}`}>
              <span className="material-symbols-outlined text-lg">logout</span>
            </button>
          </div>

          <button
            className="hidden lg:flex items-center justify-center w-full mt-1.5 py-1.5 text-white/30 hover:text-white/60 transition-colors rounded-lg hover:bg-white/[0.06]"
            onClick={(e) => { e.stopPropagation(); toggleCollapse(); }}
          >
            <span className="material-symbols-outlined text-sm transition-transform duration-300" style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}>
              keyboard_double_arrow_right
            </span>
          </button>
        </div>
      </aside>
    </>
  );
};
