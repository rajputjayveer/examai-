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
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [examId]);

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8 pb-4 border-b border-slate-800">
          <div>
            <h1 className="text-3xl font-bold">Exam Results</h1>
            <p className="text-slate-400 text-sm">Monitor student submissions and proctoring violations</p>
          </div>
          <button
            onClick={() => navigate('/teacher/exams')}
            className="px-4 py-2 bg-slate-850 hover:bg-slate-800 rounded-lg text-sm border border-slate-850"
          >
            Back to Exams
          </button>
        </header>

        {loading ? (
          <div className="text-center text-slate-500 py-10">Loading results...</div>
        ) : (
          <div className="glass-panel rounded-2xl border border-slate-850 overflow-hidden">
            {results.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                No students have submitted this exam yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-200">
                  <thead className="bg-slate-900 text-slate-400 text-xs uppercase font-bold border-b border-slate-850">
                    <tr>
                      <th className="px-6 py-4">Student Name</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Score</th>
                      <th className="px-6 py-4">Violations</th>
                      <th className="px-6 py-4">Submission Date</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {results.map(row => (
                      <tr key={row.attempt_id} className="hover:bg-slate-900/40">
                        <td className="px-6 py-4 font-semibold text-white">{row.student_name}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                            row.status === 'graded' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'
                          }`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">{row.score !== null ? `${row.score} Marks` : 'Pending'}</td>
                        <td className="px-6 py-4">
                          <span className={row.violations_count > 0 ? 'text-red-500 font-bold' : 'text-slate-450'}>
                            {row.violations_count}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-400">
                          {row.submitted_at ? new Date(row.submitted_at).toLocaleString() : 'N/A'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link
                            to={`/teacher/report/${row.attempt_id}`}
                            className="text-brand-500 hover:text-brand-400 font-semibold"
                          >
                            View Report
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
      </div>
    </div>
  );
}
