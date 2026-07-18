import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';

function Sidebar({ activeTab, setActiveTab }) {
  const { logout, user } = useAuth();
  
  const tabs = [
    { id: 'exams', label: 'Exams Workspace', icon: 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25' },
    { id: 'history', label: 'Performance Reports', icon: 'M9 19.5A4.5 4.5 0 007.5 15h-3a4.5 4.5 0 00-3 3.5M9 15h3M9 18h3m10.5-3.5h-3a4.5 4.5 0 00-3 3.5m6-3.5h3A4.5 4.5 0 0121 18.75m-6-3.75a3 3 0 11-6 0 3 3 0 016 0z' },
    { id: 'biometrics', label: 'Biometrics Profile', icon: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z' },
  ];

  return (
    <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 min-h-screen px-4 py-6 gap-2 shadow-sm">
      <div className="flex items-center gap-2.5 mb-8 px-2">
        <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>
        <span className="font-extrabold text-slate-900 font-display">SecureExam AI</span>
      </div>

      <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Student Workspace</p>

      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => setActiveTab(t.id)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${
            activeTab === t.id
              ? 'bg-brand-50 text-brand-700 border border-brand-100 shadow-sm'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d={t.icon} />
          </svg>
          {t.label}
        </button>
      ))}

      <div className="mt-auto border-t border-slate-100 pt-4">
        <div className="px-3 py-2 mb-2 bg-slate-50 rounded-xl border border-slate-100">
          <p className="text-xs font-semibold text-slate-700 truncate">{user?.name}</p>
          <p className="text-[10px] text-slate-400 truncate mt-0.5">{user?.email}</p>
        </div>
        <button onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-500 hover:bg-red-50 hover:text-red-650 w-full transition">
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
  const [activeTab, setActiveTab] = useState('exams');
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    client.get('/exams')
      .then(res => { setExams(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const liveExams     = exams.filter(e => { const now = new Date(); return now >= new Date(e.start_at) && now <= new Date(e.end_at) && !e.user_has_submitted; });
  const upcomingExams = exams.filter(e => new Date() < new Date(e.start_at) && !e.user_has_submitted);
  const completedExams = exams.filter(e => e.user_has_submitted || new Date() > new Date(e.end_at));

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="flex-1 p-6 lg:p-8 overflow-auto">
        
        {/* Header */}
        <div className="mb-8 flex items-center justify-between border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 font-display">
              Welcome back, <span className="text-brand-600">{user?.name?.split(' ')[0]}</span> 👋
            </h1>
            <p className="text-slate-500 text-sm mt-1">SecureExam Portal Student Workspace</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
              user?.face_enrolled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200 animate-pulse'
            }`}>
              <span className={`w-2 h-2 rounded-full ${user?.face_enrolled ? 'bg-emerald-500' : 'bg-red-500'}`} />
              Face ID: {user?.face_enrolled ? 'Active' : 'Unenrolled'}
            </span>
          </div>
        </div>

        {/* Tab Content: Exams Workspace */}
        {activeTab === 'exams' && (
          <div className="space-y-8 animate-fade-in">
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Live Now',  value: liveExams.length,     color: 'text-emerald-600', bg: 'bg-emerald-50', icon: 'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z' },
                { label: 'Upcoming',  value: upcomingExams.length, color: 'text-blue-600',    bg: 'bg-blue-50',    icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5' },
                { label: 'Completed', value: completedExams.length, color: 'text-slate-600',  bg: 'bg-slate-100',  icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-card flex items-center gap-4">
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
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {[1, 2, 3].map(n => (
                  <div key={n} className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col gap-4 animate-pulse">
                    <div className="h-4 bg-slate-200 rounded w-2/3" />
                    <div className="h-10 bg-slate-100 rounded-xl w-full mt-4" />
                  </div>
                ))}
              </div>
            ) : exams.filter(e => !e.user_has_submitted).length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-card">
                <p className="font-semibold text-slate-700">No active exams found</p>
                <p className="text-sm text-slate-400 mt-1">Check back when your instructor publishes a new test.</p>
              </div>
            ) : (
              <div>
                <h2 className="text-base font-bold text-slate-900 mb-4 font-display">Active & Upcoming Tests</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {exams.filter(e => !e.user_has_submitted).map(exam => {
                    const { label, cls } = statusBadge(exam);
                    const isLive = label === 'Live';
                    return (
                      <div key={exam.id} className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 flex flex-col gap-4 hover:shadow-card-hover transition duration-250">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-slate-900 font-display leading-snug">{exam.title}</h3>
                          <span className={cls}>{label}</span>
                        </div>
                        <div className="text-xs text-slate-500 space-y-1">
                          <p>⏱ Duration: <span className="font-semibold text-slate-750">{exam.duration_minutes} mins</span></p>
                          <p>📅 Starts: {new Date(exam.start_at).toLocaleString()}</p>
                          <p>🏁 Ends: {new Date(exam.end_at).toLocaleString()}</p>
                        </div>
                        <button
                          onClick={() => navigate(`/student/camera-check/${exam.id}`)}
                          disabled={!isLive}
                          className={`mt-auto w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
                            isLive
                              ? 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm'
                              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          {isLive ? '🚀 Join Exam' : '⏳ Not Started'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab Content: Performance Reports */}
        {activeTab === 'history' && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-lg font-bold text-slate-900 font-display">Exam History & Performance</h2>
            {completedExams.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
                You haven't completed any exams yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {completedExams.map(exam => (
                  <div key={exam.id} className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 flex flex-col gap-4">
                    <div>
                      <h3 className="font-semibold text-slate-950 font-display leading-snug">{exam.title}</h3>
                      <span className="inline-block mt-2 badge-green">Completed</span>
                    </div>
                    <div className="text-xs text-slate-500 space-y-1 bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <p className="font-semibold text-slate-700">
                        🎯 Score: <span className="text-brand-600 text-sm font-bold">{exam.user_score ?? 0}</span> / {exam.total_marks || 0} marks
                      </p>
                    </div>
                    {exam.user_attempt_id && (
                      <div className="flex gap-2 mt-auto">
                        <button
                          onClick={() => navigate(`/student/result/${exam.user_attempt_id}`)}
                          className="flex-1 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 transition"
                        >
                          📊 View Insights
                        </button>
                        <a
                          href={`${client.defaults.baseURL}/reports/attempts/${exam.user_attempt_id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 py-2 rounded-xl text-xs font-semibold bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 text-center transition flex items-center justify-center gap-1"
                        >
                          📥 PDF Report
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab Content: Biometrics Profile */}
        {activeTab === 'biometrics' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-card max-w-2xl animate-fade-in space-y-6">
            <h2 className="text-lg font-bold text-slate-900 font-display border-b border-slate-100 pb-3">Face ID Profile Details</h2>
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="w-28 h-28 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0 text-slate-400 overflow-hidden">
                {user?.face_enrolled ? (
                  <svg className="w-14 h-14 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                ) : (
                  <svg className="w-14 h-14 text-slate-350 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                  </svg>
                )}
              </div>
              <div className="space-y-1.5 text-center sm:text-left">
                <h3 className="font-bold text-slate-800">{user?.name}</h3>
                <p className="text-xs text-slate-500">Student Account</p>
                <div className="pt-2">
                  {user?.face_enrolled ? (
                    <span className="px-3 py-1 bg-emerald-50 border border-emerald-250 text-emerald-700 text-xs font-bold rounded-full">
                      ✓ Biometric Face ID Active
                    </span>
                  ) : (
                    <span className="px-3 py-1 bg-red-50 border border-red-250 text-red-700 text-xs font-bold rounded-full animate-pulse">
                      ⚠ Enrollment Required
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
              <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide">How face verification works</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                SecureExam AI records facial landmarks during exam start and matches them in real-time. This prevents impersonation, head-turning, or multi-face presence violations.
              </p>
              {!user?.face_enrolled && (
                <Link to="/enroll-face" className="inline-block px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl shadow-sm transition">
                  Enroll Biometrics Now →
                </Link>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}