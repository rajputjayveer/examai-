import React, { useState, useEffect } from 'react';
import client from '../../api/client';

export default function StudentProfileModal({ studentId, onClose }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    setError('');
    client.get(`/students/${studentId}/profile`)
      .then(res => {
        setProfile(res.data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.response?.data?.detail || 'Failed to load student profile.');
        setLoading(false);
      });
  }, [studentId]);

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
          <div className="space-y-6 overflow-auto pr-1">
            {/* Main Details */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200">
              <div>
                <h4 className="text-lg font-bold text-slate-900 font-display">{profile.name}</h4>
                <p className="text-xs text-slate-500">{profile.email}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                    profile.face_enrolled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200 animate-pulse'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${profile.face_enrolled ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    {profile.face_enrolled ? '✓ Face ID Enrolled' : '⚠ Face ID Missing'}
                  </span>
                </div>
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
