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

  const bgColor = isIn ? 'bg-emerald-600/90 border-emerald-400/50' :
                         'bg-red-900/95 border-red-500/50';

  const statusText = isIn ? 'Welcome! Clocked In' : 'Goodbye! Clocked Out';

  const imgSrc = banner.imageUrl && banner.imageUrl !== 'placeholder'
    ? (banner.imageUrl.startsWith('/') ? `${API_BASE}${banner.imageUrl}` : banner.imageUrl)
    : null;

  return (
    <div className={`flex items-center gap-4 px-6 py-4 border-b backdrop-blur-md shadow-2xl
      transition-all duration-500 w-full
      ${bgColor} ${exiting ? 'opacity-0 -translate-y-4' : 'opacity-100 translate-y-0'}`}>
      {imgSrc ? (
        <img src={imgSrc} alt={banner.name} className="w-16 h-16 rounded-full object-cover border-2 border-white/30 shrink-0" />
      ) : (
        <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center border-2 border-white/30 shrink-0">
          <span className="material-symbols-outlined text-slate-400 text-2xl">person</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-white font-bold text-lg truncate">{banner.name}</p>
        <p className={`text-sm font-bold uppercase tracking-wider ${
          isGuest ? 'text-amber-400' : isIn ? 'text-emerald-400' : 'text-red-400'
        }`}>{statusText}</p>
      </div>
      <div className="text-right shrink-0">
        <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold ${
          isGuest ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'
        }`}>{banner.type === 'guest' ? 'Guest' : 'Employee'}</span>
        <p className="text-white/60 text-xs font-mono mt-1">{banner.confidence.toFixed(1)}%</p>
      </div>
    </div>
  );
}
