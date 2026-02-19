import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { CameraFeed } from './components/CameraFeed';
import { ResultModal } from './components/ResultModal';
import { AccessLog } from './types';

function App() {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Default to false so we don't start scanning until the page loads
  const [isScanning, setIsScanning] = useState(false);
  
  const [activeResult, setActiveResult] = useState<AccessLog | null>(null);
  const [isSystemOnline, setIsSystemOnline] = useState(false);

  const toggleMobileSidebar = () => setSidebarOpen(!isSidebarOpen);
  const toggleDesktopCollapse = () => setSidebarCollapsed(!isSidebarCollapsed);

  // --- 1. NEW HELPER: Tell Python to Pause/Resume ---
  const toggleServerProcessing = async (shouldBeActive: boolean) => {
    try {
        await fetch('http://localhost:5001/toggle_processing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active: shouldBeActive }),
        });
    } catch (error) {
        console.error("Failed to toggle server:", error);
    }
  };

  // --- 2. INITIALIZATION: Start fresh when app loads ---
  useEffect(() => {
    // Reset server to "Paused" state on load, then start
    toggleServerProcessing(true);
    setIsScanning(true);
  }, []);

  // --- 3. HANDLE DISMISS (Close Modal -> Resume Scanning) ---
  const handleDismiss = () => {
    setActiveResult(null);
    setIsScanning(true); 
    toggleServerProcessing(true); // <--- RESUME SERVER
  };

  // --- 4. HANDLE TOGGLE BUTTON (Stop/Start Manually) ---
  const handleToggleScan = () => {
    const newState = !isScanning;
    setIsScanning(newState);
    
    if (!newState) setActiveResult(null); 
    toggleServerProcessing(newState); // <--- TELL SERVER
  };

  // --- 5. HANDLE SNAP (Face Found -> Pause Scanning) ---
  const handleResult = (result: { name: string; type: 'guest' | 'employee'; confidence: number; image_url?: string }) => {
    if (activeResult) return;

    // Pause immediately so we don't snap twice
    setIsScanning(false);
    toggleServerProcessing(false); // <--- PAUSE SERVER

    const newLog: AccessLog = {
        id: Math.random().toString(36).substr(2, 9),
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        status: result.type === 'employee' ? 'granted' : 'denied',
        isUnknown: result.type === 'guest',
        user: {
            name: result.name || (result.type === 'guest' ? 'Unregistered Visitor' : 'Unknown'),
            id: 'LIVE-' + Math.floor(Math.random() * 10000),
            imageUrl: result.image_url && result.image_url.length > 0 
              ? result.image_url 
              : 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y',
            confidence: result.confidence
        }
    };

    setActiveResult(newLog);
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 h-screen w-full flex flex-col md:flex-row overflow-hidden relative">
      <Sidebar 
        isOpen={isSidebarOpen} 
        isCollapsed={isSidebarCollapsed}
        toggleMobile={toggleMobileSidebar}
        toggleCollapse={toggleDesktopCollapse}
      />

      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <div className="px-4 pt-4 md:px-6 md:pt-6 shrink-0">
            <Header toggleSidebar={toggleMobileSidebar} isOnline={isSystemOnline} />
        </div>
        
        <div className="flex-1 p-4 md:p-6 min-h-0 overflow-hidden">
            <CameraFeed 
              isScanning={isScanning && !activeResult} 
              onSnap={handleResult}
              onToggle={handleToggleScan} 
              onStatusChange={setIsSystemOnline}
            >
                {activeResult && (
                    <ResultModal data={activeResult} onDismiss={handleDismiss} />
                )}
            </CameraFeed>
        </div>
      </main>
    </div>
  );
}

export default App;