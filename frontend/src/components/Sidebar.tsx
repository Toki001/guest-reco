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

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={toggleMobile}
      />

      <aside
        className={`
          bg-[#0f1023] flex flex-col shrink-0 fixed inset-y-0 left-0 z-50
          transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          border-r border-white/[0.06]
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:static lg:h-full
          ${isCollapsed ? 'lg:w-[72px]' : 'lg:w-60'}
          w-60
        `}
      >
        {/* Logo */}
        <div
          className={`flex items-center shrink-0 h-16 ${isCollapsed ? 'justify-center px-2 cursor-pointer hover:bg-white/[0.03]' : 'px-5 justify-between'}`}
          onClick={isCollapsed ? toggleCollapse : undefined}
        >
          <div className={`flex items-center gap-2.5 overflow-hidden ${isCollapsed ? 'justify-center w-full' : ''}`}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0 shadow-lg shadow-cyan-500/20">
              <span className="material-symbols-outlined text-white text-lg">shield</span>
            </div>
            <div className={`transition-opacity duration-200 ${isCollapsed ? 'lg:hidden' : 'block'}`}>
              <h1 className="font-bold text-sm text-white tracking-wide">FSUU</h1>
              <p className="text-[9px] text-slate-500 uppercase tracking-[0.15em] font-medium">SecureSight</p>
            </div>
          </div>

          <button className="lg:hidden p-1.5 hover:bg-white/10 rounded-lg transition-colors text-slate-400" onClick={toggleMobile}>
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 no-scrollbar">
          <div className="space-y-0.5">
            {mainLinks.map((link) => {
              const active = isActive(link.path);
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => { if (window.innerWidth < 1024) toggleMobile(); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group relative ${
                    active
                      ? 'bg-white/[0.08] text-white'
                      : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-300'
                  } ${isCollapsed ? 'justify-center' : 'justify-start'}`}
                  title={isCollapsed ? link.label : ""}
                >
                  {active && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-cyan-400 rounded-r-full" />
                  )}
                  <span className={`material-symbols-outlined text-[20px] ${active ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-300'}`}>
                    {link.icon}
                  </span>
                  {!isCollapsed && (
                    <span className={`text-[13px] ${active ? 'font-semibold' : 'font-medium'}`}>{link.label}</span>
                  )}
                </Link>
              );
            })}
          </div>

          {/* System */}
          <div className="mt-6 pt-4 border-t border-white/[0.06]">
            {!isCollapsed && (
              <h2 className="px-3 text-[10px] font-semibold text-slate-600 tracking-widest uppercase mb-2">System</h2>
            )}
            <button
              onClick={toggleTheme}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group text-slate-500 hover:bg-white/[0.04] hover:text-slate-300 ${isCollapsed ? 'justify-center' : 'justify-start'}`}
              title={isCollapsed ? (theme === 'dark' ? 'Light mode' : 'Dark mode') : ""}
            >
              <span className="material-symbols-outlined text-[20px] text-slate-500 group-hover:text-slate-300">
                {theme === 'dark' ? 'light_mode' : 'dark_mode'}
              </span>
              {!isCollapsed && <span className="text-[13px] font-medium">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
            </button>
            <button
              onClick={onSettingsClick}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group text-slate-500 hover:bg-white/[0.04] hover:text-slate-300 ${isCollapsed ? 'justify-center' : 'justify-start'}`}
              title={isCollapsed ? "Settings" : ""}
            >
              <span className="material-symbols-outlined text-[20px] text-slate-500 group-hover:text-slate-300">settings</span>
              {!isCollapsed && <span className="text-[13px] font-medium">Settings</span>}
            </button>
          </div>
        </div>

        {/* User + Collapse */}
        <div className="p-3 mt-auto border-t border-white/[0.06]">
          <div className={`flex items-center rounded-lg p-2 transition-colors hover:bg-white/[0.04] ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center border border-white/10 shrink-0">
                <svg className="w-4 h-4 text-slate-300" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
              </div>
              {!isCollapsed && (
                <div className="overflow-hidden">
                  <h3 className="text-white text-xs font-semibold truncate">Admin</h3>
                  <p className="text-slate-500 text-[10px] truncate">admin@fsuu.edu</p>
                </div>
              )}
            </div>

            {!isCollapsed && (
              <button onClick={handleLogout} className="text-slate-600 hover:text-red-400 transition-colors shrink-0 p-1">
                <span className="material-symbols-outlined text-lg">logout</span>
              </button>
            )}
          </div>

          <button
            className="hidden lg:flex items-center justify-center w-full mt-1 py-1.5 text-slate-600 hover:text-slate-400 transition-colors rounded-lg hover:bg-white/[0.04]"
            onClick={(e) => { e.stopPropagation(); toggleCollapse(); }}
          >
            <span className="material-symbols-outlined text-sm">
              {isCollapsed ? 'keyboard_double_arrow_right' : 'keyboard_double_arrow_left'}
            </span>
          </button>
        </div>
      </aside>
    </>
  );
};
