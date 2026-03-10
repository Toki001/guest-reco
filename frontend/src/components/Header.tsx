import React from 'react';

interface HeaderProps {
  toggleSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ toggleSidebar }) => {
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
          <span className="material-symbols-outlined text-primary">shield</span>
          <span className="font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase text-sm">SecureSight</span>
        </div>
      </div>

      <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider">
        <div className="flex items-center space-x-2 px-3 py-1 rounded-full border bg-purpleAccent text-primary border-primary/20">
          <span className="w-2 h-2 rounded-full animate-pulse bg-primary"></span>
          <span className="hidden sm:inline">Admin Panel</span>
        </div>
      </div>
    </header>
  );
};
