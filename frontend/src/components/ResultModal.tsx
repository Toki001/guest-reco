import React from 'react';
import { AccessLog } from '../types';

interface ResultModalProps {
  data: AccessLog[];
  onDismiss: () => void;
}

export const ResultModal: React.FC<ResultModalProps> = ({ data, onDismiss }) => {
  if (!data || data.length === 0) return null;

  // Check if there are any unregistered guests in the scan
  const hasGuest = data.some(log => log.isUnknown);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in zoom-in duration-300">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-8 w-full max-w-md text-center transform transition-all border border-white/10 relative overflow-hidden flex flex-col max-h-[80vh]">
        
        <div className={`mx-auto w-16 h-16 flex items-center justify-center rounded-full mb-4 shrink-0 ${
          hasGuest ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'
        }`}>
          <span className="material-symbols-outlined text-4xl">
            {hasGuest ? 'warning' : 'verified_user'}
          </span>
        </div>

        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1 shrink-0">
          {data.length > 1 ? `${data.length} Faces Detected` : 'Scan Complete'}
        </h2>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 shrink-0">
          {hasGuest ? 'Action Required' : 'All Employees Identified'}
        </p>

        {/* Scrollable list of recognized faces */}
        <div className="overflow-y-auto w-full no-scrollbar space-y-3 mb-6 pr-2">
          {data.map((log) => (
            <div key={log.id} className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 flex items-center space-x-4 border border-slate-100 dark:border-slate-700/50 text-left relative">
              <div className="relative shrink-0">
                <img 
                  src={log.user.imageUrl} 
                  alt={log.user.name} 
                  className={`w-12 h-12 rounded-full object-cover border-2 shadow-sm ${log.isUnknown ? 'border-amber-400 grayscale' : 'border-green-400 dark:border-slate-600'}`}
                />
                <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${log.status === 'in' || log.status === 'granted' ? 'bg-green-500' : 'bg-red-500'}`}></div>
              </div>
              
              <div className="overflow-hidden flex-1">
                <h3 className="font-bold text-slate-900 dark:text-white text-sm truncate">
                  {log.user.name}
                </h3>
                <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wide mt-0.5">
                  ID: {log.user.id}
                </p>
              </div>

              {!log.isUnknown && (
                <div className="shrink-0 text-right">
                  <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-0.5">Match</div>
                  <div className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                    {log.user.confidence !== undefined ? log.user.confidence.toFixed(1) : '0.0'}%
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <button 
          onClick={onDismiss}
          className="w-full py-4 shrink-0 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl font-bold transition-all duration-200 shadow-lg shadow-blue-600/30 text-sm tracking-wide mt-auto"
        >
          Dismiss & Resume
        </button>

      </div>
    </div>
  );
};