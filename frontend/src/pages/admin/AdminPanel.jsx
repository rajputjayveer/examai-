import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';

export default function AdminPanel() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [activeTab, setActiveTab] = useState('teachers');
  const [usersList, setUsersList] = useState([]);
  const [attemptsList, setAttemptsList] = useState([]);
  const [teacherName, setTeacherName] = useState('');
  const [teacherEmail, setTeacherEmail] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const authHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  const fetchData = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
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
      handleLogout();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isLoggedIn) fetchData(); }, [isLoggedIn]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    const params = new URLSearchParams();
    params.append('username', username);
    params.append('password', password);
    try {
      const res = await client.post('/auth/login', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      localStorage.setItem('token', res.data.access_token);
      setIsLoggedIn(true);
    } catch {
      setError('Invalid admin credentials. Check username and password.');
    }
  };

  const handleCreateTeacher = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      await client.post('/auth/admin/create-teacher',
        { name: teacherName, email: teacherEmail, password: teacherPassword, role: 'teacher' },
        authHeader()
      );
      setSuccess('Teacher account created successfully!');
      setTeacherName(''); setTeacherEmail(''); setTeacherPassword('');
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create teacher account.');
    }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Delete this user? This action cannot be undone.')) return;
    setError(''); setSuccess('');
    try {
      await client.delete(`/admin/users/${userId}`, authHeader());
      setSuccess('User deleted successfully.');
      fetchData();
    } catch {
      setError('Failed to delete user.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    setIsLoggedIn(false);
  };

  const tabs = [
    { key: 'teachers', label: 'Teacher Creation' },
    { key: 'users',    label: 'User Directory' },
    { key: 'results',  label: 'Exam Results' },
  ];

  // ── Login screen ─────────────────────────────────────────────────────────────
  if (!isLoggedIn) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-brand-50 flex items-center justify-center px-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-brand-200 opacity-25 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-slate-300 opacity-20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-slide-up">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-800 rounded-2xl shadow-lg mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 font-display">Admin Portal</h1>
          <p className="mt-1 text-sm text-slate-500">ExamGuard AI Management Console</p>
        </div>

        <div className="bg-white rounded-2xl shadow-card border border-slate-200 p-8">
          {error && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-200 p-3.5 text-sm text-red-700">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Admin Username</label>
              <input id="admin-username" type="text" required value={username}
                onChange={e => setUsername(e.target.value)} className="input"
                placeholder="admin@examguard.com" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Admin Password</label>
              <input id="admin-password" type="password" required value={password}
                onChange={e => setPassword(e.target.value)} className="input"
                placeholder="••••••••" />
            </div>
            <button id="admin-login-btn" type="submit"
              className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-semibold text-sm transition shadow-sm">
              Log In as Admin
            </button>
          </form>
        </div>
      </div>
    </div>
  );

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
              <p className="text-xs text-slate-500">ExamGuard AI Management</p>
            </div>
          </div>
          <button onClick={handleLogout}
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

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm mb-6 w-fit">
          {tabs.map(t => (
            <button key={t.key} onClick={() => { setActiveTab(t.key); setError(''); setSuccess(''); }}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
                activeTab === t.key
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50'
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
                <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6">
                  <h3 className="text-base font-bold text-slate-900 font-display mb-5">Register New Teacher</h3>
                  <form onSubmit={handleCreateTeacher} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name</label>
                      <input type="text" required value={teacherName}
                        onChange={e => setTeacherName(e.target.value)}
                        className="input" placeholder="Prof. John Smith" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Email Address</label>
                      <input type="email" required value={teacherEmail}
                        onChange={e => setTeacherEmail(e.target.value)}
                        className="input" placeholder="teacher@college.edu" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Password</label>
                      <input type="password" required value={teacherPassword}
                        onChange={e => setTeacherPassword(e.target.value)}
                        className="input" placeholder="••••••••" />
                    </div>
                    <button type="submit"
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition shadow-sm">
                      + Create Teacher Account
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
                          <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-400 text-sm">No teachers yet. Create one above.</td></tr>
                        ) : usersList.filter(u => u.role === 'teacher').map(t => (
                          <tr key={t.id} className="hover:bg-slate-50 transition">
                            <td className="px-6 py-4 font-semibold text-slate-900">{t.name}</td>
                            <td className="px-6 py-4 text-slate-600">{t.email}</td>
                            <td className="px-6 py-4 text-right">
                              <button onClick={() => handleDelete(t.id)}
                                className="text-xs font-semibold text-red-600 hover:text-red-700 hover:underline">
                                Remove
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
                    <tbody className="divide-y divide-slate-100">
                      {usersList.map(u => (
                        <tr key={u.id} className="hover:bg-slate-50 transition">
                          <td className="px-6 py-4 font-semibold text-slate-900">{u.name}</td>
                          <td className="px-6 py-4 text-slate-600">{u.email}</td>
                          <td className="px-6 py-4">
                            <span className={u.role === 'teacher' ? 'badge-blue' : 'badge-slate'}>{u.role}</span>
                          </td>
                          <td className="px-6 py-4">
                            {u.role === 'student'
                              ? (u.face_enrolled
                                  ? <span className="badge-green">✓ Yes</span>
                                  : <span className="badge-red">✗ No</span>)
                              : <span className="text-slate-400 text-xs">N/A</span>}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => handleDelete(u.id)}
                              className="text-xs font-semibold text-red-600 hover:text-red-700 hover:underline">
                              Delete
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
                <div className="px-6 py-4 border-b border-slate-100">
                  <h3 className="text-base font-bold text-slate-900 font-display">Exam Attempts Overview</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{attemptsList.length} attempt(s) recorded</p>
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
                    <tbody className="divide-y divide-slate-100">
                      {attemptsList.length === 0 ? (
                        <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400">No attempts recorded yet.</td></tr>
                      ) : attemptsList.map(row => (
                        <tr key={row.attempt_id} className="hover:bg-slate-50 transition">
                          <td className="px-6 py-4 font-semibold text-slate-900">{row.student_name}</td>
                          <td className="px-6 py-4 text-slate-600">{row.exam_title}</td>
                          <td className="px-6 py-4">
                            <span className={row.status === 'graded' ? 'badge-green' : 'badge-amber'}>{row.status}</span>
                          </td>
                          <td className="px-6 py-4 font-medium text-slate-800">
                            {row.score !== null ? `${row.score} pts` : <span className="text-slate-400">Pending</span>}
                          </td>
                          <td className="px-6 py-4">
                            <span className={row.violations_count > 0 ? 'badge-red' : 'text-slate-400 text-xs'}>
                              {row.violations_count > 0 ? `⚠ ${row.violations_count}` : '0'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Link to={`/teacher/report/${row.attempt_id}`}
                              className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline">
                              View →
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
