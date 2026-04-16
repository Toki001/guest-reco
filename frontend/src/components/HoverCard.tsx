import { useState, useRef, useCallback } from 'react';
import { API_BASE } from '../config';

interface HoverCardProps {
  name: string;
  type: string;
  imageUrl?: string;
  confidence?: number;
  cameraId?: string | null;
  status?: string;
  children: React.ReactNode;
}

export function HoverCard({ name, type, imageUrl, confidence, cameraId, status, children }: HoverCardProps) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const timeout = useRef<number>(0);
  const ref = useRef<HTMLDivElement>(null);

  const handleEnter = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
    timeout.current = window.setTimeout(() => setShow(true), 400);
  }, []);

  const handleLeave = useCallback(() => {
    clearTimeout(timeout.current);
    setShow(false);
  }, []);

  const imgSrc = imageUrl && imageUrl.startsWith('/') ? `${API_BASE}${imageUrl}` : imageUrl;
  const isGuest = type === 'guest';

  return (
    <div ref={ref} onMouseEnter={handleEnter} onMouseLeave={handleLeave} className="relative inline-flex">
      {children}
      {show && (
        <div
          className="fixed z-[200] pointer-events-none"
          style={{ left: pos.x, top: pos.y - 8, transform: 'translate(-50%, -100%)' }}
        >
          <div
            className="rounded-xl p-3 min-w-[200px] max-w-[260px]"
            style={{
              background: 'var(--glass-bg-strong)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid var(--glass-border)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
              animation: 'fade-in 0.15s ease-out',
            }}
          >
            <div className="flex items-center gap-2.5 mb-2">
              {imgSrc ? (
                <img src={imgSrc} alt={name} className="w-10 h-10 rounded-lg object-cover border border-[var(--glass-border)]" />
              ) : (
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isGuest ? 'bg-amber-500/15' : 'bg-blue-500/15'}`}>
                  <span className={`material-symbols-outlined text-sm ${isGuest ? 'text-amber-400' : 'text-blue-400'}`}>person</span>
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{name}</p>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md inline-block ${
                  isGuest ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'
                }`}>{isGuest ? 'Guest' : 'Employee'}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
              {confidence != null && (
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[10px]">verified</span>
                  {confidence}%
                </span>
              )}
              {cameraId && (
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[10px]">videocam</span>
                  {cameraId}
                </span>
              )}
              {status && (
                <span className={`font-bold ${status === 'in' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {status.toUpperCase()}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
