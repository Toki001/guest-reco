import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import DashboardTab from '../components/DashboardTab';
import CameraGridPage from './CameraGridPage';
import EmployeesPage from './EmployeesPage';
import SettingsModal from '../components/SettingsModal';
import { CommandPalette } from '../components/CommandPalette';

const EmployeeProfilePage = lazy(() => import('./EmployeeProfilePage'));
const AttendancePage = lazy(() => import('./AttendancePage'));
const VisitorsPage = lazy(() => import('./VisitorsPage'));

function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return <div key={location.pathname} className="page-enter h-full">{children}</div>;
}

const SuspenseFallback = (
  <div className="flex items-center justify-center h-full page-enter">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-3 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
      <span className="text-xs text-[var(--text-muted)]">Loading...</span>
    </div>
  </div>
);

function MainApp() {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const toggleMobileSidebar = () => setSidebarOpen(!isSidebarOpen);
  const toggleDesktopCollapse = () => setSidebarCollapsed(!isSidebarCollapsed);

  // Cmd+K / Ctrl+K to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(s => !s);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="h-screen w-full flex overflow-hidden" style={{ backgroundColor: 'var(--bg-base)', backgroundImage: 'var(--mesh-gradient)', color: 'var(--text-primary)' }}>
      <Sidebar
        isOpen={isSidebarOpen}
        isCollapsed={isSidebarCollapsed}
        toggleMobile={toggleMobileSidebar}
        toggleCollapse={toggleDesktopCollapse}
        onSettingsClick={() => setShowSettings(true)}
      />

      <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        <div className="px-6 pt-5 shrink-0">
          <Header toggleSidebar={toggleMobileSidebar} onSearchClick={() => setShowSearch(true)} />
        </div>

        <div className="flex-1 px-6 pb-6 min-h-0 overflow-y-auto">
          <PageTransition>
            <Routes>
              <Route path="dashboard" element={<DashboardTab />} />
              <Route path="cameras" element={<CameraGridPage />} />
              <Route path="employees" element={<EmployeesPage />} />
              <Route path="employees/:id" element={<Suspense fallback={SuspenseFallback}><EmployeeProfilePage /></Suspense>} />
              <Route path="visitors" element={<Suspense fallback={SuspenseFallback}><VisitorsPage /></Suspense>} />
              <Route path="attendance" element={<Suspense fallback={SuspenseFallback}><AttendancePage /></Suspense>} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </PageTransition>
        </div>
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <CommandPalette open={showSearch} onClose={() => setShowSearch(false)} />
    </div>
  );
}

export default MainApp;
