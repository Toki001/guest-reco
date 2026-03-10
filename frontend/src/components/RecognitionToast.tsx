import { useEffect, useState } from 'react';
import { API_BASE } from '../config';

export interface ToastData {
  id: string;
  name: string;
  type: 'employee' | 'guest';
  status: 'in' | 'out';
  confidence: number;
  imageUrl: string;
  skipped?: boolean;
}

interface Props {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

export function RecognitionToast({ toast, onDismiss }: Props) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setExiting(true), 3500);
    const remove = setTimeout(() => onDismiss(toast.id), 4000);
    return () => { clearTimeout(timer); clearTimeout(remove); };
  }, [toast.id, onDismiss]);

  const isIn = toast.status === 'in';
  const isGuest = toast.type === 'guest';

  const bgColor = isGuest ? 'bg-amber-900/90 border-amber-500/50' :
                  isIn ? 'bg-emerald-900/90 border-emerald-500/50' :
                         'bg-red-900/90 border-red-500/50';

  const statusLabel = isGuest ? 'GUEST' : isIn ? 'CLOCK IN' : 'CLOCK OUT';
  const statusColor = isGuest ? 'text-amber-400' : isIn ? 'text-emerald-400' : 'text-red-400';

  const imgSrc = toast.imageUrl && toast.imageUrl !== 'placeholder'
    ? (toast.imageUrl.startsWith('/') ? `${API_BASE}${toast.imageUrl}` : toast.imageUrl)
    : null;

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm shadow-2xl
      transition-all duration-500 min-w-[280px] max-w-[340px]
      ${bgColor} ${exiting ? 'opacity-0 translate-x-8' : 'opacity-100 translate-x-0'}`}>
      {imgSrc ? (
        <img src={imgSrc} alt={toast.name} className="w-12 h-12 rounded-full object-cover border-2 border-white/20 shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center border-2 border-white/20 shrink-0">
          <span className="material-symbols-outlined text-slate-400 text-xl">person</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-white font-bold text-sm truncate">{toast.name}</p>
        <p className={`text-xs font-bold uppercase tracking-wider ${statusColor}`}>{statusLabel}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-white/70 text-xs font-mono">{toast.confidence.toFixed(1)}%</p>
      </div>
    </div>
  );
}
