import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function ChangePassword() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const { refreshProfile, logout } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setStatusMsg('New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setStatusMsg('New password must be at least 6 characters long');
      return;
    }

    setLoading(true);
    setStatusMsg('');
    try {
      await client.post(`/auth/change-password?old_password=${encodeURIComponent(oldPassword)}&new_password=${encodeURIComponent(newPassword)}`);
      setIsSuccess(true);
      setStatusMsg('Password updated successfully! Re-authenticating...');
      await refreshProfile();
      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (err) {
      setStatusMsg(err.response?.data?.detail || 'Failed to update password. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-card p-8">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-slate-900 font-display">Change Your Password</h2>
          <p className="text-xs text-slate-500 mt-1">For security, you must update your temporary password to continue</p>
        </div>

        {statusMsg && (
          <div className={`mb-4 rounded-xl p-3 text-xs font-semibold text-center border ${
            isSuccess ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {statusMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">Current Password</label>
            <input
              type="password"
              required
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">New Password</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">Confirm New Password</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading || isSuccess}
            className="w-full btn-primary py-3 font-semibold disabled:opacity-50 mt-2"
          >
            {loading ? 'Updating password...' : 'Update Password ✓'}
          </button>
        </form>

        <div className="text-center mt-4">
          <button onClick={logout} className="text-xs text-red-600 font-semibold hover:underline">
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
