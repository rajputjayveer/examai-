import React, { useState } from 'react';
import client from '../../api/client';

export default function AdminPanel() {
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(!!localStorage.getItem('adminToken'));
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  
  const [teacherName, setTeacherName] = useState('');
  const [teacherEmail, setTeacherEmail] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setError('');
    const params = new URLSearchParams();
    params.append('username', adminUsername);
    params.append('password', adminPassword);

    try {
      const res = await client.post('/auth/login', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      localStorage.setItem('adminToken', res.data.access_token);
      setIsAdminLoggedIn(true);
    } catch (err) {
      setError('Invalid admin credentials.');
    }
  };

  const handleCreateTeacher = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const adminToken = localStorage.getItem('adminToken');
      await client.post('/auth/admin/create-teacher', {
        name: teacherName,
        email: teacherEmail,
        password: teacherPassword,
        role: 'teacher'
      }, {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });
      setSuccess('Teacher account created successfully!');
      setTeacherName('');
      setTeacherEmail('');
      setTeacherPassword('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create teacher account.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    setIsAdminLoggedIn(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8">
      <div className="w-full max-w-md glass-panel glow-card rounded-2xl p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-white">Admin Portal</h2>
          <p className="mt-2 text-sm text-slate-400">ExamGuard AI Management</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400 border border-red-500/20">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 rounded-lg bg-green-500/10 p-3 text-sm text-green-400 border border-green-500/20">
            {success}
          </div>
        )}

        {!isAdminLoggedIn ? (
          <form onSubmit={handleAdminLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300">Admin Username</label>
              <input
                type="text"
                required
                value={adminUsername}
                onChange={(e) => setAdminUsername(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-3 text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300">Admin Password</label>
              <input
                type="password"
                required
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-3 text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-brand-500 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              Log In as Admin
            </button>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-slate-800">
              <span className="text-sm font-medium text-slate-350">Create Teacher Account</span>
              <button onClick={handleLogout} className="text-xs text-brand-500 hover:underline">
                Sign Out
              </button>
            </div>
            <form onSubmit={handleCreateTeacher} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400">Teacher Name</label>
                <input
                  type="text"
                  required
                  value={teacherName}
                  onChange={(e) => setTeacherName(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2.5 text-white focus:border-brand-500 focus:outline-none"
                  placeholder="Prof. Srijan Akshit"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400">Email Address</label>
                <input
                  type="email"
                  required
                  value={teacherEmail}
                  onChange={(e) => setTeacherEmail(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2.5 text-white focus:border-brand-500 focus:outline-none"
                  placeholder="teacher@examguard.com"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400">Password</label>
                <input
                  type="password"
                  required
                  value={teacherPassword}
                  onChange={(e) => setTeacherPassword(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2.5 text-white focus:border-brand-500 focus:outline-none"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                className="w-full mt-2 rounded-lg bg-green-600 py-3 text-sm font-semibold text-white transition hover:bg-green-700"
              >
                Create Teacher Account
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
