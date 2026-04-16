import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authFetch } from '../auth';
import { API_BASE } from '../config';

interface SearchResult {
  type: 'person' | 'camera';
  id: string;
  name: string;
  image_url?: string;
  role?: string;
  is_online?: number;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const debounceRef = useRef<number>(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const doSearch = useCallback((q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    authFetch(`/api/search?q=${encodeURIComponent(q)}&limit=10`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { setResults(data); setSelected(0); })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => doSearch(val), 250);
  };

  const handleSelect = (result: SearchResult) => {
    onClose();
    if (result.type === 'person') {
      navigate(`/employees/${result.id}`);
    } else if (result.type === 'camera') {
      navigate('/cameras');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(s => Math.min(s + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(s => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && results[selected]) {
      handleSelect(results[selected]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-2xl overflow-hidden"
        style={{
          background: 'var(--glass-bg-strong)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid var(--glass-border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
          animation: 'fade-in 0.15s ease-out',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--glass-border)]">
          <span className="material-symbols-outlined text-[var(--accent)] text-xl">search</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search employees, visitors, cameras..."
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono text-[var(--text-muted)] border border-[var(--glass-border)] bg-white/[0.04]">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[300px] overflow-y-auto glass-scrollbar">
          {loading && (
            <div className="px-5 py-4 text-center text-[var(--text-muted)] text-xs">Searching...</div>
          )}
          {!loading && query && results.length === 0 && (
            <div className="px-5 py-8 text-center text-[var(--text-muted)] text-xs">
              <span className="material-symbols-outlined text-2xl opacity-30 block mb-1">search_off</span>
              No results for "{query}"
            </div>
          )}
          {results.map((r, i) => {
            const imgSrc = r.image_url && r.image_url.startsWith('/') ? `${API_BASE}${r.image_url}` : r.image_url;
            return (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => handleSelect(r)}
                className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${
                  i === selected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
                }`}
              >
                {r.type === 'person' ? (
                  imgSrc ? (
                    <img src={imgSrc} alt={r.name} className="w-8 h-8 rounded-lg object-cover border border-[var(--glass-border)]" />
                  ) : (
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${r.role === 'Guest' ? 'bg-amber-500/15' : 'bg-blue-500/15'}`}>
                      <span className={`material-symbols-outlined text-sm ${r.role === 'Guest' ? 'text-amber-400' : 'text-blue-400'}`}>person</span>
                    </div>
                  )
                ) : (
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${r.is_online ? 'bg-emerald-500/15' : 'bg-white/[0.06]'}`}>
                    <span className={`material-symbols-outlined text-sm ${r.is_online ? 'text-emerald-400' : 'text-slate-500'}`}>videocam</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">{r.name}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {r.type === 'person' ? r.role : (r.is_online ? 'Online' : 'Offline')} · {r.id}
                  </p>
                </div>
                <span className="material-symbols-outlined text-sm text-[var(--text-muted)]">arrow_forward</span>
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        {!query && (
          <div className="px-5 py-3 border-t border-[var(--glass-border)] flex items-center gap-4 text-[10px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded border border-[var(--glass-border)] bg-white/[0.04] font-mono">↑↓</kbd> Navigate</span>
            <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded border border-[var(--glass-border)] bg-white/[0.04] font-mono">↵</kbd> Select</span>
            <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded border border-[var(--glass-border)] bg-white/[0.04] font-mono">esc</kbd> Close</span>
          </div>
        )}
      </div>
    </div>
  );
}
