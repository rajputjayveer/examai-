import React, { useState, useEffect } from 'react';
import client from '../../api/client';

export default function StudentProfileModal({ studentId, onClose }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState({ type: '', text: '' });
  const [resetRequest, setResetRequest] = useState(null); // pending re-enrollment request from student
  const [approveLoading, setApproveLoading] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    setError('');
    setResetRequest(null);
    // Load profile and check for pending re-enrollment request in parallel
    Promise.all([
      client.get(`/students/${studentId}/profile`),
      client.get(`/students/${studentId}/face-reset-status`)
    ])
      .then(([profileRes, resetRes]) => {
        setProfile(profileRes.data);
        if (resetRes.data.has_request) setResetRequest(resetRes.data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.response?.data?.detail || 'Failed to load student profile.');
        setLoading(false);
      });
  }, [studentId]);

  const handleApproveReenrollment = async () => {
    setApproveLoading(true);
    try {
      await client.post(`/students/${studentId}/approve-face-update`);
      setProfile(prev => ({ ...prev, face_enrolled: false }));
      setResetRequest(null);
      setResetMsg({ type: 'success', text: `✅ Approved! ${profile?.name}'s old biometrics cleared. Approval email sent — they must re-enroll before their next exam.` });
    } catch (err) {
      setResetMsg({ type: 'error', text: err.response?.data?.detail || 'Approval failed.' });
    } finally {
      setApproveLoading(false);
    }
  };

  const handleResetFace = async () => {
    setResetLoading(true);
    setResetMsg({ type: '', text: '' });
    try {
      await client.post(`/students/${studentId}/reset-face`);
      setProfile(prev => ({ ...prev, face_enrolled: false }));
      setResetMsg({ type: 'success', text: `Face biometrics cleared. ${profile?.name} must re-enroll before their next exam.` });
      setResetConfirm(false);
    } catch (err) {
      setResetMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to reset biometrics.' });
    } finally {
      setResetLoading(false);
    }
  };

  if (!studentId) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full p-6 space-y-6 animate-scale-up max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-slate-900 font-display text-lg">Student Performance Profile</h3>
            <p className="text-xs text-slate-500">Inspection view for instructor proctoring & score audit</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-lg">✕</button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-4 border-brand-200 border-t-brand-600 animate-spin" />
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-600 font-semibold text-sm">
            {error}
          </div>
        ) : (
          <div className="space-y-4 overflow-auto pr-1">

            {/* Pending Re-enrollment Request Banner — full width above main card */}
            {resetRequest && (
              <div className="p-4 rounded-2xl border-2 border-amber-300 bg-amber-50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-amber-900 mb-1">🔔 Face Re-enrollment Request</p>
                    <p className="text-xs text-amber-700">Reason: <span className="font-semibold">{resetRequest.reason}</span></p>
                    {resetRequest.requested_at && (
                      <p className="text-[10px] text-amber-600 mt-0.5">Submitted: {new Date(resetRequest.requested_at).toLocaleString()}</p>
                    )}
                    <p className="text-[11px] text-amber-600 mt-1 italic">Approving will clear old face data and email the student to re-enroll.</p>
                  </div>
                  <button
                    onClick={handleApproveReenrollment}
                    disabled={approveLoading}
                    className="shrink-0 px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition disabled:opacity-60 flex items-center gap-1.5 shadow-sm"
                  >
                    {approveLoading
                      ? <><span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" /> Approving...</>
                      : '✅ Approve Re-enrollment'}
                  </button>
                </div>
              </div>
            )}

            {/* Main Details */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200">
              <div>
                <h4 className="text-lg font-bold text-slate-900 font-display">{profile.name}</h4>
                <p className="text-xs text-slate-500">{profile.email}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                    profile.face_enrolled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200 animate-pulse'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${profile.face_enrolled ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    {profile.face_enrolled ? '✓ Face ID Enrolled' : '⚠ Face ID Missing'}
                  </span>
                  {profile.face_enrolled && !resetConfirm && (
                    <button
                      onClick={() => setResetConfirm(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition"
                    >
                      🔄 Reset Face ID
                    </button>
                  )}
                </div>

                {/* Inline Reset Confirmation */}
                {resetConfirm && (
                  <div className="mt-3 p-3 rounded-xl border border-red-200 bg-red-50 text-xs">
                    <p className="font-bold text-red-800 mb-2">⚠ Reset Biometric Profile?</p>
                    <p className="text-red-700 mb-3">This will delete <strong>{profile.name}'s</strong> Face ID reference photo. They will be unable to take exams until they re-enroll. They will be notified by email.</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleResetFace}
                        disabled={resetLoading}
                        className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 transition disabled:opacity-60 flex items-center gap-1"
                      >
                        {resetLoading ? (
                          <><span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" /> Resetting...</>
                        ) : 'Yes, Reset Face ID'}
                      </button>
                      <button
                        onClick={() => setResetConfirm(false)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition"
                      >Cancel</button>
                    </div>
                  </div>
                )}

                {/* Success / Error message */}
                {resetMsg.text && (
                  <div className={`mt-2 p-2.5 rounded-xl text-xs font-semibold border ${
                    resetMsg.type === 'success'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {resetMsg.type === 'success' ? '✅ ' : '❌ '}{resetMsg.text}
                  </div>
                )}
              </div>

              <div className="flex gap-3 text-center">
                <div className="bg-white border border-slate-200 rounded-xl p-3 min-w-[90px] shadow-sm">
                  <p className="text-2xl font-bold text-brand-600 font-display">{profile.total_exams_attempted}</p>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase">Exams Taken</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3 min-w-[90px] shadow-sm">
                  <p className={`text-2xl font-bold font-display ${profile.total_violations > 0 ? 'text-red-600' : 'text-slate-700'}`}>
                    {profile.total_violations}
                  </p>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase">Warnings</p>
                </div>
              </div>
            </div>

            {/* Enrolled classes */}
            {profile.enrolled_classes && profile.enrolled_classes.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Enrolled Classes</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.enrolled_classes.map((clsName, idx) => (
                    <span key={idx} className="px-3 py-1 rounded-lg bg-brand-50 text-brand-700 border border-brand-100 text-xs font-semibold">
                      🏫 {clsName}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Exam Attempts List */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-900 font-display">Exam Attempts & Scoring History</h4>
              {profile.attempts.length === 0 ? (
                <div className="p-8 bg-slate-50 rounded-xl text-center text-slate-400 text-xs">
                  This student has not attempted any exams yet.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-650 uppercase font-semibold">
                      <tr>
                        <th className="px-4 py-3 text-left">Exam Title</th>
                        <th className="px-4 py-3 text-left">Score</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-left">Warnings</th>
                        <th className="px-4 py-3 text-left">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {profile.attempts.map(att => (
                        <tr key={att.attempt_id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-bold text-slate-900">{att.exam_title}</td>
                          <td className="px-4 py-3 font-bold text-brand-600">
                            {att.score !== null ? `${att.score} / ${att.total_marks}` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className="capitalize px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 font-semibold">
                              {att.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {att.violations_count > 0 ? (
                              <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-bold">
                                {att.violations_count} warning(s)
                              </span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {att.started_at ? new Date(att.started_at).toLocaleDateString() : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
