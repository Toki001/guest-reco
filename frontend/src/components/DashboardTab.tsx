import { useState, useEffect, useRef, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { authFetch, getAuthWsUrl } from '../auth';
import { API_BASE } from '../config';
import { SkeletonCard, SkeletonChart, SkeletonTable } from './GlassSkeleton';
import { EmptyState } from './EmptyState';
import { HoverCard } from './HoverCard';

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

interface HourlyData {
  hour: string;
  scans: number;
  entries: number;
  exits: number;
}

// ─── WebSocket Hook ─────────────────────────────────────
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
    ws.onopen = () => { setIsConnected(true); retryCountRef.current = 0; };
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
              if (existing) return prev.map(c => c.camera_id === msg.data.camera_id ? { ...c, is_online: 1, last_heartbeat: msg.data.timestamp } : c);
              return [...prev, { camera_id: msg.data.camera_id, department: msg.data.department, last_heartbeat: msg.data.timestamp, is_online: 1 }];
            });
            break;
          case 'camera_offline':
            if (msg.data.removed) setCameras(prev => prev.filter(c => c.camera_id !== msg.data.camera_id));
            else setCameras(prev => prev.map(c => c.camera_id === msg.data.camera_id ? { ...c, is_online: 0 } : c));
            break;
        }
        setLastUpdated(new Date());
      } catch (e) { console.error('WebSocket parse error:', e); }
    };
    ws.onclose = () => {
      setIsConnected(false); wsRef.current = null;
      if (mountedRef.current && retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        setTimeout(connect, Math.min(3000 * retryCountRef.current, 15000));
      }
    };
    ws.onerror = () => { ws.close(); };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send('ping');
    }, 25000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => { mountedRef.current = false; retryCountRef.current = MAX_RETRIES; wsRef.current?.close(); };
  }, [connect]);

  return { stats, setStats, cameras, setCameras, detections, isConnected, lastUpdated, setLastUpdated };
}

// ─── Time Range Presets ─────────────────────────────────
const TIME_RANGES = [
  { label: 'Today', key: 'today' },
  { label: '7 Days', key: '7d' },
  { label: '30 Days', key: '30d' },
  { label: 'All Time', key: 'all' },
] as const;

function getDateRange(key: string): { from?: string; to?: string } {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  switch (key) {
    case 'today': return { from: todayStart };
    case '7d': { const d = new Date(now); d.setDate(d.getDate() - 7); return { from: d.toISOString() }; }
    case '30d': { const d = new Date(now); d.setDate(d.getDate() - 30); return { from: d.toISOString() }; }
    default: return {};
  }
}

// ─── Chart tooltip ──────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card-strong rounded-lg px-3 py-2 text-xs" style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
      <p className="text-[var(--text-muted)] mb-1 font-mono">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="font-semibold" style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

// ─── Metric Cards Config ────────────────────────────────
const METRIC_CARDS = [
  { key: 'total_scans' as const, label: 'Total Scans', icon: 'center_focus_strong', gradient: 'from-blue-500 to-cyan-400', glow: 'var(--glow-blue)' },
  { key: 'employee_matches' as const, label: 'Employees', icon: 'badge', gradient: 'from-emerald-500 to-teal-400', glow: 'var(--glow-emerald)' },
  { key: 'guest_alerts' as const, label: 'Guests', icon: 'person_alert', gradient: 'from-amber-500 to-orange-400', glow: 'var(--glow-amber)' },
  { key: 'cameras_online' as const, label: 'Cameras', icon: 'videocam', gradient: 'from-violet-500 to-purple-400', glow: 'var(--glow-violet)' },
];

// ─── Main Component ─────────────────────────────────────
const DashboardTab = () => {
  const { stats, setStats, cameras, setCameras, detections, isConnected, lastUpdated, setLastUpdated } = useDashboardWebSocket();
  const [initialLogs, setInitialLogs] = useState<any[]>([]);
  const [todayStats, setTodayStats] = useState({ scans_today: 0, unique_people_today: 0, currently_on_site: 0, employees_in_today: 0, guests_today: 0 });
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [timeRange, setTimeRange] = useState<string>('today');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refreshData = useCallback((range?: string) => {
    const r = range ?? timeRange;
    setRefreshing(true);
    const { from, to } = getDateRange(r);
    const qs = [from && `date_from=${from}`, to && `date_to=${to}`].filter(Boolean).join('&');
    const suffix = qs ? `?${qs}` : '';

    Promise.allSettled([
      authFetch('/api/access-logs').then(r => r.ok ? r.json() : []).then(data => setInitialLogs(data)),
      authFetch('/api/stats').then(r => r.ok ? r.json() : null).then(data => { if (data) setStats(data); }),
      authFetch('/api/cameras').then(r => r.ok ? r.json() : []).then(data => setCameras(data)),
      authFetch('/api/stats/today').then(r => r.ok ? r.json() : null).then(data => { if (data) setTodayStats(data); }),
      authFetch(`/api/stats/hourly${suffix}`).then(r => r.ok ? r.json() : []).then(data => setHourlyData(data)),
    ]).finally(() => { setRefreshing(false); setLoading(false); setLastUpdated(new Date()); });
  }, [setStats, setCameras, setLastUpdated, timeRange]);

  useEffect(() => { refreshData(); }, []);

  const handleTimeRange = (key: string) => {
    setTimeRange(key);
    refreshData(key);
  };

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
      const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
      if (diffMin < 1) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return ts; }
  };

  const chartData = hourlyData.map(h => ({
    ...h,
    label: h.hour ? h.hour.slice(11, 16) : '',
  }));

  // ─── Skeleton loading ───────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col h-full w-full overflow-y-auto pb-10 page-enter">
        <div className="flex items-center justify-between mb-5">
          <div className="glass-card rounded-xl px-3.5 py-2 w-32 h-8" />
          <div className="glass-card rounded-xl px-3.5 py-2 w-20 h-8" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonChart />
        <div className="mt-5"><SkeletonTable rows={6} /></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full overflow-y-auto pb-10 glass-scrollbar page-enter">

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
            <span className="text-[10px] text-[var(--text-muted)] font-mono">{formatTime(lastUpdated.toISOString())}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Time range pills */}
          <div className="glass-card flex items-center rounded-xl overflow-hidden p-0.5">
            {TIME_RANGES.map(r => (
              <button
                key={r.key}
                onClick={() => handleTimeRange(r.key)}
                className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-all ${
                  timeRange === r.key
                    ? 'bg-[var(--accent)] text-white shadow-md'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >{r.label}</button>
            ))}
          </div>
          <button
            onClick={() => refreshData()}
            disabled={refreshing}
            className="glass-card flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all disabled:opacity-40 cursor-pointer"
          >
            <span className={`material-symbols-outlined text-sm ${refreshing ? 'animate-spin' : ''}`}>refresh</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {METRIC_CARDS.map((card) => {
          const value = stats[card.key];
          const extra = card.key === 'cameras_online' ? `${cameras.filter(c => c.is_online).length} active` : undefined;
          return (
            <div key={card.key} className="glass-card rounded-2xl p-5 group relative overflow-hidden" style={{ boxShadow: `var(--glass-shadow), ${card.glow}` }}>
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

      {/* Quick Stats + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        {/* Quick stats pills */}
        <div className="flex flex-col gap-2.5">
          {[
            { icon: 'trending_up', label: `${todayStats.scans_today} scans today`, color: 'blue' },
            { icon: 'people', label: `${todayStats.unique_people_today} unique people`, color: 'emerald' },
            { icon: 'location_on', label: `${todayStats.currently_on_site} currently on site`, color: 'violet' },
            { icon: 'badge', label: `${todayStats.employees_in_today} employees`, color: 'cyan' },
            { icon: 'person_alert', label: `${todayStats.guests_today} guests`, color: 'amber' },
          ].map((pill) => (
            <div key={pill.label} className={`glass-card flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-semibold ${
              pill.color === 'blue' ? 'text-blue-400' :
              pill.color === 'emerald' ? 'text-emerald-400' :
              pill.color === 'violet' ? 'text-violet-400' :
              pill.color === 'cyan' ? 'text-cyan-400' : 'text-amber-400'
            }`}>
              <span className="material-symbols-outlined text-sm">{pill.icon}</span>
              {pill.label}
            </div>
          ))}
        </div>

        {/* Hourly activity chart */}
        <div className="lg:col-span-2 glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-[var(--accent)]">bar_chart</span>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Activity Trend</h3>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />Entries</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" />Exits</span>
            </div>
          </div>
          {chartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center" style={{ height: 180 }}>
              <span className="material-symbols-outlined text-3xl text-[var(--accent)] opacity-25 mb-1">bar_chart</span>
              <p className="text-xs font-semibold text-[var(--text-primary)]">No chart data</p>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Activity will appear as scans are recorded</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} barGap={2}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="entries" name="Entries" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="exits" name="Exits" fill="#f87171" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
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
            <EmptyState icon="sensors_off" title="No activity yet" description="Detections will appear here in real time" />
          ) : (
            <div className="divide-y divide-[var(--glass-border)] max-h-[360px] overflow-y-auto glass-scrollbar">
              {allDetections.slice(0, 12).map((det, idx) => (
                <div key={idx} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.04] transition-colors">
                  <HoverCard name={det.name} type={det.type} imageUrl={det.image_url} confidence={det.confidence} cameraId={det.camera_id} status={det.status}>
                    {det.image_url ? (
                      <img src={det.image_url.startsWith('/') ? `${API_BASE}${det.image_url}` : det.image_url}
                           alt={det.name} className="w-9 h-9 rounded-xl object-cover border border-[var(--glass-border)] shrink-0 cursor-pointer" />
                    ) : (
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 cursor-pointer ${
                        det.type === 'guest' ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'
                      }`}>
                        <span className="material-symbols-outlined text-sm">person</span>
                      </div>
                    )}
                  </HoverCard>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{det.name}</p>
                    <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                      <span className="material-symbols-outlined text-[10px]">videocam</span>
                      {det.camera_id || 'Unknown'} <span className="opacity-40">|</span> {det.confidence}% match
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${
                      det.status === 'in' ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20' : 'bg-red-500/15 text-red-400 ring-1 ring-red-500/20'
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
            <EmptyState icon="videocam_off" title="No cameras registered" description="Connect a camera station to get started" />
          ) : (
            <div className="flex-1 p-3 grid grid-cols-2 gap-2.5 content-start">
              {cameras.map((cam) => (
                <div key={cam.camera_id} className={`rounded-xl p-3 flex items-center gap-2.5 transition-all border ${
                  cam.is_online ? 'bg-emerald-500/[0.06] border-emerald-500/20' : 'bg-white/[0.03] border-[var(--glass-border)]'
                }`} style={cam.is_online ? { boxShadow: 'var(--glow-emerald)' } : undefined}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cam.is_online ? 'bg-emerald-500/15' : 'bg-white/[0.06]'}`}>
                    <span className={`material-symbols-outlined text-base ${cam.is_online ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {cam.is_online ? 'videocam' : 'videocam_off'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[var(--text-primary)] truncate capitalize">{cam.department}</div>
                    <div className={`text-[9px] font-semibold ${cam.is_online ? 'text-emerald-400' : 'text-slate-500'}`}>{cam.is_online ? 'Online' : 'Offline'}</div>
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
                <tr><td colSpan={6}><EmptyState icon="search_off" title="No detections yet" description="Recognition events will be logged here" /></td></tr>
              ) : (
                allDetections.slice(0, 20).map((det, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.03] transition-colors">
                    <td className="px-5 py-3">
                      <HoverCard name={det.name} type={det.type} imageUrl={det.image_url} confidence={det.confidence} cameraId={det.camera_id} status={det.status}>
                        <div className="flex items-center gap-2.5 cursor-pointer">
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
                      </HoverCard>
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
                        det.status === 'in' ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20' : 'bg-red-500/15 text-red-400 ring-1 ring-red-500/20'
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
