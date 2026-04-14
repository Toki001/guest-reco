import { useState, useEffect } from 'react';
import { authFetch } from '../auth';

interface Settings {
  movement_threshold: number;
  still_time_short: number;
  still_time_long: number;
  cooldown_seconds: number;
  min_face_width: number;
  large_face_threshold: number;
}

const DEFAULTS: Settings = {
  movement_threshold: 160,
  still_time_short: 1.0,
  still_time_long: 2.0,
  cooldown_seconds: 10,
  min_face_width: 80,
  large_face_threshold: 150,
};

interface SettingsModalProps {
  onClose: () => void;
}

function SettingsModal({ onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await authFetch('/api/settings');
        if (res.ok) setSettings(await res.json());
      } catch (e) {
        console.error('Failed to fetch settings:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await authFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSettings(await res.json());
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (e) {
      console.error('Failed to save settings:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => setSettings(DEFAULTS);

  const update = (key: keyof Settings, value: number) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const fields: { key: keyof Settings; label: string; description: string; min: number; max: number; step: number; unit: string }[] = [
    { key: 'movement_threshold', label: 'Movement Threshold', description: 'Max pixel drift before "HOLD STILL" triggers. Lower = more sensitive.', min: 20, max: 500, step: 10, unit: 'px' },
    { key: 'still_time_short', label: 'Countdown (Close Face)', description: 'Seconds to hold still before capture when face is large/close.', min: 0.5, max: 10, step: 0.5, unit: 's' },
    { key: 'still_time_long', label: 'Countdown (Far Face)', description: 'Seconds to hold still before capture when face is smaller/farther.', min: 0.5, max: 10, step: 0.5, unit: 's' },
    { key: 'cooldown_seconds', label: 'Scan Cooldown', description: 'Seconds before the same person can be scanned again.', min: 1, max: 60, step: 1, unit: 's' },
    { key: 'min_face_width', label: 'Min Face Width', description: 'Minimum detected face width in pixels to be considered valid.', min: 20, max: 200, step: 5, unit: 'px' },
    { key: 'large_face_threshold', label: 'Large Face Threshold', description: 'Face width above this uses the shorter countdown timer.', min: 50, max: 300, step: 10, unit: 'px' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-blue-500">settings</span>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Camera Settings</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[var(--bg-surface-hover)] rounded-lg transition-colors">
            <span className="material-symbols-outlined text-slate-400 text-xl">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-5">
              {fields.map(f => (
                <div key={f.key}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-semibold text-[var(--text-primary)]">{f.label}</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        value={settings[f.key]}
                        onChange={e => update(f.key, parseFloat(e.target.value) || 0)}
                        min={f.min}
                        max={f.max}
                        step={f.step}
                        className="w-20 px-2 py-1 text-right text-sm font-mono bg-[var(--bg-base)] border border-[var(--border-color)] rounded-lg outline-none focus:border-blue-500 transition-colors"
                      />
                      <span className="text-xs text-slate-400 w-6">{f.unit}</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    value={settings[f.key]}
                    onChange={e => update(f.key, parseFloat(e.target.value))}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    className="w-full h-1.5 bg-[var(--bg-surface-hover)] rounded-full appearance-none cursor-pointer accent-blue-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">{f.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border-color)]">
          <button
            onClick={handleReset}
            className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] rounded-lg transition-all"
          >
            Reset to Defaults
          </button>
          <div className="flex items-center gap-2">
            {saved && (
              <span className="text-xs text-emerald-500 font-medium flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                Saved
              </span>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-400 hover:bg-[var(--bg-surface-hover)] rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="px-4 py-2 text-sm font-bold text-white bg-[#2EA3F2] hover:bg-[#0C71C3] rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
