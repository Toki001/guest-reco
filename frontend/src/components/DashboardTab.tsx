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
              // Camera was fully removed by admin — delete from list
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

  // Send periodic pings to keep connection alive
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

  // Fetch initial data via REST
  useEffect(() => { refreshData(); }, []);

  // Merge WebSocket detections with initial REST logs
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
      if (diffMin < 60) return `${diffMin} min ago`;
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return ts; }
  };

  return (
    <div className="flex flex-col h-full w-full overflow-y-auto pb-10">

      {/* Top bar: status + refresh */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold ${
            isConnected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            {isConnected ? 'System Online' : 'Disconnected'}
          </div>
          {lastUpdated && (
            <span className="text-[10px] text-slate-600 font-mono">
              {formatTime(lastUpdated.toISOString())}
            </span>
          )}
        </div>
        <button
          onClick={refreshData}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-surface)] text-slate-400 border border-[var(--border-color)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] transition-all disabled:opacity-40"
        >
          <span className={`material-symbols-outlined text-sm ${refreshing ? 'animate-spin' : ''}`}>refresh</span>
          Refresh
        </button>
      </div>

      {/* 4 METRIC CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total Scans', value: stats.total_scans, icon: 'center_focus_strong', color: 'cyan' },
          { label: 'Employees', value: stats.employee_matches, icon: 'badge', color: 'emerald' },
          { label: 'Guests', value: stats.guest_alerts, icon: 'person_alert', color: 'amber' },
          { label: 'Cameras', value: stats.cameras_online, icon: 'videocam', color: 'violet', sub: `${cameras.filter(c => c.is_online).length} active` },
        ].map((card) => (
          <div key={card.label} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-4 group hover:bg-[var(--bg-surface-hover)] transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">{card.label}</span>
              <span className={`material-symbols-outlined text-base ${
                card.color === 'cyan' ? 'text-cyan-500' :
                card.color === 'emerald' ? 'text-emerald-500' :
                card.color === 'amber' ? 'text-amber-500' : 'text-violet-500'
              }`}>{card.icon}</span>
            </div>
            <div className="text-2xl font-bold text-[var(--text-primary)] font-mono tracking-tight">{card.value.toLocaleString()}</div>
            {card.sub && <div className="text-[10px] text-emerald-500 font-medium mt-1">{card.sub}</div>}
          </div>
        ))}
      </div>

      {/* Quick stats pills */}
      <div className="flex flex-wrap gap-2 mb-5">
        <div className="flex items-center gap-1.5 px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-xs font-semibold text-cyan-400">
          <span className="material-symbols-outlined text-xs">trending_up</span>
          {todayStats.scans_today} today
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs font-semibold text-emerald-400">
          <span className="material-symbols-outlined text-xs">people</span>
          {todayStats.unique_people_today} unique
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 bg-violet-500/10 border border-violet-500/20 rounded-lg text-xs font-semibold text-violet-400">
          <span className="material-symbols-outlined text-xs">location_on</span>
          {todayStats.currently_on_site} on site
        </div>
      </div>

      {/* ACTIVITY + CAMERAS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Recent Activity</h3>
            <span className="text-[10px] text-slate-600 font-mono">{allDetections.length} events</span>
          </div>
          {allDetections.length === 0 ? (
            <div className="p-8 text-center text-slate-600 text-sm">No activity yet</div>
          ) : (
            <div className="divide-y divide-[var(--border-color)] max-h-[340px] overflow-y-auto">
              {allDetections.slice(0, 12).map((det, idx) => (
                <div key={idx} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-surface)] transition-colors">
                  {det.image_url ? (
                    <img src={det.image_url.startsWith('/') ? `${API_BASE}${det.image_url}` : det.image_url}
                         alt={det.name}
                         className="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0" />
                  ) : (
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      det.type === 'guest' ? 'bg-amber-500/20 text-amber-400' : 'bg-cyan-500/20 text-cyan-400'
                    }`}>
                      <span className="material-symbols-outlined text-sm">person</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{det.name}</p>
                    <p className="text-[10px] text-slate-500">{det.camera_id || '—'} · {det.confidence}%</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      det.status === 'in' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                    }`}>{det.status?.toUpperCase()}</span>
                    <span className="text-[10px] text-slate-600 font-mono w-16 text-right">{det.timestamp ? formatTime(det.timestamp) : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Camera Stations */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl flex flex-col">
          <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Cameras</h3>
            <span className="text-[10px] text-slate-500">{cameras.length} registered</span>
          </div>
          {cameras.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <p className="text-slate-600 text-xs text-center">No cameras registered yet</p>
            </div>
          ) : (
            <div className="flex-1 p-3 grid grid-cols-2 gap-2 content-start">
              {cameras.map((cam) => (
                <div key={cam.camera_id} className={`rounded-lg p-2.5 flex items-center gap-2 border transition-all ${
                  cam.is_online
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : 'bg-[var(--bg-surface)] border-[var(--border-color)]'
                }`}>
                  <span className={`material-symbols-outlined text-base ${cam.is_online ? 'text-emerald-400' : 'text-slate-600'}`}>
                    {cam.is_online ? 'videocam' : 'videocam_off'}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[var(--text-primary)] truncate capitalize">{cam.department}</div>
                    <div className={`text-[9px] font-medium ${cam.is_online ? 'text-emerald-400' : 'text-slate-600'}`}>
                      {cam.is_online ? 'Online' : 'Offline'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* DETECTIONS TABLE */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-color)]">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Detection Log</h3>
        </div>
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[var(--bg-surface)] text-slate-500 text-[10px] font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Camera</th>
                <th className="px-4 py-3">Confidence</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {allDetections.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-600 text-xs">No detections yet</td></tr>
              ) : (
                allDetections.slice(0, 20).map((det, idx) => (
                  <tr key={idx} className="hover:bg-[var(--bg-surface)] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {det.image_url ? (
                          <img src={det.image_url.startsWith('/') ? `${API_BASE}${det.image_url}` : det.image_url}
                               alt={det.name} className="w-7 h-7 rounded-full object-cover border border-white/10 shrink-0" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-[var(--bg-surface-hover)] flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-xs text-slate-500">person</span>
                          </div>
                        )}
                        <span className="font-medium text-[var(--text-primary)] text-xs">{det.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        det.type === 'guest' ? 'bg-amber-500/15 text-amber-400' : 'bg-cyan-500/15 text-cyan-400'
                      }`}>{det.type === 'guest' ? 'Guest' : 'Employee'}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 capitalize">{det.camera_id || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 w-20">
                        <div className="flex-1 h-1 bg-[var(--bg-surface-hover)] rounded-full overflow-hidden">
                          <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${Math.min(det.confidence, 100)}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">{det.confidence}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[10px] font-mono text-slate-500">{det.timestamp ? formatTime(det.timestamp) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        det.status === 'in' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
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
