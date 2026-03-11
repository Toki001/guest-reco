import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authFetch } from '../auth';
import { API_BASE } from '../config';
import AddEmployeeModal from '../components/AddEmployeeModal';

interface Employee {
  id: string;
  name: string;
  image_url: string | null;
  role: string;
  last_status: string | null;
  last_seen: string | null;
  last_camera: string | null;
}

function EmployeesPage() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await authFetch('/api/employees?role=Employee');
      if (res.ok) {
        const data = await res.json();
        setEmployees(data);
      }
    } catch (e) {
      console.error('Failed to fetch employees:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  const filtered = employees.filter(emp => {
    const matchesSearch = !search ||
      emp.name.toLowerCase().includes(search.toLowerCase()) ||
      emp.id.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'All' || emp.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setEditName(emp.name);
    setEditRole(emp.role);
  };

  const handleSaveEdit = async (id: string) => {
    const formData = new FormData();
    formData.append('name', editName);
    formData.append('role', editRole);
    try {
      await authFetch(`/api/employees/${encodeURIComponent(id)}`, { method: 'PUT', body: formData });
      setEditingId(null);
      fetchEmployees();
    } catch (e) {
      console.error('Failed to update employee:', e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete employee "${id}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await authFetch(`/api/employees/${encodeURIComponent(id)}`, { method: 'DELETE' });
      fetchEmployees();
    } catch (e) {
      console.error('Failed to delete employee:', e);
    }
    setDeletingId(null);
  };

  const handlePromote = async (emp: Employee) => {
    const newName = prompt('Enter name for this employee:', emp.name);
    if (!newName) return;
    const formData = new FormData();
    formData.append('name', newName);
    formData.append('role', 'Employee');
    try {
      await authFetch(`/api/employees/${encodeURIComponent(emp.id)}`, { method: 'PUT', body: formData });
      fetchEmployees();
    } catch (e) {
      console.error('Failed to promote guest:', e);
    }
  };

  const handleReface = async (id: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('image', file);
      try {
        await authFetch(`/api/employees/${encodeURIComponent(id)}/reface`, { method: 'POST', body: formData });
        fetchEmployees();
      } catch (e) {
        console.error('Failed to reface:', e);
      }
    };
    input.click();
  };

  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    return url.startsWith('/') ? `${API_BASE}${url}` : url;
  };

  const formatTime = (ts: string | null) => {
    if (!ts) return 'Never';
    try {
      return new Date(ts).toLocaleString();
    } catch { return ts; }
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-50/50 dark:bg-slate-900 overflow-y-auto pb-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Employees</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage employees and guests in the system.</p>
        </div>
        <button onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-sm transition-colors shadow-sm">
          <span className="material-symbols-outlined text-lg">person_add</span>
          Add Employee
        </button>
      </div>

      {/* Action Bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
          <input type="text" placeholder="Search by name or ID..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          className="px-4 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl text-sm outline-none focus:border-blue-500 transition-all">
          <option value="All">All Roles</option>
          <option value="Employee">Employee</option>
          <option value="Guest">Guest</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600 mb-3 block">group_off</span>
            <p className="text-slate-500 dark:text-slate-400">{search || roleFilter !== 'All' ? 'No matching employees found.' : 'No employees registered yet.'}</p>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Employee</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">ID</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Last Seen</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {filtered.map(emp => (
                  <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {getImageUrl(emp.image_url) ? (
                          <img src={getImageUrl(emp.image_url)!} alt={emp.name} className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-600" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center">
                            <span className="material-symbols-outlined text-slate-400 text-sm">person</span>
                          </div>
                        )}
                        {editingId === emp.id ? (
                          <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                            className="border border-blue-400 rounded-lg px-2 py-1 text-sm bg-white dark:bg-slate-900 outline-none w-36" autoFocus />
                        ) : (
                          <span className="text-sm font-medium text-slate-900 dark:text-white">{emp.name}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 font-mono">{emp.id}</td>
                    <td className="px-4 py-3">
                      {editingId === emp.id ? (
                        <select value={editRole} onChange={e => setEditRole(e.target.value)}
                          className="border border-blue-400 rounded-lg px-2 py-1 text-xs bg-white dark:bg-slate-900 outline-none">
                          <option value="Employee">Employee</option>
                          <option value="Guest">Guest</option>
                        </select>
                      ) : (
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          emp.role === 'Guest' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        }`}>{emp.role}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{formatTime(emp.last_seen)}</td>
                    <td className="px-4 py-3">
                      {emp.last_status ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                          emp.last_status === 'in' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${emp.last_status === 'in' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          {emp.last_status === 'in' ? 'IN' : 'OUT'}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {editingId === emp.id ? (
                          <>
                            <button onClick={() => handleSaveEdit(emp.id)} className="p-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded-lg transition-colors" title="Save">
                              <span className="material-symbols-outlined text-emerald-600 text-lg">check</span>
                            </button>
                            <button onClick={() => setEditingId(null)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title="Cancel">
                              <span className="material-symbols-outlined text-slate-400 text-lg">close</span>
                            </button>
                            <button onClick={() => handleReface(emp.id)} className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors" title="Re-capture face">
                              <span className="material-symbols-outlined text-blue-600 text-lg">photo_camera</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => navigate(`/employees/${encodeURIComponent(emp.id)}`)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title="View profile">
                              <span className="material-symbols-outlined text-slate-500 text-lg">visibility</span>
                            </button>
                            <button onClick={() => handleEdit(emp)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title="Edit">
                              <span className="material-symbols-outlined text-slate-500 text-lg">edit</span>
                            </button>
                            {emp.role === 'Guest' && (
                              <button onClick={() => handlePromote(emp)} className="p-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded-lg transition-colors" title="Promote to Employee">
                                <span className="material-symbols-outlined text-emerald-600 text-lg">upgrade</span>
                              </button>
                            )}
                            <button onClick={() => handleDelete(emp.id)} disabled={deletingId === emp.id}
                              className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50" title="Delete">
                              <span className="material-symbols-outlined text-red-500 text-lg">
                                {deletingId === emp.id ? 'hourglass_empty' : 'delete'}
                              </span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAddModal && <AddEmployeeModal onClose={() => setShowAddModal(false)} onSuccess={fetchEmployees} />}
    </div>
  );
}

export default EmployeesPage;
