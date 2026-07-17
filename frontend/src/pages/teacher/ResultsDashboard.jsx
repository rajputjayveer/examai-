import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import client from '../../api/client';

export default function ResultsDashboard() {
  const { examId } = useParams();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    client.get(`/reports/teacher/exams/${examId}/results`)
      .then(res => {
        setResults(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [examId]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 font-display">Exam Submissions</h1>
            <p className="text-xs text-slate-500">Monitor student grades and proctoring logs</p>
          </div>
          <button onClick={() => navigate('/teacher/exams')} className="btn-secondary py-2 text-xs">
            Back to Exams
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 space-y-4 animate-pulse">
            <div className="h-8 bg-slate-100 rounded w-full" />
            <div className="h-10 bg-slate-50 rounded w-full" />
            <div className="h-10 bg-slate-50 rounded w-full" />
            <div className="h-10 bg-slate-50 rounded w-full" />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
            {results.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                No students have submitted this exam yet.
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
                    {results.map(row => (
                      <tr key={row.attempt_id} className="hover:bg-slate-50 transition">
                        <td className="px-6 py-4 font-semibold text-slate-900">{row.student_name}</td>
                        <td className="px-6 py-4">
                          <span className={row.status === 'graded' ? 'badge-green' : 'badge-amber'}>
                            {row.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-800">
                          {row.score !== null ? `${row.score} pts` : <span className="text-slate-400">Pending</span>}
                        </td>
                        <td className="px-6 py-4">
                          <span className={
                            row.violations_count === 0
                              ? 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-250'
                              : row.violations_count <= 2
                                ? 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-250'
                                : 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-250 animate-pulse font-bold'
                          }>
                            {row.violations_count === 0 ? '0 (Safe)' : `${row.violations_count} flag(s)`}
                          </span>
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
        )}
      </main>
    </div>
  );
}
