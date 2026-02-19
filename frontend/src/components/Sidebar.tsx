import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient'; // Ensure this path matches your file structure
import { AccessLog } from '../types';

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
  toggleCollapse 
}) => {
  const [history, setHistory] = useState<AccessLog[]>([]);

  // --- SUPABASE CONNECTION ---
  useEffect(() => {
    let channel: any = null;
    let isMounted = true;
    
    // 1. Fetch initial history (Last 20 logs)
    const fetchHistory = async () => {
      const { data, error } = await supabase
        .from('access_logs')
        .select(`
          id,
          status,
          timestamp,
          confidence,
          snapshot_url,
          user:users ( name, image_url, id )
        `)
        .order('timestamp', { ascending: false })
        .limit(20);

      if (error) console.error('Error fetching history:', error);
      
      if (data && isMounted) {
        const formattedLogs = data.map((log: any) => ({
          id: log.id,
          time: new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
          status: log.status,
          isUnknown: log.status === 'denied',
          user: {
            name: log.user?.name || 'Guest',
            id: log.user?.id || '?',
            // LOGIC: Use snapshot if exists (Guest), otherwise use profile pic (Employee)
            imageUrl: log.snapshot_url || log.user?.image_url || '', 
            confidence: log.confidence
          }
        }));
        setHistory(formattedLogs);
      }
    };

    fetchHistory();

    // 2. Subscribe to REAL-TIME updates
      const connectionTimeout = setTimeout(() => {
        if (!isMounted) return;

        if (import.meta.env.DEV) console.log("🔌 Establishing Stable Connection...");
        
        channel = supabase
          .channel('realtime-logs')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'access_logs' }, async (payload) => {
            if (!isMounted) return;

            const newLog = payload.new;
            let userData = null;

            // Only fetch user details if it's a registered employee (has user_id)
            if (newLog.user_id) {
                const { data } = await supabase.from('users').select('*').eq('id', newLog.user_id).single();
                userData = data;
            }

            const newEntry: AccessLog = {
                id: newLog.id,
                time: new Date(newLog.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                status: newLog.status,
                isUnknown: newLog.status === 'denied',
                user: {
                    name: userData?.name || 'Guest',
                    id: userData?.id || '?',
                    // CRITICAL UPDATE: Check newLog.snapshot_url first!
                    imageUrl: newLog.snapshot_url || userData?.image_url || '',
                    confidence: newLog.confidence
                }
            };
            
            if (isMounted) {
                setHistory((prev) => [newEntry, ...prev]);
            }
          })
          .subscribe((status) => {
            if (isMounted && import.meta.env.DEV) console.log(`📡 STATUS: ${status}`);
          });

    }, 1000); 

    return () => {
      isMounted = false; 
      clearTimeout(connectionTimeout); 
      if (channel) {
        if (import.meta.env.DEV) console.log("🛑 Cleaning up channel");
        supabase.removeChannel(channel);
      }
    };
  }, []);

  return (
    <>
      {/* Mobile Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
        onClick={toggleMobile}
      />

      {/* Sidebar Container */}
      <aside 
        className={`
          bg-primary flex flex-col shrink-0 fixed inset-y-0 left-0 z-50 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          ${isOpen ? 'translate-x-0' : '-translate-x-full'} 
          lg:translate-x-0 lg:static lg:h-full lg:shadow-none
          ${isCollapsed ? 'lg:w-20' : 'lg:w-80'}
          w-72 md:w-full md:h-96 md:translate-x-0 md:relative md:order-2
        `}
      >
        {/* Header */}
        <div 
            className={`p-6 flex items-center justify-between text-white border-b border-white/10 shrink-0 h-20 ${isCollapsed ? 'cursor-pointer hover:bg-white/5' : ''}`}
            onClick={isCollapsed ? toggleCollapse : undefined}
            title={isCollapsed ? "Expand Sidebar" : ""}
        >
          <div className={`flex items-center space-x-3 overflow-hidden ${isCollapsed ? 'lg:justify-center w-full' : ''}`}>
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined">security</span>
            </div>
            <div className={`transition-opacity duration-200 ${isCollapsed ? 'lg:hidden' : 'block'}`}>
              <h1 className="font-bold text-lg leading-none whitespace-nowrap">FSUU</h1>
              <p className="text-[10px] text-white/70 mt-1 uppercase tracking-tighter whitespace-nowrap">Facial Recognition</p>
            </div>
          </div>
          
          <button className="lg:hidden p-2 hover:bg-white/10 rounded-lg transition-colors" onClick={toggleMobile}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className={`px-6 py-4 flex items-center justify-between shrink-0 ${isCollapsed ? 'lg:hidden' : ''}`}>
            <h2 className="text-xs font-bold text-white/60 tracking-widest uppercase">Live History</h2>
          </div>

          <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-6 md:grid md:grid-cols-2 md:gap-4 md:space-y-0 md:px-6 md:content-start lg:block lg:space-y-2 lg:px-4 lg:content-normal no-scrollbar">
            {history.map((item) => (
              <div 
                key={item.id} 
                className={`
                  bg-white/10 hover:bg-white/15 transition-colors p-3 rounded-xl border border-white/5 flex items-center space-x-3 cursor-pointer group
                  ${isCollapsed ? 'lg:justify-center lg:p-1 lg:space-x-0' : ''}
                `}
              >
                <div className="relative shrink-0">
                  {/* Image Logic: Only show img if URL is valid */}
                  {item.user.imageUrl && item.user.imageUrl !== "" ? (
                      <img 
                        alt={item.user.name} 
                        className={`w-10 h-10 rounded-full object-cover border-2 border-white/10 ${item.isUnknown ? 'grayscale' : ''}`} 
                        src={item.user.imageUrl} 
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold border-2 border-white/10">
                          {item.user.name.substring(0,2).toUpperCase()}
                      </div>
                    )}

                  {/* Status Indicator Icon */}
                  <div className={`absolute -bottom-1 -right-1 rounded-full p-0.5 border-2 border-primary ${
                      item.status === 'in' ? 'bg-green-500' : 
                      item.status === 'out' ? 'bg-amber-500' : 
                      'bg-red-500'
                  }`}>
                    <span className="material-symbols-outlined text-white text-[10px] flex">
                        {item.status === 'denied' ? 'close' : item.status === 'in' ? 'login' : 'logout'}
                    </span>
                  </div>
                </div>

                <div className={`flex-1 min-w-0 ${isCollapsed ? 'lg:hidden' : 'block'}`}>
                  <div className="flex justify-between items-start">
                    <h3 className="text-white text-sm font-semibold truncate pr-2">{item.user.name}</h3>
                    <span className="text-white/50 text-[10px]">{item.time}</span>
                  </div>

                  {/* Status Text */}
                  <p className="text-white/70 text-xs flex items-center gap-1">
                      {item.status === 'denied' ? (
                        <span>Access Denied</span>
                      ) : item.user.name === 'Guest' ? (
                        <span className="text-green-400">Access Granted</span>
                      ) : (
                        <span className={item.status === 'in' ? 'text-green-400' : 'text-amber-400'}>
                          {item.status === 'in' ? 'Clock In' : 'Clock Out'}
                        </span>
                      )}
                  </p>
                </div>
                
                {/* Tooltip for collapsed state */}
                {isCollapsed && (
                    <div className="hidden lg:group-hover:block absolute left-16 z-50 bg-slate-900 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap ml-2">
                        {item.user.name} ({item.time})
                    </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer Toggle Button */}
        <div className={`hidden lg:flex p-4 border-t border-white/10 shrink-0 ${isCollapsed ? 'justify-center' : 'justify-start'}`}>
            <button 
                className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors" 
                onClick={(e) => { e.stopPropagation(); toggleCollapse(); }}
                title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
                <span className="material-symbols-outlined">
                    {/* Swapped icons */}
                    {isCollapsed ? 'keyboard_double_arrow_left' : 'keyboard_double_arrow_right'}
                </span>
            </button>
        </div>
      </aside>
    </>
  );
};