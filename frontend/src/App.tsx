import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { CameraFeed } from './components/CameraFeed';
import { ResultModal } from './components/ResultModal';
import AddEmployeeTab from './components/AddEmployeeTab'; 
import { AccessLog } from './types';

function App() {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'camera' | 'add_employee'>('camera');
  
  // Controls the local CameraFeed component
  const [isScanning, setIsScanning] = useState(false);
  
  // CHANGED: Now expects an array of logs to support multi-face detection
  const [activeResults, setActiveResults] = useState<AccessLog[] | null>(null);
  
  const [isSystemOnline, setIsSystemOnline] = useState(false);

  const toggleMobileSidebar = () => setSidebarOpen(!isSidebarOpen);
  const toggleDesktopCollapse = () => setSidebarCollapsed(!isSidebarCollapsed);

  useEffect(() => {
    setIsScanning(true);
  }, []);

  const handleDismiss = () => {
    setActiveResults(null);
    setIsScanning(true); 
  };

  const handleToggleScan = () => {
    const newState = !isScanning;
    setIsScanning(newState);
    if (!newState) setActiveResults(null); 
  };

  // CHANGED: Accepts an array of results from the multi-face CameraFeed
  const handleResult = (results: { name: string; type: 'guest' | 'employee'; confidence: number; image_url?: string }[]) => {
    if (activeResults) return;
    setIsScanning(false);

    // Map through all detected faces and generate a log for each
    const newLogs: AccessLog[] = results.map(result => ({
        id: Math.random().toString(36).substr(2, 9),
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        status: result.type === 'employee' ? 'in' : 'denied', 
        isUnknown: result.type === 'guest',
        user: {
            name: result.name || (result.type === 'guest' ? 'Unregistered Visitor' : 'Unknown'),
            id: 'LIVE-' + Math.floor(Math.random() * 10000),
            imageUrl: result.image_url && result.image_url.length > 0 
              ? result.image_url 
              : 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y',
            confidence: result.confidence
        }
    }));
    
    setActiveResults(newLogs);
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 h-screen w-full flex flex-col md:flex-row overflow-hidden relative">
      <Sidebar isOpen={isSidebarOpen} isCollapsed={isSidebarCollapsed} toggleMobile={toggleMobileSidebar} toggleCollapse={toggleDesktopCollapse} />

      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <div className="px-4 pt-4 md:px-6 md:pt-6 shrink-0">
            <Header toggleSidebar={toggleMobileSidebar} isOnline={isSystemOnline} />
            
            <div className="flex gap-2 mt-4">
              <button onClick={() => setActiveTab('camera')} className={`px-4 py-2 rounded-md font-medium transition-colors ${activeTab === 'camera' ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'}`}>Live Scanner</button>
              <button onClick={() => setActiveTab('add_employee')} className={`px-4 py-2 rounded-md font-medium transition-colors ${activeTab === 'add_employee' ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'}`}>Add Employee</button>
            </div>
        </div>
        
        <div className="flex-1 p-4 md:p-6 min-h-0 overflow-hidden">
            {activeTab === 'camera' ? (
                // CHANGED: isScanning stops if activeResults exists
                <CameraFeed isScanning={isScanning && !activeResults} onSnap={handleResult} onToggle={handleToggleScan} onStatusChange={setIsSystemOnline}>
                    {/* CHANGED: Passes the array of results to the Modal */}
                    {activeResults && <ResultModal data={activeResults} onDismiss={handleDismiss} />}
                </CameraFeed>
            ) : (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 h-full overflow-y-auto p-6">
                    <AddEmployeeTab /> 
                </div>
            )}
        </div>
      </main>
    </div>
  );
}

export default App;