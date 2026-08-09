import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import client from '../../api/client';

const VIOLATION_META = {
  no_face:           { icon: '👤', label: 'No Face',          color: '#f97316' },
  multiple_faces:    { icon: '👥', label: 'Multiple Faces',   color: '#ef4444' },
  look_away:         { icon: '👀', label: 'Looking Away',      color: '#eab308' },
  identity_mismatch: { icon: '🆔', label: 'Identity Mismatch',color: '#dc2626' },
  tab_switch:        { icon: '🔀', label: 'Tab Switch',        color: '#8b5cf6' },
  fullscreen_exit:   { icon: '🖥️', label: 'Fullscreen Exit', color: '#6366f1' },
  speech_detected:   { icon: '🔇', label: 'Speech',           color: '#ec4899' },
  camera_denied:     { icon: '📷', label: 'Camera Denied',    color: '#64748b' },
  copy_paste:        { icon: '📋', label: 'Copy/Paste',        color: '#0ea5e9' },
};

function StatCard({ icon, label, value, sub, color = '#6366f1', bg = '#f0f4ff' }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 16, border: '1.5px solid #e2e8f0',
      boxShadow: '0 2px 12px rgba(0,0,0,0.05)', padding: '20px 22px',
      display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{ width:48,height:48,borderRadius:14,background:bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0 }}>{icon}</div>
      <div>
        <p style={{ fontSize:11,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:0.8,margin:0 }}>{label}</p>
        <p style={{ fontSize:26,fontWeight:800,color,margin:'2px 0 0',lineHeight:1.1 }}>{value ?? '—'}</p>
        {sub && <p style={{ fontSize:11,color:'#94a3b8',margin:'2px 0 0' }}>{sub}</p>}
      </div>
    </div>
  );
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div style={{
      background:'#fff',borderRadius:20,border:'1.5px solid #e2e8f0',
      boxShadow:'0 4px 20px rgba(0,0,0,0.05)',padding:'24px',marginBottom:20,
    }}>
      <h2 style={{ fontSize:16,fontWeight:800,color:'#0f172a',margin:'0 0 4px' }}>{title}</h2>
      {subtitle && <p style={{ fontSize:12,color:'#94a3b8',margin:'0 0 20px' }}>{subtitle}</p>}
      {children}
    </div>
  );
}

export default function ClassAnalytics() {
  const { examId, classId } = useParams();
  const navigate = useNavigate();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const isClass = Boolean(classId);

  useEffect(() => {
    const endpoint = isClass
      ? `/classes/${classId}/analytics`
      : `/reports/teacher/exams/${examId}/analytics`;
    client.get(endpoint)
      .then(res => { setData(res.data); setLoading(false); })
      .catch(() => { setError('Failed to load analytics.'); setLoading(false); });
  }, [examId, classId, isClass]);

  if (loading) return (
    <div style={{ minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16,background:'linear-gradient(135deg,#f0f4ff,#f8fafc)',fontFamily:"'Inter','Segoe UI',sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width:44,height:44,border:'4px solid #e2e8f0',borderTopColor:'#6366f1',borderRadius:'50%',animation:'spin 0.9s linear infinite' }} />
      <p style={{ color:'#64748b',fontWeight:600,fontSize:14 }}>Loading analytics…</p>
    </div>
  );

  if (error) return (
    <div style={{ minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center' }}>
      <p style={{ color:'#ef4444',fontWeight:600 }}>{error}</p>
    </div>
  );

  const {
    average_score, total_submissions, total_attempts, enrolled_count,
    completion_rate, class_name, question_difficulty = [],
    violation_breakdown = {}, exams = [],
  } = data || {};

  const totalSubs = total_submissions ?? total_attempts ?? 0;

  const difficultyData = question_difficulty.map((q, i) => ({
    name: `Q${i+1}`, pct: q.percent_wrong ?? 0, text: q.text,
  }));

  const examData = exams.map(e => ({
    name: e.title.length > 18 ? `${e.title.slice(0,18)}…` : e.title,
    avg: e.average_score ?? 0,
    subs: e.submissions_count,
    status: e.status,
    id: e.id,
    title: e.title,
    average_score: e.average_score,
    submissions_count: e.submissions_count,
  }));

  const violData = Object.entries(violation_breakdown).map(([type, count]) => ({
    type, count,
    meta: VIOLATION_META[type] || { icon:'⚠️', label: type.replace(/_/g,' '), color:'#64748b' },
  })).sort((a, b) => b.count - a.count);

  const totalViolations = violData.reduce((s, v) => s + v.count, 0);
  const riskScore = totalSubs > 0 ? (totalViolations / totalSubs).toFixed(1) : 0;
  const riskLabel = riskScore < 1
    ? { text:'Low Risk',    color:'#22c55e', bg:'#f0fdf4', icon:'✅' }
    : riskScore < 3
    ? { text:'Medium Risk', color:'#f59e0b', bg:'#fef9c3', icon:'⚠️' }
    : { text:'High Risk',   color:'#ef4444', bg:'#fff5f5', icon:'🚨' };

  return (
    <div style={{ minHeight:'100vh',background:'linear-gradient(135deg,#f0f4ff 0%,#f8fafc 60%,#fdf4ff 100%)',fontFamily:"'Inter','Segoe UI',sans-serif" }}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}} .anim{animation:fadeIn 0.4s ease}`}</style>

      {/* Header */}
      <header style={{ background:'linear-gradient(135deg,#312e81,#4f46e5)',padding:'28px 32px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:16 }}>
        <div>
          <h1 style={{ color:'#fff',fontSize:22,fontWeight:800,margin:0 }}>
            {isClass ? `📊 ${class_name || 'Class Analytics'}` : '📊 Exam Analytics'}
          </h1>
          <p style={{ color:'rgba(255,255,255,0.55)',fontSize:13,margin:'4px 0 0' }}>
            {isClass ? 'Aggregate performance across all class exams' : 'Per-question difficulty and violation breakdown'}
          </p>
        </div>
        <button onClick={() => navigate(-1)} style={{ padding:'10px 20px',borderRadius:10,border:'1.5px solid rgba(255,255,255,0.3)',background:'rgba(255,255,255,0.1)',color:'#fff',fontWeight:600,fontSize:13,cursor:'pointer' }}>
          ← Back
        </button>
      </header>

      <main className="anim" style={{ maxWidth:1100,margin:'0 auto',padding:'28px 20px' }}>

        {/* Stat Cards */}
        <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:14,marginBottom:24 }}>
          <StatCard icon="📈" label="Avg Score"   value={average_score !== null ? average_score : null} sub="points across submissions" color="#6366f1" bg="#ede9fe" />
          <StatCard icon="📋" label="Submissions" value={totalSubs}             sub="submitted or graded"        color="#22c55e" bg="#dcfce7" />
          {isClass && <>
            <StatCard icon="👥" label="Enrolled"   value={enrolled_count}        sub="active students"            color="#0ea5e9" bg="#e0f2fe" />
            <StatCard icon="✅" label="Completion" value={`${completion_rate}%`} sub="of assigned exams"         color="#f59e0b" bg="#fef3c7" />
          </>}
          {/* Integrity Risk Card */}
          <div style={{ background:riskLabel.bg,borderRadius:16,border:`1.5px solid ${riskLabel.color}44`,boxShadow:'0 2px 12px rgba(0,0,0,0.05)',padding:'20px 22px',display:'flex',alignItems:'center',gap:16 }}>
            <div style={{ fontSize:28 }}>{riskLabel.icon}</div>
            <div>
              <p style={{ fontSize:11,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:0.8,margin:0 }}>Integrity Risk</p>
              <p style={{ fontSize:18,fontWeight:800,color:riskLabel.color,margin:'2px 0 0' }}>{riskLabel.text}</p>
              <p style={{ fontSize:11,color:'#94a3b8',margin:'2px 0 0' }}>{riskScore} violations/submission</p>
            </div>
          </div>
        </div>

        {totalSubs === 0 ? (
          <div style={{ background:'#fff',borderRadius:20,border:'1.5px dashed #e2e8f0',padding:'80px 32px',textAlign:'center' }}>
            <div style={{ fontSize:56,marginBottom:16 }}>📭</div>
            <p style={{ fontSize:18,fontWeight:700,color:'#334155',margin:'0 0 8px' }}>No Submissions Yet</p>
            <p style={{ fontSize:14,color:'#94a3b8' }}>Analytics will appear once students complete their exams.</p>
          </div>
        ) : (<>

          {/* Class Exam Summary */}
          {isClass && examData.length > 0 && (
            <SectionCard title="Exam Performance Summary" subtitle="Average scores and submissions per exam in this class">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={examData} margin={{ top:4,right:16,left:0,bottom:4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize:12,fill:'#64748b' }} />
                  <YAxis tick={{ fontSize:12,fill:'#64748b' }} />
                  <Tooltip formatter={(v) => [`${v} pts`,'Avg Score']} contentStyle={{ fontSize:12,borderRadius:10,border:'1px solid #e2e8f0' }} />
                  <Bar dataKey="avg" fill="#6366f1" radius={[6,6,0,0]} maxBarSize={60} />
                </BarChart>
              </ResponsiveContainer>

              <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:10,marginTop:20 }}>
                {exams.map(e => (
                  <div key={e.id} style={{ borderRadius:12,border:'1.5px solid #e2e8f0',padding:'12px 14px',background:'#fafafa' }}>
                    <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8 }}>
                      <span style={{ fontSize:12,fontWeight:700,color:'#334155',flex:1,lineHeight:1.4 }}>{e.title}</span>
                      <span style={{ fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,flexShrink:0,marginLeft:8,background:e.status==='published'?'#dcfce7':'#fef3c7',color:e.status==='published'?'#16a34a':'#92400e' }}>{e.status}</span>
                    </div>
                    <div style={{ display:'flex',gap:14 }}>
                      <div>
                        <div style={{ fontSize:20,fontWeight:800,color:'#6366f1' }}>{e.average_score ?? '—'}</div>
                        <div style={{ fontSize:10,color:'#94a3b8' }}>avg pts</div>
                      </div>
                      <div>
                        <div style={{ fontSize:20,fontWeight:800,color:'#22c55e' }}>{e.submissions_count}</div>
                        <div style={{ fontSize:10,color:'#94a3b8' }}>submitted</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Question Difficulty */}
          {!isClass && difficultyData.length > 0 && (
            <SectionCard title="Question Difficulty" subtitle="% of students who answered each question incorrectly — higher means harder">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={difficultyData} margin={{ top:4,right:16,left:0,bottom:4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize:12,fill:'#64748b' }} />
                  <YAxis unit="%" domain={[0,100]} tick={{ fontSize:12,fill:'#64748b' }} />
                  <Tooltip formatter={(v) => [`${v}%`,'Wrong Answers']} labelFormatter={(lbl,payload) => payload?.[0]?.payload?.text?.slice(0,80) || lbl} contentStyle={{ fontSize:12,borderRadius:10,border:'1px solid #e2e8f0' }} />
                  <Bar dataKey="pct" radius={[6,6,0,0]} maxBarSize={56}>
                    {difficultyData.map((entry, i) => (
                      <Cell key={i} fill={entry.pct > 70 ? '#ef4444' : entry.pct > 40 ? '#f59e0b' : '#22c55e'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display:'flex',gap:16,marginTop:12,fontSize:11,color:'#64748b',flexWrap:'wrap' }}>
                {[['#22c55e','Easy (< 40% wrong)'],['#f59e0b','Moderate (40–70%)'],['#ef4444','Hard (> 70% wrong)']].map(([c,l]) => (
                  <span key={l} style={{ display:'flex',alignItems:'center',gap:5 }}>
                    <span style={{ width:10,height:10,borderRadius:3,background:c,display:'inline-block' }} />{l}
                  </span>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Violation Breakdown */}
          {violData.length > 0 ? (
            <SectionCard title="Violation Breakdown" subtitle={`${totalViolations} total warnings across ${totalSubs} submissions`}>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:24,alignItems:'center' }}>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={violData.map(v => ({ name:v.meta.label, value:v.count }))} cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={3} dataKey="value">
                      {violData.map((v, i) => <Cell key={i} fill={v.meta.color} />)}
                    </Pie>
                    <Tooltip formatter={(v,n) => [v,'occurrences']} contentStyle={{ fontSize:12,borderRadius:10,border:'1px solid #e2e8f0' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
                  {violData.map(v => {
                    const pct = totalViolations > 0 ? Math.round((v.count/totalViolations)*100) : 0;
                    return (
                      <div key={v.type}>
                        <div style={{ display:'flex',justifyContent:'space-between',marginBottom:4 }}>
                          <span style={{ fontSize:12,fontWeight:600,color:'#334155',display:'flex',gap:6,alignItems:'center' }}>
                            <span>{v.meta.icon}</span>{v.meta.label}
                          </span>
                          <span style={{ fontSize:12,fontWeight:700,color:v.meta.color }}>{v.count}</span>
                        </div>
                        <div style={{ height:6,background:'#f1f5f9',borderRadius:99 }}>
                          <div style={{ height:6,borderRadius:99,background:v.meta.color,width:`${pct}%`,transition:'width 0.8s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </SectionCard>
          ) : (
            <SectionCard title="Violation Breakdown" subtitle="Proctoring warnings across submissions">
              <div style={{ textAlign:'center',padding:'32px 0' }}>
                <div style={{ fontSize:44,marginBottom:10 }}>🎉</div>
                <p style={{ color:'#22c55e',fontWeight:700,fontSize:15 }}>No violations recorded!</p>
                <p style={{ color:'#94a3b8',fontSize:13 }}>All students maintained perfect exam integrity.</p>
              </div>
            </SectionCard>
          )}
        </>)}
      </main>
    </div>
  );
}
