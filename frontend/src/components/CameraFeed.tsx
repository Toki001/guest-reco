import React, { useEffect, useRef, useState } from 'react';
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import { API_BASE, WS_BASE } from '../config';

interface CameraFeedProps {
  isScanning: boolean;
  onSnap: (results: { name: string; type: 'guest' | 'employee'; confidence: number; image_url?: string; status?: string; user_id?: string; skipped?: boolean }[]) => void;
  onToggle: () => void;
  onStatusChange?: (online: boolean) => void;
  cameraId?: string;
  apiKey?: string;
  children?: React.ReactNode;
}

export const CameraFeed: React.FC<CameraFeedProps> = ({ isScanning, onSnap, onToggle, onStatusChange, cameraId, apiKey, children }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);

  const [isOnline, setIsOnline] = useState(false);
  const [scanStatus, setScanStatus] = useState<'idle' | 'analyzing'>('idle');

  const isScanningRef = useRef(isScanning);
  const isAnalyzingRef = useRef(false);
  const anchorsRef = useRef<{ x: number, y: number }[]>([]);
  const stillStartTimeRef = useRef<number | null>(null);
  const requestRef = useRef<number>(0);
  const REQUIRED_STILL_TIME = 1;

  useEffect(() => {
    isScanningRef.current = isScanning;

    if (videoRef.current) {
      if (isScanning) {
        videoRef.current.play().catch(e => console.error("Play error:", e));
      } else {
        videoRef.current.pause();
        anchorsRef.current = [];
        stillStartTimeRef.current = null;
        if (overlayCanvasRef.current) {
          const ctx = overlayCanvasRef.current.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
          }
        }
      }
    }
  }, [isScanning]);

  useEffect(() => {
    let faceDetector: FaceDetector;
    let videoStream: MediaStream;

    const initializeSystem = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks("/mediapipe-wasm");

        faceDetector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "/models/blaze_face_short_range.tflite",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          minDetectionConfidence: 0.6
        });

        videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } }
        });

        if (videoRef.current) {
          videoRef.current.srcObject = videoStream;
          videoRef.current.onloadedmetadata = () => {
            if (isScanningRef.current) {
              videoRef.current?.play();
            }
            setIsOnline(true);
            if (onStatusChange) onStatusChange(true);

            lastVideoTime = -1;
            requestRef.current = requestAnimationFrame(renderLoop);

            // Set up WebRTC signaling
            if (cameraId && videoStream) {
              const signalUrl = `${WS_BASE}/ws/camera-signal?key=${apiKey || ''}`;
              const signalWs = new WebSocket(signalUrl);
              const peerConnections = new Map<number, RTCPeerConnection>();

              const rtcConfig: RTCConfiguration = {
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
              };

              signalWs.onopen = () => {
                signalWs.send(JSON.stringify({ type: 'camera-register', camera_id: cameraId }));
              };

              signalWs.onmessage = async (event) => {
                try {
                  const msg = JSON.parse(event.data);

                  if (msg.type === 'offer') {
                    // Viewer wants to connect — create peer connection
                    const viewerId = msg.viewer_id;
                    const pc = new RTCPeerConnection(rtcConfig);
                    peerConnections.set(viewerId, pc);

                    // Add local video track
                    videoStream.getTracks().forEach(track => pc.addTrack(track, videoStream));

                    // Send ICE candidates to viewer
                    pc.onicecandidate = (e) => {
                      if (e.candidate && signalWs.readyState === WebSocket.OPEN) {
                        signalWs.send(JSON.stringify({
                          type: 'ice-candidate',
                          viewer_id: viewerId,
                          data: e.candidate.toJSON()
                        }));
                      }
                    };

                    pc.onconnectionstatechange = () => {
                      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                        pc.close();
                        peerConnections.delete(viewerId);
                      }
                    };

                    // Set remote offer and create answer
                    await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);

                    signalWs.send(JSON.stringify({
                      type: 'answer',
                      viewer_id: viewerId,
                      data: pc.localDescription?.toJSON()
                    }));
                  }

                  if (msg.type === 'ice-candidate') {
                    const pc = peerConnections.get(msg.viewer_id);
                    if (pc) {
                      await pc.addIceCandidate(new RTCIceCandidate(msg.data));
                    }
                  }
                } catch (e) {
                  console.error('WebRTC signaling error:', e);
                }
              };

              signalWs.onclose = () => {
                peerConnections.forEach(pc => pc.close());
                peerConnections.clear();
              };

              // Store cleanup
              (videoRef.current as any)._rtcCleanup = () => {
                peerConnections.forEach(pc => pc.close());
                peerConnections.clear();
                signalWs.close();
              };
            }
          };
        }
      } catch (err) {
        console.error("Camera/MediaPipe Initialization Error:", err);
      }
    };

    let lastVideoTime = -1;

    const renderLoop = () => {
      const video = videoRef.current;
      const canvas = overlayCanvasRef.current;

      if (!video || !canvas || !faceDetector) {
        requestRef.current = requestAnimationFrame(renderLoop);
        return;
      }

      if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (isScanningRef.current) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (video.currentTime !== lastVideoTime && !isAnalyzingRef.current) {
          lastVideoTime = video.currentTime;

          const detections = faceDetector.detectForVideo(video, performance.now()).detections;

          if (detections.length > 0) {
            const currentCenters = detections.map(det => {
              const rawX = det.boundingBox!.originX;
              const px = canvas.width - rawX - det.boundingBox!.width;
              return { x: px + det.boundingBox!.width / 2, y: det.boundingBox!.originY + det.boundingBox!.height / 2 };
            });

            const currentTime = Date.now();
            let isMoving = false;

            if (anchorsRef.current.length !== currentCenters.length) {
              anchorsRef.current = currentCenters;
              stillStartTimeRef.current = currentTime;
              isMoving = true;
            } else {
              let maxDrift = 0;
              const sortedCurrent = [...currentCenters].sort((a, b) => a.x - b.x);
              const sortedAnchors = [...anchorsRef.current].sort((a, b) => a.x - b.x);

              for (let i = 0; i < sortedCurrent.length; i++) {
                const drift = Math.sqrt(Math.pow(sortedCurrent[i].x - sortedAnchors[i].x, 2) + Math.pow(sortedCurrent[i].y - sortedAnchors[i].y, 2));
                if (drift > maxDrift) maxDrift = drift;
              }

              isMoving = maxDrift > 120;
            }

            detections.forEach(det => {
              const box = det.boundingBox!;
              const px = canvas.width - box.originX - box.width;

              ctx.lineWidth = 2;
              ctx.font = 'bold 20px Arial';

              if (isMoving) {
                ctx.strokeStyle = 'rgba(239, 68, 68, 1)';
                ctx.strokeRect(px, box.originY, box.width, box.height);
                ctx.fillStyle = 'rgba(239, 68, 68, 1)';
                ctx.fillText('MOVEMENT', px, box.originY - 10);
              } else {
                const timeStill = (currentTime - (stillStartTimeRef.current || currentTime)) / 1000;
                const remaining = Math.max(0, Math.ceil(REQUIRED_STILL_TIME - timeStill));

                ctx.strokeStyle = 'rgba(0, 255, 0, 1)';
                ctx.strokeRect(px, box.originY, box.width, box.height);
                ctx.fillStyle = 'rgba(0, 255, 0, 1)';
                ctx.fillText(`HOLD STILL: ${remaining}`, px, box.originY - 10);
              }
            });

            if (isMoving) {
              anchorsRef.current = currentCenters;
              stillStartTimeRef.current = currentTime;
            } else {
              const timeStill = (currentTime - (stillStartTimeRef.current || currentTime)) / 1000;
              if (timeStill >= REQUIRED_STILL_TIME) {
                captureAndSendAll(detections);
              }
            }
          } else {
            anchorsRef.current = [];
            stillStartTimeRef.current = null;
          }
        }
      }

      requestRef.current = requestAnimationFrame(renderLoop);
    };

    initializeSystem();

    return () => {
      if ((videoRef.current as any)?._rtcCleanup) {
        (videoRef.current as any)._rtcCleanup();
      }
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (faceDetector) faceDetector.close();
      if (videoStream) videoStream.getTracks().forEach(track => track.stop());
      if (onStatusChange) onStatusChange(false);
    };
  }, []);

  const captureAndSendAll = async (detections: any[]) => {
    isAnalyzingRef.current = true;
    setScanStatus('analyzing');

    if (videoRef.current) {
      const video = videoRef.current;

      // Crop all faces into blobs
      const blobs: Blob[] = [];
      for (const det of detections) {
        const box = det.boundingBox;
        const padX = box.width * 0.25;
        const padY = box.height * 0.25;
        const sx = Math.max(0, box.originX - padX);
        const sy = Math.max(0, box.originY - padY);
        const sw = Math.min(video.videoWidth - sx, box.width + padX * 2);
        const sh = Math.min(video.videoHeight - sy, box.height + padY * 2);

        const faceCanvas = document.createElement('canvas');
        faceCanvas.width = sw;
        faceCanvas.height = sh;
        const faceCtx = faceCanvas.getContext('2d');
        if (!faceCtx) continue;
        faceCtx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

        const blob = await new Promise<Blob | null>(resolve =>
          faceCanvas.toBlob(b => resolve(b), 'image/jpeg')
        );
        if (blob) blobs.push(blob);
      }

      if (blobs.length > 0) {
        // Send all face crops in a single batch request
        const formData = new FormData();
        blobs.forEach((blob, i) => formData.append('images', blob, `face_${i}.jpg`));
        if (cameraId) formData.append('camera_id', cameraId);

        try {
          const fetchHeaders: HeadersInit = apiKey ? { 'X-API-Key': apiKey } : {};
          const response = await fetch(`${API_BASE}/api/recognize-batch`, { method: 'POST', body: formData, headers: fetchHeaders });
          const data = await response.json();

          if (response.ok && Array.isArray(data.results)) {
            const validResults = data.results.filter((r: any) => r && !r.skipped && r.status);
            if (validResults.length > 0) {
              onSnap(validResults.map((r: any) => ({
                name: r.message, type: r.type, confidence: r.confidence,
                image_url: r.image_url, status: r.status, user_id: r.user_id, skipped: r.skipped
              })));
            }
          }
        } catch (error) {
          console.error('Batch recognize failed:', error);
        }
      }

      isAnalyzingRef.current = false;
      setScanStatus('idle');
      anchorsRef.current = [];
      stillStartTimeRef.current = null;
    }
  };

  return (
    <div className="relative w-full h-full bg-black rounded-[32px] overflow-hidden shadow-2xl border border-slate-800 flex flex-col items-center justify-center">
      <div className="relative w-full h-full">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 -scale-x-100 ${isOnline ? 'opacity-100' : 'opacity-0'} ${scanStatus === 'analyzing' ? 'blur-sm scale-105' : 'blur-0 scale-100'}`}
        />
        <canvas
          ref={overlayCanvasRef}
          className={`absolute inset-0 w-full h-full object-cover z-10 transition-opacity ${scanStatus === 'analyzing' || !isScanning ? 'opacity-0' : 'opacity-100'}`}
        />
      </div>

      <canvas ref={captureCanvasRef} className="hidden" />

      {scanStatus === 'analyzing' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm transition-all duration-300 animate-in fade-in">
          <div className="relative mb-4">
            <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center animate-pulse"><span className="material-symbols-outlined text-blue-400 text-2xl">group</span></div>
          </div>
          <h2 className="text-white text-xl font-bold tracking-widest animate-pulse drop-shadow-lg">ANALYZING FACES...</h2>
        </div>
      )}

      {(!isOnline || !isScanning) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/50 backdrop-blur-sm">
          <span className="material-symbols-outlined text-5xl text-slate-300 mb-3">{isScanning ? 'cloud_off' : 'videocam_off'}</span>
          <span className="text-slate-200 font-medium text-sm tracking-wide">{isScanning ? 'Stream Offline' : 'Camera Paused'}</span>
        </div>
      )}

      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex items-center gap-6 bg-[#0f0f0f] px-8 py-4 rounded-[32px] border border-white/5 shadow-2xl z-30">
        <span className={`text-[11px] font-mono font-bold uppercase tracking-[0.2em] transition-colors duration-300 ${scanStatus === 'analyzing' ? 'text-blue-400 animate-pulse' : isScanning ? 'text-[#4ade80]' : 'text-amber-500'}`}>
          {scanStatus === 'analyzing' ? 'ANALYZING MULTIPLE...' : (isScanning ? 'AUTO-CAPTURE ACTIVE' : 'SYSTEM PAUSED')}
        </span>
        <div className="w-px h-8 bg-white/10"></div>
        <div className="flex flex-col items-center gap-1 group cursor-pointer" onClick={onToggle}>
          <button className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-95 ${isScanning ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500'}`}>
            <span className="material-symbols-outlined text-white text-2xl">{isScanning ? 'stop' : 'play_arrow'}</span>
          </button>
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider group-hover:text-white transition-colors">{isScanning ? 'Stop' : 'Start'}</span>
        </div>
      </div>

      {children}
    </div>
  );
}
