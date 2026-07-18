import React from 'react';
import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-between text-slate-800 font-sans selection:bg-brand-500 selection:text-white">
      {/* Navbar */}
      <header className="w-full max-w-7xl mx-auto px-6 py-5 flex items-center justify-between z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center shadow-md shadow-brand-500/20">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <span className="font-extrabold text-slate-900 font-display tracking-tight text-lg">SecureExam <span className="text-brand-600">AI</span></span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/login" className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition">Sign In</Link>
          <Link to="/register" className="px-5 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm transition">Register</Link>
        </div>
      </header>

      {/* Decorative Blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-brand-200 opacity-20 rounded-full blur-3xl" />
        <div className="absolute top-[30%] -right-40 w-[500px] h-[500px] bg-indigo-200 opacity-20 rounded-full blur-3xl" />
      </div>

      {/* Main Hero Section */}
      <main className="w-full max-w-7xl mx-auto px-6 py-12 md:py-20 flex flex-col items-center gap-16 relative z-10 flex-1">
        <div className="text-center max-w-3xl space-y-6">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-brand-50 border border-brand-200 text-xs font-bold text-brand-700 uppercase tracking-wider">
            ⚡ Intelligent Remote Assessment
          </span>
          <h1 className="text-4xl sm:text-6xl font-black text-slate-900 font-display leading-[1.1] tracking-tight">
            The Secure Way to Conduct <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-indigo-600">Online Exams</span>
          </h1>
          <p className="text-base sm:text-lg text-slate-500 max-w-2xl mx-auto font-medium">
            An advanced exam invigilation platform powered by real-time biometrics, tab security, and instant AI-assisted evaluation.
          </p>
          <div className="flex flex-wrap justify-center gap-4 pt-4">
            <Link to="/login" className="px-8 py-3.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm shadow-lg shadow-brand-500/25 transition">
              Launch Portal
            </Link>
            <Link to="/register" className="px-8 py-3.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-sm shadow-sm transition">
              Create Student Account
            </Link>
          </div>
        </div>

        {/* Roles & Portals Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
          {/* Student Portal Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card hover:shadow-card-hover p-8 flex flex-col justify-between transition-all duration-300">
            <div>
              <div className="w-12 h-12 bg-brand-50 border border-brand-100 rounded-2xl flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-slate-900 font-display mb-3">Student Workspace</h2>
              <p className="text-sm text-slate-500 leading-relaxed mb-6">
                Complete pre-exam hardware diagnostic checks, verify your biometrics securely, and write tests with non-intrusive AI supervision.
              </p>
            </div>
            <Link to="/login" className="w-full text-center py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm shadow-sm transition">
              Enter Student Portal →
            </Link>
          </div>

          {/* Teacher Portal Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card hover:shadow-card-hover p-8 flex flex-col justify-between transition-all duration-300">
            <div>
              <div className="w-12 h-12 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-slate-900 font-display mb-3">Instructor Console</h2>
              <p className="text-sm text-slate-500 leading-relaxed mb-6">
                Generate exam papers instantly via AI-powered PDF extraction, configure questions, analyze student violations, and check class analytics.
              </p>
            </div>
            <Link to="/login" className="w-full text-center py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm transition">
              Enter Instructor Portal →
            </Link>
          </div>
        </div>

        {/* 3-Step Roadmap / Process */}
        <div className="w-full bg-white rounded-3xl border border-slate-200 p-8 md:p-12 shadow-card max-w-4xl">
          <h3 className="text-center font-bold text-slate-900 text-xl font-display mb-10">How It Works</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {[
              { num: '01', title: 'Enroll & Verify', desc: 'Students register and quickly enroll their face to establish reference biometrics.' },
              { num: '02', title: 'Take Proctored Test', desc: 'Securely write exams inside a guarded browser window featuring face, audio, and focus tracking.' },
              { num: '03', title: 'Get Smart Reports', desc: 'Instant auto-evaluation and comprehensive proctoring reports detailing any classroom violations.' }
            ].map((step, idx) => (
              <div key={step.num} className="relative flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-full bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-700 font-black text-lg">
                  {step.num}
                </div>
                <h4 className="font-bold text-slate-950 font-display">{step.title}</h4>
                <p className="text-xs text-slate-500 leading-relaxed px-2">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Trust Signals Section */}
        <div className="w-full max-w-4xl space-y-6">
          <h3 className="text-center font-bold text-slate-900 text-lg font-display">Active Proctoring Security Signals</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: '👤', title: 'Face Landmark Matching', desc: 'Tracks head orientation & gaze direction.' },
              { icon: '🔒', title: 'Tab & Focus Lockout', desc: 'Instantly warns on tab switching or blur.' },
              { icon: '🎤', title: 'Audio & Speaking Guard', desc: 'Monitors audio levels for noise violations.' },
              { icon: '🛡️', title: 'Biometric Check-in', desc: 'Runs periodic identity checks against profile.' }
            ].map(item => (
              <div key={item.title} className="bg-slate-100/60 hover:bg-slate-100 rounded-2xl p-5 border border-slate-200 flex flex-col gap-2 transition duration-200">
                <span className="text-2xl">{item.icon}</span>
                <h4 className="font-bold text-xs text-slate-900 leading-snug">{item.title}</h4>
                <p className="text-[10px] text-slate-500 leading-normal">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-white border-t border-slate-200 py-6 text-center z-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-400">© 2026 SecureExam AI. All rights reserved.</p>
          <Link to="/admin" className="text-xs text-slate-400 hover:text-slate-600 hover:underline transition">
            Administrator Access Console
          </Link>
        </div>
      </footer>
    </div>
  );
}

