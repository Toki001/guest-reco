import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../config';
import { setToken } from '../auth';

function LoginPage() {
  const navigate = useNavigate();
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

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
      <div className="w-full max-w-sm bg-[#1e293b] rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <span className="material-symbols-outlined text-4xl text-slate-200 mb-2 block">shield</span>
          <h1 className="text-white font-bold text-xl">SecureSight</h1>
          <p className="text-slate-500 text-[11px] uppercase tracking-[0.2em] mt-1 font-semibold">
            FSUU Facial Recognition
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-slate-400 text-xs font-medium block mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoFocus
              className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-blue-500 focus:outline-none transition-colors"
              placeholder="admin"
            />
          </div>

          <div>
            <label className="text-slate-400 text-xs font-medium block mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-blue-500 focus:outline-none transition-colors"
              placeholder="Enter password"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2.5 rounded-lg font-bold text-sm text-white transition-colors ${
              loading ? 'bg-blue-500/50 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
