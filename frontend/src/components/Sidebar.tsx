import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clearToken } from '../auth';

interface SidebarProps {
  isOpen: boolean;
  isCollapsed: boolean;
  toggleMobile: () => void;
  toggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  isCollapsed,
  toggleMobile,
  toggleCollapse,
}) => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => { clearToken(); navigate('/login', { replace: true }); };

  const mainLinks = [
    { path: '/dashboard', label: 'Dashboard', icon: 'grid_view' },
    { path: '/cameras', label: 'Cameras', icon: 'videocam' },
    { path: '/admin/add-employee', label: 'Add Employee', icon: 'person_add' },
  ];

  const systemLinks = [
    { path: '#', label: 'Settings', icon: 'settings' },
  ];

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={toggleMobile}
      />

      <aside
        className={`
          bg-[#1c1d3b] flex flex-col shrink-0 fixed inset-y-0 left-0 z-50 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:static lg:h-full lg:shadow-none
          ${isCollapsed ? 'lg:w-20' : 'lg:w-64'}
          w-64 md:w-full md:h-96 md:translate-x-0 md:relative md:order-2
        `}
      >
        {/* Header / Logo */}
        <div
          className={`p-6 flex items-center text-white shrink-0 h-24 ${isCollapsed ? 'justify-center cursor-pointer hover:bg-white/5' : 'justify-between'}`}
          onClick={isCollapsed ? toggleCollapse : undefined}
          title={isCollapsed ? "Expand Sidebar" : ""}
        >
          <div className={`flex items-center space-x-3 overflow-hidden ${isCollapsed ? 'lg:justify-center w-full' : ''}`}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-3xl text-slate-200">shield</span>
            </div>
            <div className={`transition-opacity duration-200 ${isCollapsed ? 'lg:hidden' : 'block'}`}>
              <h1 className="font-bold text-lg leading-none tracking-wide">FSUU</h1>
              <p className="text-[9px] text-slate-400 mt-1 uppercase tracking-[0.2em] whitespace-nowrap font-semibold">Facial Recognition</p>
            </div>
          </div>

          <button className="lg:hidden p-2 hover:bg-white/10 rounded-lg transition-colors" onClick={toggleMobile}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col px-3 py-2 no-scrollbar">
          <div className="space-y-1">
            {mainLinks.map((link) => {
              const active = isActive(link.path);
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => { if (window.innerWidth < 1024) toggleMobile(); }}
                  className={`w-full flex items-center space-x-3 px-3 py-3 rounded-xl transition-all duration-200 group ${
                    active
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  } ${isCollapsed ? 'justify-center' : 'justify-start'}`}
                  title={isCollapsed ? link.label : ""}
                >
                  <span className={`material-symbols-outlined text-[22px] ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>
                    {link.icon}
                  </span>
                  {!isCollapsed && (
                    <span className="font-medium text-sm tracking-wide">{link.label}</span>
                  )}
                </Link>
              );
            })}
          </div>

          {/* System Menu */}
          <div className="mt-8 mb-2">
            {!isCollapsed && (
              <h2 className="px-4 text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-3">System</h2>
            )}
            <div className="space-y-1">
              {systemLinks.map((link) => (
                <button
                  key={link.label}
                  onClick={() => console.log(`${link.label} not built yet`)}
                  className={`w-full flex items-center space-x-3 px-3 py-3 rounded-xl transition-all duration-200 group text-slate-400 hover:bg-white/5 hover:text-slate-200 ${isCollapsed ? 'justify-center' : 'justify-start'}`}
                  title={isCollapsed ? link.label : ""}
                >
                  <span className="material-symbols-outlined text-[22px] text-slate-400 group-hover:text-slate-200">
                    {link.icon}
                  </span>
                  {!isCollapsed && (
                    <span className="font-medium text-sm tracking-wide">{link.label}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer / User Profile */}
        <div className="p-4 mt-auto">
          <div className={`flex items-center rounded-xl p-3 transition-colors hover:bg-white/5 cursor-pointer ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
            <div className="flex items-center space-x-3 overflow-hidden">
              <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center border-2 border-white/10 shrink-0">
                <svg className="w-6 h-6 text-slate-300" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
              </div>
              {!isCollapsed && (
                <div className="overflow-hidden">
                  <h3 className="text-white text-sm font-semibold truncate">Sys Admin</h3>
                  <p className="text-slate-400 text-[11px] truncate">admin@fsuu.edu</p>
                </div>
              )}
            </div>

            {!isCollapsed && (
              <button onClick={handleLogout} className="text-slate-500 hover:text-white transition-colors shrink-0">
                <span className="material-symbols-outlined text-xl">logout</span>
              </button>
            )}
          </div>

          <button
            className="hidden lg:flex items-center justify-center w-full mt-2 py-2 text-slate-500 hover:text-white transition-colors"
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
