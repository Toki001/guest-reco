import { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch } from '../auth';

interface Event {
  id: number;
  title: string;
  description: string;
  location: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  category: string;
  created_at: string;
  camera_ids: string[];
}

interface Camera {
  camera_id: string;
  department: string;
  is_online: number;
}

interface Attendee {
  user_id: string;
  name: string;
  role: string;
  image_url: string | null;
  first_scan: string;
  last_scan: string;
}

interface AttendanceData {
  total_scans: number;
  unique_people: number;
  employees: number;
  guests: number;
  cameras: string[];
  attendees: Attendee[];
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  General: { bg: 'bg-blue-500/15', text: 'text-blue-400', dot: 'bg-blue-400' },
  Academic: { bg: 'bg-purple-500/15', text: 'text-purple-400', dot: 'bg-purple-400' },
  Sports: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  Cultural: { bg: 'bg-pink-500/15', text: 'text-pink-400', dot: 'bg-pink-400' },
  Meeting: { bg: 'bg-amber-500/15', text: 'text-amber-400', dot: 'bg-amber-400' },
  Holiday: { bg: 'bg-red-500/15', text: 'text-red-400', dot: 'bg-red-400' },
};

function getColor(cat: string) {
  return CATEGORY_COLORS[cat] || CATEGORY_COLORS.General;
}

function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [search, setSearch] = useState('');
  const [attendance, setAttendance] = useState<AttendanceData | null>(null);
  const [loadingAttendance, setLoadingAttendance] = useState(false);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await authFetch('/api/events');
      if (res.ok) setEvents(await res.json());
    } catch (e) {
      console.error('Failed to fetch events:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);

  const getDateStr = (day: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const getEventsForDate = (dateStr: string) =>
    events.filter(ev => {
      const start = ev.start_date;
      const end = ev.end_date || ev.start_date;
      return dateStr >= start && dateStr <= end;
    });

  const filteredEvents = search
    ? events.filter(ev =>
        ev.title.toLowerCase().includes(search.toLowerCase()) ||
        ev.category.toLowerCase().includes(search.toLowerCase()) ||
        ev.location.toLowerCase().includes(search.toLowerCase())
      )
    : selectedDate
      ? getEventsForDate(selectedDate)
      : events;

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const goToday = () => {
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(todayStr);
  };

  const monthLabel = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

  const fetchAttendance = async (eventId: number) => {
    setLoadingAttendance(true);
    setAttendance(null);
    try {
      const res = await authFetch(`/api/events/${eventId}/attendance`);
      if (res.ok) setAttendance(await res.json());
    } catch (e) {
      console.error('Failed to fetch attendance:', e);
    } finally {
      setLoadingAttendance(false);
    }
  };

  const handleSelectEvent = (ev: Event) => {
    setSelectedEvent(ev);
    fetchAttendance(ev.id);
  };

  const handleDeleteEvent = async (id: number) => {
    if (!confirm('Delete this event?')) return;
    try {
      await authFetch(`/api/events/${id}`, { method: 'DELETE' });
      setSelectedEvent(null);
      fetchEvents();
    } catch (e) {
      console.error('Failed to delete event:', e);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--modal-input-bg)',
    border: '1px solid var(--modal-input-border)',
  };

  return (
    <div className="flex flex-col w-full pb-10 page-enter">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2.5 mb-5">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] text-base z-10 pointer-events-none">search</span>
          <input type="text" placeholder="Search events..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-xl text-xs outline-none focus:ring-1 focus:ring-[var(--accent)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] bg-[var(--glass-bg)] border border-[var(--glass-border)]" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowUploadModal(true)}
            className="glass-card flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer">
            <span className="material-symbols-outlined text-sm">upload_file</span>
            Import
          </button>
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 h-9 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-semibold text-xs transition-colors">
            <span className="material-symbols-outlined text-sm">add</span>
            Add Event
          </button>
        </div>
      </div>

      {/* Calendar — full width */}
      <div className="glass-card rounded-2xl overflow-hidden mb-5">
        <div className="px-5 py-3.5 border-b border-[var(--glass-border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
              <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">chevron_left</span>
            </button>
            <h3 className="text-base font-bold text-[var(--text-primary)] min-w-[180px] text-center">{monthLabel}</h3>
            <button onClick={nextMonth} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
              <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">chevron_right</span>
            </button>
          </div>
          <button onClick={goToday}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/[0.06] transition-all">
            Today
          </button>
        </div>

        <div className="p-3">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="text-center text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, i) => {
              if (day === null) return <div key={`empty-${i}`} className="min-h-[100px]" />;
              const dateStr = getDateStr(day);
              const dayEvents = getEventsForDate(dateStr);
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              return (
                <button
                  key={day}
                  onClick={() => { setSelectedDate(dateStr === selectedDate ? null : dateStr); setSearch(''); setSelectedEvent(null); }}
                  className={`relative flex flex-col items-start p-2 rounded-xl transition-all min-h-[100px] text-left ${
                    isSelected
                      ? 'bg-[var(--accent)] text-white shadow-lg ring-2 ring-[var(--accent)]/50'
                      : isToday
                        ? 'bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]/30'
                        : 'hover:bg-white/[0.06]'
                  }`}
                >
                  <span className={`text-xs font-bold mb-1 ${
                    isSelected ? 'text-white' : isToday ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'
                  }`}>{day}</span>
                  {dayEvents.length > 0 && (
                    <div className="flex flex-col gap-0.5 w-full overflow-hidden flex-1">
                      {dayEvents.slice(0, 2).map((ev, j) => (
                        <div key={j} className={`flex items-center gap-1 rounded px-1 py-0.5 ${
                          isSelected ? 'bg-white/20' : getColor(ev.category).bg
                        }`}>
                          <span className={`w-1 h-1 rounded-full shrink-0 ${isSelected ? 'bg-white/70' : getColor(ev.category).dot}`} />
                          <span className={`text-[9px] font-medium truncate ${
                            isSelected ? 'text-white/90' : getColor(ev.category).text
                          }`}>{ev.title}</span>
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <span className={`text-[8px] font-bold px-1 ${isSelected ? 'text-white/60' : 'text-[var(--text-muted)]'}`}>
                          +{dayEvents.length - 2} more
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-1 gap-5">
        {/* Event List / Detail */}
        <div className="glass-card rounded-2xl overflow-hidden flex flex-col max-h-[500px]">
          <div className="px-5 py-3.5 border-b border-[var(--glass-border)] flex items-center justify-between shrink-0">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              {selectedEvent ? 'Event Details' : selectedDate ? `Events on ${new Date(selectedDate + 'T00:00').toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })}` : search ? 'Search Results' : 'All Events'}
            </h3>
            {selectedEvent && (
              <button onClick={() => { setSelectedEvent(null); setAttendance(null); }} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                <span className="material-symbols-outlined text-[var(--text-muted)] text-base">arrow_back</span>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto glass-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-7 h-7 border-3 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
              </div>
            ) : selectedEvent ? (
              <div className="p-5 space-y-4">
                <div>
                  <span className={`inline-flex px-2.5 py-1 rounded-lg text-[10px] font-bold ${getColor(selectedEvent.category).bg} ${getColor(selectedEvent.category).text}`}>
                    {selectedEvent.category}
                  </span>
                </div>
                <h4 className="text-lg font-bold text-[var(--text-primary)]">{selectedEvent.title}</h4>
                {selectedEvent.description && (
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{selectedEvent.description}</p>
                )}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-sm text-[var(--text-muted)]">calendar_today</span>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {new Date(selectedEvent.start_date + 'T00:00').toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' })}
                      {selectedEvent.end_date && selectedEvent.end_date !== selectedEvent.start_date && (
                        <> — {new Date(selectedEvent.end_date + 'T00:00').toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' })}</>
                      )}
                    </span>
                  </div>
                  {(selectedEvent.start_time || selectedEvent.end_time) && (
                    <div className="flex items-center gap-2.5">
                      <span className="material-symbols-outlined text-sm text-[var(--text-muted)]">schedule</span>
                      <span className="text-xs text-[var(--text-secondary)]">
                        {selectedEvent.start_time || '—'} {selectedEvent.end_time ? `— ${selectedEvent.end_time}` : ''}
                      </span>
                    </div>
                  )}
                  {selectedEvent.location && (
                    <div className="flex items-center gap-2.5">
                      <span className="material-symbols-outlined text-sm text-[var(--text-muted)]">location_on</span>
                      <span className="text-xs text-[var(--text-secondary)]">{selectedEvent.location}</span>
                    </div>
                  )}
                  {selectedEvent.camera_ids && selectedEvent.camera_ids.length > 0 && (
                    <div className="flex items-start gap-2.5">
                      <span className="material-symbols-outlined text-sm text-[var(--text-muted)] mt-0.5">videocam</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedEvent.camera_ids.map(cid => (
                          <span key={cid} className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20">
                            {cid.replace(/-/g, ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Attendance Section */}
                <div className="pt-2 border-t border-[var(--glass-border)]">
                  <h5 className="text-xs font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">groups</span>
                    Attendance
                  </h5>
                  {loadingAttendance ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="w-5 h-5 border-2 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
                    </div>
                  ) : !attendance || (attendance.unique_people === 0 && selectedEvent.camera_ids.length === 0) ? (
                    <div className="text-center py-4">
                      <span className="material-symbols-outlined text-2xl text-[var(--text-muted)] opacity-30 block mb-1">person_off</span>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {selectedEvent.camera_ids.length === 0 ? 'No cameras assigned to this event' : 'No attendance data yet'}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="rounded-xl p-2.5 text-center" style={{ background: 'rgba(46,163,242,0.08)', border: '1px solid rgba(46,163,242,0.15)' }}>
                          <p className="text-lg font-bold text-blue-400">{attendance.unique_people}</p>
                          <p className="text-[9px] text-[var(--text-muted)] font-semibold uppercase">Total</p>
                        </div>
                        <div className="rounded-xl p-2.5 text-center" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
                          <p className="text-lg font-bold text-emerald-400">{attendance.employees}</p>
                          <p className="text-[9px] text-[var(--text-muted)] font-semibold uppercase">Employees</p>
                        </div>
                        <div className="rounded-xl p-2.5 text-center" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}>
                          <p className="text-lg font-bold text-amber-400">{attendance.guests}</p>
                          <p className="text-[9px] text-[var(--text-muted)] font-semibold uppercase">Guests</p>
                        </div>
                      </div>
                      {attendance.attendees.length > 0 && (
                        <div className="space-y-1 max-h-48 overflow-y-auto glass-scrollbar">
                          {attendance.attendees.map(a => (
                            <div key={a.user_id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.04] transition-colors">
                              {a.image_url ? (
                                <img src={a.image_url.startsWith('/') ? a.image_url : `/${a.image_url}`} alt={a.name}
                                  className="w-8 h-8 rounded-lg object-cover shrink-0" />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                                  <span className="material-symbols-outlined text-blue-400 text-sm">person</span>
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-semibold text-[var(--text-primary)] truncate">{a.name}</p>
                                <p className="text-[9px] text-[var(--text-muted)]">
                                  {a.role} · {a.first_scan ? new Date(a.first_scan).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                </p>
                              </div>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${a.role === 'Employee' ? 'bg-blue-500/15 text-blue-400' : 'bg-amber-500/15 text-amber-400'}`}>
                                {a.role}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <button onClick={() => handleDeleteEvent(selectedEvent.id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors">
                  <span className="material-symbols-outlined text-sm">delete</span>
                  Delete Event
                </button>
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-[var(--text-muted)]">
                <span className="material-symbols-outlined text-4xl opacity-30 mb-2">event_busy</span>
                <span className="text-xs">{selectedDate ? 'No events on this date' : 'No events found'}</span>
              </div>
            ) : (
              <div className="p-2">
                {filteredEvents.map(ev => (
                  <button
                    key={ev.id}
                    onClick={() => handleSelectEvent(ev)}
                    className="w-full flex items-start gap-3 p-3 rounded-xl hover:bg-white/[0.06] transition-all text-left"
                  >
                    <div className={`w-1 shrink-0 rounded-full self-stretch ${getColor(ev.category).dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{ev.title}</p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                        {new Date(ev.start_date + 'T00:00').toLocaleDateString('default', { month: 'short', day: 'numeric' })}
                        {ev.start_time ? ` · ${ev.start_time}` : ''}
                      </p>
                      {ev.location && (
                        <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                          <span className="material-symbols-outlined text-[10px]">location_on</span>
                          {ev.location}
                        </p>
                      )}
                    </div>
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold ${getColor(ev.category).bg} ${getColor(ev.category).text}`}>
                      {ev.category}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="px-5 py-3 border-t border-[var(--glass-border)] shrink-0">
            <p className="text-[11px] text-[var(--text-muted)]">{filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* Add Event Modal */}
      {showAddModal && <AddEventModal onClose={() => setShowAddModal(false)} onSuccess={fetchEvents} />}

      {/* Upload Modal */}
      {showUploadModal && <UploadEventsModal onClose={() => setShowUploadModal(false)} onSuccess={fetchEvents} />}
    </div>
  );
}

function AddEventModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [category, setCategory] = useState('General');
  const [selectedCameras, setSelectedCameras] = useState<string[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    authFetch('/api/cameras').then(res => res.ok ? res.json() : []).then(setCameras).catch(() => {});
  }, []);

  const inputStyle: React.CSSProperties = {
    background: 'var(--modal-input-bg)',
    border: '1px solid var(--modal-input-border)',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !startDate) { setStatus('error: Title and start date are required'); return; }
    setSubmitting(true);
    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('location', location);
    formData.append('start_date', startDate);
    formData.append('end_date', endDate);
    formData.append('start_time', startTime);
    formData.append('end_time', endTime);
    formData.append('category', category);
    formData.append('camera_ids', selectedCameras.join(','));
    try {
      const res = await authFetch('/api/events', { method: 'POST', body: formData });
      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        const data = await res.json();
        setStatus(`error: ${data.detail}`);
      }
    } catch {
      setStatus('error: Network error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg mx-4 max-h-[90vh] flex flex-col rounded-2xl overflow-hidden page-enter"
        style={{ background: 'var(--modal-bg)', backdropFilter: 'blur(24px) saturate(1.3)', WebkitBackdropFilter: 'blur(24px) saturate(1.3)', border: '1px solid var(--glass-border)', boxShadow: '0 24px 64px rgba(0,0,0,0.25), var(--glass-inset-highlight)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Add Event</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <span className="material-symbols-outlined text-[var(--text-muted)] text-xl">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 glass-scrollbar space-y-3">
          <div>
            <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1.5">Title *</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} required placeholder="Event name"
              className="w-full rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-1 focus:ring-[var(--accent)]" style={inputStyle} />
          </div>
          <div>
            <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Optional details..."
              className="w-full rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-1 focus:ring-[var(--accent)] resize-none" style={inputStyle} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1.5">Start Date *</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required
                className="w-full rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]" style={inputStyle} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1.5">End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]" style={inputStyle} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1.5">Start Time</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]" style={inputStyle} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1.5">End Time</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]" style={inputStyle} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1.5">Location</label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Main Hall"
                className="w-full rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-1 focus:ring-[var(--accent)]" style={inputStyle} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1.5">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]" style={inputStyle}>
                {Object.keys(CATEGORY_COLORS).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {/* Camera Assignment */}
          {cameras.length > 0 && (
            <div>
              <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1.5">
                Assign Cameras
                {selectedCameras.length > 0 && <span className="ml-1 text-[var(--accent)]">({selectedCameras.length})</span>}
              </label>
              <div className="rounded-xl p-2 space-y-1 max-h-32 overflow-y-auto glass-scrollbar" style={inputStyle}>
                {cameras.map(cam => (
                  <label key={cam.camera_id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/[0.06] cursor-pointer transition-colors">
                    <input type="checkbox"
                      checked={selectedCameras.includes(cam.camera_id)}
                      onChange={e => {
                        if (e.target.checked) setSelectedCameras(prev => [...prev, cam.camera_id]);
                        else setSelectedCameras(prev => prev.filter(c => c !== cam.camera_id));
                      }}
                      className="rounded accent-[var(--accent)]" />
                    <span className="material-symbols-outlined text-sm text-[var(--text-muted)]">videocam</span>
                    <span className="text-xs text-[var(--text-primary)] flex-1">{cam.department || cam.camera_id.replace(/-/g, ' ')}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${cam.is_online ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  </label>
                ))}
              </div>
            </div>
          )}

          <button type="submit" disabled={submitting}
            className="w-full py-2.5 rounded-xl font-bold text-sm text-white transition-all mt-2"
            style={{ background: submitting ? 'rgba(46,163,242,0.3)' : 'linear-gradient(135deg, #2EA3F2, #0C71C3)', boxShadow: submitting ? 'none' : '0 4px 16px rgba(46,163,242,0.3)', cursor: submitting ? 'not-allowed' : 'pointer' }}>
            {submitting ? 'Creating...' : 'Create Event'}
          </button>
          {status && (
            <div className={`p-3 rounded-xl text-center text-sm font-medium ${status.startsWith('error') ? 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20' : 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20'}`}>
              {status.substring(status.indexOf(':') + 1).trim()}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

function UploadEventsModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const inputStyle: React.CSSProperties = {
    background: 'var(--modal-input-bg)',
    border: '1px solid var(--modal-input-border)',
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setStatus('');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await authFetch('/api/events/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        setStatus(`success: ${data.message}`);
        onSuccess();
        setTimeout(onClose, 1200);
      } else {
        setStatus(`error: ${data.detail}`);
      }
    } catch {
      setStatus('error: Network error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-md mx-4 rounded-2xl overflow-hidden page-enter"
        style={{ background: 'var(--modal-bg)', backdropFilter: 'blur(24px) saturate(1.3)', WebkitBackdropFilter: 'blur(24px) saturate(1.3)', border: '1px solid var(--glass-border)', boxShadow: '0 24px 64px rgba(0,0,0,0.25), var(--glass-inset-highlight)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Import Events</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <span className="material-symbols-outlined text-[var(--text-muted)] text-xl">close</span>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-xs text-[var(--text-muted)]">
            Upload an Excel (.xlsx) or CSV file. Expected columns: <span className="font-mono text-[var(--text-secondary)]">title</span>, <span className="font-mono text-[var(--text-secondary)]">start_date</span>, and optionally <span className="font-mono text-[var(--text-secondary)]">end_date</span>, <span className="font-mono text-[var(--text-secondary)]">start_time</span>, <span className="font-mono text-[var(--text-secondary)]">end_time</span>, <span className="font-mono text-[var(--text-secondary)]">description</span>, <span className="font-mono text-[var(--text-secondary)]">location</span>, <span className="font-mono text-[var(--text-secondary)]">category</span>.
          </p>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            className="w-full py-8 rounded-xl text-sm font-medium text-[var(--text-muted)] transition-all flex flex-col items-center gap-2 disabled:opacity-50"
            style={{ ...inputStyle, borderStyle: 'dashed' }}>
            {uploading ? (
              <div className="w-6 h-6 border-2 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
            ) : (
              <span className="material-symbols-outlined text-3xl opacity-40">upload_file</span>
            )}
            {uploading ? 'Importing...' : 'Click to select file (.xlsx or .csv)'}
          </button>
          <input type="file" accept=".xlsx,.xls,.csv" ref={fileRef} onChange={handleUpload} className="hidden" />
          {status && (
            <div className={`p-3 rounded-xl text-center text-sm font-medium ${status.startsWith('error') ? 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20' : 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20'}`}>
              {status.substring(status.indexOf(':') + 1).trim()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default EventsPage;
