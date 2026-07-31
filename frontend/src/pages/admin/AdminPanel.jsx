import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function AdminPanel() {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState('teachers');
  const [usersList, setUsersList] = useState([]);
  const [attemptsList, setAttemptsList] = useState([]);
  const [teacherName, setTeacherName] = useState('');
  const [teacherEmail, setTeacherEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState(null);

  // Filters for Exam Results
  const [selectedExamFilter, setSelectedExamFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [hasViolationsFilter, setHasViolationsFilter] = useState('All');

  const authHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, attemptsRes] = await Promise.all([
        client.get('/admin/users', authHeader()),
        client.get('/admin/attempts', authHeader()),
      ]);
      setUsersList(usersRes.data);
      setAttemptsList(attemptsRes.data);
    } catch {
      setError('Session expired. Please log in again.');
      logout();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateTeacher = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    setSubmitting(true);
    try {
      await client.post('/auth/admin/create-teacher',
        { name: teacherName, email: teacherEmail, role: 'teacher' },
        authHeader()
      );
      setSuccess(`Teacher account for ${teacherName} created! Auto-generated login credentials emailed to ${teacherEmail}.`);
      setTeacherName(''); setTeacherEmail('');
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create teacher account.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Delete this user? This action cannot be undone.')) return;
    setError(''); setSuccess('');
    setDeletingUserId(userId);
    try {
      await client.delete(`/admin/users/${userId}`, authHeader());
      setSuccess('User deleted successfully.');
      await fetchData();
    } catch {
      setError('Failed to delete user.');
    } finally {
      setDeletingUserId(null);
    }
  };


  const uniqueExams = Array.from(new Set(attemptsList.map(a => a.exam_title))).filter(Boolean);

  const filteredAttempts = attemptsList.filter(row => {
    const matchesExam = selectedExamFilter === 'All' || row.exam_title === selectedExamFilter;
    const matchesSearch = 
      row.student_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      row.student_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      row.exam_title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesViolations = 
      hasViolationsFilter === 'All' || 
      (hasViolationsFilter === 'Yes' && row.violations_count > 0) || 
      (hasViolationsFilter === 'No' && row.violations_count === 0);
    return matchesExam && matchesSearch && matchesViolations;
  });

  const tabs = [
    { key: 'teachers', label: 'Teacher Creation' },
    { key: 'users',    label: 'User Directory' },
    { key: 'results',  label: 'Exam Results' },
  ];

  // ── Dashboard ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 font-display">Admin Dashboard</h1>
              <p className="text-xs text-slate-500">SecureExam AI Management</p>
            </div>
          </div>
          <button onClick={logout}
            className="px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-sm font-semibold transition">
            Sign Out
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Alerts */}
        {error && (
          <div className="mb-6 flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" /></svg>
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 flex items-start gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-700">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>
            {success}
          </div>
        )}

        {/* Stats strip */}
        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {[
              {
                label: 'Total Teachers',
                value: usersList.filter(u => u.role === 'teacher').length,
                color: 'text-emerald-700',
                bg: 'from-emerald-50 to-teal-50 border-emerald-200/60',
                icon: (
                  <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                )
              },
              {
                label: 'Total Students',
                value: usersList.filter(u => u.role === 'student').length,
                color: 'text-brand-700',
                bg: 'from-brand-50 to-indigo-50 border-brand-200/60',
                icon: (
                  <svg className="w-6 h-6 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" />
                  </svg>
                )
              },
              {
                label: 'Total Exams Run',
                value: attemptsList.length,
                color: 'text-violet-700',
                bg: 'from-violet-50 to-fuchsia-50 border-violet-200/60',
                icon: (
                  <svg className="w-6 h-6 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                )
              },
            ].map(stat => (
              <div key={stat.label} className={`relative overflow-hidden bg-gradient-to-br ${stat.bg} rounded-2xl border p-6 shadow-sm transition hover:shadow-md flex items-center justify-between`}>
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{stat.label}</p>
                  <p className={`text-3xl font-extrabold font-display mt-2 ${stat.color}`}>{stat.value}</p>
                </div>
                <div className="p-3 bg-white/80 rounded-xl shadow-xs border border-slate-100">
                  {stat.icon}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-slate-200 rounded-2xl p-1.5 shadow-xs mb-8 w-fit">
          {tabs.map(t => (
            <button key={t.key} onClick={() => { setActiveTab(t.key); setError(''); setSuccess(''); }}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === t.key
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-4 border-brand-200 border-t-brand-600 animate-spin" />
          </div>
        ) : (
          <>
            {/* ── TAB 1: Teacher Creation ── */}
            {activeTab === 'teachers' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Form */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 h-fit">
                  <h3 className="text-base font-bold text-slate-900 font-display mb-5">Register New Teacher</h3>
                  <form onSubmit={handleCreateTeacher} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name</label>
                      <input type="text" required value={teacherName}
                        onChange={e => setTeacherName(e.target.value)}
                        className="input text-xs" placeholder="Prof. John Smith" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Email Address</label>
                      <input type="email" required value={teacherEmail}
                        onChange={e => setTeacherEmail(e.target.value)}
                        className="input text-xs" placeholder="teacher@college.edu" />
                    </div>
                    <p className="text-[11px] text-slate-400 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      ℹ️ A secure temporary password will be auto-generated and emailed to the instructor.
                    </p>
                    <button type="submit" disabled={submitting}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                      {submitting ? 'Creating Account…' : '+ Create Teacher Account'}
                    </button>
                  </form>
                </div>

                {/* Existing teachers */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="text-base font-bold text-slate-900 font-display">Registered Teachers</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{usersList.filter(u => u.role === 'teacher').length} teacher(s) registered</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          {['Name', 'Email', 'Action'].map(h => (
                            <th key={h} className={`px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider ${h === 'Action' ? 'text-right' : 'text-left'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {usersList.filter(u => u.role === 'teacher').length === 0 ? (
                          <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-400 text-xs">No teachers yet. Create one above.</td></tr>
                        ) : usersList.filter(u => u.role === 'teacher').map(t => (
                          <tr key={t.id} className="hover:bg-slate-50 transition">
                            <td className="px-6 py-4 font-bold text-slate-900 text-xs">{t.name}</td>
                            <td className="px-6 py-4 text-slate-600 text-xs font-mono">{t.email}</td>
                            <td className="px-6 py-4 text-right">
                              <button onClick={() => handleDelete(t.id)}
                                disabled={deletingUserId === t.id}
                                className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-bold border border-red-200 text-xs transition disabled:opacity-50 inline-flex items-center gap-1.5">
                                {deletingUserId === t.id ? (
                                  <>
                                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                                    Removing…
                                  </>
                                ) : 'Remove'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 2: User Directory ── */}
            {activeTab === 'users' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h3 className="text-base font-bold text-slate-900 font-display">All Users</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{usersList.length} user(s) total</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        {['Name', 'Email', 'Role', 'Face Enrolled', 'Actions'].map(h => (
                          <th key={h} className={`px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider ${h === 'Actions' ? 'text-right' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {usersList.map(u => (
                        <tr key={u.id} className="hover:bg-slate-50 transition">
                          <td className="px-6 py-4 font-bold text-slate-900 text-xs">{u.name}</td>
                          <td className="px-6 py-4 text-slate-600 text-xs font-mono">{u.email}</td>
                          <td className="px-6 py-4 text-xs">
                            <span className={u.role === 'teacher' ? 'px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-250 font-bold' : 'px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold'}>{u.role}</span>
                          </td>
                          <td className="px-6 py-4 text-xs">
                            {u.role === 'student'
                              ? (u.face_enrolled
                                  ? <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">✓ Yes</span>
                                  : <span className="px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-bold">✗ No</span>)
                              : <span className="text-slate-400 font-medium">N/A</span>}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => handleDelete(u.id)}
                              disabled={deletingUserId === u.id}
                              className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-bold border border-red-200 text-xs transition disabled:opacity-50 inline-flex items-center gap-1.5">
                              {deletingUserId === u.id ? (
                                <>
                                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                                  Deleting…
                                </>
                              ) : 'Delete'}
                            </button>
                          </td>

                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB 3: Exam Results ── */}
            {activeTab === 'results' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 font-display">Exam Attempts Overview</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Showing {filteredAttempts.length} of {attemptsList.length} recorded attempts
                    </p>
                  </div>

                  {/* Filter controls */}
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Search Input */}
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search student or exam..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="input text-xs py-1.5 pl-8 pr-3 w-48 md:w-56 focus:ring-1 focus:ring-brand-500"
                      />
                      <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>

                    {/* Exam Filter Dropdown */}
                    <div className="flex items-center gap-1.5 text-xs">
                      <label className="font-semibold text-slate-650 whitespace-nowrap">Exam:</label>
                      <select
                        value={selectedExamFilter}
                        onChange={e => setSelectedExamFilter(e.target.value)}
                        className="rounded-lg border border-slate-250 bg-white px-2.5 py-1.5 font-medium text-slate-700 outline-none focus:border-brand-500"
                      >
                        <option value="All">All Exams</option>
                        {uniqueExams.map(exam => (
                          <option key={exam} value={exam}>{exam}</option>
                        ))}
                      </select>
                    </div>

                    {/* Violations Filter Dropdown */}
                    <div className="flex items-center gap-1.5 text-xs">
                      <label className="font-semibold text-slate-650 whitespace-nowrap">Integrity:</label>
                      <select
                        value={hasViolationsFilter}
                        onChange={e => setHasViolationsFilter(e.target.value)}
                        className="rounded-lg border border-slate-250 bg-white px-2.5 py-1.5 font-medium text-slate-700 outline-none focus:border-brand-500"
                      >
                        <option value="All">All Integrity Status</option>
                        <option value="Yes">⚠️ Has Violations</option>
                        <option value="No">✅ Clean Attempts</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        {['Student', 'Exam', 'Status', 'Score', 'Violations', 'Report'].map(h => (
                          <th key={h} className={`px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider ${h === 'Report' ? 'text-right' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {filteredAttempts.length === 0 ? (
                        <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400 text-xs">No matching attempts found.</td></tr>
                      ) : filteredAttempts.map(row => (
                        <tr key={row.attempt_id} className="hover:bg-slate-50 transition">
                          <td className="px-6 py-4 text-xs">
                            <p className="font-bold text-slate-900">{row.student_name}</p>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{row.student_email}</p>
                          </td>
                          <td className="px-6 py-4 font-semibold text-slate-800 text-xs">{row.exam_title}</td>
                          <td className="px-6 py-4 text-xs">
                            <span className={row.status === 'graded' ? 'px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold' : 'px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-bold'}>{row.status}</span>
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-900 text-xs">
                            {row.score !== null ? `${row.score} pts` : <span className="text-slate-400 font-medium">Pending</span>}
                          </td>
                          <td className="px-6 py-4 text-xs">
                            {row.violations_count > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-bold">
                                ⚠️ {row.violations_count}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                                ✓ Clean
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Link to={`/teacher/report/${row.attempt_id}`}
                              className="px-3 py-1.5 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold border border-brand-200 text-xs transition">
                              View Report
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
