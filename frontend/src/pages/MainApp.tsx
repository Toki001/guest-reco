import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import AddEmployeeTab from '../components/AddEmployeeTab';
import DashboardTab from '../components/DashboardTab';
import CameraGridPage from './CameraGridPage';

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
            <Route path="admin/add-employee" element={
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 h-full overflow-y-auto p-6">
                <AddEmployeeTab />
              </div>
            } />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default MainApp;
