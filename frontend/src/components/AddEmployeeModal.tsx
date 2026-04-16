import { useState, useRef, useEffect } from 'react';
import { authFetch } from '../auth';

interface AddEmployeeModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface BatchEntry {
  id: string;
  employeeId: string;
  name: string;
  role: string;
  file: File;
  previewUrl: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  message?: string;
}

export default function AddEmployeeModal({ onClose, onSuccess }: AddEmployeeModalProps) {
  const [tab, setTab] = useState<'single' | 'batch'>('single');

  // ─── Single registration state ────────────────────────
  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('Employee');
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ─── Batch state ──────────────────────────────────────
  const [batchEntries, setBatchEntries] = useState<BatchEntry[]>([]);
  const [batchUploading, setBatchUploading] = useState(false);
  const batchFileRef = useRef<HTMLInputElement>(null);

  const startCamera = async () => {
    try {
      setStatus('');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setIsCameraActive(true);
      setPreviewUrl(null);
      setImage(null);
    } catch {
      setStatus('error: Could not access the webcam.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], `webcam_${Date.now()}.jpg`, { type: 'image/jpeg' });
            setImage(file);
            setPreviewUrl(URL.createObjectURL(blob));
            stopCamera();
          }
        }, 'image/jpeg');
      }
    }
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      stopCamera();
      setImage(file);
      setPreviewUrl(URL.createObjectURL(file));
      setStatus('');
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!image || !employeeId || !name) {
      setStatus('error: Please fill out all fields and provide an image.');
      return;
    }
    setIsUploading(true);
    setStatus('uploading: Registering employee...');
    const formData = new FormData();
    formData.append('employee_id', employeeId);
    formData.append('name', name);
    formData.append('role', role);
    formData.append('image', image);
    try {
      const response = await authFetch('/api/employees/add', { method: 'POST', body: formData });
      const data = await response.json();
      if (response.ok) {
        setStatus(`success: ${data.message}`);
        setTimeout(() => { onSuccess(); onClose(); }, 1000);
      } else {
        setStatus(`error: ${data.detail}`);
      }
    } catch {
      setStatus('error: Network error occurred.');
    } finally {
      setIsUploading(false);
    }
  };

  // ─── Batch handlers ───────────────────────────────────
  const handleBatchFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newEntries: BatchEntry[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      newEntries.push({
        id: `${Date.now()}-${i}`,
        employeeId: `EMP-${String(batchEntries.length + i + 1).padStart(3, '0')}`,
        name: baseName.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        role: 'Employee',
        file,
        previewUrl: URL.createObjectURL(file),
        status: 'pending',
      });
    }
    setBatchEntries(prev => [...prev, ...newEntries]);
    e.target.value = '';
  };

  const updateBatchEntry = (id: string, updates: Partial<BatchEntry>) => {
    setBatchEntries(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  const removeBatchEntry = (id: string) => {
    setBatchEntries(prev => prev.filter(e => e.id !== id));
  };

  const handleBatchUpload = async () => {
    const pending = batchEntries.filter(e => e.status === 'pending' || e.status === 'error');
    if (pending.length === 0) return;
    setBatchUploading(true);

    for (const entry of pending) {
      updateBatchEntry(entry.id, { status: 'uploading' });
      const formData = new FormData();
      formData.append('employee_id', entry.employeeId);
      formData.append('name', entry.name);
      formData.append('role', entry.role);
      formData.append('image', entry.file);
      try {
        const res = await authFetch('/api/employees/add', { method: 'POST', body: formData });
        if (res.ok) {
          updateBatchEntry(entry.id, { status: 'success', message: 'Registered' });
        } else {
          const data = await res.json();
          updateBatchEntry(entry.id, { status: 'error', message: data.detail || 'Failed' });
        }
      } catch {
        updateBatchEntry(entry.id, { status: 'error', message: 'Network error' });
      }
    }

    setBatchUploading(false);
    onSuccess();
  };

  const pendingCount = batchEntries.filter(e => e.status === 'pending' || e.status === 'error').length;
  const successCount = batchEntries.filter(e => e.status === 'success').length;

  // ─── Shared glass styles ──────────────────────────────
  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--glass-border)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-lg mx-4 max-h-[90vh] flex flex-col rounded-2xl overflow-hidden page-enter"
        style={{
          background: 'var(--glass-bg-strong)',
          backdropFilter: 'blur(24px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
          border: '1px solid var(--glass-border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Register Employee</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <span className="material-symbols-outlined text-[var(--text-muted)] text-xl">close</span>
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex px-6 pt-4 gap-1">
          {(['single', 'batch'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                tab === t
                  ? 'bg-[var(--accent)] text-white shadow-md'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/[0.06]'
              }`}
            >
              {t === 'single' ? 'Single' : 'Batch Upload'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 glass-scrollbar">

          {/* ─── SINGLE TAB ──────────────────────── */}
          {tab === 'single' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1.5">Employee ID</label>
                  <input type="text" placeholder="e.g. EMP-001" value={employeeId} onChange={e => setEmployeeId(e.target.value)} required
                    className="w-full rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-1 focus:ring-[var(--accent)] transition-all"
                    style={inputStyle} />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1.5">Full Name</label>
                  <input type="text" placeholder="John Doe" value={name} onChange={e => setName(e.target.value)} required
                    className="w-full rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-1 focus:ring-[var(--accent)] transition-all"
                    style={inputStyle} />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1.5">Role</label>
                <select value={role} onChange={e => setRole(e.target.value)}
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)] transition-all"
                  style={inputStyle}>
                  <option value="Employee">Employee</option>
                  <option value="Guest">Guest</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1.5">Face Photo</label>
                <div className="relative w-full aspect-video rounded-xl overflow-hidden" style={{ ...inputStyle, background: 'rgba(0,0,0,0.2)' }}>
                  <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover -scale-x-100 ${isCameraActive ? 'block' : 'hidden'}`} />
                  <canvas ref={canvasRef} className="hidden" />
                  {!isCameraActive && previewUrl && <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />}
                  {!isCameraActive && !previewUrl && (
                    <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
                      <span className="material-symbols-outlined text-4xl opacity-30 mb-2">photo_camera</span>
                      <span className="text-xs">No image selected</span>
                    </div>
                  )}
                  <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2 px-4">
                    {isCameraActive ? (
                      <>
                        <button type="button" onClick={capturePhoto}
                          className="px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all"
                          style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}>
                          Snap Photo
                        </button>
                        <button type="button" onClick={stopCamera}
                          className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-500/80 hover:bg-red-500 transition-all">
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={startCamera}
                          className="px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all"
                          style={{ background: 'linear-gradient(135deg, #2EA3F2, #0C71C3)', boxShadow: '0 4px 12px rgba(46,163,242,0.3)' }}>
                          Take Photo
                        </button>
                        <button type="button" onClick={() => fileInputRef.current?.click()}
                          className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-primary)] transition-all"
                          style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid var(--glass-border)' }}>
                          Upload
                        </button>
                      </>
                    )}
                    <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageChange} className="hidden" />
                  </div>
                </div>
              </div>

              <button type="submit" disabled={isUploading}
                className="w-full py-2.5 rounded-xl font-bold text-sm text-white transition-all"
                style={{
                  background: isUploading ? 'rgba(46,163,242,0.3)' : 'linear-gradient(135deg, #2EA3F2, #0C71C3)',
                  boxShadow: isUploading ? 'none' : '0 4px 16px rgba(46,163,242,0.3)',
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                }}>
                {isUploading ? 'Registering...' : 'Register Employee'}
              </button>

              {status && (
                <div className={`p-3 rounded-xl text-center text-sm font-medium ${
                  status.startsWith('success') ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20' :
                  status.startsWith('uploading') ? 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20' :
                  'bg-red-500/10 text-red-400 ring-1 ring-red-500/20'
                }`}>
                  {status.substring(status.indexOf(':') + 1).trim()}
                </div>
              )}
            </form>
          )}

          {/* ─── BATCH TAB ───────────────────────── */}
          {tab === 'batch' && (
            <div className="space-y-4">
              <p className="text-xs text-[var(--text-muted)]">
                Select multiple face photos. Each file becomes an employee entry — edit ID and name before uploading.
              </p>

              <button type="button" onClick={() => batchFileRef.current?.click()}
                className="w-full py-6 rounded-xl text-sm font-medium text-[var(--text-muted)] transition-all flex flex-col items-center gap-2"
                style={{ ...inputStyle, borderStyle: 'dashed' }}>
                <span className="material-symbols-outlined text-2xl opacity-40">upload_file</span>
                Click to select images
              </button>
              <input type="file" accept="image/*" multiple ref={batchFileRef} onChange={handleBatchFiles} className="hidden" />

              {batchEntries.length > 0 && (
                <div className="space-y-2">
                  {batchEntries.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-3 p-2.5 rounded-xl transition-all"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)' }}>
                      <img src={entry.previewUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 border border-[var(--glass-border)]" />
                      <div className="flex-1 min-w-0 grid grid-cols-2 gap-1.5">
                        <input
                          type="text"
                          value={entry.employeeId}
                          onChange={e => updateBatchEntry(entry.id, { employeeId: e.target.value })}
                          disabled={entry.status === 'uploading' || entry.status === 'success'}
                          className="rounded-lg px-2 py-1 text-[11px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none disabled:opacity-50"
                          style={inputStyle}
                          placeholder="ID"
                        />
                        <input
                          type="text"
                          value={entry.name}
                          onChange={e => updateBatchEntry(entry.id, { name: e.target.value })}
                          disabled={entry.status === 'uploading' || entry.status === 'success'}
                          className="rounded-lg px-2 py-1 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none disabled:opacity-50"
                          style={inputStyle}
                          placeholder="Name"
                        />
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        {entry.status === 'pending' && (
                          <button onClick={() => removeBatchEntry(entry.id)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                            <span className="material-symbols-outlined text-[var(--text-muted)] text-base">close</span>
                          </button>
                        )}
                        {entry.status === 'uploading' && (
                          <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                        )}
                        {entry.status === 'success' && (
                          <span className="material-symbols-outlined text-emerald-400 text-base">check_circle</span>
                        )}
                        {entry.status === 'error' && (
                          <span className="material-symbols-outlined text-red-400 text-base" title={entry.message}>error</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {batchEntries.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {pendingCount} pending · {successCount} registered
                  </span>
                  <button
                    onClick={handleBatchUpload}
                    disabled={batchUploading || pendingCount === 0}
                    className="px-4 py-2 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-40"
                    style={{
                      background: batchUploading || pendingCount === 0 ? 'rgba(46,163,242,0.3)' : 'linear-gradient(135deg, #2EA3F2, #0C71C3)',
                      boxShadow: batchUploading || pendingCount === 0 ? 'none' : '0 4px 16px rgba(46,163,242,0.3)',
                      cursor: batchUploading || pendingCount === 0 ? 'not-allowed' : 'pointer',
                    }}>
                    {batchUploading ? 'Uploading...' : `Register ${pendingCount} Employee${pendingCount !== 1 ? 's' : ''}`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
