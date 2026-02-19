import React, { useEffect, useRef, useState } from 'react';

interface CameraFeedProps {
  isScanning: boolean;
  onSnap: (result: { name: string; type: 'guest' | 'employee'; confidence: number; image_url?: string }) => void;
  onToggle: () => void;
  onStatusChange?: (online: boolean) => void;
  children?: React.ReactNode;
}

export const CameraFeed: React.FC<CameraFeedProps> = ({ 
  isScanning, 
  onSnap, 
  onToggle, 
  onStatusChange,
  children
}) => {
  const [isOnline, setIsOnline] = useState(false);
  const [scanStatus, setScanStatus] = useState<string>('idle'); // Track 'scanning', 'idle', 'employee', etc.
  const lastTypeRef = useRef<string>('idle');

  // --- POLL STATUS ---
  useEffect(() => {
    if (!isScanning) return;

    const interval = setInterval(() => {
        fetch('http://localhost:5001/status')
            .then(res => res.json())
            .then(data => {
                // 1. Online Check
                if (!isOnline) {
                    setIsOnline(true);
                    if (onStatusChange) onStatusChange(true);
                }

                // 2. Update Local Status for UI (Blur/Spinner)
                setScanStatus(data.type);
                
                // 3. Check for Result Match
                if (data.type !== lastTypeRef.current) {
                     // If we moved from 'scanning' -> 'employee'/'guest', trigger the result
                     if ((data.type === 'employee' || data.type === 'guest') && isScanning) {
                         onSnap({
                             name: data.message.replace('ACCESS GRANTED: ', '').replace('ALERT: ', ''),
                             type: data.type,
                             confidence: data.confidence,
                             image_url: data.image_url 
                         });
                     }
                     lastTypeRef.current = data.type;
                }
            })
            .catch(() => {
                if (isOnline) {
                    setIsOnline(false);
                    if (onStatusChange) onStatusChange(false);
                }
            });
    }, 500); 
    return () => clearInterval(interval);
  }, [onSnap, isScanning, isOnline, onStatusChange]);

  return (
    <div className="relative w-full h-full bg-black rounded-[32px] overflow-hidden shadow-2xl border border-slate-800 flex flex-col items-center justify-center">
      
      {/* 1. Video Feed Container */}
      <div className="relative w-full h-full">
          {/* Video Image */}
          <img 
            src={isScanning ? "http://localhost:5001/video_feed" : undefined}
            alt="Camera Feed"
            className={`w-full h-full object-cover transition-all duration-500 
              ${isOnline && isScanning ? 'opacity-100' : 'opacity-0'}
              ${scanStatus === 'scanning' ? 'blur-sm scale-105' : 'blur-0 scale-100'} 
            `} 
          />
          
          {/* 2. SCANNING OVERLAY (Only visible when status is 'scanning') */}
          {scanStatus === 'scanning' && (
             <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm transition-all duration-300 animate-in fade-in">
                <div className="relative mb-4">
                   {/* Spinning Ring */}
                   <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                   {/* Pulsing Icon */}
                   <div className="absolute inset-0 flex items-center justify-center animate-pulse">
                      <span className="material-symbols-outlined text-blue-400 text-2xl">face</span>
                   </div>
                </div>
                <h2 className="text-white text-xl font-bold tracking-widest animate-pulse drop-shadow-lg">IDENTIFYING...</h2>
                <p className="text-blue-200 text-xs mt-2 font-mono uppercase tracking-wide">Verifying Biometrics</p>
             </div>
          )}
      </div>

      {/* 3. Offline / Paused State Overlay */}
      {(!isOnline || !isScanning) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
            <span className="material-symbols-outlined text-5xl text-slate-600 mb-3">
                {isScanning ? 'cloud_off' : 'videocam_off'}
            </span>
            <span className="text-slate-500 font-medium text-sm tracking-wide">
                {isScanning ? 'Stream Offline' : 'Camera Paused'}
            </span>
        </div>
      )}

      {/* 4. Bottom Info (Tech Specs) */}
      <div className="absolute bottom-8 right-8 text-right z-10 pointer-events-none">
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
            Flask Stream
        </div>
        <div className="font-mono text-[10px] text-slate-400">
            MJPEG • 640x480
        </div>
      </div>

      {/* 5. Control Bar */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex items-center gap-6 bg-[#0f0f0f] px-8 py-4 rounded-[32px] border border-white/5 shadow-2xl z-30">
        
        {/* Left: Text Indicator */}
        <span className={`text-[11px] font-mono font-bold uppercase tracking-[0.2em] transition-colors duration-300 ${
            scanStatus === 'scanning' ? 'text-blue-400 animate-pulse' : 
            isScanning ? 'text-[#4ade80]' : 'text-amber-500'
        }`}>
            {scanStatus === 'scanning' ? 'ANALYZING...' : (isScanning ? 'AUTO-CAPTURE ACTIVE' : 'SYSTEM PAUSED')}
        </span>

        {/* Divider Line */}
        <div className="w-px h-8 bg-white/10"></div>

        {/* Right: Button Group */}
        <div className="flex flex-col items-center gap-1 group cursor-pointer" onClick={onToggle}>
            <button 
                className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-95 ${
                    isScanning 
                    ? 'bg-red-600 hover:bg-red-500 shadow-lg shadow-red-900/20' 
                    : 'bg-green-600 hover:bg-green-500 shadow-lg shadow-green-900/20'
                }`}
            >
                <span className="material-symbols-outlined text-white text-2xl">
                    {isScanning ? 'stop' : 'play_arrow'}
                </span>
            </button>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider group-hover:text-white transition-colors">
                {isScanning ? 'Stop' : 'Start'}
            </span>
        </div>
      </div>

      {/* 6. Render Popup Modal (Result) */}
      {children} 
      
    </div>
  );
};