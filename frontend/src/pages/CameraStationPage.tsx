import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CameraFeed, CameraSettings } from '../components/CameraFeed';
import { RecognitionBanner, BannerData } from '../components/RecognitionBanner';
import { API_BASE } from '../config';

const CAMERA_KEY_STORAGE = 'securesight_camera_key';

function CameraStationPage() {
  const { cameraId } = useParams<{ cameraId: string }>();
  const [searchParams] = useSearchParams();
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
      // Skip if no status (shouldn't happen but safety check)
      if (!result.status) continue;

      const userId = result.user_id || result.name;

      // Client-side cooldown check (secondary guard)
      const cooldownMs = (cameraSettings?.cooldown_seconds ?? 10) * 1000;
      const lastSeen = cooldownRef.current.get(userId);
      if (lastSeen && now - lastSeen < cooldownMs) continue;

      // Update cooldown
      cooldownRef.current.set(userId, now);

      const entry = {
        id: `${userId}-${now}-${Math.random().toString(36).slice(2, 6)}`,
        name: result.name,
        type: result.type,
        status: result.status as 'in' | 'out',
        confidence: result.confidence,
        imageUrl: result.image_url || '',
      };

      // Add banner
      setBanners(prev => [...prev, entry]);

      // Add to history (newest first, keep last 50)
      setHistory(prev => [{ ...entry, timestamp: new Date() }, ...prev].slice(0, 50));

      // Play tone
      if (result.status === 'in') {
        playTone(880, 0.15);
      } else {
        playTone(440, 0.2);
      }
    }

    // Reset idle state on recognition
    setIsIdle(false);
  };

  const handleToggleScan = () => {
    unlockAudio();
    setIsScanning(prev => !prev);
  };

  // Show API key input if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="h-screen w-screen bg-[#0f172a] flex items-center justify-center">
        <div className="w-full max-w-sm bg-[#1e293b] rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-6">
            <span className="material-symbols-outlined text-4xl text-blue-400 mb-2 block">videocam</span>
            <h1 className="text-white font-bold text-lg">{departmentName}</h1>
            <p className="text-slate-500 text-[11px] uppercase tracking-[0.2em] mt-1 font-semibold">
              Camera Station Setup
            </p>
          </div>

          <form onSubmit={handleKeySubmit} className="space-y-4">
            <div>
              <label className="text-slate-400 text-xs font-medium block mb-1.5">Camera API Key</label>
              <input
                type="text"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                required
                autoFocus
                className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm font-mono focus:border-blue-500 focus:outline-none transition-colors"
                placeholder="Paste API key here"
              />
              <p className="text-slate-500 text-[10px] mt-1.5">Get this from the server console or your administrator.</p>
            </div>

            {authError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-400 text-sm">
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg font-bold text-sm text-white bg-blue-600 hover:bg-blue-500 transition-colors"
            >
              Connect Camera
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black flex flex-col">
      {/* Department header bar */}
      <div className="bg-slate-900 px-6 py-3 flex items-center justify-between shrink-0 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <span className="material-symbols-outlined text-blue-400">videocam</span>
          <div>
            <h1 className="text-white font-bold text-lg">FSUU — {departmentName}</h1>
            <p className="text-slate-500 text-xs uppercase tracking-wider">Camera Station</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          {/* Clock */}
          <div className="text-right">
            <p className="text-white font-bold text-sm font-mono">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
            <p className="text-slate-400 text-[10px] uppercase tracking-wider">
              {currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          {/* Mute toggle */}
          <button
            onClick={() => {
              unlockAudio();
              setIsMuted(prev => !prev);
            }}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            <span className="material-symbols-outlined text-white text-xl">
              {isMuted ? 'volume_off' : 'volume_up'}
            </span>
          </button>
          {/* Connection status */}
          <div className="flex items-center space-x-2">
            <span className={`w-2 h-2 rounded-full ${isRegistered ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`}></span>
            <span className={`text-xs font-bold uppercase tracking-wider ${isRegistered ? 'text-green-400' : 'text-amber-400'}`}>
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

            {/* Idle overlay */}
            {isIdle && isScanning && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/30 backdrop-blur-[2px]">
                <span className="material-symbols-outlined text-6xl text-white/60 mb-4 animate-pulse">face</span>
                <p className="text-white/80 text-lg font-medium tracking-wide">Approach camera to scan</p>
              </div>
            )}
          </CameraFeed>
        </div>

        {/* Live history sidebar */}
        <div className="w-80 bg-slate-900/95 border-l border-slate-800 flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-400 text-lg">history</span>
            <h2 className="text-white font-bold text-sm uppercase tracking-wider">Live Activity</h2>
            <span className="ml-auto text-slate-500 text-xs">{history.length} events</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-600">
                <span className="material-symbols-outlined text-3xl mb-2">pending</span>
                <p className="text-xs">Waiting for scans...</p>
              </div>
            ) : (
              history.map((entry) => {
                const isIn = entry.status === 'in';
                const imgSrc = entry.imageUrl && entry.imageUrl !== 'placeholder'
                  ? (entry.imageUrl.startsWith('/') ? `${API_BASE}${entry.imageUrl}` : entry.imageUrl)
                  : null;
                return (
                  <div key={entry.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    {/* Avatar */}
                    {imgSrc ? (
                      <img src={imgSrc} alt={entry.name} className="w-10 h-10 rounded-full object-cover border-2 border-slate-700 shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border-2 border-slate-700 shrink-0">
                        <span className="material-symbols-outlined text-slate-500 text-lg">person</span>
                      </div>
                    )}
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{entry.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${isIn ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
                        <span className={`text-xs font-bold uppercase ${isIn ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isIn ? 'IN' : 'OUT'}
                        </span>
                        <span className="text-slate-600 text-xs">·</span>
                        <span className={`text-xs ${entry.type === 'guest' ? 'text-amber-500' : 'text-blue-400'}`}>
                          {entry.type === 'guest' ? 'Guest' : 'Employee'}
                        </span>
                      </div>
                    </div>
                    {/* Time */}
                    <span className="text-slate-500 text-[11px] font-mono shrink-0">
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
