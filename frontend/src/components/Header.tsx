import React from 'react';

interface HeaderProps {
  toggleSidebar: () => void;
  // NEW: Accept the online status from the parent app
  isOnline: boolean;
}

export const Header: React.FC<HeaderProps> = ({ toggleSidebar, isOnline }) => {
  return (
    <header className="flex items-center justify-between mb-4 md:mb-6 shrink-0">
      <div className="flex items-center space-x-4">
        <button 
          className="lg:hidden p-2 -ml-2 text-slate-500 hover:text-primary transition-colors" 
          onClick={toggleSidebar}
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
        <div className="flex items-center space-x-2">
          <span className="material-symbols-outlined text-primary">videocam</span>
          <div className="flex space-x-2 text-sm">
            <span className="font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase hidden sm:inline">Camera Feed</span>
            <span className="font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase sm:hidden">Feed</span>
          </div>
        </div>
      </div>

      {/* STATUS BADGE SECTION */}
      <div className="flex items-center space-x-2 md:space-x-4 text-xs font-bold uppercase tracking-wider">
        
        {/* Dynamic Badge: Changes color based on 'isOnline' */}
        <div className={`flex items-center space-x-2 px-3 py-1 rounded-full border transition-all duration-300
            ${isOnline 
              ? 'bg-purpleAccent text-primary border-primary/20' 
              : 'bg-red-500/10 text-red-500 border-red-500/20'
            }`}>
          
          {/* Pulsing Dot */}
          <span className={`w-2 h-2 rounded-full animate-pulse ${isOnline ? 'bg-primary' : 'bg-red-500'}`}></span>
          
          {/* Text Label */}
          <span className="hidden sm:inline">
            {isOnline ? 'Monitoring' : 'Offline'}
          </span>
          <span className="sm:hidden">
            {isOnline ? 'Live' : 'Off'}
          </span>
        </div>

        {/* FPS Counter - Only show when online */}
        {isOnline && (
          <div className="text-slate-400 dark:text-slate-500 hidden sm:block">
            FPS: <span className="text-slate-600 dark:text-slate-300">30</span>
          </div>
        )}
      </div>
    </header>
  );
};