import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';

// ── Violation type icons & labels ────────────────────────────────────────────
const VIOLATION_META = {
  no_face:          { icon: '👤', label: 'No Face Detected',    color: '#f97316' },
  multiple_faces:   { icon: '👥', label: 'Multiple Faces',      color: '#ef4444' },
  look_away:        { icon: '👀', label: 'Looking Away',         color: '#eab308' },
  identity_mismatch:{ icon: '🆔', label: 'Identity Mismatch',   color: '#dc2626' },
  tab_switch:       { icon: '🔀', label: 'Tab Switch',           color: '#8b5cf6' },
  fullscreen_exit:  { icon: '🖥️', label: 'Fullscreen Exit',     color: '#6366f1' },
  speech_detected:  { icon: '🔇', label: 'Speech Detected',     color: '#ec4899' },
  camera_denied:    { icon: '📷', label: 'Camera Denied',        color: '#64748b' },
  copy_paste:       { icon: '📋', label: 'Copy / Paste',         color: '#0ea5e9' },
};

// ── Circular animated score ring ─────────────────────────────────────────────
function ScoreRing({ score, total }) {
  const pct   = total > 0 ? Math.round((score / total) * 100) : 0;
  const r     = 70;
  const circ  = 2 * Math.PI * r;
  const dash  = circ - (circ * pct) / 100;

  const color = pct >= 75 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{ position: 'relative', width: 180, height: 180, margin: '0 auto' }}>
      <svg width="180" height="180" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="90" cy="90" r={r} fill="none" stroke="#e2e8f0" strokeWidth="12" />
        <circle
          cx="90" cy="90" r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${circ}`}
          strokeDashoffset={dash}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 36, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>
          {score ?? '–'}
        </span>
        <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>/ {total}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color, marginTop: 2 }}>{pct}%</span>
      </div>
    </div>
  );
}

// ── AI Insight shimmer skeleton ───────────────────────────────────────────────
function AiInsightSkeleton() {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 100%)',
      border: '1.5px solid #c7d7fd',
      borderRadius: 16,
      padding: '20px 22px',
      marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'linear-gradient(90deg, #c7d7fd 25%, #dde9ff 50%, #c7d7fd 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
        }} />
        <div style={{
          height: 14, width: 160, borderRadius: 6,
          background: 'linear-gradient(90deg, #c7d7fd 25%, #dde9ff 50%, #c7d7fd 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
        }} />
      </div>
      {[100, 85, 92].map((w, i) => (
        <div key={i} style={{
          height: 11, width: `${w}%`, borderRadius: 4, marginBottom: 8,
          background: 'linear-gradient(90deg, #c7d7fd 25%, #dde9ff 50%, #c7d7fd 75%)',
          backgroundSize: '200% 100%',
          animation: `shimmer 1.5s infinite ${i * 0.2}s`,
        }} />
      ))}
      <div style={{
        marginTop: 12, fontSize: 12, color: '#6366f1',
        fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
        AI Mentor is analysing your exam…
      </div>
    </div>
  );
}

// ── Answer review row ─────────────────────────────────────────────────────────
function AnswerRow({ ans, idx }) {
  const [open, setOpen] = useState(false);
  const correct = ans.correct_option && ans.selected_option === ans.correct_option;
  const unanswered = !ans.selected_option;
  const statusColor = unanswered ? '#94a3b8' : correct ? '#22c55e' : '#ef4444';
  const statusIcon  = unanswered ? '—' : correct ? '✓' : '✗';

  const optLabel = { A: ans.option_a, B: ans.option_b, C: ans.option_c, D: ans.option_d };

  return (
    <div
      style={{
        borderRadius: 12, border: `1.5px solid ${unanswered ? '#e2e8f0' : correct ? '#bbf7d0' : '#fecaca'}`,
        background: unanswered ? '#f8fafc' : correct ? '#f0fdf4' : '#fff5f5',
        marginBottom: 10, overflow: 'hidden',
        transition: 'box-shadow 0.2s',
      }}
    >
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '12px 16px', display: 'flex', alignItems: 'center',
          gap: 12, cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: statusColor, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 14,
        }}>
          {statusIcon}
        </div>
        <span style={{ fontSize: 13, color: '#334155', fontWeight: 500, flex: 1, lineHeight: 1.4 }}>
          Q{idx + 1}. {ans.question_text || '(No question text)'}
        </span>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {open && (
        <div style={{ padding: '0 16px 14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {['A','B','C','D'].map(opt => {
            const isSelected = ans.selected_option === opt;
            const isCorrect  = ans.correct_option  === opt;
            let bg = '#f1f5f9'; let border = '#e2e8f0'; let textColor = '#475569';
            if (isCorrect)                    { bg = '#dcfce7'; border = '#86efac'; textColor = '#166534'; }
            if (isSelected && !isCorrect)     { bg = '#fee2e2'; border = '#fca5a5'; textColor = '#991b1b'; }
            return (
              <div key={opt} style={{
                background: bg, border: `1.5px solid ${border}`, borderRadius: 8,
                padding: '6px 10px', fontSize: 12, color: textColor, fontWeight: isSelected || isCorrect ? 600 : 400,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontWeight: 700 }}>{opt}.</span>
                <span>{optLabel[opt] || '—'}</span>
                {isCorrect  && <span style={{ marginLeft: 'auto' }}>✓</span>}
                {isSelected && !isCorrect && <span style={{ marginLeft: 'auto' }}>✗</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Result Page ──────────────────────────────────────────────────────────
export default function Result() {
  const { attemptId } = useParams();
  const navigate      = useNavigate();

  const [report,          setReport]          = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [aiInsight,       setAiInsight]       = useState(null);
  const [aiReady,         setAiReady]         = useState(false);
  const [downloadingPdf,  setDownloadingPdf]  = useState(false);
  const [activeTab,       setActiveTab]       = useState('overview'); // overview | answers | violations
  const pollRef = useRef(null);

  // ── Step 1: Load report INSTANTLY (no AI wait) ────────────────────────────
  useEffect(() => {
    client.get(`/reports/${attemptId}`)
      .then(res => {
        setReport(res.data);
        setLoading(false);
        if (res.data.ai_insight_ready) {
          setAiInsight(res.data.ai_insight);
          setAiReady(true);
        }
        // If AI not ready yet, start polling
        if (!res.data.ai_insight_ready) {
          startPolling();
        }
      })
      .catch(() => setLoading(false));

    return () => clearInterval(pollRef.current);
  }, [attemptId]);

  // ── Step 2: Poll /insight every 3s until AI is ready ─────────────────────
  function startPolling() {
    pollRef.current = setInterval(async () => {
      try {
        const res = await client.get(`/reports/${attemptId}/insight`);
        if (res.data.ready) {
          setAiInsight(res.data.text);
          setAiReady(true);
          clearInterval(pollRef.current);
        }
      } catch {
        // silent — keep polling
      }
    }, 3000);
  }

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const response = await client.get(`/reports/${attemptId}/pdf`, { responseType: 'blob' });
      const url  = window.URL.createObjectURL(new Blob([response.data]));
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

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20,
    }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
      `}</style>
      <div style={{
        width: 52, height: 52, border: '4px solid rgba(255,255,255,0.15)',
        borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.9s linear infinite',
      }} />
      <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: 500 }}>
        Loading your results…
      </p>
    </div>
  );

  if (!report) return (
    <div style={{
      minHeight: '100vh', background: '#f8fafc',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <p style={{ color: '#64748b', fontWeight: 500 }}>Could not load results. Please try again.</p>
        <button onClick={() => navigate('/')} style={{
          marginTop: 16, padding: '10px 24px', borderRadius: 10,
          background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600,
        }}>Go to Dashboard</button>
      </div>
    </div>
  );

  const { attempt, exam_title, student_name, violations = [], answers = [], total_questions } = report;
  const isPending = attempt.status !== 'graded';
  const score     = attempt.score ?? 0;
  const total     = total_questions || 0;
  const pct       = total > 0 ? Math.round((score / total) * 100) : 0;
  const correct   = answers.filter(a => a.selected_option && a.selected_option === a.correct_option).length;
  const wrong     = answers.filter(a => a.selected_option && a.selected_option !== a.correct_option).length;
  const skipped   = answers.filter(a => !a.selected_option).length;

  const gradeInfo = () => {
    if (isPending) return { label: 'Pending Grading', color: '#f59e0b', bg: '#fef3c7', emoji: '⏳' };
    if (pct >= 90) return { label: 'A+ — Excellent!',  color: '#16a34a', bg: '#dcfce7', emoji: '🏆' };
    if (pct >= 75) return { label: 'A — Very Good',    color: '#22c55e', bg: '#f0fdf4', emoji: '🌟' };
    if (pct >= 60) return { label: 'B — Good',         color: '#3b82f6', bg: '#eff6ff', emoji: '👍' };
    if (pct >= 45) return { label: 'C — Average',      color: '#f59e0b', bg: '#fef9c3', emoji: '📘' };
    return           { label: 'D — Needs Improvement', color: '#ef4444', bg: '#fee2e2', emoji: '📉' };
  };
  const grade = gradeInfo();

  // Violation summary grouped by type
  const violSummary = violations.reduce((acc, v) => {
    acc[v.type] = (acc[v.type] || 0) + 1;
    return acc;
  }, {});

  const TAB_STYLE = (active) => ({
    padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600,
    fontSize: 13, transition: 'all 0.2s',
    background: active ? '#6366f1' : 'transparent',
    color: active ? '#fff' : '#64748b',
  });

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f0f4ff 0%, #f8fafc 50%, #fdf4ff 100%)',
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      animation: 'fadeIn 0.5s ease',
    }}>
      <style>{`
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .ai-card-ready{animation:slideIn 0.4s ease}
        button:hover{opacity:0.88}
      `}</style>

      {/* ── Hero Header ──────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 60%, #7c3aed 100%)',
        padding: '40px 24px 64px',
        textAlign: 'center',
        position: 'relative',
      }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.07, backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 6, fontWeight: 500 }}>
          {exam_title}
        </p>
        <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 800, margin: '0 0 4px', letterSpacing: -0.5 }}>
          {grade.emoji} Exam Submitted!
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
          {student_name} · {attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : '—'}
        </p>
      </div>

      {/* ── Score Card floats over hero ───────────────────────────────────── */}
      <div style={{ maxWidth: 680, margin: '-44px auto 0', padding: '0 16px', position: 'relative', zIndex: 10 }}>
        <div style={{
          background: '#fff', borderRadius: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
          padding: '32px 28px', marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
            {/* Score ring */}
            <div>
              {isPending ? (
                <div style={{ width: 180, height: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <div style={{ fontSize: 48 }}>⏳</div>
                  <p style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600, textAlign: 'center' }}>Awaiting<br />Evaluation</p>
                </div>
              ) : <ScoreRing score={score} total={total} />}
            </div>

            {/* Stats */}
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{
                display: 'inline-block', padding: '6px 16px', borderRadius: 20,
                background: grade.bg, color: grade.color, fontWeight: 700, fontSize: 14, marginBottom: 16,
              }}>
                {grade.label}
              </div>

              {!isPending && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {[
                    { label: 'Correct', val: correct, color: '#22c55e', bg: '#f0fdf4' },
                    { label: 'Wrong',   val: wrong,   color: '#ef4444', bg: '#fff5f5' },
                    { label: 'Skipped', val: skipped, color: '#94a3b8', bg: '#f8fafc' },
                  ].map(s => (
                    <div key={s.label} style={{
                      textAlign: 'center', padding: '12px 8px', borderRadius: 12,
                      background: s.bg, border: `1px solid ${s.color}22`,
                    }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Violations mini badge */}
              {violations.length > 0 && (
                <div style={{
                  marginTop: 12, padding: '8px 14px', borderRadius: 10,
                  background: '#fff5f5', border: '1px solid #fca5a5',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ fontSize: 16 }}>⚠️</span>
                  <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
                    {violations.length} proctoring warning{violations.length > 1 ? 's' : ''} logged
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── AI Insight Card ───────────────────────────────────────────── */}
        {!aiReady ? (
          <AiInsightSkeleton />
        ) : aiInsight ? (
          <div className="ai-card-ready" style={{
            background: 'linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 100%)',
            border: '1.5px solid #a5b4fc',
            borderRadius: 16, padding: '20px 22px', marginBottom: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
              }}>✨</div>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#4338ca', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                AI Mentor Insights
              </span>
            </div>
            <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.7, margin: 0, fontWeight: 500 }}>
              {aiInsight}
            </p>
          </div>
        ) : null}

        {/* ── Tab Navigation ────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 6, marginBottom: 16,
          background: '#f1f5f9', borderRadius: 12, padding: 6,
        }}>
          {['overview', 'answers', 'violations'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={TAB_STYLE(activeTab === tab)}>
              {{overview: '📊 Overview', answers: `📝 Answers (${answers.length})`, violations: `⚠️ Warnings (${violations.length})`}[tab]}
            </button>
          ))}
        </div>

        {/* ── Tab Content ───────────────────────────────────────────────── */}
        <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.06)', padding: 24, marginBottom: 20 }}>

          {/* OVERVIEW tab */}
          {activeTab === 'overview' && (
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>Exam Summary</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Status',      val: attempt.status,  badge: attempt.status === 'graded' ? '#22c55e' : '#f59e0b' },
                  { label: 'Total Marks', val: `${score} / ${total}` },
                  { label: 'Started',     val: attempt.started_at   ? new Date(attempt.started_at).toLocaleString()   : '—' },
                  { label: 'Submitted',   val: attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : '—' },
                ].map(row => (
                  <div key={row.label} style={{ background: '#f8fafc', borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>{row.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: row.badge || '#334155' }}>{row.val}</div>
                  </div>
                ))}
              </div>

              {/* Score bar */}
              {!isPending && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>
                    <span>Score Progress</span><span>{pct}%</span>
                  </div>
                  <div style={{ height: 10, background: '#e2e8f0', borderRadius: 99 }}>
                    <div style={{
                      height: 10, borderRadius: 99,
                      background: pct >= 75 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444',
                      width: `${pct}%`,
                      transition: 'width 1.2s cubic-bezier(0.4,0,0.2,1)',
                    }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ANSWERS tab */}
          {activeTab === 'answers' && (
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>
                Answer Review
                <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8', marginLeft: 8 }}>Click a question to expand</span>
              </h3>
              {answers.length === 0 ? (
                <p style={{ color: '#94a3b8', textAlign: 'center', padding: '32px 0' }}>No answers recorded.</p>
              ) : (
                answers.map((ans, i) => <AnswerRow key={ans.question_id} ans={ans} idx={i} />)
              )}
            </div>
          )}

          {/* VIOLATIONS tab */}
          {activeTab === 'violations' && (
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>Proctoring Warnings</h3>
              {violations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>
                  <p style={{ color: '#22c55e', fontWeight: 700 }}>No violations recorded!</p>
                  <p style={{ color: '#94a3b8', fontSize: 13 }}>You maintained perfect exam integrity.</p>
                </div>
              ) : (
                <>
                  {/* Summary grouped */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                    {Object.entries(violSummary).map(([type, count]) => {
                      const meta = VIOLATION_META[type] || { icon: '⚠️', label: type, color: '#64748b' };
                      return (
                        <div key={type} style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                          borderRadius: 20, background: `${meta.color}18`, border: `1.5px solid ${meta.color}44`,
                        }}>
                          <span>{meta.icon}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: meta.color }}>{meta.label}</span>
                          <span style={{
                            background: meta.color, color: '#fff', borderRadius: '50%',
                            width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 700,
                          }}>{count}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Individual log */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {violations.map((v, i) => {
                      const meta = VIOLATION_META[v.type] || { icon: '⚠️', label: v.type, color: '#64748b' };
                      return (
                        <div key={v.id} style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                          borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0',
                        }}>
                          <span style={{ fontSize: 20 }}>{meta.icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: meta.color }}>{meta.label}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                              {v.created_at ? new Date(v.created_at).toLocaleTimeString() : '—'}
                            </div>
                          </div>
                          <span style={{
                            fontSize: 11, color: '#94a3b8', fontWeight: 500,
                            background: '#f1f5f9', padding: '2px 8px', borderRadius: 6,
                          }}>#{i + 1}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 40 }}>
          <button
            onClick={() => navigate('/')}
            style={{
              flex: 1, padding: '14px', borderRadius: 14, border: '2px solid #e2e8f0',
              background: '#fff', color: '#334155', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}
          >
            ← Dashboard
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            style={{
              flex: 1, padding: '14px', borderRadius: 14, border: 'none',
              background: downloadingPdf ? '#a5b4fc' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', fontWeight: 700, fontSize: 14, cursor: downloadingPdf ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {downloadingPdf ? (
              <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 0.9s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>Downloading…</>
            ) : (
              <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17" strokeLinecap="round" strokeLinejoin="round"/></svg>Download PDF</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
