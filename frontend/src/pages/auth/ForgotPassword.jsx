import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import client from '../../api/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg('');
    try {
      await client.post(`/auth/forgot-password?email=${encodeURIComponent(email)}`);
      setStatusMsg('If that email is registered, a reset code has been sent to your inbox.');
      setTimeout(() => {
        navigate(`/reset-password?email=${encodeURIComponent(email)}`);
      }, 2000);
    } catch (err) {
      setStatusMsg('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-card p-8">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-slate-900 font-display">Forgot Password</h2>
          <p className="text-xs text-slate-500 mt-1">Enter your email address to receive a verification reset code</p>
        </div>

        {statusMsg && (
          <div className="mb-4 rounded-xl bg-blue-50 border border-blue-200 p-3.5 text-xs font-semibold text-blue-700 text-center">
            {statusMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary py-3 font-semibold disabled:opacity-50 mt-2"
          >
            {loading ? 'Sending code...' : 'Send Reset Code'}
          </button>
        </form>

        <div className="text-center mt-6">
          <Link to="/login" className="text-xs text-brand-600 font-semibold hover:underline">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
