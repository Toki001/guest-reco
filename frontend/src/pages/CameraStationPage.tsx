import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CameraFeed } from '../components/CameraFeed';
import { RecognitionToast, ToastData } from '../components/RecognitionToast';
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

  // Toast system
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const cooldownRef = useRef<Map<string, number>>(new Map());

  // Save key to localStorage when set via URL
  useEffect(() => {
    if (urlKey) {
      localStorage.setItem(CAMERA_KEY_STORAGE, urlKey);
      setApiKey(urlKey);
      setIsAuthenticated(true);
    }
  }, [urlKey]);

  const handleKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) return;
    setAuthError('');

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

  const handleDismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const handleResult = (results: { name: string; type: 'guest' | 'employee'; confidence: number; image_url?: string; status?: string; user_id?: string; skipped?: boolean }[]) => {
    const now = Date.now();

    for (const result of results) {
      // Skip if no status (shouldn't happen but safety check)
      if (!result.status) continue;

      const userId = result.user_id || result.name;

      // Client-side cooldown check (secondary guard)
      const lastSeen = cooldownRef.current.get(userId);
      if (lastSeen && now - lastSeen < 10000) continue;

      // Update cooldown
      cooldownRef.current.set(userId, now);

      // Add toast
      setToasts(prev => [...prev, {
        id: `${userId}-${now}-${Math.random().toString(36).slice(2, 6)}`,
        name: result.name,
        type: result.type,
        status: result.status as 'in' | 'out',
        confidence: result.confidence,
        imageUrl: result.image_url || '',
      }]);
    }
  };

  const handleToggleScan = () => {
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
            <h1 className="text-white font-bold text-lg">{departmentName}</h1>
            <p className="text-slate-500 text-xs uppercase tracking-wider">Camera Station</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`w-2 h-2 rounded-full ${isRegistered ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`}></span>
          <span className={`text-xs font-bold uppercase tracking-wider ${isRegistered ? 'text-green-400' : 'text-amber-400'}`}>
            {isRegistered ? 'Connected' : 'Connecting...'}
          </span>
        </div>
      </div>

      {/* Camera feed */}
      <div className="flex-1 relative">
        <CameraFeed
          isScanning={isScanning}
          onSnap={handleResult}
          onToggle={handleToggleScan}
          cameraId={cameraId}
          apiKey={apiKey}
        >
          {/* Toast stack */}
          <div className="absolute bottom-24 right-4 z-40 flex flex-col gap-2">
            {toasts.map(t => (
              <RecognitionToast key={t.id} toast={t} onDismiss={handleDismissToast} />
            ))}
          </div>
        </CameraFeed>
      </div>
    </div>
  );
}

export default CameraStationPage;
