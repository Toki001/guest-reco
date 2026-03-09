import React from 'react';

interface SidebarProps {
  isOpen: boolean;
  isCollapsed: boolean;
  toggleMobile: () => void;
  toggleCollapse: () => void;
  // NEW: Added props to control navigation from the sidebar
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen, 
  isCollapsed, 
  toggleMobile, 
  toggleCollapse,
  activeTab = 'dashboard',
  setActiveTab
}) => {

  const mainLinks = [
    { id: 'dashboard', label: 'Dashboard', icon: 'grid_view' },
    { id: 'analytics', label: 'Analytics', icon: 'bar_chart' },
    { id: 'camera', label: 'Live Feed', icon: 'videocam' },
    { id: 'employees', label: 'Employees', icon: 'group' },
    { id: 'add_employee', label: 'Add Employee', icon: 'person_add' }, // Added to support your existing tab
    { id: 'logs', label: 'Access Logs', icon: 'history' },
  ];

  const systemLinks = [
    { id: 'settings', label: 'Settings', icon: 'settings' },
    { id: 'user_mgmt', label: 'User Mgmt', icon: 'admin_panel_settings' },
  ];

  const handleNavClick = (id: string) => {
    if (setActiveTab) {
        // For now, we only have these three tabs built. 
        // We fallback to dashboard if clicking an unbuilt tab just to prevent errors.
        if (id === 'dashboard' || id === 'camera' || id === 'add_employee') {
            setActiveTab(id);
        } else {
            console.log(`Tab ${id} is not built yet!`);
            // setActiveTab(id); // Uncomment this when you build the other tabs
        }
    }
    if (window.innerWidth < 1024) {
      toggleMobile();
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
        onClick={toggleMobile}
      />

      {/* Sidebar Container - Using the dark purple/blue from your screenshot */}
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
          
          {/* Main Menu */}
          <div className="space-y-1">
            {mainLinks.map((link) => {
              const isActive = activeTab === link.id;
              return (
                <button
                  key={link.id}
                  onClick={() => handleNavClick(link.id)}
                  className={`w-full flex items-center space-x-3 px-3 py-3 rounded-xl transition-all duration-200 group ${
                    isActive 
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20' 
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  } ${isCollapsed ? 'justify-center' : 'justify-start'}`}
                  title={isCollapsed ? link.label : ""}
                >
                  <span className={`material-symbols-outlined text-[22px] ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>
                    {link.icon}
                  </span>
                  {!isCollapsed && (
                    <span className="font-medium text-sm tracking-wide">{link.label}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* System Menu */}
          <div className="mt-8 mb-2">
             {!isCollapsed && (
                <h2 className="px-4 text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-3">System</h2>
             )}
             <div className="space-y-1">
                {systemLinks.map((link) => {
                  const isActive = activeTab === link.id;
                  return (
                    <button
                      key={link.id}
                      onClick={() => handleNavClick(link.id)}
                      className={`w-full flex items-center space-x-3 px-3 py-3 rounded-xl transition-all duration-200 group ${
                        isActive 
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20' 
                          : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                      } ${isCollapsed ? 'justify-center' : 'justify-start'}`}
                      title={isCollapsed ? link.label : ""}
                    >
                      <span className={`material-symbols-outlined text-[22px] ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>
                        {link.icon}
                      </span>
                      {!isCollapsed && (
                        <span className="font-medium text-sm tracking-wide">{link.label}</span>
                      )}
                    </button>
                  );
                })}
             </div>
          </div>
        </div>

        {/* Footer / User Profile */}
        <div className="p-4 mt-auto">
          <div className={`flex items-center rounded-xl p-3 transition-colors hover:bg-white/5 cursor-pointer ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
            <div className="flex items-center space-x-3 overflow-hidden">
                <img 
                   src="https://ui-avatars.com/api/?name=Sys+Admin&background=0D8ABC&color=fff" 
                   alt="Admin" 
                   className="w-10 h-10 rounded-full border-2 border-white/10 shrink-0 object-cover"
                />
                {!isCollapsed && (
                    <div className="overflow-hidden">
                        <h3 className="text-white text-sm font-semibold truncate">Sys Admin</h3>
                        <p className="text-slate-400 text-[11px] truncate">admin@fsuu.edu</p>
                    </div>
                )}
            </div>
            
            {!isCollapsed && (
               <button className="text-slate-500 hover:text-white transition-colors shrink-0">
                  <span className="material-symbols-outlined text-xl">logout</span>
               </button>
            )}
          </div>
          
          {/* Collapse Toggle Button - Only visible on desktop */}
          <button 
              className={`hidden lg:flex items-center justify-center w-full mt-2 py-2 text-slate-500 hover:text-white transition-colors`} 
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