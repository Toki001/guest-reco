import { useEffect, useState } from 'react';
import { API_BASE } from '../config';

export interface BannerData {
  id: string;
  name: string;
  type: 'employee' | 'guest';
  status: 'in' | 'out';
  confidence: number;
  imageUrl: string;
}

interface Props {
  banner: BannerData;
  onDismiss: (id: string) => void;
}

export function RecognitionBanner({ banner, onDismiss }: Props) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setExiting(true), 3500);
    const removeTimer = setTimeout(() => onDismiss(banner.id), 4000);
    return () => { clearTimeout(fadeTimer); clearTimeout(removeTimer); };
  }, [banner.id, onDismiss]);

  const isIn = banner.status === 'in';
  const isGuest = banner.type === 'guest';

  const imgSrc = banner.imageUrl && banner.imageUrl !== 'placeholder'
    ? (banner.imageUrl.startsWith('/') ? `${API_BASE}${banner.imageUrl}` : banner.imageUrl)
    : null;

  return (
    <div
      className={`mx-2 sm:mx-4 mt-2 sm:mt-3 flex items-center gap-2.5 sm:gap-4 px-3 sm:px-5 py-3 sm:py-4 rounded-xl sm:rounded-2xl shadow-2xl transition-all duration-500 ${
        exiting ? 'opacity-0 -translate-y-4 scale-95' : 'opacity-100 translate-y-0 scale-100'
      }`}
      style={{
        background: isIn
          ? 'linear-gradient(135deg, rgba(16,185,129,0.85), rgba(5,150,105,0.9))'
          : 'linear-gradient(135deg, rgba(239,68,68,0.85), rgba(185,28,28,0.9))',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid ${isIn ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
        boxShadow: isIn
          ? '0 12px 40px rgba(16,185,129,0.3), inset 0 1px 0 rgba(255,255,255,0.15)'
          : '0 12px 40px rgba(239,68,68,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
      }}
    >
      {imgSrc ? (
        <img src={imgSrc} alt={banner.name} className="w-10 h-10 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl object-cover border-2 border-white/30 shrink-0 shadow-lg" />
      ) : (
        <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl bg-white/15 flex items-center justify-center border-2 border-white/20 shrink-0">
          <span className="material-symbols-outlined text-white/80 text-xl sm:text-2xl">person</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-white font-bold text-sm sm:text-lg truncate drop-shadow-sm">{banner.name}</p>
        <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5">
          <span className="material-symbols-outlined text-white/80 text-xs sm:text-sm">{isIn ? 'login' : 'logout'}</span>
          <p className="text-white/90 text-xs sm:text-sm font-semibold">{isIn ? 'Clocked In' : 'Clocked Out'}</p>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className={`inline-flex px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-bold shadow-sm ${
          isGuest ? 'bg-amber-400/20 text-amber-100' : 'bg-white/15 text-white'
        }`}>{banner.type === 'guest' ? 'Guest' : 'Employee'}</span>
        <p className="text-white/60 text-[10px] sm:text-[11px] font-mono">{banner.confidence.toFixed(1)}%</p>
      </div>
    </div>
  );
}
