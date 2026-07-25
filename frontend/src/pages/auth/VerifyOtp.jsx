import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import client from '../../api/client';

export default function VerifyOtp() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') || '';
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleChange = (value, idx) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...otp];
    next[idx] = value;
    setOtp(next);
    if (value && idx < 5) {
      document.getElementById(`otp-${idx + 1}`)?.focus();
    }
  };

  const handleKeyDown = (e, idx) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      document.getElementById(`otp-${idx - 1}`)?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split('');
    const next = [...otp];
    pasted.forEach((d, i) => { next[i] = d; });
    setOtp(next);
    document.getElementById(`otp-${Math.min(pasted.length, 5)}`)?.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length < 6) { setError('Please enter all 6 digits.'); return; }
    setError('');
    setLoading(true);
    try {
      await client.post(`/auth/verify-otp?email=${encodeURIComponent(email)}&otp_code=${code}`);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 1800);
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid or expired code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-slate-100 flex items-center justify-center px-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-brand-200 opacity-25 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-slide-up">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6 px-2">
          {['Account Details', 'Verify Email', 'Face Enroll'].map((step, i) => (
            <React.Fragment key={step}>
              <div className="flex items-center gap-1.5">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  i === 0 ? 'bg-brand-200 text-brand-700' : i === 1 ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-400'
                }`}>
                  {i === 0 ? '✓' : i + 1}
                </div>
                <span className={`text-xs font-medium ${i === 1 ? 'text-brand-700' : 'text-slate-400'}`}>{step}</span>
              </div>
              {i < 2 && <div className="flex-1 h-px bg-slate-200" />}
            </React.Fragment>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-card border border-slate-200 p-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-50 rounded-2xl mb-4">
            <svg className="w-7 h-7 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-1">Check your email</h2>
          <p className="text-sm text-slate-500 mb-8">
            We sent a 6-digit code to <span className="font-semibold text-slate-700">{email}</span>
          </p>

          {success && (
            <div className="mb-6 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-700 font-medium">
              ✓ Email verified! Redirecting to login…
            </div>
          )}

          {error && (
            <div className="mb-6 rounded-xl bg-red-50 border border-red-200 p-3.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="flex gap-3 justify-center mb-8" onPaste={handlePaste}>
              {otp.map((digit, idx) => (
                <input
                  key={idx}
                  id={`otp-${idx}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(e.target.value, idx)}
                  onKeyDown={(e) => handleKeyDown(e, idx)}
                  className="w-12 h-14 text-center text-xl font-bold rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition"
                />
              ))}
            </div>

            <button
              id="otp-submit"
              type="submit"
              disabled={loading || success}
              className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition-all duration-150 shadow-sm flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Verifying…
                </>
              ) : 'Verify Email'}
            </button>
          </form>

          <p className="mt-6 text-xs text-slate-400">
            Wrong email?{' '}
            <Link to="/register" className="text-brand-600 font-medium hover:underline">Go back</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
