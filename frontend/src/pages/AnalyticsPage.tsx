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

const RANGE_OPTIONS = [
  { label: '7 Days', days: 7 },
  { label: '30 Days', days: 30 },
  { label: '90 Days', days: 90 },
  { label: 'All Time', days: 3650 },
];

const ROLE_COLORS: Record<string, string> = {
  Employee: '#3b82f6',
  Guest: '#f59e0b',
  Unknown: '#6b7280',
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
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    authFetch(`/api/stats/analytics?days=${days}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [days]);

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

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[var(--text-muted)]">Failed to load analytics data.</p>
      </div>
    );
  }

  const { summary, peak_hours, day_of_week, daily_trend, camera_traffic, role_breakdown, prediction } = data;

  const sortedDow = [...day_of_week].sort((a, b) => {
    const order = [1, 2, 3, 4, 5, 6, 0];
    return order.indexOf(a.dow) - order.indexOf(b.dow);
  });

  return (
    <div className="space-y-6 pt-4 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Analytics</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Predictions and insights from {summary.days_analyzed} days of data</p>
        </div>
        <div className="flex items-center gap-1 p-0.5 rounded-lg glass-card">
          {RANGE_OPTIONS.map(opt => (
            <button
              key={opt.days}
              onClick={() => setDays(opt.days)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                days === opt.days
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Avg Daily Scans" value={summary.avg_daily_scans} icon="center_focus_strong" gradient="from-blue-500 to-cyan-400" glow="rgba(59,130,246,0.25)" />
        <MetricCard label="Avg Daily People" value={summary.avg_daily_unique} icon="groups" gradient="from-emerald-500 to-green-400" glow="rgba(16,185,129,0.25)" />
        <MetricCard label="Busiest Hour" value={formatHour(summary.busiest_hour)} icon="schedule" gradient="from-amber-500 to-orange-400" glow="rgba(245,158,11,0.25)" />
        <MetricCard label="Busiest Day" value={summary.busiest_day} icon="date_range" gradient="from-purple-500 to-pink-400" glow="rgba(168,85,247,0.25)" />
      </div>

      {/* Prediction Card */}
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

      {/* Charts Row 1: Peak Hours + Day of Week */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Peak Hours */}
        <div className="glass-card rounded-2xl p-5">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-400 text-lg">schedule</span>
            Peak Hours
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

        {/* Day of Week */}
        <div className="glass-card rounded-2xl p-5">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-400 text-lg">date_range</span>
            Busiest Days
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

      {/* Charts Row 2: Daily Trend */}
      <div className="glass-card rounded-2xl p-5">
        <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-emerald-400 text-lg">trending_up</span>
          Daily Trend
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={daily_trend}>
            <defs>
              <linearGradient id="gradEntries" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradUnique" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
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

      {/* Charts Row 3: Camera Traffic + Role Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Camera Traffic */}
        <div className="glass-card rounded-2xl p-5 lg:col-span-2">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-cyan-400 text-lg">videocam</span>
            Camera Traffic
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

        {/* Role Breakdown */}
        <div className="glass-card rounded-2xl p-5">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-purple-400 text-lg">pie_chart</span>
            Role Breakdown
          </h3>
          {role_breakdown.length === 0 ? (
            <p className="text-[var(--text-muted)] text-xs text-center py-8">No data</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={role_breakdown} dataKey="total" nameKey="role" cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={3} strokeWidth={0}>
                    {role_breakdown.map((entry) => (
                      <Cell key={entry.role} fill={ROLE_COLORS[entry.role] || '#6b7280'} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" iconSize={8}
                    formatter={(value: string) => <span className="text-[11px] text-[var(--text-secondary)]">{value}</span>} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-3">
                {role_breakdown.map(r => (
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
      </div>
    </div>
  );
}
