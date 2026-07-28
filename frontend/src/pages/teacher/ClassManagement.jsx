import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import StudentProfileModal from './StudentProfileModal';

export default function ClassManagement() {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Create class modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // Selected class for managing students / roster
  const [selectedClass, setSelectedClass] = useState(null);
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentEmailInput, setStudentEmailInput] = useState('');
  const [enrollMsg, setEnrollMsg] = useState(null);
  const [enrollError, setEnrollError] = useState(null);
  const [fileUploading, setFileUploading] = useState(false);

  // Share class modal
  const [shareClassObj, setShareClassObj] = useState(null);
  const [coTeachers, setCoTeachers] = useState([]);
  const [coTeacherEmailInput, setCoTeacherEmailInput] = useState('');
  const [shareMsg, setShareMsg] = useState(null);
  const [shareError, setShareError] = useState(null);

  // Student Profile Inspection Modal
  const [inspectStudentId, setInspectStudentId] = useState(null);

  const navigate = useNavigate();

  const loadClasses = async () => {
    setLoading(true);
    try {
      const res = await client.get('/classes');
      setClasses(res.data);
    } catch (err) {
      console.warn("Failed to fetch classes", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClasses();
  }, []);

  const handleCreateClass = async (e) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    setCreateError('');
    setCreateLoading(true);
    try {
      await client.post('/classes', { name: newClassName.trim() });
      setNewClassName('');
      setShowCreateModal(false);
      loadClasses();
    } catch (err) {
      setCreateError(err.response?.data?.detail || 'Failed to create class.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeleteClass = async (classId, className) => {
    if (!window.confirm(`Are you sure you want to delete class "${className}"? This will remove all student roster associations.`)) return;
    try {
      await client.delete(`/classes/${classId}`);
      loadClasses();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to delete class.");
    }
  };

  const openStudentModal = async (cls) => {
    setSelectedClass(cls);
    setStudentsLoading(true);
    setEnrollMsg(null);
    setEnrollError(null);
    try {
      const res = await client.get(`/classes/${cls.id}/students`);
      setStudents(res.data);
    } catch (err) {
      console.warn("Failed to load class students", err);
    } finally {
      setStudentsLoading(false);
    }
  };

  const [studentNameInput, setStudentNameInput] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);

  const handleSingleEnroll = async (e) => {
    e.preventDefault();
    if (!studentEmailInput.trim() || !selectedClass) return;
    setEnrollMsg(null);
    setEnrollError(null);
    setAddingStudent(true);
    try {
      const res = await client.post(`/classes/${selectedClass.id}/students`, {
        email: studentEmailInput.trim(),
        name: studentNameInput.trim() || undefined
      });
      if (res.data.added && res.data.added.length > 0) {
        const addedItem = res.data.added[0];
        setEnrollMsg(`Added: ${addedItem.name} (${addedItem.email}) - ${addedItem.status}`);
        setStudentEmailInput('');
        setStudentNameInput('');
        await openStudentModal(selectedClass);
        loadClasses();
      } else if (res.data.errors && res.data.errors.length > 0) {
        setEnrollError(res.data.errors.join(', '));
      }
    } catch (err) {
      setEnrollError(err.response?.data?.detail || 'Failed to process student add.');
    } finally {
      setAddingStudent(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !selectedClass) return;
    setFileUploading(true);
    setEnrollMsg(null);
    setEnrollError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await client.post(`/classes/${selectedClass.id}/students/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      const addedCount = res.data.added ? res.data.added.length : 0;
      const errorCount = res.data.errors ? res.data.errors.length : 0;
      
      let msg = `Roster Upload Complete: ${addedCount} entry/entries processed.`;
      if (errorCount > 0) {
        setEnrollError(`Errors: ${res.data.errors.join(' | ')}`);
      }
      setEnrollMsg(msg);
      openStudentModal(selectedClass);
      loadClasses();
    } catch (err) {
      setEnrollError(err.response?.data?.detail || 'Failed to upload roster file.');
    } finally {
      setFileUploading(false);
      e.target.value = '';
    }
  };

  const handleRemoveStudent = async (studentId) => {
    if (!selectedClass) return;
    const confirmMsg = studentId < 0 ? "Cancel pending invitation?" : "Remove this student from class?";
    if (!window.confirm(confirmMsg)) return;
    try {
      await client.delete(`/classes/${selectedClass.id}/students/${studentId}`);
      openStudentModal(selectedClass);
      loadClasses();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to remove student.");
    }
  };

  // Co-teacher Sharing Handlers
  const openShareModal = async (cls) => {
    setShareClassObj(cls);
    setShareMsg(null);
    setShareError(null);
    setCoTeacherEmailInput('');
    try {
      const res = await client.get(`/classes/${cls.id}/co-teachers`);
      setCoTeachers(res.data);
    } catch (err) {
      console.warn("Failed to load co-teachers", err);
    }
  };

  const handleAddCoTeacher = async (e) => {
    e.preventDefault();
    if (!coTeacherEmailInput.trim() || !shareClassObj) return;
    setShareMsg(null);
    setShareError(null);
    try {
      const res = await client.post(`/classes/${shareClassObj.id}/co-teachers`, {
        email: coTeacherEmailInput.trim()
      });
      setShareMsg(res.data.detail);
      setCoTeacherEmailInput('');
      const updated = await client.get(`/classes/${shareClassObj.id}/co-teachers`);
      setCoTeachers(updated.data);
    } catch (err) {
      setShareError(err.response?.data?.detail || 'Failed to share class.');
    }
  };

  const handleRemoveCoTeacher = async (coTeacherId) => {
    if (!shareClassObj) return;
    if (!window.confirm("Remove this co-teacher's access to the class?")) return;
    try {
      await client.delete(`/classes/${shareClassObj.id}/co-teachers/${coTeacherId}`);
      const updated = await client.get(`/classes/${shareClassObj.id}/co-teachers`);
      setCoTeachers(updated.data);
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to remove co-teacher.");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900 font-display">My Classes & Co-Teaching</h2>
          <p className="text-xs text-slate-500">Create, share, and manage classes for scoped exam delivery</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition shadow-sm"
        >
          + Create Class
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 rounded-full border-4 border-brand-200 border-t-brand-600 animate-spin" />
        </div>
      ) : classes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-card">
          <h3 className="font-semibold text-slate-700 mb-1">No classes created yet</h3>
          <p className="text-sm text-slate-400 mb-4">Create your first class to enroll students and restrict exam visibility.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary text-xs py-2 px-4"
          >
            Create Class Now
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {classes.map(c => (
            <div key={c.id} className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 flex flex-col justify-between hover:shadow-card-hover transition relative">
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-slate-900 font-display text-lg leading-snug">{c.name}</h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200">
                    {c.student_count} Students
                  </span>
                </div>
                <p className="text-xs text-slate-400">Created: {new Date(c.created_at).toLocaleDateString()}</p>
              </div>

              <div className="space-y-2 pt-5 mt-4 border-t border-slate-100">
                <div className="flex gap-2">
                  <button
                    onClick={() => openStudentModal(c)}
                    className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition border border-slate-200"
                  >
                    👥 Roster ({c.student_count})
                  </button>
                  <button
                    onClick={() => navigate(`/teacher/class/${c.id}/analytics`)}
                    className="flex-1 py-2 rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-700 text-xs font-bold transition border border-brand-200"
                  >
                    📊 Analytics
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => openShareModal(c)}
                    className="flex-1 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-750 text-xs font-bold transition border border-emerald-200"
                  >
                    🤝 Share Class
                  </button>
                  <button
                    onClick={() => handleDeleteClass(c.id, c.name)}
                    className="py-1.5 px-3 rounded-lg bg-red-50 hover:bg-red-100 text-red-650 text-xs font-bold transition border border-red-200"
                  >
                    🗑 Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Class Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 animate-scale-up">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 font-display text-base">Create New Class</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>
            {createError && (
              <p className="text-xs font-semibold text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-200">{createError}</p>
            )}
            <form onSubmit={handleCreateClass} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Class Name</label>
                <input
                  type="text"
                  required
                  value={newClassName}
                  onChange={e => setNewClassName(e.target.value)}
                  placeholder="e.g. CS101 - Intro to Computer Science"
                  className="input"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="btn-primary text-xs py-2 px-4"
                >
                  {createLoading ? 'Creating...' : 'Create Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Share Class Modal */}
      {shareClassObj && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 animate-scale-up">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 font-display text-base">Share Class Access</h3>
                <p className="text-xs text-slate-500">{shareClassObj.name}</p>
              </div>
              <button onClick={() => setShareClassObj(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            {shareMsg && <p className="text-xs font-bold text-emerald-700 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">{shareMsg}</p>}
            {shareError && <p className="text-xs font-semibold text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-200">{shareError}</p>}

            <form onSubmit={handleAddCoTeacher} className="space-y-3">
              <label className="block text-xs font-bold text-slate-700">Add Co-Teacher by Email</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  required
                  value={coTeacherEmailInput}
                  onChange={e => setCoTeacherEmailInput(e.target.value)}
                  placeholder="teacher@example.com"
                  className="input text-xs py-2"
                />
                <button type="submit" className="btn-primary text-xs py-2 px-3 whitespace-nowrap">
                  + Add Teacher
                </button>
              </div>
            </form>

            <div className="space-y-2 pt-2 border-t border-slate-100">
              <p className="text-xs font-bold text-slate-700 uppercase">Assigned Co-Teachers</p>
              {coTeachers.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No co-teachers currently assigned.</p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-auto">
                  {coTeachers.map(ct => (
                    <div key={ct.id} className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs">
                      <div>
                        <p className="font-bold text-slate-900">{ct.name}</p>
                        <p className="text-[10px] text-slate-500">{ct.email}</p>
                      </div>
                      <button
                        onClick={() => handleRemoveCoTeacher(ct.teacher_id)}
                        className="px-2 py-1 bg-red-50 text-red-600 font-bold rounded-md hover:bg-red-100 transition"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Student Roster Modal */}
      {selectedClass && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full p-6 space-y-6 animate-scale-up max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 font-display text-lg">{selectedClass.name} — Student Roster</h3>
                <p className="text-xs text-slate-500">Unregistered emails will receive invitations and auto-enroll upon biometric setup.</p>
              </div>
              <button onClick={() => setSelectedClass(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            {/* Notification messages */}
            {enrollMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800">
                ✓ {enrollMsg}
              </div>
            )}
            {enrollError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700">
                ⚠ {enrollError}
              </div>
            )}

            {/* Add student forms */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              {/* Single add */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Add Student (Name & Email)</label>
                <form onSubmit={handleSingleEnroll} className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={studentNameInput}
                      onChange={e => setStudentNameInput(e.target.value)}
                      placeholder="Student Name (optional)"
                      className="input text-xs py-1.5 flex-1"
                    />
                    <input
                      type="email"
                      required
                      value={studentEmailInput}
                      onChange={e => setStudentEmailInput(e.target.value)}
                      placeholder="student@example.com"
                      className="input text-xs py-1.5 flex-1"
                    />
                  </div>
                  <button type="submit" disabled={addingStudent} className="w-full btn-primary text-xs py-1.5 px-3 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
                    {addingStudent ? 'Adding…' : '+ Add Student / Send Invitation'}
                  </button>
                </form>
              </div>

              {/* Bulk CSV / Excel upload */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Bulk CSV / Excel Import</label>
                <div className="flex flex-col justify-between h-[calc(100%-24px)] gap-2">
                  <p className="text-[11px] text-slate-500">
                    Upload file containing <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-700 font-mono">email</code> and optional <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-700 font-mono">student_name</code> columns.
                  </p>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="roster-upload-input"
                    disabled={fileUploading}
                  />
                  <label
                    htmlFor="roster-upload-input"
                    className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold text-center cursor-pointer transition shadow-sm"
                  >
                    {fileUploading ? 'Uploading Roster…' : '📁 Upload Roster File (.xlsx / .csv)'}
                  </label>
                </div>
              </div>
            </div>

            {/* Student table */}
            <div className="flex-1 overflow-auto border border-slate-200 rounded-xl">
              {studentsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 rounded-full border-2 border-brand-200 border-t-brand-600 animate-spin" />
                </div>
              ) : students.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs font-medium">
                  No active students or pending invitations in this class.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-650 uppercase font-semibold">
                    <tr>
                      <th className="px-4 py-3 text-left">Student Name</th>
                      <th className="px-4 py-3 text-left">Email Address</th>
                      <th className="px-4 py-3 text-left">Enrollment Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {students.map(std => {
                      const isPending = std.status === "pending_registration";
                      return (
                        <tr key={std.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-bold text-slate-900">
                            {isPending ? (
                              <span className="font-bold text-slate-800">{std.student_name}</span>
                            ) : (
                              <button
                                onClick={() => setInspectStudentId(std.student_id)}
                                className="text-brand-600 hover:underline font-bold text-left"
                              >
                                {std.student_name}
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">{std.student_email}</td>
                          <td className="px-4 py-3">
                            {isPending ? (
                              <span className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs">
                                ⏳ Pending Registration
                              </span>
                            ) : (
                              <span className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                ✓ Active Student
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleRemoveStudent(isPending ? std.id : std.student_id)}
                              className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-650 font-bold border border-red-200 transition"
                            >
                              {isPending ? 'Cancel' : 'Remove'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Inspection Modal */}
      {inspectStudentId && (
        <StudentProfileModal
          studentId={inspectStudentId}
          onClose={() => setInspectStudentId(null)}
        />
      )}
    </div>
  );
}
