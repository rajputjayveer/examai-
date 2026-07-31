import React, { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function Login() {
  const [searchParams] = useSearchParams();
  const initialRole = searchParams.get('role') || (window.location.pathname.includes('/admin') ? 'admin' : 'student');
  const [roleTab, setRoleTab] = useState(initialRole); // 'student', 'teacher', 'admin'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();


  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);

      // Verify returned role against selected role tab (warn if mismatched)
      if (user && user.role !== roleTab && !(roleTab === 'admin' && user.role === 'admin')) {
        console.warn(`User role '${user.role}' logged in under '${roleTab}' tab.`);
      }

      const nextParam = searchParams.get('next');
      const pendingNextUrl = sessionStorage.getItem('pendingNextUrl');
      const pendingExam = sessionStorage.getItem('pendingExamJoin');

      if (user?.role === 'admin') {
        navigate('/admin');
      } else if (user?.role === 'teacher') {
        navigate('/teacher/exams');
      } else {
        if (nextParam) {
          navigate(nextParam);
        } else if (pendingNextUrl) {
          sessionStorage.removeItem('pendingNextUrl');
          navigate(pendingNextUrl);
        } else if (pendingExam) {
          sessionStorage.removeItem('pendingExamJoin');
          navigate(`/student/instructions/${pendingExam}`);
        } else {
          navigate('/student/dashboard');
        }
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const roleConfigs = {
    student: {
      title: 'Student Portal Login',
      subtitle: 'Sign in to access your assigned proctored exams',
      placeholderEmail: 'student@example.com',
      badgeColor: 'bg-brand-50 text-brand-700 border-brand-200'
    },
    teacher: {
      title: 'Instructor Portal Login',
      subtitle: 'Sign in to manage classes, exams, and student analytics',
      placeholderEmail: 'teacher@college.edu',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200'
    },
    admin: {
      title: 'Admin Console Login',
      subtitle: 'Sign in to manage teachers, users, and platform settings',
      placeholderEmail: 'admin@secureexam.ai',
      badgeColor: 'bg-slate-100 text-slate-800 border-slate-300'
    }
  };

  const currentConfig = roleConfigs[roleTab];

  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-slate-100 flex items-center justify-center px-4 py-8">
      {/* Decorative blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-brand-200 opacity-30 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-brand-300 opacity-20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-600 rounded-2xl shadow-lg mb-3">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 font-display">SecureExam <span className="text-brand-600">AI</span></h1>
          <p className="mt-1 text-xs text-slate-500 font-medium">Unified Authentication Portal</p>
        </div>

        {/* Role Selector Tabs */}
        <div className="grid grid-cols-3 gap-1 bg-slate-200/80 p-1.5 rounded-2xl mb-6 shadow-inner">
          <button
            type="button"
            onClick={() => { setRoleTab('student'); setError(''); }}
            className={`py-2 px-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              roleTab === 'student'
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🎓</span> Student
          </button>
          <button
            type="button"
            onClick={() => { setRoleTab('teacher'); setError(''); }}
            className={`py-2 px-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              roleTab === 'teacher'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>👨‍🏫</span> Teacher
          </button>
          <button
            type="button"
            onClick={() => { setRoleTab('admin'); setError(''); }}
            className={`py-2 px-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              roleTab === 'admin'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🛡️</span> Admin
          </button>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-card border border-slate-200 p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900 font-display">{currentConfig.title}</h2>
            <p className="text-xs text-slate-500 mt-1">{currentConfig.subtitle}</p>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs font-semibold text-red-700">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Email Address</label>
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input text-xs"
                placeholder={currentConfig.placeholderEmail}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-bold text-slate-700">Password</label>
                <Link to="/forgot-password" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input text-xs pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none p-1"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12c1.274 4.057 5.065 7 9.964 7 4.899 0 8.69-2.943 9.964-7-1.274-4.057-5.065-7-9.964-7-4.899 0-8.69 2.943-9.964 7z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition-all duration-150 shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Signing in…
                </>
              ) : `Sign In as ${roleTab.charAt(0).toUpperCase() + roleTab.slice(1)}`}
            </button>
          </form>

          {roleTab === 'student' && (
            <p className="mt-6 text-center text-xs text-slate-500">
              New student?{' '}
              <Link to="/register" className="font-bold text-brand-600 hover:text-brand-700">
                Create an account
              </Link>
            </p>
          )}

          {roleTab === 'teacher' && (
            <p className="mt-6 text-center text-xs text-slate-400">
              Teacher accounts are created by your administrator. Contact your admin for access credentials.
            </p>
          )}

          {roleTab === 'admin' && (
            <p className="mt-6 text-center text-xs text-slate-400">
              Admin console access for platform administrators.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
