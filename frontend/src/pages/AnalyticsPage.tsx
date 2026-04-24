import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { authFetch } from '../auth';

interface AnalyticsData {
  summary: {
    total_scans: number;
    total_entries: number;
    total_unique: number;
    avg_daily_scans: number;
    avg_daily_entries: number;
    avg_daily_unique: number;
    busiest_hour: number;
    busiest_day: string;
    days_analyzed: number;
  };
  peak_hours: { hour: number; total: number; entries: number; exits: number }[];
  day_of_week: { day: string; dow: number; total: number; entries: number; avg: number }[];
  daily_trend: { day: string; total: number; entries: number; exits: number; unique_people: number }[];
  camera_traffic: { camera_id: string; department: string; total: number; entries: number; unique_people: number }[];
  role_breakdown: { role: string; total: number; unique_people: number }[];
  prediction: {
    day_name: string;
    date: string;
    expected_scans: number;
    expected_entries: number;
    expected_unique: number;
    based_on_days: number;
    confidence: number;
  };
}

interface DayData {
  date: string;
  summary: { total_scans: number; total_entries: number; total_exits: number; unique_people: number; busiest_hour: number };
  hourly: { hour: number; total: number; entries: number; exits: number; unique_people: number }[];
  role_breakdown: { role: string; total: number; unique_people: number }[];
  camera_traffic: { camera_id: string; department: string; total: number; entries: number; unique_people: number }[];
  events: {
    id: number; title: string; category: string; start_time: string; end_time: string; location: string; camera_ids: string[];
    attendance: { unique_people: number; employees: number; guests: number; total_scans: number };
  }[];
}

interface HoursData {
  hours: number;
  summary: { total_scans: number; total_entries: number; unique_people: number };
  hourly: { time: string; total: number; entries: number; exits: number; unique_people: number }[];
  role_breakdown: { role: string; total: number; unique_people: number }[];
}

type ViewMode = 'range' | 'day' | 'hours';

const RANGE_OPTIONS = [
  { label: '7 Days', days: 7 },
  { label: '30 Days', days: 30 },
  { label: '90 Days', days: 90 },
  { label: 'All Time', days: 3650 },
];

const HOURS_OPTIONS = Array.from({ length: 15 }, (_, i) => i + 1);

const ROLE_COLORS: Record<string, string> = {
  Employee: '#3b82f6',
  Guest: '#f59e0b',
  Unknown: '#6b7280',
};

const EVENT_COLORS: Record<string, { bg: string; text: string }> = {
  General: { bg: 'rgba(59,130,246,0.1)', text: 'text-blue-400' },
  Academic: { bg: 'rgba(168,85,247,0.1)', text: 'text-purple-400' },
  Sports: { bg: 'rgba(16,185,129,0.1)', text: 'text-emerald-400' },
  Cultural: { bg: 'rgba(236,72,153,0.1)', text: 'text-pink-400' },
  Meeting: { bg: 'rgba(245,158,11,0.1)', text: 'text-amber-400' },
  Holiday: { bg: 'rgba(239,68,68,0.1)', text: 'text-red-400' },
};

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

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

function MetricCard({ label, value, sub, icon, gradient, glow }: {
  label: string; value: string | number; sub?: string; icon: string; gradient: string; glow: string;
}) {
  return (
    <div className="glass-card rounded-2xl p-4 flex items-center gap-4 group hover:scale-[1.02] transition-transform duration-200">
      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0 shadow-lg`} style={{ boxShadow: `0 4px 16px ${glow}` }}>
        <span className="material-symbols-outlined text-white text-xl">{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[var(--text-muted)] text-[10px] font-semibold uppercase tracking-wider">{label}</p>
        <p className="text-[var(--text-primary)] text-xl font-bold leading-tight">{value}</p>
        {sub && <p className="text-[var(--text-muted)] text-[10px] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('range');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [dayData, setDayData] = useState<DayData | null>(null);
  const [hoursData, setHoursData] = useState<HoursData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedHours, setSelectedHours] = useState(6);

  useEffect(() => {
    setLoading(true);
    if (viewMode === 'range') {
      authFetch(`/api/stats/analytics?days=${days}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { setData(d); setLoading(false); })
        .catch(() => setLoading(false));
    } else if (viewMode === 'day') {
      authFetch(`/api/stats/day?date=${selectedDate}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { setDayData(d); setLoading(false); })
        .catch(() => setLoading(false));
    } else {
      authFetch(`/api/stats/hours?hours=${selectedHours}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { setHoursData(d); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [viewMode, days, selectedDate, selectedHours]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
          <span className="text-xs text-[var(--text-muted)]">Loading analytics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-4 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Analytics</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {viewMode === 'range' && data ? `Insights from ${data.summary.days_analyzed} days of data` :
             viewMode === 'day' ? `Daily view for ${new Date(selectedDate + 'T00:00').toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' })}` :
             `Last ${selectedHours} hours`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode selector */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg glass-card">
            {([['range', 'Date Range'], ['day', '1 Day'], ['hours', 'Hours']] as const).map(([mode, label]) => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                  viewMode === mode ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}>
                {label}
              </button>
            ))}
          </div>
          {/* Sub-options */}
          {viewMode === 'range' && (
            <div className="flex items-center gap-1 p-0.5 rounded-lg glass-card">
              {RANGE_OPTIONS.map(opt => (
                <button key={opt.days} onClick={() => setDays(opt.days)}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                    days === opt.days ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          {viewMode === 'day' && (
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              className="h-8 px-3 rounded-lg text-xs text-[var(--text-primary)] bg-[var(--glass-bg)] border border-[var(--glass-border)] outline-none focus:ring-1 focus:ring-[var(--accent)]" />
          )}
          {viewMode === 'hours' && (
            <select value={selectedHours} onChange={e => setSelectedHours(Number(e.target.value))}
              className="h-8 px-3 rounded-lg text-xs text-[var(--text-primary)] bg-[var(--glass-bg)] border border-[var(--glass-border)] outline-none focus:ring-1 focus:ring-[var(--accent)]">
              {HOURS_OPTIONS.map(h => (
                <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ─── RANGE VIEW ────────────────────────── */}
      {viewMode === 'range' && data && <RangeView data={data} />}

      {/* ─── DAY VIEW ──────────────────────────── */}
      {viewMode === 'day' && dayData && <DayView data={dayData} />}

      {/* ─── HOURS VIEW ────────────────────────── */}
      {viewMode === 'hours' && hoursData && <HoursView data={hoursData} />}

      {!data && viewMode === 'range' && <p className="text-center text-[var(--text-muted)]">No data available</p>}
      {!dayData && viewMode === 'day' && !loading && <p className="text-center text-[var(--text-muted)]">No data for this date</p>}
      {!hoursData && viewMode === 'hours' && !loading && <p className="text-center text-[var(--text-muted)]">No data available</p>}
    </div>
  );
}

function RangeView({ data }: { data: AnalyticsData }) {
  const { summary, peak_hours, day_of_week, daily_trend, camera_traffic, role_breakdown, prediction } = data;
  const sortedDow = [...day_of_week].sort((a, b) => {
    const order = [1, 2, 3, 4, 5, 6, 0];
    return order.indexOf(a.dow) - order.indexOf(b.dow);
  });

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Avg Daily Scans" value={summary.avg_daily_scans} icon="center_focus_strong" gradient="from-blue-500 to-cyan-400" glow="rgba(59,130,246,0.25)" />
        <MetricCard label="Avg Daily People" value={summary.avg_daily_unique} icon="groups" gradient="from-emerald-500 to-green-400" glow="rgba(16,185,129,0.25)" />
        <MetricCard label="Busiest Hour" value={formatHour(summary.busiest_hour)} icon="schedule" gradient="from-amber-500 to-orange-400" glow="rgba(245,158,11,0.25)" />
        <MetricCard label="Busiest Day" value={summary.busiest_day} icon="date_range" gradient="from-purple-500 to-pink-400" glow="rgba(168,85,247,0.25)" />
      </div>

      {/* Prediction */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg" style={{ boxShadow: '0 4px 16px rgba(139,92,246,0.3)' }}>
            <span className="material-symbols-outlined text-white text-lg">auto_awesome</span>
          </div>
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Prediction for {prediction.day_name}</h2>
            <p className="text-[10px] text-[var(--text-muted)]">{prediction.date} — based on {prediction.based_on_days} similar {prediction.day_name}s</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: prediction.confidence >= 70 ? 'rgba(16,185,129,0.1)' : prediction.confidence >= 40 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${prediction.confidence >= 70 ? 'rgba(16,185,129,0.2)' : prediction.confidence >= 40 ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
            <span className={`text-[10px] font-bold ${prediction.confidence >= 70 ? 'text-emerald-400' : prediction.confidence >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
              {prediction.confidence}% confidence
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 rounded-xl" style={{ background: 'var(--glass-bg)' }}>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{prediction.expected_scans}</p>
            <p className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider mt-1">Expected Scans</p>
          </div>
          <div className="text-center p-3 rounded-xl" style={{ background: 'var(--glass-bg)' }}>
            <p className="text-2xl font-bold text-emerald-400">{prediction.expected_entries}</p>
            <p className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider mt-1">Expected Entries</p>
          </div>
          <div className="text-center p-3 rounded-xl" style={{ background: 'var(--glass-bg)' }}>
            <p className="text-2xl font-bold text-blue-400">{prediction.expected_unique}</p>
            <p className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider mt-1">Unique People</p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card rounded-2xl p-5">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-400 text-lg">schedule</span>Peak Hours
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={peak_hours} barGap={1}>
              <XAxis dataKey="hour" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={(h) => `${h}`} />
              <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={30} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--glass-bg)', radius: 4 }} labelFormatter={(h) => formatHour(h as number)} />
              <Bar dataKey="entries" name="Entries" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              <Bar dataKey="exits" name="Exits" fill="#f87171" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="glass-card rounded-2xl p-5">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-400 text-lg">date_range</span>Busiest Days
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={sortedDow} barGap={2}>
              <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={(d) => d.slice(0, 3)} />
              <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={30} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--glass-bg)', radius: 4 }} />
              <Bar dataKey="avg" name="Avg Scans/Day" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-5">
        <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-emerald-400 text-lg">trending_up</span>Daily Trend
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={daily_trend}>
            <defs>
              <linearGradient id="gradEntries" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} /><stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradUnique" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}
              tickFormatter={(d) => { const date = new Date(d + 'T00:00'); return `${date.getMonth() + 1}/${date.getDate()}`; }} />
            <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={30} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="entries" name="Entries" stroke="#3b82f6" fill="url(#gradEntries)" strokeWidth={2} />
            <Area type="monotone" dataKey="unique_people" name="Unique People" stroke="#10b981" fill="url(#gradUnique)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card rounded-2xl p-5 lg:col-span-2">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-cyan-400 text-lg">videocam</span>Camera Traffic
          </h3>
          {camera_traffic.length === 0 ? (
            <p className="text-[var(--text-muted)] text-xs text-center py-8">No camera data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(camera_traffic.length * 48, 120)}>
              <BarChart data={camera_traffic} layout="vertical" barGap={2}>
                <XAxis type="number" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="department" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={100} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--glass-bg)', radius: 4 }} />
                <Bar dataKey="entries" name="Entries" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                <Bar dataKey="unique_people" name="Unique People" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <RoleBreakdown data={role_breakdown} />
      </div>
    </>
  );
}

function DayView({ data }: { data: DayData }) {
  const { summary, hourly, role_breakdown, camera_traffic, events } = data;
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Total Scans" value={summary.total_scans} icon="center_focus_strong" gradient="from-blue-500 to-cyan-400" glow="rgba(59,130,246,0.25)" />
        <MetricCard label="Unique People" value={summary.unique_people} icon="groups" gradient="from-emerald-500 to-green-400" glow="rgba(16,185,129,0.25)" />
        <MetricCard label="Entries" value={summary.total_entries} icon="login" gradient="from-violet-500 to-purple-400" glow="rgba(139,92,246,0.25)" />
        <MetricCard label="Busiest Hour" value={formatHour(summary.busiest_hour)} icon="schedule" gradient="from-amber-500 to-orange-400" glow="rgba(245,158,11,0.25)" />
      </div>

      {/* Events on this day */}
      {events.length > 0 && (
        <div className="glass-card rounded-2xl p-5">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-pink-400 text-lg">event</span>
            Events Today ({events.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {events.map(ev => {
              const col = EVENT_COLORS[ev.category] || EVENT_COLORS.General;
              return (
                <div key={ev.id} className="rounded-xl p-4" style={{ background: col.bg, border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className={`text-sm font-bold ${col.text}`}>{ev.title}</h4>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                        {ev.start_time || '—'}{ev.end_time ? ` — ${ev.end_time}` : ''}{ev.location ? ` · ${ev.location}` : ''}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${col.text}`} style={{ background: 'rgba(255,255,255,0.08)' }}>
                      {ev.category}
                    </span>
                  </div>
                  {ev.camera_ids.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <div className="text-center">
                        <p className="text-lg font-bold text-[var(--text-primary)]">{ev.attendance.unique_people}</p>
                        <p className="text-[8px] text-[var(--text-muted)] font-semibold uppercase">Attendees</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-blue-400">{ev.attendance.employees}</p>
                        <p className="text-[8px] text-[var(--text-muted)] font-semibold uppercase">Employees</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-amber-400">{ev.attendance.guests}</p>
                        <p className="text-[8px] text-[var(--text-muted)] font-semibold uppercase">Guests</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] text-[var(--text-muted)] mt-2 italic">No cameras assigned</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hourly chart */}
      <div className="glass-card rounded-2xl p-5">
        <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-blue-400 text-lg">schedule</span>Hourly Breakdown
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={hourly} barGap={1}>
            <XAxis dataKey="hour" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={(h) => formatHour(h)} />
            <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={30} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--glass-bg)', radius: 4 }} labelFormatter={(h) => formatHour(h as number)} />
            <Bar dataKey="entries" name="Entries" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            <Bar dataKey="exits" name="Exits" fill="#f87171" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {camera_traffic.length > 0 && (
          <div className="glass-card rounded-2xl p-5 lg:col-span-2">
            <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-cyan-400 text-lg">videocam</span>Camera Traffic
            </h3>
            <ResponsiveContainer width="100%" height={Math.max(camera_traffic.length * 48, 120)}>
              <BarChart data={camera_traffic} layout="vertical" barGap={2}>
                <XAxis type="number" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="department" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={100} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--glass-bg)', radius: 4 }} />
                <Bar dataKey="entries" name="Entries" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                <Bar dataKey="unique_people" name="Unique People" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <RoleBreakdown data={role_breakdown} />
      </div>
    </>
  );
}

function HoursView({ data }: { data: HoursData }) {
  const { summary, hourly, role_breakdown } = data;
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <MetricCard label="Total Scans" value={summary.total_scans} icon="center_focus_strong" gradient="from-blue-500 to-cyan-400" glow="rgba(59,130,246,0.25)" />
        <MetricCard label="Entries" value={summary.total_entries} icon="login" gradient="from-emerald-500 to-green-400" glow="rgba(16,185,129,0.25)" />
        <MetricCard label="Unique People" value={summary.unique_people} icon="groups" gradient="from-purple-500 to-pink-400" glow="rgba(168,85,247,0.25)" />
      </div>

      <div className="glass-card rounded-2xl p-5">
        <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-blue-400 text-lg">timeline</span>Activity
        </h3>
        {hourly.length === 0 ? (
          <p className="text-[var(--text-muted)] text-xs text-center py-8">No activity in this period</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={hourly} barGap={1}>
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={30} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--glass-bg)', radius: 4 }} />
              <Bar dataKey="entries" name="Entries" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              <Bar dataKey="exits" name="Exits" fill="#f87171" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <RoleBreakdown data={role_breakdown} />
    </>
  );
}

function RoleBreakdown({ data }: { data: { role: string; total: number; unique_people: number }[] }) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-purple-400 text-lg">pie_chart</span>Role Breakdown
      </h3>
      {data.length === 0 ? (
        <p className="text-[var(--text-muted)] text-xs text-center py-8">No data</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={data} dataKey="total" nameKey="role" cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={3} strokeWidth={0}>
                {data.map((entry) => (
                  <Cell key={entry.role} fill={ROLE_COLORS[entry.role] || '#6b7280'} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend iconType="circle" iconSize={8}
                formatter={(value: string) => <span className="text-[11px] text-[var(--text-secondary)]">{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-3">
            {data.map(r => (
              <div key={r.role} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: ROLE_COLORS[r.role] || '#6b7280' }} />
                  <span className="text-[var(--text-secondary)] font-medium">{r.role}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[var(--text-muted)]">{r.unique_people} people</span>
                  <span className="text-[var(--text-primary)] font-semibold">{r.total} scans</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
