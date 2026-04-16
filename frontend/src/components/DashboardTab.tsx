import { useState, useEffect, useRef, useCallback } from 'react';
import { authFetch, getAuthWsUrl } from '../auth';
import { API_BASE } from '../config';

interface DashboardStats {
  total_scans: number;
  employee_matches: number;
  guest_alerts: number;
  cameras_online: number;
}

interface CameraInfo {
  camera_id: string;
  department: string;
  last_heartbeat: string;
  is_online: number;
}

interface DetectionEvent {
  name: string;
  type: string;
  confidence: number;
  image_url: string;
  status: string;
  camera_id: string | null;
  timestamp: string;
}

function useDashboardWebSocket() {
  const [stats, setStats] = useState<DashboardStats>({ total_scans: 0, employee_matches: 0, guest_alerts: 0, cameras_online: 0 });
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [detections, setDetections] = useState<DetectionEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 10;
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current || retryCountRef.current >= MAX_RETRIES) return;

    const ws = new WebSocket(getAuthWsUrl('/ws/dashboard'));
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      retryCountRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.event) {
          case 'initial_state':
            setCameras(msg.data.cameras || []);
            setStats(msg.data.stats || { total_scans: 0, employee_matches: 0, guest_alerts: 0, cameras_online: 0 });
            break;
          case 'recognition_result':
            setDetections(prev => [msg.data, ...prev].slice(0, 50));
            break;
          case 'stats_update':
            setStats(msg.data);
            break;
          case 'camera_online':
            setCameras(prev => {
              const existing = prev.find(c => c.camera_id === msg.data.camera_id);
              if (existing) {
                return prev.map(c => c.camera_id === msg.data.camera_id ? { ...c, is_online: 1, last_heartbeat: msg.data.timestamp } : c);
              }
              return [...prev, { camera_id: msg.data.camera_id, department: msg.data.department, last_heartbeat: msg.data.timestamp, is_online: 1 }];
            });
            break;
          case 'camera_offline':
            if (msg.data.removed) {
              setCameras(prev => prev.filter(c => c.camera_id !== msg.data.camera_id));
            } else {
              setCameras(prev => prev.map(c => c.camera_id === msg.data.camera_id ? { ...c, is_online: 0 } : c));
            }
            break;
        }
        setLastUpdated(new Date());
      } catch (e) {
        console.error('WebSocket parse error:', e);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;
      if (mountedRef.current && retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        const delay = Math.min(3000 * retryCountRef.current, 15000);
        setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send('ping');
      }
    }, 25000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      retryCountRef.current = MAX_RETRIES;
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return { stats, setStats, cameras, setCameras, detections, isConnected, lastUpdated, setLastUpdated };
}

const METRIC_CARDS = [
  { key: 'total_scans' as const, label: 'Total Scans', icon: 'center_focus_strong', gradient: 'from-blue-500 to-cyan-400', glow: 'var(--glow-blue)', ring: 'ring-blue-400/20', badge: 'bg-blue-500/15 text-blue-400' },
  { key: 'employee_matches' as const, label: 'Employees', icon: 'badge', gradient: 'from-emerald-500 to-teal-400', glow: 'var(--glow-emerald)', ring: 'ring-emerald-400/20', badge: 'bg-emerald-500/15 text-emerald-400' },
  { key: 'guest_alerts' as const, label: 'Guests', icon: 'person_alert', gradient: 'from-amber-500 to-orange-400', glow: 'var(--glow-amber)', ring: 'ring-amber-400/20', badge: 'bg-amber-500/15 text-amber-400' },
  { key: 'cameras_online' as const, label: 'Cameras', icon: 'videocam', gradient: 'from-violet-500 to-purple-400', glow: 'var(--glow-violet)', ring: 'ring-violet-400/20', badge: 'bg-violet-500/15 text-violet-400' },
];

const DashboardTab = () => {
  const { stats, setStats, cameras, setCameras, detections, isConnected, lastUpdated, setLastUpdated } = useDashboardWebSocket();
  const [initialLogs, setInitialLogs] = useState<any[]>([]);
  const [todayStats, setTodayStats] = useState({ scans_today: 0, unique_people_today: 0, currently_on_site: 0, employees_in_today: 0, guests_today: 0 });

  const [refreshing, setRefreshing] = useState(false);

  const refreshData = useCallback(() => {
    setRefreshing(true);
    Promise.allSettled([
      authFetch('/api/access-logs').then(r => r.ok ? r.json() : []).then(data => setInitialLogs(data)),
      authFetch('/api/stats').then(r => r.ok ? r.json() : null).then(data => { if (data) setStats(data); }),
      authFetch('/api/cameras').then(r => r.ok ? r.json() : []).then(data => setCameras(data)),
      authFetch('/api/stats/today').then(r => r.ok ? r.json() : null).then(data => { if (data) setTodayStats(data); }),
    ]).finally(() => { setRefreshing(false); setLastUpdated(new Date()); });
  }, [setStats, setCameras, setLastUpdated]);

  useEffect(() => { refreshData(); }, []);

  const allDetections = detections.length > 0 ? detections : initialLogs.map(log => ({
    name: log.name || log.user_id,
    type: log.role?.toLowerCase() || 'employee',
    confidence: log.confidence,
    image_url: log.image_url,
    status: log.status,
    camera_id: log.camera_id,
    timestamp: log.timestamp,
  }));

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return ts; }
  };

  return (
    <div className="flex flex-col h-full w-full overflow-y-auto pb-10 glass-scrollbar">

      {/* Status Bar */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className={`glass-card flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold ${
            isConnected ? 'text-emerald-500' : 'text-red-400'
          }`} style={{ boxShadow: isConnected ? 'var(--glow-emerald)' : undefined }}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            {isConnected ? 'System Online' : 'Disconnected'}
          </div>
          {lastUpdated && (
            <span className="text-[10px] text-[var(--text-muted)] font-mono">
              {formatTime(lastUpdated.toISOString())}
            </span>
          )}
        </div>
        <button
          onClick={refreshData}
          disabled={refreshing}
          className="glass-card flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all disabled:opacity-40 cursor-pointer"
        >
          <span className={`material-symbols-outlined text-sm ${refreshing ? 'animate-spin' : ''}`}>refresh</span>
          Refresh
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {METRIC_CARDS.map((card) => {
          const value = stats[card.key];
          const extra = card.key === 'cameras_online' ? `${cameras.filter(c => c.is_online).length} active` : undefined;
          return (
            <div
              key={card.key}
              className="glass-card rounded-2xl p-5 group relative overflow-hidden"
              style={{ boxShadow: `var(--glass-shadow), ${card.glow}` }}
            >
              {/* Gradient orb background */}
              <div className={`absolute -top-6 -right-6 w-24 h-24 rounded-full bg-gradient-to-br ${card.gradient} opacity-[0.08] group-hover:opacity-[0.15] transition-opacity duration-500 blur-xl`} />

              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">{card.label}</span>
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center shadow-lg`}>
                    <span className="material-symbols-outlined text-white text-lg">{card.icon}</span>
                  </div>
                </div>
                <div className="text-3xl font-bold text-[var(--text-primary)] font-mono tracking-tight">{value.toLocaleString()}</div>
                {extra && <div className="text-[11px] text-emerald-500 font-semibold mt-1.5 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{extra}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Today's Quick Stats */}
      <div className="flex flex-wrap gap-2.5 mb-5">
        {[
          { icon: 'trending_up', label: `${todayStats.scans_today} today`, color: 'blue' },
          { icon: 'people', label: `${todayStats.unique_people_today} unique`, color: 'emerald' },
          { icon: 'location_on', label: `${todayStats.currently_on_site} on site`, color: 'violet' },
        ].map((pill) => (
          <div
            key={pill.label}
            className={`glass-card flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold ${
              pill.color === 'blue' ? 'text-blue-400' :
              pill.color === 'emerald' ? 'text-emerald-400' : 'text-violet-400'
            }`}
          >
            <span className="material-symbols-outlined text-xs">{pill.icon}</span>
            {pill.label}
          </div>
        ))}
      </div>

      {/* Activity + Cameras Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">

        {/* Recent Activity */}
        <div className="lg:col-span-2 glass-card rounded-2xl overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-[var(--glass-border)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-[var(--accent)]">timeline</span>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Recent Activity</h3>
            </div>
            <span className="text-[10px] text-[var(--text-muted)] font-mono bg-white/[0.06] px-2 py-0.5 rounded-md">{allDetections.length} events</span>
          </div>
          {allDetections.length === 0 ? (
            <div className="p-10 text-center text-[var(--text-muted)] text-sm flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-3xl opacity-30">sensors_off</span>
              No activity yet
            </div>
          ) : (
            <div className="divide-y divide-[var(--glass-border)] max-h-[360px] overflow-y-auto glass-scrollbar">
              {allDetections.slice(0, 12).map((det, idx) => (
                <div key={idx} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.04] transition-colors">
                  {det.image_url ? (
                    <img src={det.image_url.startsWith('/') ? `${API_BASE}${det.image_url}` : det.image_url}
                         alt={det.name}
                         className="w-9 h-9 rounded-xl object-cover border border-[var(--glass-border)] shrink-0" />
                  ) : (
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      det.type === 'guest' ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'
                    }`}>
                      <span className="material-symbols-outlined text-sm">person</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{det.name}</p>
                    <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                      <span className="material-symbols-outlined text-[10px]">videocam</span>
                      {det.camera_id || 'Unknown'} <span className="opacity-40">|</span> {det.confidence}% match
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${
                      det.status === 'in'
                        ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20'
                        : 'bg-red-500/15 text-red-400 ring-1 ring-red-500/20'
                    }`}>{det.status?.toUpperCase()}</span>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono w-14 text-right">{det.timestamp ? formatTime(det.timestamp) : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Camera Stations */}
        <div className="glass-card rounded-2xl flex flex-col">
          <div className="px-5 py-3.5 border-b border-[var(--glass-border)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-violet-400">videocam</span>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Cameras</h3>
            </div>
            <span className="text-[10px] text-[var(--text-muted)] font-mono bg-white/[0.06] px-2 py-0.5 rounded-md">{cameras.length} total</span>
          </div>
          {cameras.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center text-[var(--text-muted)]">
                <span className="material-symbols-outlined text-3xl opacity-30 block mb-1">videocam_off</span>
                <p className="text-xs">No cameras registered</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 p-3 grid grid-cols-2 gap-2.5 content-start">
              {cameras.map((cam) => (
                <div key={cam.camera_id} className={`rounded-xl p-3 flex items-center gap-2.5 transition-all border ${
                  cam.is_online
                    ? 'bg-emerald-500/[0.06] border-emerald-500/20'
                    : 'bg-white/[0.03] border-[var(--glass-border)]'
                }`} style={cam.is_online ? { boxShadow: 'var(--glow-emerald)' } : undefined}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    cam.is_online ? 'bg-emerald-500/15' : 'bg-white/[0.06]'
                  }`}>
                    <span className={`material-symbols-outlined text-base ${cam.is_online ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {cam.is_online ? 'videocam' : 'videocam_off'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[var(--text-primary)] truncate capitalize">{cam.department}</div>
                    <div className={`text-[9px] font-semibold ${cam.is_online ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {cam.is_online ? 'Online' : 'Offline'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detection Log Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--glass-border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-cyan-400">list_alt</span>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Detection Log</h3>
          </div>
          <span className="text-[10px] text-[var(--text-muted)] font-mono bg-white/[0.06] px-2 py-0.5 rounded-md">Last 20</span>
        </div>
        <div className="w-full overflow-x-auto glass-scrollbar">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-[var(--glass-border)]">
                <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Subject</th>
                <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Type</th>
                <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Camera</th>
                <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Confidence</th>
                <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Time</th>
                <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--glass-border)]">
              {allDetections.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-[var(--text-muted)] text-xs">No detections yet</td></tr>
              ) : (
                allDetections.slice(0, 20).map((det, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.03] transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        {det.image_url ? (
                          <img src={det.image_url.startsWith('/') ? `${API_BASE}${det.image_url}` : det.image_url}
                               alt={det.name} className="w-8 h-8 rounded-lg object-cover border border-[var(--glass-border)] shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-xs text-[var(--text-muted)]">person</span>
                          </div>
                        )}
                        <span className="font-semibold text-[var(--text-primary)] text-xs">{det.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${
                        det.type === 'guest' ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'
                      }`}>{det.type === 'guest' ? 'Guest' : 'Employee'}</span>
                    </td>
                    <td className="px-5 py-3 text-xs text-[var(--text-muted)] capitalize">{det.camera_id || '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 w-24">
                        <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all" style={{ width: `${Math.min(det.confidence, 100)}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-[var(--text-muted)] w-8 text-right">{det.confidence}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-[10px] font-mono text-[var(--text-muted)]">{det.timestamp ? formatTime(det.timestamp) : '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${
                        det.status === 'in'
                          ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20'
                          : 'bg-red-500/15 text-red-400 ring-1 ring-red-500/20'
                      }`}>{det.status?.toUpperCase() || '—'}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default DashboardTab;
