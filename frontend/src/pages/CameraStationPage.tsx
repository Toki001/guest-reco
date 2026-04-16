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

  // API key: from URL param, localStorage, or prompt user
  const [apiKey, setApiKey] = useState(() => urlKey || localStorage.getItem(CAMERA_KEY_STORAGE) || '');
  const [keyInput, setKeyInput] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(!!apiKey);
  const [authError, setAuthError] = useState('');

  const [isScanning, setIsScanning] = useState(true);
  const [isRegistered, setIsRegistered] = useState(false);
  const [cameraSettings, setCameraSettings] = useState<CameraSettings | undefined>(undefined);

  // Banner system + history
  const [banners, setBanners] = useState<BannerData[]>([]);
  const [history, setHistory] = useState<(BannerData & { timestamp: Date })[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isIdle, setIsIdle] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [showHistory, setShowHistory] = useState(true);
  const cooldownRef = useRef<Map<string, number>>(new Map());
  const idleTimerRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Save key to localStorage when set via URL
  useEffect(() => {
    if (urlKey) {
      localStorage.setItem(CAMERA_KEY_STORAGE, urlKey);
      setApiKey(urlKey);
      setIsAuthenticated(true);
    }
  }, [urlKey]);

  // Clock
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch camera settings from API (and re-fetch every 60s to pick up admin changes)
  useEffect(() => {
    if (!apiKey) return;
    const fetchSettings = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/settings`, {
          headers: { 'X-API-Key': apiKey },
        });
        if (res.ok) setCameraSettings(await res.json());
      } catch (e) {
        console.error('Failed to fetch settings:', e);
      }
    };
    fetchSettings();
    const interval = setInterval(fetchSettings, 60000);
    return () => clearInterval(interval);
  }, [apiKey]);

  // Idle state tracker
  const handleFeedbackChange = useCallback((feedback: string) => {
    clearTimeout(idleTimerRef.current);
    if (feedback === 'idle') {
      idleTimerRef.current = window.setTimeout(() => setIsIdle(true), 10000);
    } else {
      setIsIdle(false);
    }
  }, []);

  // Audio
  const unlockAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
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
      const res = await fetch(`${API_BASE}/api/camera/register`, {
        method: 'POST',
        body: formData,
        headers: { 'X-API-Key': keyInput.trim() },
      });
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

  // Register camera with central server on mount
  useEffect(() => {
    if (!cameraId || !apiKey || isRegistered) return;

    const headers: HeadersInit = { 'X-API-Key': apiKey };

    const register = async () => {
      try {
        const formData = new FormData();
        formData.append('camera_id', cameraId);
        formData.append('department', departmentName);
        const res = await fetch(`${API_BASE}/api/camera/register`, { method: 'POST', body: formData, headers });
        if (res.ok) {
          setIsRegistered(true);
        } else if (res.status === 401) {
          localStorage.removeItem(CAMERA_KEY_STORAGE);
          setApiKey('');
          setIsAuthenticated(false);
          return;
        }
      } catch (e) {
        console.error('Camera registration failed:', e);
      }
    };
    register();

    // Heartbeat every 10 seconds
    const heartbeat = setInterval(async () => {
      try {
        const formData = new FormData();
        formData.append('camera_id', cameraId);
        await fetch(`${API_BASE}/api/camera/heartbeat`, { method: 'POST', body: formData, headers });
      } catch (e) {
        console.error('Heartbeat failed:', e);
      }
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
        name: result.name,
        type: result.type,
        status: result.status as 'in' | 'out',
        confidence: result.confidence,
        imageUrl: result.image_url || '',
      };

      setBanners(prev => [...prev, entry]);
      setHistory(prev => [{ ...entry, timestamp: new Date() }, ...prev].slice(0, 50));

      if (result.status === 'in') {
        playTone(880, 0.15);
      } else {
        playTone(440, 0.2);
      }
    }

    setIsIdle(false);
  };

  const handleToggleScan = () => {
    unlockAudio();
    setIsScanning(prev => !prev);
  };

  // ─── AUTH SCREEN (API Key input) ────────────────────────
  if (!isAuthenticated) {
    return (
      <div
        className="h-screen w-screen flex items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, #0a2a5e 0%, #0d1b3e 40%, #111827 100%)',
        }}
      >
        {/* Decorative orbs */}
        <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full opacity-20 blur-3xl" style={{ background: 'radial-gradient(circle, rgba(46,163,242,0.4), transparent 70%)' }} />
        <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] rounded-full opacity-15 blur-3xl" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.3), transparent 70%)' }} />

        <div
          className="relative w-full max-w-sm rounded-2xl p-8 border"
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(24px) saturate(1.3)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            boxShadow: '0 16px 48px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
          }}
        >
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/15 border border-blue-400/20 flex items-center justify-center mx-auto mb-3" style={{ boxShadow: '0 0 24px rgba(46,163,242,0.15)' }}>
              <span className="material-symbols-outlined text-3xl text-blue-400">videocam</span>
            </div>
            <h1 className="text-white font-bold text-lg">{departmentName}</h1>
            <p className="text-blue-300/50 text-[11px] uppercase tracking-[0.2em] mt-1 font-semibold">
              Camera Station Setup
            </p>
          </div>

          <form onSubmit={handleKeySubmit} className="space-y-4">
            <div>
              <label className="text-blue-200/60 text-xs font-medium block mb-1.5">Camera API Key</label>
              <input
                type="text"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                required
                autoFocus
                className="w-full rounded-xl px-3.5 py-2.5 text-white text-sm font-mono focus:outline-none transition-all placeholder:text-white/20"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(46,163,242,0.5)'; e.currentTarget.style.boxShadow = '0 0 16px rgba(46,163,242,0.1)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.02)'; }}
                placeholder="Paste API key here"
              />
              <p className="text-white/25 text-[10px] mt-1.5">Get this from the server console or your administrator.</p>
            </div>

            {authError && (
              <div className="rounded-xl px-3.5 py-2.5 text-red-300 text-sm border" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)' }}>
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl font-bold text-sm text-white transition-all"
              style={{
                background: 'linear-gradient(135deg, #2EA3F2, #0C71C3)',
                boxShadow: '0 4px 16px rgba(46,163,242,0.3)',
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 24px rgba(46,163,242,0.45)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(46,163,242,0.3)'; }}
            >
              Connect Camera
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─── MAIN CAMERA VIEW ──────────────────────────────────
  return (
    <div
      className="h-screen w-screen flex flex-col transition-colors duration-200"
      style={{
        backgroundColor: 'var(--bg-base)',
        backgroundImage: 'var(--mesh-gradient)',
      }}
    >
      {/* Header bar — glass */}
      <div
        className="px-6 py-3 flex items-center justify-between shrink-0"
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(20px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.3)',
          borderBottom: '1px solid var(--glass-border)',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06), inset 0 -1px 0 rgba(255, 255, 255, 0.04)',
        }}
      >
        <div className="flex items-center space-x-3">
          <div
            className="p-2 rounded-xl"
            style={{
              background: 'linear-gradient(135deg, rgba(46,163,242,0.15), rgba(139,92,246,0.1))',
              border: '1px solid rgba(46,163,242,0.2)',
              boxShadow: '0 0 12px rgba(46,163,242,0.1)',
            }}
          >
            <span className="material-symbols-outlined text-[var(--accent)]">videocam</span>
          </div>
          <div>
            <h1 className="text-[var(--text-primary)] font-bold text-lg">FSUU — {departmentName}</h1>
            <p className="text-[var(--accent)] text-[10px] uppercase tracking-[0.15em] font-semibold opacity-70">Camera Station</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          {/* Clock — glass pill */}
          <div
            className="hidden sm:flex items-center gap-2.5 px-4 py-2 rounded-xl"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--glass-border)',
            }}
          >
            <span className="material-symbols-outlined text-sm text-[var(--accent)]">schedule</span>
            <div className="text-right">
              <p className="text-[var(--text-primary)] font-bold text-sm font-mono leading-none">
                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              <p className="text-[var(--text-muted)] text-[9px] uppercase tracking-wider mt-0.5">
                {currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
              </p>
            </div>
          </div>
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl transition-all"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--glass-border)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
          >
            <span className="material-symbols-outlined text-[var(--accent)] text-xl">
              {theme === 'dark' ? 'light_mode' : 'dark_mode'}
            </span>
          </button>
          {/* History toggle */}
          <button
            onClick={() => setShowHistory(s => !s)}
            className="p-2 rounded-xl transition-all"
            style={{
              background: showHistory ? 'rgba(46,163,242,0.12)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${showHistory ? 'rgba(46,163,242,0.25)' : 'var(--glass-border)'}`,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = showHistory ? 'rgba(46,163,242,0.18)' : 'rgba(255,255,255,0.12)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = showHistory ? 'rgba(46,163,242,0.12)' : 'rgba(255,255,255,0.06)'; }}
            title={showHistory ? 'Hide activity panel' : 'Show activity panel'}
          >
            <span className={`material-symbols-outlined text-xl ${showHistory ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
              {showHistory ? 'right_panel_open' : 'right_panel_close'}
            </span>
          </button>
          {/* Connection status */}
          <div
            className="flex items-center space-x-2 px-3 py-1.5 rounded-xl"
            style={{
              background: isRegistered ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
              border: `1px solid ${isRegistered ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
              boxShadow: isRegistered ? '0 0 12px rgba(16,185,129,0.08)' : undefined,
            }}
          >
            <span className={`w-2 h-2 rounded-full ${isRegistered ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className={`text-[10px] font-bold uppercase tracking-wider ${isRegistered ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isRegistered ? 'Connected' : 'Connecting...'}
            </span>
          </div>
        </div>
      </div>

      {/* Camera feed + History sidebar */}
      <div className="flex-1 flex min-h-0">
        {/* Camera feed */}
        <div className="flex-1 relative">
          <CameraFeed
            isScanning={isScanning}
            onSnap={handleResult}
            onToggle={handleToggleScan}
            cameraId={cameraId}
            apiKey={apiKey}
            settings={cameraSettings}
            onFeedbackChange={handleFeedbackChange}
          >
            {/* Recognition banners — top of feed */}
            <div className="absolute top-0 left-0 right-0 z-40 flex flex-col">
              {banners.slice(0, 3).map(b => (
                <RecognitionBanner key={b.id} banner={b} onDismiss={handleDismissBanner} />
              ))}
            </div>

            {/* Idle overlay — glass */}
            {isIdle && isScanning && (
              <div
                className="absolute inset-0 z-30 flex flex-col items-center justify-center"
                style={{
                  background: 'rgba(0, 0, 0, 0.25)',
                  backdropFilter: 'blur(4px)',
                  WebkitBackdropFilter: 'blur(4px)',
                }}
              >
                <div
                  className="flex flex-col items-center px-10 py-8 rounded-3xl"
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.2)',
                  }}
                >
                  <span className="material-symbols-outlined text-6xl text-white/60 mb-4 animate-pulse">face</span>
                  <p className="text-white/80 text-lg font-medium tracking-wide">Approach camera to scan</p>
                </div>
              </div>
            )}
          </CameraFeed>
        </div>

        {/* Live history sidebar — glass, collapsible */}
        <div
          className={`flex flex-col shrink-0 transition-all duration-300 ${showHistory ? 'w-80' : 'w-0 overflow-hidden'} max-md:absolute max-md:right-0 max-md:top-0 max-md:bottom-0 max-md:z-30`}
          style={{
            background: 'var(--glass-bg-strong)',
            backdropFilter: 'blur(24px) saturate(1.3)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
            borderLeft: '1px solid var(--glass-border)',
            boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.06)',
          }}
        >
          <div className="px-4 py-3.5 flex items-center gap-2" style={{ borderBottom: '1px solid var(--glass-border)' }}>
            <span className="material-symbols-outlined text-[var(--accent)] text-lg">history</span>
            <h2 className="text-[var(--text-primary)] font-bold text-sm uppercase tracking-wider">Live Activity</h2>
            <span
              className="ml-auto text-[var(--accent)] text-[10px] px-2.5 py-0.5 rounded-lg font-semibold"
              style={{ background: 'rgba(46,163,242,0.1)', border: '1px solid rgba(46,163,242,0.15)' }}
            >
              {history.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto glass-scrollbar">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
                <span className="material-symbols-outlined text-4xl mb-2 opacity-25">pending</span>
                <p className="text-xs">Waiting for scans...</p>
              </div>
            ) : (
              history.map((entry) => {
                const isIn = entry.status === 'in';
                const imgSrc = entry.imageUrl && entry.imageUrl !== 'placeholder'
                  ? (entry.imageUrl.startsWith('/') ? `${API_BASE}${entry.imageUrl}` : entry.imageUrl)
                  : null;
                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 px-4 py-3 transition-colors"
                    style={{ borderBottom: '1px solid var(--glass-border)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {/* Avatar */}
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt={entry.name}
                        className="w-10 h-10 rounded-xl object-cover shrink-0"
                        style={{ border: '2px solid var(--glass-border)' }}
                      />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{
                          background: 'rgba(46,163,242,0.1)',
                          border: '2px solid rgba(46,163,242,0.15)',
                        }}
                      >
                        <span className="material-symbols-outlined text-[var(--accent)] text-lg">person</span>
                      </div>
                    )}
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[var(--text-primary)] text-sm font-semibold truncate">{entry.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                          isIn
                            ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20'
                            : 'bg-red-500/15 text-red-400 ring-1 ring-red-500/20'
                        }`}>
                          {isIn ? 'IN' : 'OUT'}
                        </span>
                        <span className={`text-[10px] font-medium ${entry.type === 'guest' ? 'text-amber-400' : 'text-[var(--accent)]'}`}>
                          {entry.type === 'guest' ? 'Guest' : 'Employee'}
                        </span>
                      </div>
                    </div>
                    {/* Time */}
                    <span className="text-[var(--text-muted)] text-[10px] font-mono shrink-0">
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
