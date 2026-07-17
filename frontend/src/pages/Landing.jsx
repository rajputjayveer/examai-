import React from 'react';
import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-slate-100 flex flex-col items-center justify-center px-4 py-12">
      {/* Decorative blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-brand-200 opacity-25 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-indigo-200 opacity-20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-4xl animate-slide-up">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-600 rounded-2xl shadow-lg mb-5">
            <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 font-display leading-tight">
            ExamGuard <span className="text-brand-600">AI</span>
          </h1>
          <p className="mt-3 text-lg text-slate-500 max-w-xl mx-auto">
            AI-powered proctored online examination system with real-time face detection and auto-evaluation.
          </p>
        </div>

        {/* Role cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Student Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-8 flex flex-col hover:shadow-card-hover transition-shadow duration-200">
            <div className="w-12 h-12 bg-brand-50 border border-brand-200 rounded-2xl flex items-center justify-center mb-5">
              <svg className="w-6 h-6 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900 font-display mb-2">Student</h2>
            <p className="text-sm text-slate-500 mb-6 flex-1">
              Take proctored exams, view your results, and track your progress. Register once, then enroll your face for secure identity verification.
            </p>
            <div className="flex flex-col gap-3">
              <Link
                to="/login"
                id="student-login-btn"
                className="w-full text-center py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition shadow-sm"
              >
                Student / Teacher Login
              </Link>
              <Link
                to="/register"
                id="student-register-btn"
                className="w-full text-center py-3 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-sm transition"
              >
                New Student? Register →
              </Link>
            </div>
          </div>

          {/* Teacher Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-8 flex flex-col hover:shadow-card-hover transition-shadow duration-200">
            <div className="w-12 h-12 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-center mb-5">
              <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900 font-display mb-2">Teacher</h2>
            <p className="text-sm text-slate-500 mb-6 flex-1">
              Create exams, upload question papers via PDF (AI extraction), set the answer key, and view student results and proctoring reports.
            </p>
            <div className="flex flex-col gap-3">
              <Link
                to="/login"
                id="teacher-login-btn"
                className="w-full text-center py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition shadow-sm"
              >
                Teacher Login
              </Link>
              <div className="w-full text-center py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 font-semibold text-sm cursor-default select-none">
                Accounts created by Admin only
              </div>
            </div>
          </div>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-3 mb-10">
          {[
            { icon: '🔍', label: 'Real-time Face Detection' },
            { icon: '🤖', label: 'AI Question Extraction (PDF)' },
            { icon: '📊', label: 'Auto Evaluation' },
            { icon: '🛡️', label: 'Tab Switch Detection' },
            { icon: '📄', label: 'PDF Reports' },
          ].map(f => (
            <span key={f.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs text-slate-600 font-medium shadow-sm">
              {f.icon} {f.label}
            </span>
          ))}
        </div>

        {/* Admin link — discreet, at the very bottom */}
        <div className="text-center">
          <Link
            to="/admin"
            id="admin-portal-link"
            className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2 transition"
          >
            Administrator Access
          </Link>
        </div>
      </div>
    </div>
  );
}
