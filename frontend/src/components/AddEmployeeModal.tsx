import { useState, useRef, useEffect } from 'react';
import { authFetch } from '../auth';

interface AddEmployeeModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface FileRow {
  employee_id: string;
  name: string;
  role: string;
  status: 'pending' | 'created' | 'skipped';
  reason?: string;
}

export default function AddEmployeeModal({ onClose, onSuccess }: AddEmployeeModalProps) {
  const [tab, setTab] = useState<'single' | 'file'>('single');

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

  // ─── File import state ────────────────────────────────
  const [fileUploading, setFileUploading] = useState(false);
  const [fileStatus, setFileStatus] = useState('');
  const [fileRows, setFileRows] = useState<FileRow[]>([]);
  const [fileStep, setFileStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [editingFileRow, setEditingFileRow] = useState<number | null>(null);
  const csvFileRef = useRef<HTMLInputElement>(null);
  const [rawFileData, setRawFileData] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);

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

  // ─── File import handlers ─────────────────────────────
  const handleFileParse = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRawFileData(file);
    setFileUploading(true);
    setFileStatus('');
    setFileRows([]);

    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await authFetch('/api/employees/batch-upload/preview', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        setFileRows((data.rows || []).map((r: any) => ({ ...r, status: 'pending' as const })));
        setFileStep('preview');
      } else {
        const res2 = await authFetch('/api/employees/batch-upload', { method: 'POST', body: formData });
        const data = await res2.json();
        if (res2.ok) {
          setFileRows((data.results || []).map((r: any) => ({
            employee_id: r.employee_id || '',
            name: r.name || '',
            role: r.role || 'Employee',
            status: r.status === 'created' ? 'created' as const : 'skipped' as const,
            reason: r.reason,
          })));
          setFileStep('done');
          setFileStatus(`success: ${data.message}`);
          onSuccess();
        } else {
          setFileStatus(`error: ${data.detail}`);
        }
      }
    } catch {
      setFileStatus('error: Network error');
    } finally {
      setFileUploading(false);
      if (csvFileRef.current) csvFileRef.current.value = '';
    }
  };

  const handleFileConfirm = async () => {
    if (!rawFileData) return;
    setFileUploading(true);
    const formData = new FormData();
    formData.append('file', rawFileData);
    for (const img of imageFiles) {
      formData.append('images', img);
    }
    try {
      const res = await authFetch('/api/employees/batch-upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        setFileRows((data.results || []).map((r: any) => ({
          employee_id: r.employee_id || '',
          name: r.name || '',
          role: r.role || 'Employee',
          status: r.status === 'created' ? 'created' as const : 'skipped' as const,
          reason: r.reason,
        })));
        setFileStep('done');
        setFileStatus(`success: ${data.message}`);
        onSuccess();
      } else {
        setFileStatus(`error: ${data.detail}`);
      }
    } catch {
      setFileStatus('error: Network error');
    } finally {
      setFileUploading(false);
    }
  };

  const resetFileImport = () => {
    setFileRows([]);
    setFileStatus('');
    setFileStep('upload');
    setRawFileData(null);
    setEditingFileRow(null);
    setImageFiles([]);
  };

  const fileCreated = fileRows.filter(r => r.status === 'created').length;
  const fileSkipped = fileRows.filter(r => r.status === 'skipped').length;

  const inputStyle: React.CSSProperties = {
    background: 'var(--modal-input-bg)',
    border: '1px solid var(--modal-input-border)',
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-xl mx-4 max-h-[90vh] flex flex-col rounded-2xl overflow-hidden page-enter"
        style={{
          background: 'var(--modal-bg)',
          backdropFilter: 'blur(24px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
          border: '1px solid var(--glass-border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.25), var(--glass-inset-highlight)',
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
          {([
            ['single', 'Single', 'person_add'],
            ['file', 'Import File', 'upload_file'],
          ] as const).map(([t, label, icon]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                tab === t
                  ? 'bg-[var(--accent)] text-white shadow-md'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/[0.06]'
              }`}
            >
              <span className="material-symbols-outlined text-sm">{icon}</span>
              {label}
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

          {/* ─── FILE IMPORT TAB ────────────────── */}
          {tab === 'file' && (
            <div className="space-y-4">

              {fileStep === 'upload' && (
                <>
                  <div className="rounded-xl p-3.5" style={{ background: 'rgba(46,163,242,0.08)', border: '1px solid rgba(46,163,242,0.15)' }}>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                      Upload an <strong>Excel (.xlsx)</strong> or <strong>CSV</strong> file. Supported columns:
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {['employee_id / id', 'name / full_name', 'role (optional)'].map(col => (
                        <span key={col} className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-white/[0.08] text-[var(--text-secondary)]">{col}</span>
                      ))}
                    </div>
                  </div>

                  <button type="button" onClick={() => csvFileRef.current?.click()} disabled={fileUploading}
                    className="w-full py-10 rounded-xl text-sm font-medium text-[var(--text-muted)] transition-all flex flex-col items-center gap-3 disabled:opacity-50 hover:bg-white/[0.03]"
                    style={{ ...inputStyle, borderStyle: 'dashed' }}>
                    {fileUploading ? (
                      <div className="w-7 h-7 border-2 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
                    ) : (
                      <span className="material-symbols-outlined text-4xl opacity-30">description</span>
                    )}
                    <span>{fileUploading ? 'Reading file...' : 'Click to select file'}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">.xlsx, .xls, or .csv</span>
                  </button>
                  <input type="file" accept=".xlsx,.xls,.csv" ref={csvFileRef} onChange={handleFileParse} className="hidden" />

                  {fileStatus && fileStatus.startsWith('error') && (
                    <div className="p-3 rounded-xl text-center text-sm font-medium bg-red-500/10 text-red-400 ring-1 ring-red-500/20">
                      {fileStatus.substring(fileStatus.indexOf(':') + 1).trim()}
                    </div>
                  )}
                </>
              )}

              {fileStep === 'preview' && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-[var(--text-secondary)]">
                      <strong>{fileRows.length}</strong> employee{fileRows.length !== 1 ? 's' : ''} found — review before importing
                    </p>
                    <button onClick={resetFileImport} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                      Choose different file
                    </button>
                  </div>

                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--glass-border)' }}>
                    <table className="w-full text-left">
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                          <th className="px-3 py-2 text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">ID</th>
                          <th className="px-3 py-2 text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Name</th>
                          <th className="px-3 py-2 text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Role</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--glass-border)]">
                        {fileRows.slice(0, 50).map((row, i) => (
                          <tr key={i} className="hover:bg-white/[0.03]">
                            <td className="px-3 py-2 text-[11px] font-mono text-[var(--text-primary)]">{row.employee_id || <span className="text-red-400">missing</span>}</td>
                            <td className="px-3 py-2 text-[11px] text-[var(--text-primary)]">{row.name || <span className="text-red-400">missing</span>}</td>
                            <td className="px-3 py-2">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${row.role === 'Guest' ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'}`}>{row.role}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {fileRows.length > 50 && (
                      <div className="px-3 py-2 text-[10px] text-[var(--text-muted)] text-center border-t border-[var(--glass-border)]">
                        ...and {fileRows.length - 50} more
                      </div>
                    )}
                  </div>

                  {/* Photo upload */}
                  <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-[var(--text-muted)]">photo_library</span>
                        <span className="text-[11px] font-semibold text-[var(--text-secondary)]">Attach Photos (optional)</span>
                      </div>
                      {imageFiles.length > 0 && (
                        <span className="text-[10px] text-emerald-400 font-mono">{imageFiles.length} photos</span>
                      )}
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] mb-2">
                      Upload face photos named by employee ID (e.g. <span className="font-mono">22100000463.jpg</span>).
                    </p>
                    <label
                      className="w-full py-3 rounded-lg text-[11px] font-medium text-[var(--text-muted)] transition-all flex items-center justify-center gap-2 hover:bg-white/[0.03] cursor-pointer"
                      style={{ border: '1px dashed var(--glass-border)' }}>
                      <span className="material-symbols-outlined text-base opacity-40">add_photo_alternate</span>
                      {imageFiles.length > 0 ? `${imageFiles.length} photos selected — click to add more` : 'Select photos'}
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png"
                        multiple
                        className="hidden"
                        onChange={e => {
                          if (e.target.files && e.target.files.length > 0) {
                            const newFiles = Array.from(e.target.files);
                            setImageFiles(prev => [...prev, ...newFiles]);
                          }
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {imageFiles.length > 0 && (
                      <div className="mt-2 space-y-1 max-h-32 overflow-y-auto glass-scrollbar">
                        {imageFiles.map((f, i) => (
                          <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded-lg text-[10px]"
                            style={{ background: 'rgba(255,255,255,0.04)' }}>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="material-symbols-outlined text-emerald-400 text-xs">image</span>
                              <span className="text-[var(--text-secondary)] truncate">{f.name}</span>
                            </div>
                            <button type="button" onClick={() => setImageFiles(prev => prev.filter((_, j) => j !== i))}
                              className="text-red-400 hover:text-red-300 ml-2 shrink-0">
                              <span className="material-symbols-outlined text-xs">close</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <button onClick={resetFileImport}
                      className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)' }}>
                      Cancel
                    </button>
                    <button onClick={handleFileConfirm} disabled={fileUploading}
                      className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-50"
                      style={{
                        background: fileUploading ? 'rgba(46,163,242,0.3)' : 'linear-gradient(135deg, #2EA3F2, #0C71C3)',
                        boxShadow: fileUploading ? 'none' : '0 4px 16px rgba(46,163,242,0.3)',
                        cursor: fileUploading ? 'not-allowed' : 'pointer',
                      }}>
                      {fileUploading ? 'Importing...' : `Import ${fileRows.length} Employee${fileRows.length !== 1 ? 's' : ''}`}
                    </button>
                  </div>
                </>
              )}

              {fileStep === 'done' && (
                <>
                  {fileStatus && (
                    <div className={`p-4 rounded-xl text-center ${fileStatus.startsWith('error') ? 'bg-red-500/10 ring-1 ring-red-500/20' : 'bg-emerald-500/10 ring-1 ring-emerald-500/20'}`}>
                      <span className={`material-symbols-outlined text-3xl mb-2 block ${fileStatus.startsWith('error') ? 'text-red-400' : 'text-emerald-400'}`}>
                        {fileStatus.startsWith('error') ? 'error' : 'check_circle'}
                      </span>
                      <p className={`text-sm font-semibold ${fileStatus.startsWith('error') ? 'text-red-400' : 'text-emerald-400'}`}>
                        {fileStatus.substring(fileStatus.indexOf(':') + 1).trim()}
                      </p>
                      {fileCreated > 0 && <p className="text-[11px] text-[var(--text-muted)] mt-1">{fileCreated} created · {fileSkipped} skipped</p>}
                    </div>
                  )}

                  <div className="space-y-1 max-h-52 overflow-y-auto glass-scrollbar">
                    {fileRows.map((r, i) => (
                      <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px]"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)' }}>
                        {r.status === 'created' ? (
                          <span className="material-symbols-outlined text-emerald-400 text-sm shrink-0">check_circle</span>
                        ) : (
                          <span className="material-symbols-outlined text-amber-400 text-sm shrink-0">info</span>
                        )}
                        <span className="font-mono text-[var(--text-secondary)] shrink-0">{r.employee_id || '—'}</span>
                        <span className="text-[var(--text-primary)] flex-1 truncate">{r.name || ''}</span>
                        <span className="text-[var(--text-muted)] shrink-0">
                          {r.status === 'created' ? 'Created' : r.reason || 'Skipped'}
                        </span>
                      </div>
                    ))}
                  </div>

                  <button onClick={resetFileImport}
                    className="w-full py-2.5 rounded-xl font-semibold text-sm text-[var(--text-primary)] transition-all hover:bg-white/[0.06]"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)' }}>
                    Import Another File
                  </button>
                </>
              )}
            </div>
          )}


        </div>
      </div>
    </div>
  );
}
