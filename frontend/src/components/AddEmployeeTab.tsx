import React, { useState, useRef, useEffect } from 'react';
import { authFetch } from '../auth';

const AddEmployeeTab = () => {
  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  
  // New state for webcam
  const [isCameraActive, setIsCameraActive] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // --- WEBCAM FUNCTIONS ---
  const startCamera = async () => {
    try {
      setStatus('');
      // Request webcam access
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraActive(true);
      setPreviewUrl(null); // Clear any existing image
      setImage(null);
    } catch (err) {
      console.error("Error accessing camera:", err);
      setStatus('error: Could not access the webcam. Please ensure you have granted browser permissions.');
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
      
      // Set canvas dimensions to match the video feed
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw the current video frame onto the canvas
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Optional: mirror the canvas context if you mirrored the video element
        // ctx.translate(canvas.width, 0);
        // ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert the canvas drawing into a Blob, then into a File
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], `webcam_${Date.now()}.jpg`, { type: 'image/jpeg' });
            setImage(file);
            setPreviewUrl(URL.createObjectURL(blob));
            stopCamera(); // Turn off the camera after snapping
          }
        }, 'image/jpeg');
      }
    }
  };

  // Cleanup: Stop the camera if the user navigates away from this tab
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // --- EXISTING FORM FUNCTIONS ---
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      stopCamera(); // Stop camera if they decide to upload instead
      setImage(file);
      setPreviewUrl(URL.createObjectURL(file));
      setStatus('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!image || !employeeId || !name) {
      setStatus('error: Please fill out all fields and provide an image.');
      return;
    }

    setIsUploading(true);
    setStatus('uploading: Registering employee to system...');

    const formData = new FormData();
    formData.append('employee_id', employeeId);
    formData.append('name', name);
    formData.append('image', image);

    try {
      const response = await authFetch('/api/employees/add', { method: 'POST', body: formData });

      const data = await response.json();

      if (response.ok) {
        setStatus(`success: ${data.message}`);
        setEmployeeId('');
        setName('');
        setImage(null);
        setPreviewUrl(null);
      } else {
        setStatus(`error: ${data.detail}`);
      }
    } catch (error) {
      console.error("Upload error:", error);
      setStatus('error: Network error occurred while uploading.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex justify-center items-start pt-6 h-full w-full bg-white dark:bg-slate-900 overflow-y-auto pb-10">
      <div className="w-full max-w-3xl px-4 md:px-8">
        
        <h2 className="text-3xl font-bold text-center text-slate-900 dark:text-white mb-10">
          Register New Employee
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-w-xl mx-auto">
          
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-900 dark:text-slate-200 pl-2">
              Employee ID
            </label>
            <input 
              type="text" 
              placeholder="Enter Employee ID"
              value={employeeId} 
              onChange={(e) => setEmployeeId(e.target.value)} 
              required 
              className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-full px-5 py-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-sm"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-900 dark:text-slate-200 pl-2">
              Full Name
            </label>
            <input 
              type="text" 
              placeholder="Enter Full Name"
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              required 
              className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-full px-5 py-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-sm"
            />
          </div>

          {/* Integrated Facial Capture */}
          <div className="flex flex-col gap-2 mt-2">
            <label className="text-sm font-semibold text-slate-900 dark:text-slate-200 pl-2">
              Integrated Facial Capture
            </label>
            
            <div className="relative w-full aspect-[4/3] md:aspect-video bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-600 flex items-center justify-center shadow-inner">
              
              {/* WEBCAM VIDEO ELEMENT */}
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className={`w-full h-full object-cover -scale-x-100 ${isCameraActive ? 'block' : 'hidden'}`}
              />

              {/* HIDDEN CANVAS FOR CAPTURING FRAME */}
              <canvas ref={canvasRef} className="hidden" />

              {/* Image Preview (Only show if camera is OFF and we have an image) */}
              {!isCameraActive && previewUrl && (
                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
              )}

              {/* Placeholder (Only show if camera is OFF and no image) */}
              {!isCameraActive && !previewUrl && (
                <div className="flex flex-col items-center text-slate-400 dark:text-slate-500">
                  <svg className="w-12 h-12 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                  <span>No image selected</span>
                </div>
              )}

              {/* Overlay Controls */}
              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 px-4">
                {isCameraActive ? (
                  <>
                    <button 
                      type="button" 
                      onClick={capturePhoto}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 px-4 rounded-xl shadow-md transition-colors flex-1 max-w-[180px]"
                    >
                      Snap Photo
                    </button>
                    <button 
                      type="button" 
                      onClick={stopCamera}
                      className="bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 px-4 rounded-xl shadow-md transition-colors flex-1 max-w-[180px]"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      type="button" 
                      onClick={startCamera}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-xl shadow-md transition-colors flex-1 max-w-[180px]"
                    >
                      Take Photo
                    </button>
                    <button 
                      type="button" 
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-white hover:bg-slate-50 text-slate-800 font-medium py-2.5 px-4 rounded-xl shadow-md border border-slate-200 transition-colors flex-1 max-w-[180px] flex items-center justify-center gap-2"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      Upload
                    </button>
                  </>
                )}

                <input 
                  type="file" 
                  accept="image/*" 
                  ref={fileInputRef}
                  onChange={handleImageChange} 
                  className="hidden"
                />
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isUploading}
            className={`w-full text-white font-bold text-lg py-3.5 rounded-full shadow-md mt-4 transition-colors ${
              isUploading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isUploading ? 'Registering...' : 'Register Employee'}
          </button>

        </form>

        {status && (
          <div className={`mt-6 p-4 rounded-xl text-center font-medium max-w-xl mx-auto ${
            status.startsWith('success') ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 
            status.startsWith('uploading') ? 'bg-blue-50 text-blue-800 border border-blue-200' :
            'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {status.substring(status.indexOf(':') + 1).trim()}
          </div>
        )}

      </div>
    </div>
  );
};

export default AddEmployeeTab;