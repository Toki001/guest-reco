import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../config';
import { setToken } from '../auth';
import { useTheme } from '../ThemeContext';

function LoginPage() {
  const navigate = useNavigate();
  const { theme, toggle: toggleTheme } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('username', username);
      formData.append('password', password);

      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.detail || 'Login failed');
        setLoading(false);
        return;
      }

      const data = await res.json();
      setToken(data.token);
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Network error. Is the server running?');
      setLoading(false);
    }
  };

  const isDark = theme === 'dark';

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden transition-colors duration-300"
      style={{
        background: isDark
          ? 'linear-gradient(135deg, #0a2a5e 0%, #0d1b3e 40%, #111827 100%)'
          : 'linear-gradient(135deg, #dbeafe 0%, #e8edf5 40%, #f0f4f8 100%)',
      }}
    >
      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="absolute top-5 right-5 p-2.5 rounded-xl z-10 transition-all"
        style={{
          background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
        }}
      >
        <span className={`material-symbols-outlined text-lg ${isDark ? 'text-white/70' : 'text-slate-500'}`}>
          {isDark ? 'light_mode' : 'dark_mode'}
        </span>
      </button>

      {/* Decorative orbs */}
      <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full opacity-20 blur-3xl" style={{ background: 'radial-gradient(circle, rgba(46,163,242,0.4), transparent 70%)' }} />
      <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] rounded-full opacity-15 blur-3xl" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.3), transparent 70%)' }} />

      <div
        className="relative w-full max-w-sm rounded-2xl p-8 border transition-colors duration-300"
        style={{
          background: isDark ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(24px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
          boxShadow: isDark
            ? '0 16px 48px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)'
            : '0 16px 48px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7)',
        }}
      >
        <div className="text-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
            style={{
              background: 'linear-gradient(135deg, rgba(46,163,242,0.2), rgba(14,85,180,0.15))',
              border: '1px solid rgba(46,163,242,0.25)',
              boxShadow: '0 0 24px rgba(46,163,242,0.15)',
            }}
          >
            <span className="material-symbols-outlined text-3xl text-blue-400">shield</span>
          </div>
          <h1 className={`font-bold text-xl ${isDark ? 'text-white' : 'text-slate-800'}`}>SecureSight</h1>
          <p className={`text-[11px] uppercase tracking-[0.2em] mt-1 font-semibold ${isDark ? 'text-blue-300/40' : 'text-blue-500/50'}`}>
            FSUU Facial Recognition
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={`text-xs font-medium block mb-1.5 ${isDark ? 'text-blue-200/50' : 'text-slate-500'}`}>Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoFocus
              className={`w-full rounded-xl px-3.5 py-2.5 text-sm focus:outline-none transition-all ${isDark ? 'text-white placeholder:text-white/20' : 'text-slate-800 placeholder:text-slate-400'}`}
              style={{
                background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(46,163,242,0.5)'; e.currentTarget.style.boxShadow = '0 0 16px rgba(46,163,242,0.1)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'; e.currentTarget.style.boxShadow = 'none'; }}
              placeholder="admin"
            />
          </div>

          <div>
            <label className={`text-xs font-medium block mb-1.5 ${isDark ? 'text-blue-200/50' : 'text-slate-500'}`}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className={`w-full rounded-xl px-3.5 py-2.5 text-sm focus:outline-none transition-all ${isDark ? 'text-white placeholder:text-white/20' : 'text-slate-800 placeholder:text-slate-400'}`}
              style={{
                background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(46,163,242,0.5)'; e.currentTarget.style.boxShadow = '0 0 16px rgba(46,163,242,0.1)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'; e.currentTarget.style.boxShadow = 'none'; }}
              placeholder="Enter password"
            />
          </div>

          {error && (
            <div className="rounded-xl px-3.5 py-2.5 text-red-400 text-sm border" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl font-bold text-sm text-white transition-all"
            style={{
              background: loading ? 'rgba(46,163,242,0.3)' : 'linear-gradient(135deg, #2EA3F2, #0C71C3)',
              boxShadow: loading ? 'none' : '0 4px 16px rgba(46,163,242,0.3)',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
