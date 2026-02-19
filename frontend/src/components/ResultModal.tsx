import React from 'react';

interface ResultModalProps {
  data: {
    status: 'granted' | 'denied' | 'in' | 'out';
    isUnknown?: boolean;
    user: {
      name: string;
      id: string;
      imageUrl: string;
      confidence?: number;
    };
  };
  onDismiss: () => void;
}

export const ResultModal: React.FC<ResultModalProps> = ({ data, onDismiss }) => {
  const isGranted = data.status === 'granted';
  // Use real confidence if available, else fallback
  const confidenceScore = data.user.confidence !== undefined 
  ? data.user.confidence.toFixed(1) 
  : '0.0';

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in zoom-in duration-300">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-8 w-full max-w-sm text-center transform transition-all border border-white/10 relative overflow-hidden">
        
        <div className={`mx-auto w-20 h-20 flex items-center justify-center rounded-full mb-6 ${
          isGranted ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
        }`}>
          <span className="material-symbols-outlined text-5xl">
            {isGranted ? 'check_circle' : 'check_circle'}
          </span>
        </div>

        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          {isGranted ? 'Access Granted' : 'Access Granted'}
        </h2>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-8">
          {data.isUnknown ? 'Identity Unverified' : 'Employee Identified'}
        </p>

        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 mb-6 flex items-center space-x-4 border border-slate-100 dark:border-slate-700/50">
           <div className="relative">
             <img 
              src={data.user.imageUrl} 
              alt={data.user.name} 
              className="w-14 h-14 rounded-full object-cover border-2 border-white dark:border-slate-600 shadow-sm"
            />
            <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white ${isGranted ? 'bg-green-500' : 'bg-red-500'}`}></div>
           </div>
          
          <div className="text-left overflow-hidden">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm truncate">
              {data.user.name}
            </h3>
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wide mt-0.5">
              ID: {data.user.id}
            </p>
          </div>
        </div>

        {!data.isUnknown && (
             <div className="mb-8 px-4 py-3 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 rounded-xl text-xs font-bold font-mono flex items-center justify-center">
                <span className="material-symbols-outlined text-base mr-2">analytics</span>
                Confidence: {confidenceScore}%
             </div>
        )}

        <button 
          onClick={onDismiss}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl font-bold transition-all duration-200 shadow-lg shadow-blue-600/30 text-sm tracking-wide"
        >
          Dismiss
        </button>

      </div>
    </div>
  );
};