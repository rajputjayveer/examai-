import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import client from '../../api/client';

export default function ResultsDashboard() {
  const { examId } = useParams();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all' | 'flagged' | 'graded' | 'pending'
  const navigate = useNavigate();

  useEffect(() => {
    client.get(`/reports/teacher/exams/${examId}/results`)
      .then(res => {
        setResults(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [examId]);

  const filteredResults = results.filter(row => {
    if (filter === 'flagged') return row.flagged_for_review;
    if (filter === 'graded') return row.status === 'graded';
    if (filter === 'pending') return row.status !== 'graded';
    return true;
  });

  const stats = {
    total: results.length,
    flagged: results.filter(r => r.flagged_for_review).length,
    graded: results.filter(r => r.status === 'graded').length,
    pending: results.filter(r => r.status !== 'graded').length
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 font-display">Instructor Workspace</h1>
            <p className="text-xs text-slate-500">Monitor student grades, proctoring alerts, and audit logs</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/teacher/exam/${examId}/analytics`)}
              className="px-4 py-2 rounded-xl bg-brand-50 hover:bg-brand-100 border border-brand-200 text-brand-700 text-xs font-semibold transition"
            >
              📊 View Class Analytics
            </button>
            <button onClick={() => navigate('/teacher/exams')} className="btn-secondary py-2 text-xs">
              Back to Exams
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 space-y-4 animate-pulse">
            <div className="h-8 bg-slate-100 rounded w-full" />
            <div className="h-10 bg-slate-50 rounded w-full" />
            <div className="h-10 bg-slate-50 rounded w-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            
            {/* Left Filter Rail */}
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">Filter Submissions</h3>
                <div className="flex flex-col gap-1.5">
                  {[
                    { id: 'all', label: 'All Submissions', count: stats.total, color: 'text-slate-700 bg-slate-50 hover:bg-slate-100' },
                    { id: 'flagged', label: '🚩 Flagged Review', count: stats.flagged, color: 'text-red-700 bg-red-50 hover:bg-red-100' },
                    { id: 'graded', label: '✓ Graded', count: stats.graded, color: 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100' },
                    { id: 'pending', label: '⏳ Pending Review', count: stats.pending, color: 'text-amber-700 bg-amber-50 hover:bg-amber-100' }
                  ].map(btn => (
                    <button
                      key={btn.id}
                      onClick={() => setFilter(btn.id)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition border ${
                        filter === btn.id
                          ? 'border-brand-500 bg-brand-50/50 text-brand-700'
                          : 'border-transparent text-slate-650 hover:bg-slate-50'
                      }`}
                    >
                      <span>{btn.label}</span>
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-white border border-slate-200 text-slate-500 font-bold shadow-sm">{btn.count}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick statistics banner */}
              <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4 shadow-sm space-y-2">
                <h4 className="text-xs font-bold text-brand-700 uppercase tracking-wider">Exam Status Info</h4>
                <p className="text-[11px] text-brand-650 leading-relaxed">
                  Students with 3 or more warnings will automatically be flagged. Review individual PDF logs to identify focus anomalies.
                </p>
              </div>
            </div>

            {/* Right Submissions Table */}
            <div className="lg:col-span-3">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
                {filteredResults.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 text-sm font-medium">
                    No submissions match the selected filter.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-650 text-xs uppercase font-semibold">
                        <tr>
                          <th className="px-6 py-4 text-left">Student Name</th>
                          <th className="px-6 py-4 text-left">Status</th>
                          <th className="px-6 py-4 text-left">Score</th>
                          <th className="px-6 py-4 text-left">Violations</th>
                          <th className="px-6 py-4 text-left">Submitted At</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredResults.map(row => (
                          <tr key={row.attempt_id} className="hover:bg-slate-50 transition">
                            <td className="px-6 py-4 font-bold text-slate-900">{row.student_name}</td>
                            <td className="px-6 py-4">
                              <span className={row.status === 'graded' ? 'badge-green animate-none' : 'badge-amber animate-none'}>
                                {row.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-medium text-slate-800">
                              {row.score !== null ? `${row.score} pts` : <span className="text-slate-400">Pending</span>}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5">
                                <span className={
                                  row.violations_count === 0
                                    ? 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : row.violations_count <= 2
                                      ? 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200'
                                      : 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200'
                                }>
                                  {row.violations_count === 0 ? '0 (Safe)' : `${row.violations_count} flag(s)`}
                                </span>
                                {row.flagged_for_review && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black bg-red-600 text-white shadow-sm">
                                    🚩 Flagged
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-slate-500">
                              {row.submitted_at ? new Date(row.submitted_at).toLocaleString() : 'N/A'}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <Link
                                to={`/teacher/report/${row.attempt_id}`}
                                className="text-brand-600 hover:text-brand-700 font-bold hover:underline"
                              >
                                View Report →
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}

