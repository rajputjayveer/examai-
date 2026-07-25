import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import client from '../../api/client';

const VIOLATION_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#84cc16',
  '#22c55e', '#06b6d4', '#6366f1', '#ec4899'
];

function StatCard({ label, value, sub, color }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 flex flex-col gap-1">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-3xl font-bold font-display ${color || 'text-slate-900'}`}>{value ?? '—'}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export default function ClassAnalytics() {
  const { examId, classId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isClassAnalytics = Boolean(classId);

  useEffect(() => {
    const endpoint = isClassAnalytics
      ? `/classes/${classId}/analytics`
      : `/reports/teacher/exams/${examId}/analytics`;

    client.get(endpoint)
      .then(res => { setData(res.data); setLoading(false); })
      .catch(() => { setError('Failed to load analytics data.'); setLoading(false); });
  }, [examId, classId, isClassAnalytics]);

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-4 border-brand-200 border-t-brand-600 animate-spin" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-red-600 font-medium">{error}</p>
    </div>
  );

  const {
    average_score,
    total_submissions,
    total_attempts,
    enrolled_count,
    completion_rate,
    class_name,
    question_difficulty,
    violation_breakdown = {},
    exams = []
  } = data || {};

  const totalSubs = total_submissions ?? total_attempts ?? 0;

  // Question difficulty bar chart data (for exam analytics)
  const difficultyData = (question_difficulty || []).map((q, i) => ({
    name: `Q${i + 1}`,
    percent_wrong: q.percent_wrong ?? 0,
    full_text: q.text
  }));

  // Exam summary bar chart data (for class analytics)
  const examSummaryData = (exams || []).map((e) => ({
    name: e.title.length > 15 ? `${e.title.slice(0, 15)}...` : e.title,
    avg_score: e.average_score ?? 0,
    submissions: e.submissions_count
  }));

  // Violation breakdown pie data
  const violationData = Object.entries(violation_breakdown).map(([type, count]) => ({
    name: type.replace(/_/g, ' '),
    value: count
  }));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 font-display">
              {isClassAnalytics ? `Class Analytics: ${class_name || ''}` : 'Exam Performance Analytics'}
            </h1>
            <p className="text-xs text-slate-500">
              {isClassAnalytics
                ? 'Aggregate performance, completion rates, and violation trends across class exams'
                : 'Performance overview and violation breakdown for this exam'}
            </p>
          </div>
          <button
            onClick={() => navigate('/teacher/exams')}
            className="btn-secondary py-2 text-xs"
          >
            ← Back to Teacher Console
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Average Score"
            value={average_score !== null ? `${average_score} pts` : null}
            sub="across submissions"
            color="text-brand-600"
          />
          <StatCard
            label="Total Submissions"
            value={totalSubs}
            sub="submitted or graded"
          />
          {isClassAnalytics && (
            <>
              <StatCard
                label="Enrolled Students"
                value={enrolled_count}
                sub="active class roster"
                color="text-emerald-600"
              />
              <StatCard
                label="Completion Rate"
                value={`${completion_rate}%`}
                sub="assigned exam submissions"
                color="text-blue-600"
              />
            </>
          )}
        </div>

        {totalSubs === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-12 text-center text-slate-400">
            No submissions yet — analytics will appear once students complete exams.
          </div>
        ) : (
          <>
            {/* Exam Summaries for Class Analytics */}
            {isClassAnalytics && examSummaryData.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6">
                <h2 className="text-base font-bold text-slate-900 font-display mb-1">Class Exam Performance Summary</h2>
                <p className="text-xs text-slate-500 mb-5">Average scores achieved per exam in this class</p>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={examSummaryData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                    <Tooltip
                      formatter={(value, name) => [`${value} pts`, 'Average Score']}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                    />
                    <Bar dataKey="avg_score" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Question difficulty chart for Exam Analytics */}
            {!isClassAnalytics && difficultyData.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6">
                <h2 className="text-base font-bold text-slate-900 font-display mb-1">Question Difficulty</h2>
                <p className="text-xs text-slate-500 mb-5">% of students who answered each question incorrectly (higher = harder)</p>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={difficultyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis unit="%" tick={{ fontSize: 12, fill: '#64748b' }} domain={[0, 100]} />
                    <Tooltip
                      formatter={(value) => [`${value}%`, 'Wrong answers']}
                      labelFormatter={(label, payload) => {
                        if (payload && payload[0]) {
                          const text = payload[0].payload.full_text;
                          return text.length > 60 ? `${text.slice(0, 60)}…` : text;
                        }
                        return label;
                      }}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                    />
                    <Bar dataKey="percent_wrong" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Violation breakdown */}
            {violationData.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6">
                <h2 className="text-base font-bold text-slate-900 font-display mb-1">Violation Breakdown</h2>
                <p className="text-xs text-slate-500 mb-5">Total warnings recorded per type across submissions</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={violationData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {violationData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={VIOLATION_COLORS[index % VIOLATION_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [value, 'occurrences']}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>

                  <div className="space-y-2">
                    {violationData.map((item, i) => (
                      <div key={item.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: VIOLATION_COLORS[i % VIOLATION_COLORS.length] }}
                          />
                          <span className="text-sm text-slate-700 capitalize">{item.name}</span>
                        </div>
                        <span className="text-sm font-bold text-slate-900">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
