import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import ClassManagement from './ClassManagement';
import StudentProfileModal from './StudentProfileModal';

function Sidebar({ activeTab, setActiveTab }) {
  const { logout, user } = useAuth();
  
  const tabs = [
    { id: 'exams', label: 'Exams Workspace', icon: 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25' },
    { id: 'classes', label: 'My Classes', icon: 'M4.26 10.147a60.436 60.436 0 01-.491-6.347A48.627 48.627 0 0112 3c4.248 0 8.312.545 12.163 1.571a60.465 60.465 0 01-.491 6.347m-15.482 0a50.57 50.57 0 00-2.658 8.14A59.905 59.905 0 0112 19c4.248 0 8.312-.545 12.163-1.571a50.55 50.55 0 00-2.658-8.14' },
    { id: 'students', label: 'Student Directory', icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A11.978 11.978 0 0112 20.25a11.978 11.978 0 01-3-.109v-.111c0-1.113.285-2.16.786-3.07M12 20.25a8.974 8.974 0 002.223-5.843M12 20.25a8.974 8.974 0 01-2.223-5.843m0 0a8.968 8.968 0 00-1.75-5.54M9 14.377a8.968 8.968 0 01-1.75-5.54M12 14.407a8.977 8.977 0 01-2.223-5.843M12 14.407a8.977 8.977 0 002.223-5.843M12 8.564a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z' },
    { id: 'alerts', label: 'Live Warnings Feed', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
  ];

  return (
    <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 min-h-screen px-4 py-6 gap-2 shadow-sm">
      <div className="flex items-center gap-2.5 mb-8 px-2">
        <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>
        <span className="font-extrabold text-slate-900 font-display">SecureExam AI</span>
      </div>

      <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Teacher Console</p>

      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => setActiveTab(t.id)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${
            activeTab === t.id
              ? 'bg-brand-50 text-brand-700 border border-brand-100 shadow-sm'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d={t.icon} />
          </svg>
          {t.label}
        </button>
      ))}

      <div className="mt-auto border-t border-slate-100 pt-4">
        <div className="px-3 py-2 mb-2 bg-slate-50 rounded-xl border border-slate-100">
          <p className="text-xs font-semibold text-slate-700 truncate">{user?.name}</p>
          <p className="text-[10px] text-slate-400 truncate mt-0.5">{user?.email}</p>
        </div>
        <button onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-500 hover:bg-red-50 hover:text-red-650 w-full transition">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
          </svg>
          Sign Out
        </button>
      </div>
    </aside>
  );
}

export default function ExamList() {
  const [exams, setExams] = useState([]);
  const [students, setStudents] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('exams');
  const [selectedExam, setSelectedExam] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [alertPage, setAlertPage] = useState(1);
  const [alertMeta, setAlertMeta] = useState({ total: 0, pages: 0 });
  const [inspectStudentId, setInspectStudentId] = useState(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      try {
        const [examsRes, studentsRes] = await Promise.all([
          client.get('/exams'),
          client.get('/reports/teacher/students')
        ]);
        setExams(examsRes.data);
        setStudents(studentsRes.data);
      } catch (err) {
        console.warn("Failed to load initial datasets", err);
      } finally {
        setLoading(false);
      }
    };
    loadAll();
  }, []);

  useEffect(() => {
    if (activeTab !== 'alerts') return;
    setAlertsLoading(true);
    
    let url = `/reports/teacher/alerts?page=${alertPage}&size=10`;
    if (selectedExam) url += `&exam_id=${selectedExam}`;
    if (selectedStudent) url += `&student_id=${selectedStudent}`;
    
    client.get(url)
      .then(res => {
        setAlerts(res.data.items || []);
        setAlertMeta({
          total: res.data.total,
          pages: res.data.pages
        });
        setAlertsLoading(false);
      })
      .catch(() => setAlertsLoading(false));
  }, [activeTab, alertPage, selectedExam, selectedStudent]);

  // Reset page to 1 when filters change
  const handleExamFilterChange = (val) => {
    setSelectedExam(val);
    setAlertPage(1);
  };

  const handleStudentFilterChange = (val) => {
    setSelectedStudent(val);
    setAlertPage(1);
  };

  const [publishingId, setPublishingId] = useState(null);

  const handlePublish = async (examId) => {
    setPublishingId(examId);
    try {
      await client.post(`/exams/${examId}/publish`);
      const examsRes = await client.get('/exams');
      setExams(examsRes.data);
    } catch (err) {
      alert('Failed to publish exam: ' + (err.response?.data?.detail || err.message));
    } finally {
      setPublishingId(null);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="flex-1 p-6 lg:p-8 overflow-auto">
        
        {/* Header */}
        <div className="mb-8 flex items-center justify-between border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 font-display">Teacher Dashboard</h1>
            <p className="text-xs text-slate-500">Welcome, {user?.name || 'Instructor'}</p>
          </div>
          {activeTab === 'exams' && (
            <button
              onClick={() => navigate('/teacher/create-exam')}
              className="px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition shadow-sm"
            >
              + Create Exam
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-4 border-brand-200 border-t-brand-600 animate-spin" />
          </div>
        ) : (
          <div className="animate-fade-in">
            {/* Tab 1: Exams Workspace */}
            {activeTab === 'exams' && (
              <div className="space-y-6">
                <h2 className="text-base font-bold text-slate-900 mb-4 font-display">Manage Exams</h2>
                {exams.length === 0 ? (
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
                                isEvaluated ? 'badge-green animate-none' : 
                                exam.status === 'published' ? 'badge-blue animate-none' : 'badge-slate animate-none'
                              }>
                                {exam.status}
                              </span>
                            </div>
                            <div className="space-y-1.5 text-xs text-slate-500 mb-6">
                              <p>⏱ Duration: <span className="font-semibold text-slate-750">{exam.duration_minutes} mins</span></p>
                              <p>📅 Starts: {start.toLocaleString()}</p>
                              <p>🏁 Ends: {end.toLocaleString()}</p>
                            </div>
                          </div>
                          <div className="flex gap-2 pt-2 border-t border-slate-100">
                            {isDraft ? (
                              <>
                                <button
                                  onClick={() => navigate(`/teacher/edit-exam/${exam.id}`)}
                                  className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition border border-slate-200"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handlePublish(exam.id)}
                                  disabled={publishingId === exam.id}
                                  className="flex-1 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                                >
                                  {publishingId === exam.id ? (
                                    <>
                                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                                      Publishing…
                                    </>
                                  ) : 'Publish'}
                                </button>
                              </>
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
              </div>
            )}

            {/* Tab 2: My Classes */}
            {activeTab === 'classes' && <ClassManagement />}

            {/* Tab 3: Student Directory */}
            {activeTab === 'students' && (
              <div className="space-y-6">
                <h2 className="text-base font-bold text-slate-900 mb-4 font-display">Student Roster</h2>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
                  {students.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 text-sm">
                      No registered students found in the portal database.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-650 text-xs uppercase font-semibold">
                          <tr>
                            <th className="px-6 py-4 text-left">Student Name</th>
                            <th className="px-6 py-4 text-left">Email Address</th>
                            <th className="px-6 py-4 text-left">Biometrics Profile</th>
                            <th className="px-6 py-4 text-left">Registration Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {students.map(std => (
                            <tr key={std.id} className="hover:bg-slate-50/50 transition">
                              <td className="px-6 py-4 font-bold text-slate-900">
                                <button
                                  onClick={() => setInspectStudentId(std.id)}
                                  className="text-brand-600 hover:underline font-bold text-left"
                                >
                                  {std.name}
                                </button>
                              </td>
                              <td className="px-6 py-4">{std.email}</td>
                              <td className="px-6 py-4">
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold border ${
                                  std.face_enrolled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200 animate-pulse'
                                }`}>
                                  <span className={`w-2 h-2 rounded-full ${std.face_enrolled ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                  {std.face_enrolled ? '✓ Face Enrolled' : '⚠ Missing Face'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-slate-500">
                                {std.created_at ? new Date(std.created_at).toLocaleDateString() : 'N/A'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 3: Live Warnings Feed */}
            {activeTab === 'alerts' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <h2 className="text-base font-bold text-slate-900 font-display">Recent Proctoring Warnings Log</h2>
                  
                  {/* Select Filters */}
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <select
                      value={selectedExam}
                      onChange={(e) => handleExamFilterChange(e.target.value)}
                      className="text-xs rounded-xl border-slate-200 bg-white text-slate-700 shadow-sm focus:border-brand-500 py-2 px-3"
                    >
                      <option value="">All Exams</option>
                      {exams.map(e => (
                        <option key={e.id} value={e.id}>{e.title}</option>
                      ))}
                    </select>

                    <select
                      value={selectedStudent}
                      onChange={(e) => handleStudentFilterChange(e.target.value)}
                      className="text-xs rounded-xl border-slate-200 bg-white text-slate-700 shadow-sm focus:border-brand-500 py-2 px-3"
                    >
                      <option value="">All Students</option>
                      {students.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
                  {alertsLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <div className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-brand-600 animate-spin" />
                    </div>
                  ) : alerts.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 text-sm font-medium">
                      No proctoring violations recorded recently.
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-650 text-xs uppercase font-semibold">
                            <tr>
                              <th className="px-6 py-4 text-left">Student</th>
                              <th className="px-6 py-4 text-left">Exam</th>
                              <th className="px-6 py-4 text-left">Violation Type</th>
                              <th className="px-6 py-4 text-left">Occurred At</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700">
                            {alerts.map(alert => (
                              <tr key={alert.id} className="hover:bg-slate-50/50 transition">
                                <td className="px-6 py-4 font-bold text-slate-900">{alert.student_name}</td>
                                <td className="px-6 py-4">{alert.exam_title}</td>
                                <td className="px-6 py-4">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                                    {alert.violation_type.replace(/_/g, ' ')}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-slate-500">
                                  {alert.created_at ? new Date(alert.created_at).toLocaleString() : 'N/A'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination Controls */}
                      {alertMeta.pages > 1 && (
                        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200 text-xs">
                          <div className="text-slate-500">
                            Showing page <span className="font-bold text-slate-700">{alertPage}</span> of{' '}
                            <span className="font-bold text-slate-700">{alertMeta.pages}</span> ({alertMeta.total} alerts total)
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setAlertPage(p => Math.max(1, p - 1))}
                              disabled={alertPage === 1}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-bold transition disabled:opacity-40"
                            >
                              ← Previous
                            </button>
                            <button
                              onClick={() => setAlertPage(p => Math.min(alertMeta.pages, p + 1))}
                              disabled={alertPage === alertMeta.pages}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-bold transition disabled:opacity-40"
                            >
                              Next →
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {inspectStudentId && (
        <StudentProfileModal
          studentId={inspectStudentId}
          onClose={() => setInspectStudentId(null)}
        />
      )}
    </div>
  );
}

