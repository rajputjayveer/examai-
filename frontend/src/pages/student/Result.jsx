import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';

export default function Result() {
  const { attemptId } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    client.get(`/reports/${attemptId}`)
      .then(res => {
        setReport(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [attemptId]);

  const downloadPdf = () => {
    window.open(`/api/reports/${attemptId}/pdf`, '_blank');
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">Loading exam results...</div>;
  }

  const { attempt, exam_title } = report;

  return (
    <div className="min-h-screen bg-slate-950 p-6 flex items-center justify-center">
      <div className="max-w-md w-full glass-panel border border-slate-800 rounded-2xl p-8 text-center glow-card">
        <div className="w-16 h-16 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-white mb-2">Exam Submitted</h2>
        <p className="text-slate-400 text-sm mb-6">{exam_title}</p>

        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 mb-8 space-y-4">
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-400">Score:</span>
            <span className="text-white font-bold">{attempt.score !== null ? `${attempt.score} Marks` : 'Pending Grading'}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-400">Status:</span>
            <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
              attempt.status === 'graded' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'
            }`}>
              {attempt.status}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-400">Submitted at:</span>
            <span className="text-slate-200">{new Date(attempt.submitted_at).toLocaleString()}</span>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => navigate('/')}
            className="flex-1 py-3 bg-slate-900 border border-slate-800 hover:bg-slate-850 rounded-lg text-sm font-semibold transition"
          >
            Dashboard
          </button>
          <button
            onClick={downloadPdf}
            className="flex-1 py-3 bg-brand-500 hover:bg-brand-600 rounded-lg text-sm font-semibold text-white transition"
          >
            Download Report
          </button>
        </div>
      </div>
    </div>
  );
}
