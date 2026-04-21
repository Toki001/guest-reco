import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CameraFeed, CameraSettings } from '../components/CameraFeed';
import { RecognitionBanner, BannerData } from '../components/RecognitionBanner';
import { API_BASE } from '../config';
import { useTheme } from '../ThemeContext';

const CAMERA_KEY_STORAGE = 'securesight_camera_key';

function CameraStationPage() {
  const { cameraId } = useParams<{ cameraId: string }>();
  const [searchParams] = useSearchParams();
  const { theme, toggle: toggleTheme } = useTheme();
  const urlKey = searchParams.get('key') || '';
  const departmentName = cameraId ? cameraId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Unknown';

  const [apiKey, setApiKey] = useState(() => urlKey || localStorage.getItem(CAMERA_KEY_STORAGE) || '');
  const [keyInput, setKeyInput] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(!!apiKey);
  const [authError, setAuthError] = useState('');

  const [isScanning, setIsScanning] = useState(true);
  const [isRegistered, setIsRegistered] = useState(false);
  const [cameraSettings, setCameraSettings] = useState<CameraSettings | undefined>(undefined);

  const [banners, setBanners] = useState<BannerData[]>([]);
  const [history, setHistory] = useState<(BannerData & { timestamp: Date })[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isIdle, setIsIdle] = useState(false);
  const [isMuted] = useState(true);
  const [showHistory, setShowHistory] = useState(() => window.innerWidth >= 1024);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'in' | 'out'>('all');
  const cooldownRef = useRef<Map<string, number>>(new Map());
  const idleTimerRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (urlKey) {
      localStorage.setItem(CAMERA_KEY_STORAGE, urlKey);
      setApiKey(urlKey);
      setIsAuthenticated(true);
    }
  }, [urlKey]);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!apiKey) return;
    const fetchSettings = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/settings`, { headers: { 'X-API-Key': apiKey } });
        if (res.ok) setCameraSettings(await res.json());
      } catch (e) { console.error('Failed to fetch settings:', e); }
    };
    fetchSettings();
    const interval = setInterval(fetchSettings, 60000);
    return () => clearInterval(interval);
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey || !cameraId) return;
    const loadRecentActivity = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/camera/${encodeURIComponent(cameraId)}/recent-activity?limit=50`, { headers: { 'X-API-Key': apiKey } });
        if (!res.ok) return;
        const data = await res.json();
        const entries = data.map((item: any) => ({
          id: `hist-${item.id}`,
          name: item.name || item.user_id,
          type: (item.role || 'guest').toLowerCase() as 'guest' | 'employee',
          status: item.status as 'in' | 'out',
          confidence: item.confidence,
          imageUrl: item.image_url || '',
          timestamp: new Date(item.timestamp),
        }));
        setHistory(entries);
      } catch (e) { console.error('Failed to load recent activity:', e); }
    };
    loadRecentActivity();
  }, [apiKey, cameraId]);

  const handleFeedbackChange = useCallback((feedback: string) => {
    clearTimeout(idleTimerRef.current);
    if (feedback === 'idle') {
      idleTimerRef.current = window.setTimeout(() => setIsIdle(true), 10000);
    } else {
      setIsIdle(false);
    }
  }, []);

  const unlockAudio = useCallback(() => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
  }, []);

  const playTone = useCallback((frequency: number, duration: number) => {
    if (isMuted || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    osc.type = 'sine';
    gain.gain.value = 0.3;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.stop(ctx.currentTime + duration);
  }, [isMuted]);

  const handleKeySubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!keyInput.trim()) return;
    setAuthError('');
    unlockAudio();
    try {
      const formData = new FormData();
      formData.append('camera_id', cameraId || 'test');
      formData.append('department', departmentName);
      const res = await fetch(`${API_BASE}/api/camera/register`, { method: 'POST', body: formData, headers: { 'X-API-Key': keyInput.trim() } });
      if (res.ok) {
        localStorage.setItem(CAMERA_KEY_STORAGE, keyInput.trim());
        setApiKey(keyInput.trim());
        setIsAuthenticated(true);
        setIsRegistered(true);
      } else {
        setAuthError('Invalid API key. Check with your administrator.');
      }
    } catch {
      setAuthError('Cannot reach server. Is the backend running?');
    }
  };

  useEffect(() => {
    if (!cameraId || !apiKey || isRegistered) return;
    const headers: HeadersInit = { 'X-API-Key': apiKey };
    const register = async () => {
      try {
        const formData = new FormData();
        formData.append('camera_id', cameraId);
        formData.append('department', departmentName);
        const res = await fetch(`${API_BASE}/api/camera/register`, { method: 'POST', body: formData, headers });
        if (res.ok) { setIsRegistered(true); }
        else if (res.status === 401) { localStorage.removeItem(CAMERA_KEY_STORAGE); setApiKey(''); setIsAuthenticated(false); }
      } catch (e) { console.error('Camera registration failed:', e); }
    };
    register();
    const heartbeat = setInterval(async () => {
      try {
        const formData = new FormData();
        formData.append('camera_id', cameraId);
        await fetch(`${API_BASE}/api/camera/heartbeat`, { method: 'POST', body: formData, headers });
      } catch (e) { console.error('Heartbeat failed:', e); }
    }, 10000);
    return () => clearInterval(heartbeat);
  }, [cameraId, departmentName, apiKey, isRegistered]);

  const handleDismissBanner = useCallback((id: string) => {
    setBanners(prev => prev.filter(b => b.id !== id));
  }, []);

  const handleResult = (results: { name: string; type: 'guest' | 'employee'; confidence: number; image_url?: string; status?: string; user_id?: string; skipped?: boolean }[]) => {
    const now = Date.now();
    for (const result of results) {
      if (!result.status) continue;
      const userId = result.user_id || result.name;
      const cooldownMs = (cameraSettings?.cooldown_seconds ?? 10) * 1000;
      const lastSeen = cooldownRef.current.get(userId);
      if (lastSeen && now - lastSeen < cooldownMs) continue;
      cooldownRef.current.set(userId, now);
      const entry = {
        id: `${userId}-${now}-${Math.random().toString(36).slice(2, 6)}`,
        name: result.name, type: result.type, status: result.status as 'in' | 'out',
        confidence: result.confidence, imageUrl: result.image_url || '',
      };
      setBanners(prev => [...prev, entry]);
      setHistory(prev => [{ ...entry, timestamp: new Date() }, ...prev].slice(0, 50));
      playTone(result.status === 'in' ? 880 : 440, result.status === 'in' ? 0.15 : 0.2);
    }
    setIsIdle(false);
  };

  const handleToggleScan = () => { unlockAudio(); setIsScanning(prev => !prev); };

  const inCount = history.filter(h => h.status === 'in').length;
  const outCount = history.filter(h => h.status === 'out').length;
  const filteredHistory = historyFilter === 'all' ? history : history.filter(h => h.status === historyFilter);

  // Theme-aware colors for the camera page
  const isDark = theme === 'dark';
  const pageBg = isDark ? '#0a0e1a' : 'var(--bg-base)';
  const headerBg = isDark ? 'rgba(10,14,26,0.6)' : 'rgba(255,255,255,0.92)';
  const headerBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const headerShadow = isDark ? '0 8px 32px rgba(0,0,0,0.3)' : '0 8px 32px rgba(0,0,0,0.08)';
  const headerText = isDark ? 'text-white' : 'text-[var(--text-primary)]';
  const headerTextSub = isDark ? 'text-white/30' : 'text-[var(--text-muted)]';
  const btnBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  const btnBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const btnIcon = isDark ? 'text-white/40' : 'text-[var(--text-muted)]';
  const sidebarBg = isDark ? 'rgba(10,14,26,0.85)' : 'var(--modal-bg)';
  const sidebarBorder = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const sidebarText = isDark ? 'text-white' : 'text-[var(--text-primary)]';
  const sidebarTextSub = isDark ? 'text-white/25' : 'text-[var(--text-muted)]';
  const sidebarHover = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';

  // ─── AUTH SCREEN ───────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="h-screen w-screen flex items-center justify-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0a2a5e 0%, #0d1b3e 40%, #111827 100%)' }}>
        <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full opacity-20 blur-3xl" style={{ background: 'radial-gradient(circle, rgba(46,163,242,0.4), transparent 70%)' }} />
        <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] rounded-full opacity-15 blur-3xl" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.3), transparent 70%)' }} />
        <div className="relative w-full max-w-sm rounded-2xl p-8 border page-enter" style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(24px) saturate(1.3)', WebkitBackdropFilter: 'blur(24px) saturate(1.3)', borderColor: 'rgba(255,255,255,0.1)', boxShadow: '0 16px 48px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/15 border border-blue-400/20 flex items-center justify-center mx-auto mb-3" style={{ boxShadow: '0 0 24px rgba(46,163,242,0.15)' }}>
              <span className="material-symbols-outlined text-3xl text-blue-400">videocam</span>
            </div>
            <h1 className="text-white font-bold text-lg">{departmentName}</h1>
            <p className="text-blue-300/50 text-[11px] uppercase tracking-[0.2em] mt-1 font-semibold">Camera Station Setup</p>
          </div>
          <form onSubmit={handleKeySubmit} className="space-y-4">
            <div>
              <label className="text-blue-200/60 text-xs font-medium block mb-1.5">Camera API Key</label>
              <input type="text" value={keyInput} onChange={e => setKeyInput(e.target.value)} required autoFocus placeholder="Paste API key here"
                className="w-full rounded-xl px-3.5 py-2.5 text-white text-sm font-mono focus:outline-none transition-all placeholder:text-white/20"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(46,163,242,0.5)'; }} onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }} />
              <p className="text-white/25 text-[10px] mt-1.5">Get this from the server console or your administrator.</p>
            </div>
            {authError && <div className="rounded-xl px-3.5 py-2.5 text-red-300 text-sm border" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)' }}>{authError}</div>}
            <button type="submit" className="w-full py-2.5 rounded-xl font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg, #2EA3F2, #0C71C3)', boxShadow: '0 4px 16px rgba(46,163,242,0.3)' }}>Connect Camera</button>
          </form>
        </div>
      </div>
    );
  }

  // ─── MAIN CAMERA VIEW ──────────────────────────────────
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: pageBg }}>

      {/* ── Floating glass header ────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-20 p-2 sm:p-3">
        <div
          className="flex items-center justify-between px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl"
          style={{
            background: headerBg,
            backdropFilter: 'blur(20px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
            border: `1px solid ${headerBorder}`,
            boxShadow: headerShadow,
          }}
        >
          {/* Left: branding */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <span className="material-symbols-outlined text-white text-sm sm:text-lg">videocam</span>
            </div>
            <div>
              <h1 className={`${headerText} font-bold text-xs sm:text-sm leading-tight`}>{departmentName}</h1>
              <p className="text-blue-400/60 text-[8px] sm:text-[9px] uppercase tracking-[0.15em] font-semibold hidden xs:block">SecureSight Station</p>
            </div>
          </div>

          {/* Center: clock */}
          <div className="hidden md:flex flex-col items-center">
            <p className={`${headerText} font-bold text-lg lg:text-xl font-mono leading-none tracking-tight`}>
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
            <p className={`${headerTextSub} text-[9px] uppercase tracking-wider mt-0.5`}>
              {currentTime.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
            </p>
          </div>

          {/* Right: controls */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {history.length > 0 && (
              <div className="hidden lg:flex items-center gap-1.5 mr-1">
                <span className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20">
                  <span className="material-symbols-outlined text-[10px]">login</span>{inCount}
                </span>
                <span className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-red-500/15 text-red-400 ring-1 ring-red-500/20">
                  <span className="material-symbols-outlined text-[10px]">logout</span>{outCount}
                </span>
              </div>
            )}

            <button onClick={toggleTheme}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-all"
              style={{ background: btnBg, border: `1px solid ${btnBorder}` }}>
              <span className={`material-symbols-outlined text-sm sm:text-base ${btnIcon}`}>{theme === 'dark' ? 'light_mode' : 'dark_mode'}</span>
            </button>

            <button onClick={() => setShowHistory(s => !s)}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-all"
              style={{ background: showHistory ? 'rgba(46,163,242,0.15)' : btnBg, border: `1px solid ${showHistory ? 'rgba(46,163,242,0.25)' : btnBorder}` }}>
              <span className={`material-symbols-outlined text-sm sm:text-base ${showHistory ? 'text-blue-400' : btnIcon}`}>
                {showHistory ? 'right_panel_open' : 'right_panel_close'}
              </span>
            </button>

            <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1 rounded-lg" style={{ background: isRegistered ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', border: `1px solid ${isRegistered ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}` }}>
              <span className={`w-1.5 h-1.5 rounded-full ${isRegistered ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className={`text-[8px] sm:text-[9px] font-bold uppercase ${isRegistered ? 'text-emerald-400' : 'text-amber-400'}`}>{isRegistered ? 'Live' : '...'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Camera + Sidebar ─────────────────────────────── */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 relative bg-black">
          <CameraFeed
            isScanning={isScanning}
            onSnap={handleResult}
            onToggle={handleToggleScan}
            cameraId={cameraId}
            apiKey={apiKey}
            settings={cameraSettings}
            onFeedbackChange={handleFeedbackChange}
          >
            <div className="absolute top-12 sm:top-16 left-0 right-0 z-40 flex flex-col">
              {banners.slice(0, 3).map(b => (
                <RecognitionBanner key={b.id} banner={b} onDismiss={handleDismissBanner} />
              ))}
            </div>

            {/* Idle state — no overlay */}
          </CameraFeed>

          {!showHistory && history.length > 0 && (
            <div className="absolute bottom-20 sm:bottom-4 left-1/2 -translate-x-1/2 z-20">
              <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl" style={{ background: isDark ? 'rgba(10,14,26,0.7)' : 'rgba(255,255,255,0.7)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}` }}>
                <span className={`${isDark ? 'text-white/40' : 'text-[var(--text-muted)]'} text-[9px] sm:text-[10px] font-semibold uppercase`}>{history.length} scans</span>
                <span className="text-emerald-400 text-[9px] sm:text-[10px] font-bold">{inCount} IN</span>
                <span className="text-red-400 text-[9px] sm:text-[10px] font-bold">{outCount} OUT</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Mobile backdrop ─────────────────────────────── */}
        {showHistory && (
          <div
            className="fixed inset-0 bg-black/40 z-25 lg:hidden"
            onClick={() => setShowHistory(false)}
          />
        )}

        {/* ── History sidebar ────────────────────────────── */}
        <div
          className={`flex flex-col shrink-0 transition-all duration-300
            max-lg:fixed max-lg:right-0 max-lg:top-0 max-lg:bottom-0 max-lg:z-30
            ${showHistory ? 'w-[280px] sm:w-72 lg:w-80' : 'max-lg:translate-x-full lg:w-0 lg:overflow-hidden'}
          `}
          style={{
            background: sidebarBg,
            backdropFilter: 'blur(24px) saturate(1.3)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
            borderLeft: `1px solid ${sidebarBorder}`,
          }}
        >
          {/* Sidebar header — pushed down to clear floating header */}
          <div className="pt-16 sm:pt-20 px-3 sm:px-4 pb-3" style={{ borderBottom: `1px solid ${sidebarBorder}` }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-blue-400 text-lg">history</span>
              <h2 className={`${sidebarText} font-bold text-xs uppercase tracking-widest`}>Activity</h2>
              <span className="ml-auto text-blue-400 text-[10px] px-2 py-0.5 rounded-md font-semibold bg-blue-500/10 ring-1 ring-blue-500/20">
                {filteredHistory.length}
              </span>
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}>
              {(['all', 'in', 'out'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setHistoryFilter(f)}
                  className={`flex-1 px-2 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${
                    historyFilter === f
                      ? f === 'in' ? 'bg-emerald-500 text-white shadow-sm'
                        : f === 'out' ? 'bg-red-500 text-white shadow-sm'
                        : 'bg-[var(--accent)] text-white shadow-sm'
                      : `${isDark ? 'text-white/40 hover:text-white/60' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'in' ? `In (${inCount})` : `Out (${outCount})`}
                </button>
              ))}
            </div>
          </div>

          {/* History list */}
          <div className="flex-1 overflow-y-auto glass-scrollbar">
            {filteredHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-3 ring-1 ${isDark ? 'bg-white/[0.03] ring-white/[0.06]' : 'bg-black/[0.02] ring-black/[0.06]'}`}>
                  <span className={`material-symbols-outlined text-3xl ${isDark ? 'text-white/15' : 'text-[var(--text-muted)]'} opacity-50`}>
                    {historyFilter === 'all' ? 'pending' : historyFilter === 'in' ? 'login' : 'logout'}
                  </span>
                </div>
                <p className={`${sidebarTextSub} text-xs font-medium`}>
                  {historyFilter === 'all' ? 'Waiting for scans...' : `No ${historyFilter === 'in' ? 'clock-ins' : 'clock-outs'} yet`}
                </p>
              </div>
            ) : (
              filteredHistory.map((entry, idx) => {
                const isIn = entry.status === 'in';
                const imgSrc = entry.imageUrl && entry.imageUrl !== 'placeholder'
                  ? (entry.imageUrl.startsWith('/') ? `${API_BASE}${entry.imageUrl}` : entry.imageUrl)
                  : null;
                return (
                  <div key={entry.id}
                    className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 transition-colors"
                    style={{ borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`, animation: idx === 0 ? 'fade-in 0.3s ease-out' : undefined }}
                    onMouseEnter={e => { e.currentTarget.style.background = sidebarHover; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                    {imgSrc ? (
                      <img src={imgSrc} alt={entry.name} className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl object-cover shrink-0 border ${isDark ? 'border-white/10' : 'border-[var(--glass-border)]'}`} />
                    ) : (
                      <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 bg-blue-500/10 border ${isDark ? 'border-blue-500/15' : 'border-blue-500/20'}`}>
                        <span className="material-symbols-outlined text-blue-400 text-base sm:text-lg">person</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`${sidebarText} text-xs sm:text-sm font-semibold truncate`}>{entry.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                          isIn ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20' : 'bg-red-500/15 text-red-400 ring-1 ring-red-500/20'
                        }`}>{isIn ? 'IN' : 'OUT'}</span>
                        <span className={`text-[10px] font-medium ${entry.type === 'guest' ? 'text-amber-400' : 'text-blue-400'}`}>
                          {entry.type === 'guest' ? 'Guest' : 'Employee'}
                        </span>
                      </div>
                    </div>
                    <span className={`${sidebarTextSub} text-[10px] font-mono shrink-0`}>
                      {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CameraStationPage;
