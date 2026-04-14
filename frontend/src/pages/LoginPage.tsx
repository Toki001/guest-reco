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
    <div className="min-h-screen bg-[#1a0a4a] flex items-center justify-center">
      <div className="w-full max-w-sm bg-[#2B0E72] rounded-2xl p-8 shadow-2xl border border-white/[0.08]">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#2EA3F2] to-[#0C71C3] flex items-center justify-center mx-auto mb-3 shadow-lg shadow-[#2EA3F2]/20">
            <span className="material-symbols-outlined text-3xl text-white">shield</span>
          </div>
          <h1 className="text-white font-bold text-xl">SecureSight</h1>
          <p className="text-blue-300/60 text-[11px] uppercase tracking-[0.2em] mt-1 font-semibold">
            FSUU Facial Recognition
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-blue-200/70 text-xs font-medium block mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoFocus
              className="w-full bg-[#1a0a4a] border border-white/[0.12] rounded-lg px-3 py-2.5 text-white text-sm focus:border-[#2EA3F2] focus:outline-none transition-colors placeholder:text-white/30"
              placeholder="admin"
            />
          </div>

          <div>
            <label className="text-blue-200/70 text-xs font-medium block mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-[#1a0a4a] border border-white/[0.12] rounded-lg px-3 py-2.5 text-white text-sm focus:border-[#2EA3F2] focus:outline-none transition-colors placeholder:text-white/30"
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
              loading ? 'bg-[#2EA3F2]/50 cursor-not-allowed' : 'bg-[#2EA3F2] hover:bg-[#0C71C3]'
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
