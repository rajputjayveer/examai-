import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';

export default function Result() {
  const { attemptId } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    client.get(`/reports/${attemptId}`)
      .then(res => { setReport(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [attemptId]);

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const response = await client.get(`/reports/${attemptId}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `SecureExam_Report_${attemptId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      alert('Failed to download PDF report.');
    } finally {
      setDownloadingPdf(false);
    }
  };


  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-4 border-brand-200 border-t-brand-600 animate-spin" />
    </div>
  );

  if (!report) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-slate-500">Could not load result. Please try again.</p>
    </div>
  );

  const { attempt, exam_title } = report;
  const isPending = attempt.status !== 'graded';
  const score = attempt.score;
  const total = report.total_questions || '—';

  const gradeInfo = (s, t) => {
    if (s === null || t === '—') return { label: 'Pending', cls: 'badge-amber', emoji: '⏳' };
    const pct = (s / t) * 100;
    if (pct >= 90) return { label: 'A+ Excellent', cls: 'badge-green', emoji: '🏆' };
    if (pct >= 75) return { label: 'A  Very Good', cls: 'badge-green', emoji: '🌟' };
    if (pct >= 60) return { label: 'B  Good',      cls: 'badge-blue',  emoji: '👍' };
    if (pct >= 45) return { label: 'C  Average',   cls: 'badge-amber', emoji: '📘' };
    return { label: 'D  Below Pass',               cls: 'badge-red',   emoji: '📉' };
  };

  const grade = gradeInfo(score, total);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-slide-up">

        {/* Result card */}
        <div className="bg-white rounded-2xl shadow-card border border-slate-200 overflow-hidden">
          {/* Gradient header */}
          <div className="bg-gradient-to-r from-brand-600 to-brand-700 px-8 py-8 text-center">
            <div className="text-5xl mb-2">{grade.emoji}</div>
            <h2 className="text-2xl font-bold text-white font-display">Exam Submitted!</h2>
            <p className="text-brand-200 text-sm mt-1">{exam_title}</p>
          </div>

          <div className="p-8">
            {/* Score display */}
            {!isPending ? (
              <div className="text-center mb-6">
                <div className="inline-flex items-baseline gap-1">
                  <span className="text-6xl font-black text-slate-900 font-display">{score}</span>
                  <span className="text-2xl font-bold text-slate-400">/ {total}</span>
                </div>
                <div className="mt-2">
                  <span className={grade.cls}>{grade.label}</span>
                </div>
                {/* Score bar */}
                <div className="mt-4 h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-3 bg-brand-500 rounded-full transition-all duration-1000"
                    style={{ width: `${Math.round((score / total) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">{Math.round((score / total) * 100)}% correct</p>
              </div>
            ) : (
              <div className="text-center mb-6 py-4">
                <div className="w-14 h-14 bg-amber-50 border border-amber-200 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-7 h-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="font-semibold text-slate-700">Awaiting Evaluation</p>
                <p className="text-sm text-slate-500 mt-1">Your teacher will upload the answer key to grade your exam.</p>
              </div>
            )}

            {/* Stats */}
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 mb-6 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Status</span>
                <span className={attempt.status === 'graded' ? 'badge-green' : 'badge-amber'}>{attempt.status}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Submitted at</span>
                <span className="font-medium text-slate-700">{new Date(attempt.submitted_at).toLocaleString()}</span>
              </div>
            </div>

            {/* AI Insights Study Tips Card */}
            {report.ai_insight && (
              <div className="mb-6 bg-brand-50 border border-brand-200 rounded-xl p-4 text-left">
                <h4 className="text-xs font-bold text-brand-800 uppercase tracking-wider mb-1.5">✨ AI Mentor Study Insights</h4>
                <p className="text-xs text-slate-650 leading-relaxed font-medium">{report.ai_insight}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/')}
                className="flex-1 btn-secondary py-3"
              >
                Dashboard
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="flex-1 btn-primary py-3 inline-flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {downloadingPdf ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                    Downloading…
                  </>
                ) : 'Download PDF'}
              </button>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
