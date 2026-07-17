import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';

function Sidebar({ active }) {
  const { logout, user } = useAuth();
  const nav = useNavigate();
  const links = [
    { label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', path: '/student/dashboard' },
  ];
  return (
    <aside className="hidden md:flex flex-col w-60 bg-white border-r border-slate-200 min-h-screen px-4 py-6 gap-2 shadow-sm">
      <div className="flex items-center gap-2.5 mb-8 px-2">
        <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>
        <span className="font-bold text-slate-900 font-display">ExamGuard AI</span>
      </div>

      {links.map(l => (
        <button key={l.path} onClick={() => nav(l.path)}
          className={`nav-item text-left ${active === l.path ? 'active' : ''}`}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d={l.icon} />
          </svg>
          {l.label}
        </button>
      ))}

      <div className="mt-auto border-t border-slate-100 pt-4">
        <div className="px-3 py-2 mb-2">
          <p className="text-xs font-semibold text-slate-700 truncate">{user?.name}</p>
          <p className="text-xs text-slate-400 truncate">{user?.email}</p>
        </div>
        <button onClick={logout}
          className="nav-item w-full text-left text-red-500 hover:bg-red-50 hover:text-red-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
          </svg>
          Sign Out
        </button>
      </div>
    </aside>
  );
}

function statusBadge(exam) {
  const now = new Date();
  const start = new Date(exam.start_at);
  const end   = new Date(exam.end_at);
  if (now < start) return { label: 'Upcoming', cls: 'badge-blue' };
  if (now >= start && now <= end) return { label: 'Live', cls: 'badge-green' };
  return { label: 'Ended', cls: 'badge-slate' };
}

export default function StudentDashboard() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    client.get('/exams')
      .then(res => { setExams(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const liveExams     = exams.filter(e => { const now = new Date(); return now >= new Date(e.start_at) && now <= new Date(e.end_at); });
  const upcomingExams = exams.filter(e => new Date() < new Date(e.start_at));
  const pastExams     = exams.filter(e => new Date() > new Date(e.end_at));

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar active="/student/dashboard" />
      <main className="flex-1 p-6 lg:p-8 overflow-auto">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <h1 className="text-2xl font-bold text-slate-900 font-display">
            Welcome back, <span className="text-brand-600">{user?.name?.split(' ')[0]}</span> 👋
          </h1>
          <p className="text-slate-500 text-sm mt-1">Here are your available exams</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-8 animate-slide-up">
          {[
            { label: 'Live Now',  value: liveExams.length,     color: 'text-emerald-600', bg: 'bg-emerald-50', icon: 'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z' },
            { label: 'Upcoming',  value: upcomingExams.length, color: 'text-blue-600',    bg: 'bg-blue-50',    icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5' },
            { label: 'Completed', value: pastExams.length,     color: 'text-slate-600',  bg: 'bg-slate-100',  icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
          ].map(s => (
            <div key={s.label} className={`bg-white rounded-2xl border border-slate-200 p-5 shadow-card flex items-center gap-4`}>
              <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                <svg className={`w-5 h-5 ${s.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 font-display">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 rounded-full border-4 border-brand-200 border-t-brand-600 animate-spin" />
          </div>
        ) : exams.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-card">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <h3 className="font-semibold text-slate-700 mb-1">No Exams Available</h3>
            <p className="text-sm text-slate-400">Your teacher hasn't published any exams yet. Check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 animate-slide-up">
            {exams.map(exam => {
              let { label, cls } = statusBadge(exam);
              const alreadySubmitted = exam.user_has_submitted;
              if (alreadySubmitted) {
                label = 'Submitted';
                cls = 'badge-green';
              }
              const isLive = label === 'Live';
              return (
                <div key={exam.id} className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 flex flex-col gap-4 hover:shadow-card-hover transition-shadow duration-200">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-slate-900 font-display leading-snug">{exam.title}</h3>
                    <span className={cls}>{label}</span>
                  </div>
                  <div className="text-xs text-slate-500 space-y-1">
                    <p>⏱ Duration: <span className="font-medium text-slate-700">{exam.duration_minutes} mins</span></p>
                    <p>📅 Starts: {new Date(exam.start_at).toLocaleString()}</p>
                    <p>🏁 Ends: {new Date(exam.end_at).toLocaleString()}</p>
                  </div>
                  <button
                    onClick={() => navigate(`/student/instructions/${exam.id}`)}
                    disabled={!isLive || alreadySubmitted}
                    className={`mt-auto w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      isLive && !alreadySubmitted
                        ? 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {alreadySubmitted ? '✓ Submitted' : isLive ? '🚀 Join Exam' : label === 'Upcoming' ? '⏳ Not Started Yet' : '✓ Exam Ended'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
