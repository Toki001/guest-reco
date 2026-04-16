import { useState, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import DashboardTab from '../components/DashboardTab';
import CameraGridPage from './CameraGridPage';
import EmployeesPage from './EmployeesPage';
import SettingsModal from '../components/SettingsModal';

const EmployeeProfilePage = lazy(() => import('./EmployeeProfilePage'));
const AttendancePage = lazy(() => import('./AttendancePage'));
const VisitorsPage = lazy(() => import('./VisitorsPage'));

function MainApp() {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const toggleMobileSidebar = () => setSidebarOpen(!isSidebarOpen);
  const toggleDesktopCollapse = () => setSidebarCollapsed(!isSidebarCollapsed);

  return (
    <div className="h-screen w-full flex overflow-hidden" style={{ backgroundColor: 'var(--bg-base)', backgroundImage: 'var(--mesh-gradient)', color: 'var(--text-primary)' }}>
      {/* Sidebar — always on the LEFT */}
      <Sidebar
        isOpen={isSidebarOpen}
        isCollapsed={isSidebarCollapsed}
        toggleMobile={toggleMobileSidebar}
        toggleCollapse={toggleDesktopCollapse}
        onSettingsClick={() => setShowSettings(true)}
      />

      {/* Main content */}
      <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        <div className="px-6 pt-5 shrink-0">
          <Header toggleSidebar={toggleMobileSidebar} />
        </div>

        <div className="flex-1 px-6 pb-6 min-h-0 overflow-y-auto">
          <Routes>
            <Route path="dashboard" element={<DashboardTab />} />
            <Route path="cameras" element={<CameraGridPage />} />
            <Route path="employees" element={<EmployeesPage />} />
            <Route path="employees/:id" element={<Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" /></div>}><EmployeeProfilePage /></Suspense>} />
            <Route path="visitors" element={<Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" /></div>}><VisitorsPage /></Suspense>} />
            <Route path="attendance" element={<Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" /></div>}><AttendancePage /></Suspense>} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default MainApp;
