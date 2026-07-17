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
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8 pb-4 border-b border-slate-800">
          <div>
            <h1 className="text-3xl font-bold">Teacher Dashboard</h1>
            <p className="text-slate-400 text-sm">Create and monitor your exams</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => navigate('/teacher/create-exam')}
              className="px-4 py-2 bg-brand-500 hover:bg-brand-600 rounded-lg text-sm font-semibold transition"
            >
              Create Exam
            </button>
            <button onClick={logout} className="px-4 py-2 bg-slate-850 hover:bg-slate-800 rounded-lg text-sm border border-slate-800">
              Sign Out
            </button>
          </div>
        </header>

        {loading ? (
          <div className="text-center text-slate-500 py-10">Loading exams...</div>
        ) : (
          <div>
            <h2 className="text-xl font-semibold mb-4">My Exams</h2>
            {exams.length === 0 ? (
              <div className="glass-panel p-8 text-center rounded-xl text-slate-500 border border-slate-850">
                You have not created any exams yet. Click "Create Exam" to get started.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {exams.map(exam => (
                  <div key={exam.id} className="glass-panel p-6 rounded-xl border border-slate-850 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="text-lg font-semibold">{exam.title}</h3>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                          exam.status === 'published' ? 'bg-green-500/10 text-green-400' : 'bg-slate-500/10 text-slate-400'
                        }`}>
                          {exam.status}
                        </span>
                      </div>
                      <div className="space-y-1 text-sm text-slate-400 mb-6">
                        <p>Duration: {exam.duration_minutes} mins</p>
                        <p>Starts: {new Date(exam.start_at).toLocaleString()}</p>
                        <p>Ends: {new Date(exam.end_at).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {exam.status === 'draft' && (
                        <button
                          onClick={async () => {
                            await client.post(`/exams/${exam.id}/publish`);
                            window.location.reload();
                          }}
                          className="flex-1 py-2 border border-brand-500 text-brand-500 hover:bg-brand-500 hover:text-white rounded-lg text-xs font-semibold transition"
                        >
                          Publish
                        </button>
                      )}
                      <button
                        onClick={() => navigate(`/teacher/exam/${exam.id}/results`)}
                        className="flex-1 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-lg text-xs font-semibold text-slate-300 transition"
                      >
                        Monitor / Results
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
