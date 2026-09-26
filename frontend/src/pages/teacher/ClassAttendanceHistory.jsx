import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';

export default function ClassAttendanceHistory() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [className, setClassName] = useState('');
  const [exportingId, setExportingId] = useState(null);
  const [filterSubject, setFilterSubject] = useState('all');

  useEffect(() => {
    const load = async () => {
      try {
        const [sessRes, classRes] = await Promise.all([
          client.get(`/attendance/classes/${classId}/sessions`),
          client.get(`/classes`),
        ]);
        setSessions(sessRes.data);
        const cls = classRes.data.find(c => String(c.id) === String(classId));
        if (cls) setClassName(cls.name);
      } catch (err) {
        console.warn('Failed to load attendance history', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [classId]);

  const handleExportCSV = async (sessionId) => {
    setExportingId(sessionId);
    try {
      const response = await client.get(`/attendance/sessions/${sessionId}/export-csv`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `attendance_session_${sessionId}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      alert('Failed to export CSV.');
    } finally {
      setExportingId(null);
    }
  };

  // Unique subjects for filter
  const subjects = ['all', ...new Set(sessions.map(s => s.subject_name || 'General').filter(Boolean))];

  const filteredSessions = filterSubject === 'all'
    ? sessions
    : sessions.filter(s => (s.subject_name || 'General') === filterSubject);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-brand-200 border-t-brand-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm px-4 sm:px-6 py-4 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate('/teacher/exams')}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="font-extrabold text-slate-900 font-display text-sm truncate">Attendance History</h1>
              <p className="text-xs text-slate-500 truncate">{className}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Total Sessions', value: sessions.length, color: 'brand' },
            { label: 'Subjects', value: subjects.length - 1, color: 'purple' },
            { label: 'Completed', value: sessions.filter(s => !s.is_active).length, color: 'emerald' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-200 shadow-card p-4">
              <p className={`text-2xl font-extrabold font-display text-${color}-600`}>{value}</p>
              <p className="text-xs text-slate-500 font-medium mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Subject Filter */}
        {subjects.length > 2 && (
          <div className="flex gap-2 flex-wrap">
            {subjects.map(s => (
              <button key={s}
                onClick={() => setFilterSubject(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                  filterSubject === s
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}>
                {s === 'all' ? 'All Subjects' : s}
              </button>
            ))}
          </div>
        )}

        {/* Sessions List */}
        {filteredSessions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-12 text-center">
            <p className="text-slate-400 text-sm">No attendance sessions recorded yet.</p>
            <p className="text-xs text-slate-400 mt-1">Launch attendance from the My Classes tab.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSessions.map(session => (
              <div key={session.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-card p-4 sm:p-5 hover:shadow-card-hover transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-900 text-sm font-display">{session.title}</h3>
                      {session.subject_name && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                          {session.subject_name}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        session.is_active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        {session.is_active ? '● LIVE' : 'Closed'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                      <span className="text-xs text-slate-500">
                        📅 {new Date(session.created_at).toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-500">
                        📍 {session.radius_meters}m geofence
                      </span>
                      <span className="text-xs text-slate-500">
                        ⚡ {session.mode === 'biometric' ? 'Biometric' : 'Standard'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                    {session.is_active && (
                      <button
                        onClick={() => navigate(`/teacher/attendance/session/${session.id}`)}
                        className="btn-primary text-xs py-2 px-3 whitespace-nowrap"
                      >
                        Open Projector
                      </button>
                    )}
                    <button
                      onClick={() => handleExportCSV(session.id)}
                      disabled={exportingId === session.id}
                      className="btn-secondary text-xs py-2 px-3 whitespace-nowrap"
                    >
                      {exportingId === session.id ? 'Exporting…' : '↓ CSV'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
