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
    <div className="bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 h-screen w-full flex flex-col md:flex-row overflow-hidden relative">
      <Sidebar
        isOpen={isSidebarOpen}
        isCollapsed={isSidebarCollapsed}
        toggleMobile={toggleMobileSidebar}
        toggleCollapse={toggleDesktopCollapse}
      />

      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <div className="px-4 pt-4 md:px-6 md:pt-6 shrink-0">
          <Header toggleSidebar={toggleMobileSidebar} />
        </div>

        <div className="flex-1 p-4 md:p-6 min-h-0 overflow-hidden">
          <Routes>
            <Route path="dashboard" element={<DashboardTab />} />
            <Route path="cameras" element={<CameraGridPage />} />
            <Route path="employees" element={<EmployeesPage />} />
            <Route path="employees/:id" element={<Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" /></div>}><EmployeeProfilePage /></Suspense>} />
            <Route path="visitors" element={<Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" /></div>}><VisitorsPage /></Suspense>} />
            <Route path="attendance" element={<Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" /></div>}><AttendancePage /></Suspense>} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default MainApp;
