import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const TABS = [
  { id: 'exams', label: 'Exams Workspace', icon: 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25' },
  { id: 'history', label: 'Performance Reports', icon: 'M9 19.5A4.5 4.5 0 007.5 15h-3a4.5 4.5 0 00-3 3.5M9 15h3M9 18h3m10.5-3.5h-3a4.5 4.5 0 00-3 3.5m6-3.5h3A4.5 4.5 0 0121 18.75m-6-3.75a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'biometrics', label: 'Biometrics Profile', icon: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z' },
];

function Sidebar({ activeTab, setActiveTab }) {
  const { logout, user } = useAuth();

  return (
    <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 min-h-screen px-4 py-6 gap-2 shadow-sm flex-shrink-0">
      <div className="flex items-center gap-2.5 mb-8 px-2">
        <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center shadow-xs">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>
        <span className="font-extrabold text-slate-900 font-display">SecureExam AI</span>
      </div>

      <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Student Workspace</p>

      {TABS.map(t => (
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
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('exams');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [faceRequestState, setFaceRequestState] = useState('idle'); // idle | pending | submitting | submitted
  const [faceRequestReason, setFaceRequestReason] = useState('');
  const [faceRequestMsg, setFaceRequestMsg] = useState('');
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    client.get('/exams')
      .then(res => { setExams(res.data); setLoading(false); })
      .catch(() => setLoading(false));

    client.get('/students/profile')
      .then(res => {
        setProfileData(res.data);
      })
      .catch(() => {});
  }, []);

  const handleFaceUpdateRequest = async () => {
    if (!faceRequestReason.trim()) return;
    setFaceRequestState('submitting');
    try {
      await client.post('/students/me/request-face-update', { reason: faceRequestReason });
      setFaceRequestState('submitted');
      setFaceRequestMsg('Request sent! Your teacher will review and approve it. You will receive an email once approved.');
    } catch (err) {
      setFaceRequestMsg(err.response?.data?.detail || 'Failed to submit request.');
      setFaceRequestState('idle');
    }
  };

  const liveExams     = exams.filter(e => { const now = new Date(); return now >= new Date(e.start_at) && now <= new Date(e.end_at) && !e.user_has_submitted; });
  const upcomingExams = exams.filter(e => new Date() < new Date(e.start_at) && !e.user_has_submitted);
  const completedExams = exams.filter(e => e.user_has_submitted || new Date() > new Date(e.end_at));

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Mobile Slide-Over Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex animate-fade-in">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-4/5 max-w-xs bg-white h-full shadow-2xl flex flex-col p-5 z-10">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center shadow-xs">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <span className="font-extrabold text-slate-900 font-display text-sm">SecureExam AI</span>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="p-2 text-slate-400 hover:text-slate-700">
                ✕
              </button>
            </div>

            <div className="py-4 space-y-1">
              <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Student Navigation</p>
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setActiveTab(t.id); setMobileMenuOpen(false); }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold w-full transition ${
                    activeTab === t.id
                      ? 'bg-brand-50 text-brand-700 border border-brand-100 shadow-xs'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={t.icon} />
                  </svg>
                  {t.label}
                </button>
              ))}

              <button
                onClick={() => { navigate('/student/attendance'); setMobileMenuOpen(false); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold w-full bg-indigo-50 text-indigo-700 border border-indigo-100 mt-2"
              >
                <span>📷</span> Mark Attendance
              </button>
            </div>

            <div className="mt-auto border-t border-slate-100 pt-4">
              <div className="px-3 py-2 mb-2 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-xs font-semibold text-slate-700 truncate">{user?.name}</p>
                <p className="text-[10px] text-slate-400 truncate mt-0.5">{user?.email}</p>
              </div>
              <button onClick={logout}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-500 hover:bg-red-50 w-full transition">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                </svg>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto pb-24 md:pb-8">
        {/* Mobile Header Bar */}
        <div className="md:hidden flex items-center justify-between bg-white border border-slate-200 rounded-2xl p-3.5 mb-5 shadow-xs">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
              aria-label="Open menu"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <span className="font-bold text-slate-900 font-display text-sm">
              {TABS.find(t => t.id === activeTab)?.label || 'Dashboard'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/student/attendance')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-brand-600 text-white shadow-xs"
            >
              <span>📷</span> Scan
            </button>
          </div>
        </div>
        
        {/* Desktop Header */}
        <div className="mb-6 sm:mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 font-display">
              Welcome back, <span className="text-brand-600">{user?.name?.split(' ')[0]}</span> 👋
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">SecureExam Portal Student Workspace</p>
          </div>
          <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
            <button
              onClick={() => navigate('/student/attendance')}
              className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white shadow-xs transition"
            >
              <span>📷</span> Mark Attendance
            </button>
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
            {/* Overview Stats row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Live Exams',      value: liveExams.length,                                color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100', icon: 'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z' },
                { label: 'Upcoming',        value: upcomingExams.length,                            color: 'text-blue-600',    bg: 'bg-blue-50 border-blue-100',       icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5' },
                { label: 'Completed',       value: completedExams.length,                           color: 'text-purple-600',  bg: 'bg-purple-50 border-purple-100',   icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
                { label: 'Enrolled Classes',value: profileData?.enrolled_classes?.length || 0,     color: 'text-brand-600',   bg: 'bg-brand-50 border-brand-100',     icon: 'M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-card hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 flex items-center gap-4">
                  <div className={`w-11 h-11 ${s.bg} rounded-xl border flex items-center justify-center flex-shrink-0 shadow-sm`}>
                    <svg className={`w-5 h-5 ${s.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
                    </svg>
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold text-slate-900 font-display">{s.value}</p>
                    <p className="text-xs font-semibold text-slate-500">{s.label}</p>
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
            <h2 className="text-lg font-bold text-slate-900 font-display border-b border-slate-100 pb-3">Student Profile & Biometrics</h2>
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
                <h3 className="font-bold text-slate-800 text-lg">{user?.name}</h3>
                <p className="text-xs text-slate-500 font-mono">{user?.email}</p>
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

            {/* My Enrolled Classes Section */}
            <div className="bg-brand-50/50 border border-brand-200/70 rounded-2xl p-5 space-y-3">
              <h4 className="text-xs font-bold text-brand-800 uppercase tracking-wide flex items-center gap-2">
                <span>🏫</span> My Enrolled Classes
              </h4>
              {profileData?.enrolled_classes?.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {profileData.enrolled_classes.map(cls => (
                    <div key={cls.id} className="bg-white p-3 rounded-xl border border-brand-100 shadow-sm">
                      <p className="font-bold text-slate-900 text-xs">{cls.name}</p>
                      {cls.description && <p className="text-[11px] text-slate-500 mt-0.5">{cls.description}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  You are not currently enrolled in any class rooms.
                </p>
              )}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
              <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide">How face verification works</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                SecureExam AI records facial landmarks during exam start and matches them in real-time. This prevents impersonation, head-turning, or multi-face presence violations.
              </p>
              {!user?.face_enrolled && (
                <Link to="/enroll-face" className="inline-block px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl shadow-sm transition">
                  Re-enroll Biometrics Now →
                </Link>
              )}
            </div>

            {/* Request Face Update Section — only shown when face IS enrolled */}
            {user?.face_enrolled && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3">
                <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wide flex items-center gap-2">
                  🔄 Request Face ID Update
                </h4>
                <p className="text-xs text-amber-700 leading-relaxed">
                  If your face looks different (new glasses, changed appearance, poor enrollment photo), you can request your teacher to approve a face update. You will receive an email once approved.
                </p>

                {faceRequestState === 'submitted' ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-100 border border-amber-300 rounded-xl">
                    <span className="text-lg">⏳</span>
                    <div>
                      <p className="text-xs font-bold text-amber-800">Pending Teacher Approval</p>
                      <p className="text-[11px] text-amber-700">{faceRequestMsg}</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      value={faceRequestReason}
                      onChange={e => setFaceRequestReason(e.target.value)}
                      placeholder="Brief reason (e.g. 'Changed appearance, previous photo was dark')"
                      rows={2}
                      className="w-full text-xs px-3 py-2 rounded-xl border border-amber-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
                    />
                    {faceRequestMsg && (
                      <p className="text-xs text-red-600 font-semibold">{faceRequestMsg}</p>
                    )}
                    <button
                      onClick={handleFaceUpdateRequest}
                      disabled={faceRequestState === 'submitting' || !faceRequestReason.trim()}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition disabled:opacity-60 flex items-center gap-1.5"
                    >
                      {faceRequestState === 'submitting'
                        ? <><span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" /> Submitting...</>
                        : '📤 Submit Request to Teacher'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-2 flex items-center justify-around shadow-lg">
        {TABS.map(t => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${
                isActive ? 'text-brand-600 font-bold' : 'text-slate-500 font-medium'
              }`}
            >
              <svg className={`w-5 h-5 ${isActive ? 'text-brand-600' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={isActive ? 2.2 : 1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d={t.icon} />
              </svg>
              <span className="text-[10px] leading-none">{t.label.split(' ')[0]}</span>
            </button>
          );
        })}

        <button
          onClick={() => navigate('/student/attendance')}
          className="flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-indigo-600 font-bold transition"
        >
          <div className="w-5 h-5 flex items-center justify-center text-sm leading-none">📷</div>
          <span className="text-[10px] leading-none text-indigo-600">Attendance</span>
        </button>
      </nav>
    </div>
  );
}