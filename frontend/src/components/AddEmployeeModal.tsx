import { useState, useRef, useEffect } from 'react';
import { authFetch } from '../auth';

interface AddEmployeeModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddEmployeeModal({ onClose, onSuccess }: AddEmployeeModalProps) {
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

  const startCamera = async () => {
    try {
      setStatus('');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
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
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1000);
      } else {
        setStatus(`error: ${data.detail}`);
      }
    } catch {
      setStatus('error: Network error occurred.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Register New Employee</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <span className="material-symbols-outlined text-slate-500">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1.5">Employee ID</label>
              <input type="text" placeholder="e.g. EMP-001" value={employeeId} onChange={e => setEmployeeId(e.target.value)} required
                className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1.5">Full Name</label>
              <input type="text" placeholder="John Doe" value={name} onChange={e => setName(e.target.value)} required
                className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1.5">Role</label>
            <select value={role} onChange={e => setRole(e.target.value)}
              className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all">
              <option value="Employee">Employee</option>
              <option value="Guest">Guest</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1.5">Face Photo</label>
            <div className="relative w-full aspect-video bg-slate-100 dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-600">
              <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover -scale-x-100 ${isCameraActive ? 'block' : 'hidden'}`} />
              <canvas ref={canvasRef} className="hidden" />
              {!isCameraActive && previewUrl && <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />}
              {!isCameraActive && !previewUrl && (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <span className="material-symbols-outlined text-4xl mb-2">photo_camera</span>
                  <span className="text-sm">No image selected</span>
                </div>
              )}
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2 px-4">
                {isCameraActive ? (
                  <>
                    <button type="button" onClick={capturePhoto} className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors">Snap Photo</button>
                    <button type="button" onClick={stopCamera} className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors">Cancel</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={startCamera} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors">Take Photo</button>
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-300 text-sm font-medium py-2 px-4 rounded-lg border border-slate-300 dark:border-slate-600 transition-colors">Upload</button>
                  </>
                )}
                <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageChange} className="hidden" />
              </div>
            </div>
          </div>

          <button type="submit" disabled={isUploading}
            className={`w-full text-white font-bold py-3 rounded-xl transition-colors ${isUploading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {isUploading ? 'Registering...' : 'Register Employee'}
          </button>

          {status && (
            <div className={`p-3 rounded-lg text-center text-sm font-medium ${
              status.startsWith('success') ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
              status.startsWith('uploading') ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
              'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            }`}>
              {status.substring(status.indexOf(':') + 1).trim()}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
