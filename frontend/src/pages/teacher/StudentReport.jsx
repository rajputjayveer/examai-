import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';

const BASE = 'http://localhost:8000/api/storage/';

const BADGE_COLORS = {
  NO_FACE: 'bg-red-100 text-red-700 border-red-200',
  IDENTITY_MISMATCH: 'bg-orange-100 text-orange-700 border-orange-200',
  MULTIPLE_FACES: 'bg-purple-100 text-purple-700 border-purple-200',
  TAB_SWITCH: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  WINDOW_BLUR: 'bg-blue-100 text-blue-700 border-blue-200',
  FULLSCREEN_EXIT: 'bg-pink-100 text-pink-700 border-pink-200',
};

const riskColor = (count) => {
  if (count === 0) return 'text-emerald-600';
  if (count <= 3) return 'text-yellow-600';
  if (count <= 7) return 'text-orange-600';
  return 'text-red-600';
};

const riskLabel = (count) => {
  if (count === 0) return 'Clean';
  if (count <= 3) return 'Low Risk';
  if (count <= 7) return 'Medium Risk';
  return 'High Risk';
};

function LightboxModal({ src, onClose }) {
  if (!src) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="max-w-2xl w-full mx-4 relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-8 right-0 text-white text-sm font-semibold hover:text-slate-300"
        >
          ✕ Close
        </button>
        <img src={src} alt="Violation Evidence" className="w-full rounded-2xl shadow-2xl" />
      </div>
    </div>
  );
}

export default function StudentReport() {
  const { attemptId } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null);
  const [expandedQ, setExpandedQ] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    client.get(`/reports/${attemptId}`)
      .then(res => { setReport(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [attemptId]);

  const downloadPdf = async () => {
    try {
      const response = await client.get(`/reports/${attemptId}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `ExamGuard_Report_${attemptId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      alert('Failed to download PDF report.');
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-4 border-brand-200 border-t-brand-600 animate-spin" />
    </div>
  );

  if (!report) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-slate-500">Report details could not be found.</p>
    </div>
  );

  const { attempt, student_name, exam_title, violations, answers, total_questions, ai_insight } = report;
  const score = attempt.score ?? 0;
  const scorePercent = total_questions > 0 ? Math.round((score / total_questions) * 100) : 0;
  const wrongCount = total_questions - score;
  const violationsByType = violations.reduce((acc, v) => {
    acc[v.type] = (acc[v.type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Lightbox */}
      <LightboxModal src={lightbox} onClose={() => setLightbox(null)} />

      {/* Sticky Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 font-display">Candidate Proctoring Report</h1>
            <p className="text-xs text-slate-500">
              {student_name} · <span className="font-medium">{exam_title}</span>
              · {attempt.started_at ? new Date(attempt.started_at).toLocaleString() : ''}
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={downloadPdf} className="btn-primary py-2 px-4 text-xs">
              📥 Download PDF
            </button>
            <button onClick={() => navigate(-1)} className="btn-secondary py-2 px-4 text-xs">
              ← Back
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* ── Score Summary Bar ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Score', value: `${score} / ${total_questions}`, color: 'text-brand-600', icon: '🎯' },
            { label: 'Percentage', value: `${scorePercent}%`, color: scorePercent >= 60 ? 'text-emerald-600' : 'text-red-600', icon: '📊' },
            { label: 'Violations', value: violations.length, color: riskColor(violations.length), icon: '⚠️' },
            { label: 'Risk Level', value: riskLabel(violations.length), color: riskColor(violations.length), icon: '🔰' },
          ].map(card => (
            <div key={card.label} className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 flex items-center gap-4">
              <span className="text-3xl">{card.icon}</span>
              <div>
                <p className="text-xs text-slate-500 font-medium">{card.label}</p>
                <p className={`text-lg font-bold ${card.color}`}>{card.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── AI Insight Banner ── */}
        {ai_insight && (
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-5 flex gap-4 items-start">
            <span className="text-2xl mt-0.5">✨</span>
            <div>
              <p className="font-bold text-indigo-800 text-sm mb-1">AI Proctor Audit</p>
              <p className="text-sm text-slate-700 leading-relaxed">{ai_insight}</p>
            </div>
          </div>
        )}

        {/* ── Main Two-Column Layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* LEFT: Question Breakdown (3/5) */}
          <div className="lg:col-span-3 space-y-3">
            <h2 className="text-base font-bold text-slate-900 font-display mb-1">
              📝 Question Breakdown
            </h2>
            <div className="space-y-2">
              {answers.map((ans, idx) => {
                const isCorrect = ans.selected_option === ans.correct_option;
                const isOpen = expandedQ === idx;
                return (
                  <div
                    key={idx}
                    className={`bg-white border rounded-2xl shadow-card overflow-hidden transition-all ${isCorrect ? 'border-emerald-200' : 'border-red-200'}`}
                  >
                    {/* Collapsed header row */}
                    <button
                      onClick={() => setExpandedQ(isOpen ? null : idx)}
                      className="w-full flex items-center justify-between px-5 py-3.5 gap-4 text-left hover:bg-slate-50 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {isCorrect ? '✓' : '✗'}
                        </span>
                        <span className="text-sm font-semibold text-slate-800 truncate">{idx + 1}. {ans.question_text}</span>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 text-xs">
                        <span className={`font-bold px-2 py-0.5 rounded-full ${isCorrect ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                          {ans.selected_option || 'None'}
                        </span>
                        <span className="text-slate-400">{isOpen ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {/* Expanded details */}
                    {isOpen && (
                      <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/50">
                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 mb-3">
                          {['a', 'b', 'c', 'd'].map(opt => {
                            const text = ans[`option_${opt}`];
                            const LETTER = opt.toUpperCase();
                            const isSelectedOption = ans.selected_option === LETTER;
                            const isCorrectOption = ans.correct_option === LETTER;
                            return (
                              <span
                                key={opt}
                                className={`px-2 py-1.5 rounded-lg font-medium ${
                                  isCorrectOption ? 'bg-emerald-100 text-emerald-800' :
                                  isSelectedOption && !isCorrectOption ? 'bg-red-100 text-red-800' :
                                  'bg-white text-slate-600 border border-slate-100'
                                }`}
                              >
                                {LETTER}: {text}
                              </span>
                            );
                          })}
                        </div>
                        <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-200">
                          <span className="text-slate-500">Selected: <strong className={isCorrect ? 'text-emerald-700' : 'text-red-700'}>{ans.selected_option || 'None'}</strong></span>
                          {ans.correct_option && <span className="text-emerald-700 font-medium">✓ Correct: {ans.correct_option}</span>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT: Violations Panel (2/5) */}
          <div className="lg:col-span-2 space-y-4">

            {/* Violation Type Summary */}
            {violations.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5">
                <h3 className="text-sm font-bold text-slate-950 mb-3 font-display">⚠️ Violation Types</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(violationsByType).map(([type, count]) => (
                    <span
                      key={type}
                      className={`px-2.5 py-1 rounded-full text-xs font-bold border ${BADGE_COLORS[type] || 'bg-slate-100 text-slate-600 border-slate-200'}`}
                    >
                      {type.replace(/_/g, ' ')} × {count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Violation Photo Grid */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5">
              <h3 className="text-sm font-bold text-slate-950 mb-3 font-display">
                📷 Violation Evidence
                <span className="ml-2 text-xs font-normal text-slate-400">click to enlarge</span>
              </h3>
              {violations.length === 0 ? (
                <div className="text-center py-6">
                  <span className="text-3xl">✅</span>
                  <p className="text-xs text-slate-500 mt-2">No violations recorded</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {violations.map((v, i) => (
                    <div key={i} className="group relative">
                      {v.evidence_path ? (
                        <button
                          onClick={() => setLightbox(`${BASE}${v.evidence_path}`)}
                          className="w-full block"
                        >
                          <div className="aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100 group-hover:ring-2 group-hover:ring-brand-400 transition">
                            <img
                              src={`${BASE}${v.evidence_path}`}
                              alt={v.type}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center text-xl">📷</div>';
                              }}
                            />
                          </div>
                          <p className="text-center text-[10px] text-red-600 font-bold mt-1 truncate">
                            {v.type?.replace(/_/g, ' ')}
                          </p>
                        </button>
                      ) : (
                        <div>
                          <div className="aspect-square rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-2xl">
                            {v.type === 'TAB_SWITCH' ? '🗂️' : v.type === 'WINDOW_BLUR' ? '💤' : v.type === 'FULLSCREEN_EXIT' ? '🖥️' : '⚠️'}
                          </div>
                          <p className="text-center text-[10px] text-red-600 font-bold mt-1 truncate">
                            {v.type?.replace(/_/g, ' ')}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Score Breakdown */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5">
              <h3 className="text-sm font-bold text-slate-950 mb-3 font-display">📈 Score Breakdown</h3>
              <div className="mb-3">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Accuracy</span>
                  <span className="font-bold text-slate-800">{scorePercent}%</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${scorePercent >= 60 ? 'bg-emerald-500' : 'bg-red-500'}`}
                    style={{ width: `${scorePercent}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-emerald-50 rounded-xl p-2">
                  <p className="font-bold text-emerald-700 text-base">{score}</p>
                  <p className="text-slate-500">Correct</p>
                </div>
                <div className="bg-red-50 rounded-xl p-2">
                  <p className="font-bold text-red-700 text-base">{wrongCount}</p>
                  <p className="text-slate-500">Wrong</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-2">
                  <p className="font-bold text-slate-700 text-base">{total_questions}</p>
                  <p className="text-slate-500">Total</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
