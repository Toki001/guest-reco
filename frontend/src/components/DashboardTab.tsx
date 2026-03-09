import React from 'react';

const DashboardTab = () => {
  return (
    <div className="flex flex-col h-full w-full bg-slate-50/50 dark:bg-slate-900 overflow-y-auto pb-10">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard Overview</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Real-time surveillance summary and facility status.</p>
        </div>
        
        <div className="flex items-center gap-3 mt-4 md:mt-0">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
            <input 
              type="text" 
              placeholder="Search data..." 
              className="pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64 shadow-sm"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium shadow-sm hover:bg-slate-50 transition-colors">
            <span className="material-symbols-outlined text-sm">calendar_today</span>
            Today
          </button>
          <button className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm hover:bg-slate-50 transition-colors">
            <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">notifications</span>
          </button>
        </div>
      </div>

      {/* 4 METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6">
        {/* Card 1 */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium">Total Scans</h3>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center">
              <span className="material-symbols-outlined text-sm">center_focus_strong</span>
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white mb-2">15,842</div>
          <div className="flex items-center text-xs">
            <span className="text-emerald-500 font-bold flex items-center"><span className="material-symbols-outlined text-[14px] mr-1">trending_up</span>+8.4%</span>
            <span className="text-slate-400 ml-2">from yesterday</span>
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium">Employee Matches</h3>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-500 flex items-center justify-center">
              <span className="material-symbols-outlined text-sm">badge</span>
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white mb-2">12,150</div>
          <div className="flex items-center text-xs">
            <span className="text-emerald-500 font-bold flex items-center"><span className="material-symbols-outlined text-[14px] mr-1">trending_up</span>+12%</span>
            <span className="text-slate-400 ml-2">from yesterday</span>
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium">Guest Alerts</h3>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center">
              <span className="material-symbols-outlined text-sm">person_alert</span>
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white mb-2">142</div>
          <div className="flex items-center text-xs">
            <span className="text-red-500 font-bold flex items-center"><span className="material-symbols-outlined text-[14px] mr-1">trending_up</span>+3.2%</span>
            <span className="text-slate-400 ml-2">from yesterday</span>
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium">System Health</h3>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-500 flex items-center justify-center">
              <span className="material-symbols-outlined text-sm">hub</span>
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white mb-2">98%</div>
          <div className="flex items-center text-xs">
            <span className="text-emerald-500 font-bold flex items-center"><div className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></div>All cameras active</span>
          </div>
        </div>
      </div>

      {/* CHARTS & CAMERAS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Chart Area */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">Access Activity</h3>
              <p className="text-xs text-slate-500">Weekly traffic across all entry points</p>
            </div>
            <div className="flex gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500"></div>Main Entry</div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-purple-400"></div>Staff Entry</div>
            </div>
          </div>
          {/* MOCK SVG CHART */}
          <div className="flex-1 w-full min-h-[200px] relative border-b border-slate-100 dark:border-slate-700 flex items-end pb-4">
             {/* Y Axis Guides */}
             <div className="absolute inset-0 flex flex-col justify-between text-[10px] text-slate-400 pointer-events-none">
                <span>700</span><span>500</span><span>300</span><span>100</span><span>0</span>
             </div>
             {/* Lines */}
             <svg className="absolute left-8 right-0 top-4 bottom-4 w-[calc(100%-2rem)] h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                {/* Blue Line */}
                <path d="M 0 50 C 20 20, 30 70, 50 40 S 70 80, 80 80 S 90 60, 100 60" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
                <path d="M 0 50 C 20 20, 30 70, 50 40 S 70 80, 80 80 S 90 60, 100 60 L 100 100 L 0 100 Z" fill="url(#blue-gradient)" opacity="0.1" />
                
                {/* Purple Line */}
                <path d="M 0 70 C 20 60, 30 80, 50 60 S 70 95, 80 95 S 90 85, 100 85" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" />
                
                {/* Points */}
                <circle cx="0" cy="50" r="1.5" fill="white" stroke="#3b82f6" strokeWidth="1"/>
                <circle cx="20" cy="30" r="1.5" fill="white" stroke="#3b82f6" strokeWidth="1"/>
                <circle cx="50" cy="40" r="1.5" fill="white" stroke="#3b82f6" strokeWidth="1"/>
                <circle cx="80" cy="80" r="1.5" fill="white" stroke="#3b82f6" strokeWidth="1"/>
                <circle cx="100" cy="60" r="1.5" fill="white" stroke="#3b82f6" strokeWidth="1"/>

                <defs>
                  <linearGradient id="blue-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="transparent" />
                  </linearGradient>
                </defs>
             </svg>
          </div>
          {/* X Axis */}
          <div className="flex justify-between ml-8 mt-2 text-[10px] text-slate-400 font-medium">
             <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
          </div>
        </div>

        {/* Facility Status Area */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col">
          <div className="flex justify-between items-center mb-6">
             <h3 className="font-bold text-slate-900 dark:text-white">Current Facility Status</h3>
             <div className="flex items-center text-xs font-bold text-emerald-500 bg-emerald-50 px-2 py-1 rounded-md">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span> Live
             </div>
          </div>
          
          {/* 2x2 Grid Map */}
          <div className="flex-1 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-700 p-4 grid grid-cols-2 grid-rows-2 gap-2 relative">
             <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm flex items-center justify-center relative">
                 <span className="material-symbols-outlined text-emerald-500 absolute top-2 left-2 text-sm bg-emerald-50 rounded-full p-1">videocam</span>
             </div>
             <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm flex items-center justify-center relative">
                 <span className="material-symbols-outlined text-emerald-500 absolute top-2 left-2 text-sm bg-emerald-50 rounded-full p-1">videocam</span>
             </div>
             <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm flex items-center justify-center relative">
                 <span className="material-symbols-outlined text-emerald-500 absolute top-2 left-2 text-sm bg-emerald-50 rounded-full p-1">videocam</span>
             </div>
             <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm flex items-center justify-center relative border-2 border-amber-200">
                 <span className="material-symbols-outlined text-amber-500 absolute top-2 left-2 text-sm bg-amber-50 rounded-full p-1">videocam_off</span>
             </div>
          </div>
          
          <div className="flex justify-between items-center mt-4 text-xs font-medium">
             <span className="text-slate-500">4 Cameras Installed</span>
             <span className="text-amber-500 font-bold">1 Attention Needed</span>
          </div>
        </div>
      </div>

      {/* RECENT DETECTIONS TABLE */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
          <h3 className="font-bold text-slate-900 dark:text-white">Recent Detections</h3>
          <button className="text-blue-500 text-sm font-medium hover:text-blue-600">View Full Log</button>
        </div>
        
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50/50 dark:bg-slate-900/50 text-slate-400 text-xs font-bold uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Subject</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Camera Location</th>
                <th className="px-6 py-4">Confidence</th>
                <th className="px-6 py-4">Timestamp</th>
                <th className="px-6 py-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {/* Row 1 */}
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-6 py-4 flex items-center gap-3">
                  <img src="https://ui-avatars.com/api/?name=Guest+7607&background=random" alt="Guest" className="w-10 h-10 rounded-full object-cover" />
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">Guest 7607</div>
                    <div className="text-xs text-slate-500">ID: #98221</div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2.5 py-1 bg-purple-50 text-purple-600 rounded-md text-xs font-bold">Guest</span>
                </td>
                <td className="px-6 py-4 text-slate-500">Cam 01: Lobby</td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1 w-24">
                     <span className="text-xs font-bold text-slate-700 dark:text-slate-300">85%</span>
                     <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 w-[85%] rounded-full"></div>
                     </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-500">2 mins ago</td>
                <td className="px-6 py-4 text-right">
                  <button className="text-slate-400 hover:text-slate-600"><span className="material-symbols-outlined text-lg">more_vert</span></button>
                </td>
              </tr>

              {/* Row 2 */}
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-6 py-4 flex items-center gap-3">
                  <img src="https://ui-avatars.com/api/?name=Yari+Villanueva&background=random" alt="Yari" className="w-10 h-10 rounded-full object-cover" />
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">Yari Villanueva</div>
                    <div className="text-xs text-slate-500">ID: #FF6A</div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-md text-xs font-bold">Employee</span>
                </td>
                <td className="px-6 py-4 text-slate-500">Cam 02: Servers</td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1 w-24">
                     <span className="text-xs font-bold text-slate-700 dark:text-slate-300">99.8%</span>
                     <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 w-[99.8%] rounded-full"></div>
                     </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-500">14 mins ago</td>
                <td className="px-6 py-4 text-right">
                  <button className="text-slate-400 hover:text-slate-600"><span className="material-symbols-outlined text-lg">more_vert</span></button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default DashboardTab;