import React, { useState } from 'react';

export const SettingsPanel: React.FC = () => {
  const [threshold, setThreshold] = useState(80);
  const [isUpdating, setIsUpdating] = useState(false);

  const updateThreshold = async (val: number) => {
    setThreshold(val);
    setIsUpdating(true);
    try {
      const response = await fetch('http://localhost:5001/update_config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: val }),
      });
      if (!response.ok) throw new Error('Failed');
    } catch (error) {
      console.error("Sync Error:", error);
    } finally {
      setTimeout(() => setIsUpdating(false), 300);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl p-8 shadow-2xl transition-all">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center">
            <span className="material-symbols-outlined text-blue-500 text-2xl">tune</span>
          </div>
          <div>
            <h3 className="text-slate-900 dark:text-white font-bold text-lg leading-none">AI Sensitivity</h3>
            <p className="text-slate-500 dark:text-white/40 text-[10px] uppercase tracking-widest font-black mt-1">Calibration Engine</p>
          </div>
        </div>
        
        {isUpdating && (
          <div className="flex items-center space-x-2 text-blue-500 animate-pulse">
            <span className="material-symbols-outlined text-sm animate-spin">sync</span>
            <span className="text-[10px] font-bold uppercase tracking-widest">Syncing</span>
          </div>
        )}
      </div>
      
      <div className="space-y-10">
        <div className="flex justify-between items-end px-1">
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-700 dark:text-white/80">Rekognition Threshold</label>
            <p className="text-xs text-slate-400 dark:text-white/30 max-w-[320px]">
              Minimum confidence level required for identity match.
            </p>
          </div>
          <div className="text-right">
             <div className="flex items-baseline justify-end">
                <span className="text-5xl font-mono font-black text-blue-500">{threshold}</span>
                <span className="text-blue-500/50 font-mono font-bold text-xl ml-1">%</span>
             </div>
          </div>
        </div>

        <div className="relative px-2">
          <input 
            type="range" min="50" max="99" value={threshold}
            onChange={(e) => updateThreshold(parseInt(e.target.value))}
            className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full appearance-none cursor-pointer accent-blue-500"
          />
          <div className="flex justify-between mt-4 text-[10px] font-black text-slate-400 dark:text-white/20 uppercase tracking-tighter">
            <span>50% Lenient</span>
            <span>99% Strict</span>
          </div>
        </div>

        <div className="bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/10 dark:border-blue-500/20 rounded-2xl p-5 flex items-start space-x-4">
          <span className="material-symbols-outlined text-blue-500">info</span>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-blue-200/60">
            <strong className="text-blue-600 dark:text-blue-400">Optimization Note:</strong> Higher values prevent unauthorized access but might struggle with motion blur.
          </p>
        </div>
      </div>
    </div>
  );
};