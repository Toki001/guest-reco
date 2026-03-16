import { useState, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import DashboardTab from '../components/DashboardTab';
import CameraGridPage from './CameraGridPage';
import EmployeesPage from './EmployeesPage';

const EmployeeProfilePage = lazy(() => import('./EmployeeProfilePage'));
const AttendancePage = lazy(() => import('./AttendancePage'));
const VisitorsPage = lazy(() => import('./VisitorsPage'));

function MainApp() {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);

  const toggleMobileSidebar = () => setSidebarOpen(!isSidebarOpen);
  const toggleDesktopCollapse = () => setSidebarCollapsed(!isSidebarCollapsed);

  return (
    <div className="bg-[#0a0b1a] text-slate-100 h-screen w-full flex overflow-hidden">
      {/* Sidebar — always on the LEFT */}
      <Sidebar
        isOpen={isSidebarOpen}
        isCollapsed={isSidebarCollapsed}
        toggleMobile={toggleMobileSidebar}
        toggleCollapse={toggleDesktopCollapse}
      />

      {/* Main content */}
      <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        <div className="px-5 pt-4 shrink-0">
          <Header toggleSidebar={toggleMobileSidebar} />
        </div>

        <div className="flex-1 px-5 pb-5 min-h-0 overflow-hidden">
          <Routes>
            <Route path="dashboard" element={<DashboardTab />} />
            <Route path="cameras" element={<CameraGridPage />} />
            <Route path="employees" element={<EmployeesPage />} />
            <Route path="employees/:id" element={<Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" /></div>}><EmployeeProfilePage /></Suspense>} />
            <Route path="visitors" element={<Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" /></div>}><VisitorsPage /></Suspense>} />
            <Route path="attendance" element={<Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" /></div>}><AttendancePage /></Suspense>} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default MainApp;
