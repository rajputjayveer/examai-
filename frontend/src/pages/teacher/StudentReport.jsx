import { useEffect, useState } from 'react';
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
  SPEECH_DETECTED: 'bg-amber-100 text-amber-700 border-amber-200',
};

const riskColor = (count) => {
  if (count === 0) return 'text-emerald-600';
  if (count <= 3) return 'text-amber-600';
  return 'text-red-600';
};

const riskLabel = (count) => {
  if (count === 0) return 'LOW RISK';
  if (count <= 3) return 'MEDIUM RISK';
  return 'HIGH RISK';
};

// ── Lightbox Modal ────────────────────────────────────────────────────────────
function LightboxModal({ src, onClose }) {
  if (!src) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="max-w-2xl w-full relative" onClick={(e) => e.stopPropagation()}>
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
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    client.get(`/reports/${attemptId}`)
      .then(res => { setReport(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [attemptId]);

  const downloadPdf = async () => {
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
      <p className="text-slate-500">Report details could not be found.</p>
    </div>
  );

  const { attempt, student_name, exam_title, violations, answers, total_questions, ai_insight } = report;
  const score = attempt.score ?? 0;
  const scorePercent = total_questions > 0 ? Math.round((score / total_questions) * 100) : 0;

  const violationsByType = violations.reduce((acc, v) => {
    acc[v.type] = (acc[v.type] || 0) + 1;
    return acc;
  }, {});

  // Categorize violations cleanly for layout
  const audioViolations = violations.filter(v => v.evidence_path && v.evidence_path.endsWith('.webm'));
  const photoViolations = violations.filter(v => v.evidence_path && !v.evidence_path.endsWith('.webm') && v.type !== 'speech_detected');
  const logViolations   = violations.filter(v => !v.evidence_path);

  const formatMarkdownText = (text) => {
    if (!text) return null;
    const paragraphs = text.split('\n').filter(Boolean);
    return (
      <div className="space-y-2 text-xs sm:text-sm text-slate-700 leading-relaxed">
        {paragraphs.map((p, idx) => {
          const html = p.replace(/\*\*(.*?)\*\*/g, '<strong className="font-bold text-indigo-900">$1</strong>');
          return (
            <div
              key={idx}
              className="leading-relaxed"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
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
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold transition"
            >
              ← Back
            </button>
            <button
              onClick={downloadPdf}
              disabled={downloadingPdf}
              className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              {downloadingPdf ? 'Generating PDF…' : '📥 Download PDF'}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* ── Score Summary Bar ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Score', value: `${score} / ${total_questions}`, color: 'text-brand-600', icon: '🎯' },
            { label: 'Percentage', value: `${scorePercent}%`, color: scorePercent >= 60 ? 'text-emerald-600' : 'text-red-600', icon: '📊' },
            { label: 'Total Violations', value: violations.length, color: riskColor(violations.length), icon: '⚠️' },
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

        {/* ── AI Insight Banner (Gemini Multimodal LLM Audit) ── */}
        {ai_insight && (
          <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 border border-indigo-200 rounded-2xl p-6 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">✨</span>
              <h2 className="font-bold text-indigo-900 text-base font-display">AI Proctor Audit &amp; Audio Transcription</h2>
              <span className="ml-auto px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold uppercase tracking-wider">
                Multimodal AI
              </span>
            </div>
            {formatMarkdownText(ai_insight)}
          </div>
        )}

        {/* ── Main Two-Column Layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* LEFT: Question Breakdown (3/5) */}
          <div className="lg:col-span-3 space-y-3">
            <h2 className="text-base font-bold text-slate-900 font-display mb-1 flex items-center gap-2">
              <span>📝</span> Question Breakdown
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
                        <span className="text-slate-400 font-bold">{isOpen ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {/* Expanded details */}
                    {isOpen && (
                      <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 space-y-2 text-xs">
                        <p className="font-semibold text-slate-700">{ans.question_text}</p>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          {['a', 'b', 'c', 'd'].map(optKey => {
                            const optText = ans[`option_${optKey}`];
                            if (!optText) return null;
                            const optUpper = optKey.toUpperCase();
                            const isUserPick = ans.selected_option === optUpper;
                            const isCorrectPick = ans.correct_option === optUpper;
                            return (
                              <div
                                key={optKey}
                                className={`p-2.5 rounded-xl border font-medium ${
                                  isCorrectPick
                                    ? 'bg-emerald-100 border-emerald-300 text-emerald-900 font-bold'
                                    : isUserPick
                                      ? 'bg-red-100 border-red-300 text-red-900 font-bold'
                                      : 'bg-white border-slate-200 text-slate-600'
                                }`}
                              >
                                <span className="font-bold mr-1.5">{optUpper}.</span>
                                {optText}
                                {isCorrectPick && <span className="ml-1 text-emerald-700">✓ Correct</span>}
                                {isUserPick && !isCorrectPick && <span className="ml-1 text-red-700">✗ Candidate Pick</span>}
                              </div>
                            );
                          })}
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

            {/* Violation Type Summary Badges */}
            {violations.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-950 font-display">⚠️ Warning Breakdown</h3>
                  <span className="text-xs font-bold text-slate-500">{violations.length} total</span>
                </div>
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

            {/* 🎙️ 1. Audio Speech Evidence Section */}
            {audioViolations.length > 0 && (
              <div className="bg-white rounded-2xl border border-amber-200 shadow-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-amber-900 font-display flex items-center gap-1.5">
                    <span>🎙️</span> Recorded Speech Evidence ({audioViolations.length})
                  </h3>
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    Audio Clips
                  </span>
                </div>
                <div className="space-y-3.5">
                  {audioViolations.map((v, i) => (
                    <div key={i} className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-amber-900 flex items-center gap-1">
                          <span>🔊</span> Clip #{i + 1} — Speech Detected
                        </span>
                        <span className="text-[10px] font-medium text-slate-500">
                          {new Date(v.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <audio
                        controls
                        src={`${BASE}${v.evidence_path}`}
                        className="w-full h-8 rounded-lg"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 📷 2. Visual Photo Evidence Section */}
            {photoViolations.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-950 font-display flex items-center gap-1.5">
                    <span>📷</span> Visual Snapshots ({photoViolations.length})
                  </h3>
                  <span className="text-[10px] font-normal text-slate-400">click to enlarge</span>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  {photoViolations.map((v, i) => (
                    <button
                      key={i}
                      onClick={() => setLightbox(`${BASE}${v.evidence_path}`)}
                      className="group block text-left"
                    >
                      <div className="aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100 group-hover:ring-2 group-hover:ring-brand-400 transition relative">
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
                  ))}
                </div>
              </div>
            )}

            {/* 🗂️ 3. Focus & Event Audit Logs */}
            {logViolations.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 space-y-3">
                <h3 className="text-sm font-bold text-slate-950 font-display flex items-center gap-1.5">
                  <span>🗂️</span> Focus &amp; System Event Logs ({logViolations.length})
                </h3>
                <div className="space-y-2">
                  {logViolations.map((v, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs">
                      <div className="flex items-center gap-2 font-bold text-slate-700">
                        <span>{v.type === 'TAB_SWITCH' ? '🗂️' : v.type === 'WINDOW_BLUR' ? '💤' : v.type === 'FULLSCREEN_EXIT' ? '🖥️' : '⚠️'}</span>
                        <span>{v.type?.replace(/_/g, ' ')}</span>
                      </div>
                      <span className="text-[10px] font-medium text-slate-400">
                        {new Date(v.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No violations fallback */}
            {violations.length === 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-8 text-center space-y-2">
                <span className="text-4xl">✅</span>
                <h3 className="text-sm font-bold text-slate-900 font-display">Clean Proctoring Record</h3>
                <p className="text-xs text-slate-500">No warnings or cheating violations logged during this exam.</p>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
