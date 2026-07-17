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
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [attemptId]);

  const downloadPdf = () => {
    window.open(`/api/reports/${attemptId}/pdf`, '_blank');
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">Loading student report...</div>;
  }

  const { attempt, student_name, exam_title, violations, answers } = report;

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8 pb-4 border-b border-slate-800">
          <div>
            <h1 className="text-3xl font-bold">Candidate Exam Report</h1>
            <p className="text-slate-400 text-sm">Reviewing attempt details for {student_name}</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={downloadPdf}
              className="px-4 py-2 bg-brand-500 hover:bg-brand-600 rounded-lg text-sm font-semibold transition text-white"
            >
              Download PDF Report
            </button>
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 bg-slate-850 hover:bg-slate-800 rounded-lg text-sm border border-slate-855"
            >
              Back
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content: Answers & Questions */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-xl font-semibold text-white">Question Breakdown</h2>
            <div className="space-y-4">
              {answers.map((ans, idx) => {
                const isCorrect = ans.selected_option === ans.correct_option;
                return (
                  <div key={idx} className="glass-panel p-6 rounded-xl border border-slate-850">
                    <h3 className="text-slate-200 font-medium mb-3">{idx + 1}. {ans.question_text}</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm text-slate-450 mb-4">
                      <p>A: {ans.option_a}</p>
                      <p>B: {ans.option_b}</p>
                      <p>C: {ans.option_c}</p>
                      <p>D: {ans.option_d}</p>
                    </div>
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-400">Selected Answer: <span className={isCorrect ? 'text-green-500' : 'text-red-500'}>{ans.selected_option}</span></span>
                      {ans.correct_option && (
                        <span className="text-green-500">Correct Answer: {ans.correct_option}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Violation log & details */}
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-xl border border-slate-850">
              <h3 className="text-lg font-semibold mb-4 text-white">Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Score:</span>
                  <span className="text-white font-bold">{attempt.score !== null ? `${attempt.score} Marks` : 'Pending'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Violations logged:</span>
                  <span className={`font-bold ${violations.length > 0 ? 'text-red-500' : 'text-slate-200'}`}>
                    {violations.length}
                  </span>
                </div>
              </div>
            </div>

            <div className="glass-panel p-6 rounded-xl border border-slate-850">
              <h3 className="text-lg font-semibold mb-4 text-white">Violation Evidence Logs</h3>
              {violations.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No violations logged during the exam.</p>
              ) : (
                <div className="space-y-4">
                  {violations.map(v => (
                    <div key={v.id} className="border-b border-slate-850 pb-4 last:border-b-0 last:pb-0">
                      <div className="flex justify-between text-xs text-slate-400 mb-2">
                        <span className="font-semibold text-red-500 uppercase">{v.type}</span>
                        <span>{new Date(v.created_at).toLocaleTimeString()}</span>
                      </div>
                      {v.evidence_path && (
                        <div className="aspect-video w-full rounded bg-slate-900 overflow-hidden border border-slate-800">
                          <img src={`/api/storage/${v.evidence_path}`} alt="Evidence screenshot" className="w-full h-full object-cover" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
