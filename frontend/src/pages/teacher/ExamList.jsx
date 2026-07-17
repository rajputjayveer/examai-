import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function ExamList() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    client.get('/exams')
      .then(res => {
        setExams(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handlePublish = async (examId) => {
    try {
      await client.post(`/exams/${examId}/publish`);
      setExams(exams.map(e => e.id === examId ? { ...e, status: 'published' } : e));
    } catch (err) {
      alert('Failed to publish exam');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 font-display">Teacher Dashboard</h1>
            <p className="text-xs text-slate-500">Welcome, {user?.name || 'Instructor'}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/teacher/create-exam')}
              className="btn-primary py-2 text-xs"
            >
              + Create Exam
            </button>
            <button onClick={logout} className="btn-secondary py-2 text-xs text-red-650 hover:bg-red-50">
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <h2 className="text-lg font-bold text-slate-900 mb-6 font-display">Manage Exams</h2>
        
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-4 border-brand-200 border-t-brand-600 animate-spin" />
          </div>
        ) : exams.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-card">
            <h3 className="font-semibold text-slate-700 mb-1">No exams found</h3>
            <p className="text-sm text-slate-400">Click "Create Exam" to build your first proctored test.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {exams.map(exam => {
              const start = new Date(exam.start_at);
              const end = new Date(exam.end_at);
              const isDraft = exam.status === 'draft';
              const isEvaluated = exam.status === 'evaluated';
              
              return (
                <div key={exam.id} className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 flex flex-col justify-between hover:shadow-card-hover transition duration-200">
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-semibold text-slate-900 font-display leading-snug">{exam.title}</h3>
                      <span className={
                        isEvaluated ? 'badge-green' : 
                        exam.status === 'published' ? 'badge-blue' : 'badge-slate'
                      }>
                        {exam.status}
                      </span>
                    </div>
                    <div className="space-y-1.5 text-xs text-slate-500 mb-6">
                      <p>⏱ Duration: <span className="font-medium text-slate-750">{exam.duration_minutes} mins</span></p>
                      <p>📅 Starts: {start.toLocaleString()}</p>
                      <p>🏁 Ends: {end.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2 border-t border-slate-100">
                    {isDraft ? (
                      <button
                        onClick={() => handlePublish(exam.id)}
                        className="flex-1 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition"
                      >
                        Publish
                      </button>
                    ) : (
                      <button
                        onClick={() => navigate(`/teacher/exam/${exam.id}/answer-key`)}
                        className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition"
                      >
                        {isEvaluated ? 'Correct Key' : 'Review Key'}
                      </button>
                    )}
                    <button
                      onClick={() => navigate(`/teacher/exam/${exam.id}/results`)}
                      className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition"
                    >
                      Results
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
