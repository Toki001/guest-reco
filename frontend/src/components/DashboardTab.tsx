import { useState, useEffect, useRef, useCallback } from 'react';
import { authFetch, getAuthWsUrl } from '../auth';

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

  return { stats, setStats, cameras, setCameras, detections, isConnected };
}

const DashboardTab = () => {
  const { stats, setStats, cameras, setCameras, detections, isConnected } = useDashboardWebSocket();
  const [initialLogs, setInitialLogs] = useState<any[]>([]);

  const [refreshing, setRefreshing] = useState(false);

  const refreshData = useCallback(() => {
    setRefreshing(true);
    Promise.all([
      authFetch('/api/access-logs').then(r => r.json()).then(data => setInitialLogs(data)),
      authFetch('/api/stats').then(r => r.json()).then(data => setStats(data)),
      authFetch('/api/cameras').then(r => r.json()).then(data => setCameras(data)),
    ]).catch(() => {}).finally(() => setRefreshing(false));
  }, []);

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
    <div className="flex flex-col h-full w-full bg-slate-50/50 dark:bg-slate-900 overflow-y-auto pb-10">

      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard Overview</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Real-time surveillance summary and facility status.</p>
        </div>
        <div className="flex items-center gap-3 mt-4 md:mt-0">
          <button
            onClick={refreshData}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-sm ${refreshing ? 'animate-spin' : ''}`}>refresh</span>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${isConnected ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
            {isConnected ? 'Live' : 'Disconnected'}
          </div>
        </div>
      </div>

      {/* 4 METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium">Total Scans</h3>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center">
              <span className="material-symbols-outlined text-sm">center_focus_strong</span>
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white mb-2">{stats.total_scans.toLocaleString()}</div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium">Employee Matches</h3>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-500 flex items-center justify-center">
              <span className="material-symbols-outlined text-sm">badge</span>
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white mb-2">{stats.employee_matches.toLocaleString()}</div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium">Guest Alerts</h3>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center">
              <span className="material-symbols-outlined text-sm">person_alert</span>
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white mb-2">{stats.guest_alerts.toLocaleString()}</div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium">Cameras Online</h3>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-500 flex items-center justify-center">
              <span className="material-symbols-outlined text-sm">videocam</span>
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white mb-2">{stats.cameras_online}</div>
          <div className="flex items-center text-xs">
            <span className="text-emerald-500 font-bold flex items-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></span>
              {cameras.filter(c => c.is_online).length} active
            </span>
          </div>
        </div>
      </div>

      {/* CAMERA STATUS + CHART ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <h3 className="font-bold text-slate-900 dark:text-white mb-4">Recent Activity</h3>
          {allDetections.length === 0 ? (
            <p className="text-slate-500 text-sm">No activity recorded yet. Camera stations will appear here when they detect faces.</p>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {allDetections.slice(0, 10).map((det, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${det.type === 'guest' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                    <span className="material-symbols-outlined text-lg">{det.type === 'guest' ? 'person_alert' : 'badge'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{det.name}</p>
                    <p className="text-xs text-slate-500">{det.camera_id || 'Unknown camera'} &middot; {det.confidence}%</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-xs font-bold px-2 py-1 rounded-md ${det.type === 'guest' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                      {det.type === 'guest' ? 'Guest' : 'Employee'}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-1">{det.timestamp ? formatTime(det.timestamp) : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Camera Status Grid */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-900 dark:text-white">Camera Stations</h3>
            <div className={`flex items-center text-xs font-bold px-2 py-1 rounded-md ${isConnected ? 'text-emerald-500 bg-emerald-50' : 'text-red-500 bg-red-50'}`}>
              <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
              {isConnected ? 'Live' : 'Offline'}
            </div>
          </div>

          {cameras.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-slate-400 text-sm text-center">No cameras registered yet.<br />Open /camera/department-name on a device to connect.</p>
            </div>
          ) : (
            <div className="flex-1 grid grid-cols-2 gap-2">
              {cameras.map((cam) => (
                <div key={cam.camera_id} className={`bg-slate-50 dark:bg-slate-900 rounded-lg p-3 flex flex-col items-center justify-center border ${cam.is_online ? 'border-emerald-200' : 'border-amber-200'}`}>
                  <span className={`material-symbols-outlined text-lg mb-1 ${cam.is_online ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {cam.is_online ? 'videocam' : 'videocam_off'}
                  </span>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 text-center truncate w-full">{cam.department}</span>
                  <span className={`text-[10px] font-bold mt-0.5 ${cam.is_online ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {cam.is_online ? 'Online' : 'Offline'}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between items-center mt-4 text-xs font-medium">
            <span className="text-slate-500">{cameras.length} Cameras</span>
            <span className={cameras.some(c => !c.is_online) ? "text-amber-500 font-bold" : "text-emerald-500 font-bold"}>
              {cameras.filter(c => !c.is_online).length > 0 ? `${cameras.filter(c => !c.is_online).length} Offline` : 'All Online'}
            </span>
          </div>
        </div>
      </div>

      {/* RECENT DETECTIONS TABLE */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
          <h3 className="font-bold text-slate-900 dark:text-white">Recent Detections</h3>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50/50 dark:bg-slate-900/50 text-slate-400 text-xs font-bold uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Subject</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Camera / Department</th>
                <th className="px-6 py-4">Confidence</th>
                <th className="px-6 py-4">Timestamp</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {allDetections.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">No detections yet</td>
                </tr>
              ) : (
                allDetections.slice(0, 20).map((det, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${det.type === 'guest' ? 'bg-amber-100' : 'bg-blue-100'}`}>
                        <span className={`material-symbols-outlined text-sm ${det.type === 'guest' ? 'text-amber-600' : 'text-blue-600'}`}>person</span>
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">{det.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${det.type === 'guest' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                        {det.type === 'guest' ? 'Guest' : 'Employee'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500">{det.camera_id || 'N/A'}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 w-24">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{det.confidence}%</span>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(det.confidence, 100)}%` }}></div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500">{det.timestamp ? formatTime(det.timestamp) : 'N/A'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-md text-xs font-bold ${det.status === 'in' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                        {det.status?.toUpperCase() || 'N/A'}
                      </span>
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
