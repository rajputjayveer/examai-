import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';

export default function StudentReport() {
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

  const { attempt, student_name, exam_title, violations, answers } = report;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 font-display">Candidate Proctoring Report</h1>
            <p className="text-xs text-slate-500">Attempt review for {student_name}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={downloadPdf} className="btn-primary py-2 text-xs">
              Download PDF Report
            </button>
            <button onClick={() => navigate(-1)} className="btn-secondary py-2 text-xs">
              Back
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content: Answers & Questions */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-base font-bold text-slate-900 font-display">Question Breakdown</h2>
            <div className="space-y-4">
              {answers.map((ans, idx) => {
                const isCorrect = ans.selected_option === ans.correct_option;
                return (
                  <div key={idx} className="bg-white border border-slate-200 rounded-2xl shadow-card p-6">
                    <h3 className="text-slate-900 font-semibold mb-3">{idx + 1}. {ans.question_text}</h3>
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 mb-4">
                      <p>A: {ans.option_a}</p>
                      <p>B: {ans.option_b}</p>
                      <p>C: {ans.option_c}</p>
                      <p>D: {ans.option_d}</p>
                    </div>
                    <div className="flex justify-between items-center text-xs font-semibold pt-3 border-t border-slate-100">
                      <span className="text-slate-500">
                        Selected: <span className={isCorrect ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>{ans.selected_option || 'None'}</span>
                      </span>
                      {ans.correct_option && (
                        <span className="text-emerald-600">Correct Answer: {ans.correct_option}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Violation log & details */}
          <div className="space-y-6">
            {/* Summary */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6">
              <h3 className="text-base font-bold text-slate-950 mb-4 font-display">Performance Summary</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Exam Title</span>
                  <span className="font-semibold text-slate-800 text-right max-w-[150px] truncate">{exam_title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Score Achieved</span>
                  <span className="font-bold text-slate-900">{attempt.score !== null ? `${attempt.score} Marks` : 'Pending'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Logged Violations</span>
                  <span className={`font-bold ${violations.length > 0 ? 'text-red-600 animate-pulse' : 'text-emerald-600'}`}>
                    {violations.length}
                  </span>
                </div>
              </div>
            </div>

            {/* Gemini AI Auditor Insights */}
            {report.ai_insight && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6">
                <h3 className="text-base font-bold text-slate-950 mb-3 font-display">✨ AI Proctor Audit</h3>
                <div className="bg-red-50/40 border border-red-100 rounded-xl p-4">
                  <p className="text-xs text-slate-700 leading-relaxed font-medium">{report.ai_insight}</p>
                </div>
              </div>
            )}

            {/* Violation Feed */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6">
              <h3 className="text-base font-bold text-slate-950 mb-4 font-display">Violations Feed</h3>
              {violations.length === 0 ? (
                <p className="text-xs text-slate-500">No violations recorded. Candidate followed all guidelines.</p>
              ) : (
                <div className="space-y-4">
                  {violations.map((v, i) => (
                    <div key={i} className="p-3 border border-red-100 bg-red-50/50 rounded-xl text-xs space-y-2">
                      <div className="flex justify-between font-bold text-red-700">
                        <span className="uppercase">{v.type}</span>
                        <span>{v.timestamp ? new Date(v.timestamp).toLocaleTimeString() : ''}</span>
                      </div>
                      <p className="text-slate-650">{v.description || 'Proctor warning triggered.'}</p>
                      {v.evidence_path && (
                        <div className="relative aspect-video rounded-lg overflow-hidden border border-red-200 bg-slate-100">
                          <img
                            src={`http://localhost:8000/api/storage/${v.evidence_path}`}
                            alt="Violation Snapshot"
                            className="w-full h-full object-cover"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
