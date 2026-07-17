import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function Dashboard() {
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
            <h1 className="text-3xl font-bold">Welcome, <span className="text-brand-500">{user?.name}</span></h1>
            <p className="text-slate-400 text-sm">Student Exam Dashboard</p>
          </div>
          <button onClick={logout} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm">
            Sign Out
          </button>
        </header>

        {loading ? (
          <div className="text-center text-slate-500 py-10">Loading exams...</div>
        ) : (
          <div>
            <h2 className="text-xl font-semibold mb-4">Available Exams</h2>
            {exams.length === 0 ? (
              <div className="glass-panel p-8 text-center rounded-xl text-slate-500">
                No active exams available at the moment.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {exams.map(exam => (
                  <div key={exam.id} className="glass-panel p-6 rounded-xl border border-slate-800 flex flex-col justify-between">
                    <div>
                      <h3 className="text-lg font-semibold mb-2">{exam.title}</h3>
                      <div className="space-y-1 text-sm text-slate-400 mb-4">
                        <p>Duration: {exam.duration_minutes} mins</p>
                        <p>Starts: {new Date(exam.start_at).toLocaleString()}</p>
                        <p>Ends: {new Date(exam.end_at).toLocaleString()}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/student/instructions/${exam.id}`)}
                      className="w-full py-2 bg-brand-500 hover:bg-brand-600 rounded-lg text-sm font-semibold transition"
                    >
                      Start Exam
                    </button>
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
