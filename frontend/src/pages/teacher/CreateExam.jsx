import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import client from '../../api/client';

export default function CreateExam() {
  const { examId } = useParams();
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(60);
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [classId, setClassId] = useState('');
  const [classList, setClassList] = useState([]);
  
  const [questions, setQuestions] = useState([]);
  const [qText, setQText] = useState('');
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const [optC, setOptC] = useState('');
  const [optD, setOptD] = useState('');
  const [correctOpt, setCorrectOpt] = useState('A');
  const [error, setError] = useState('');
  const [editingIdx, setEditingIdx] = useState(null);
  const [pdfUploading, setPdfUploading] = useState(false);
  const [sheetUploading, setSheetUploading] = useState(false);
  
  const navigate = useNavigate();

  useEffect(() => {
    client.get('/classes')
      .then(res => setClassList(res.data))
      .catch(() => {});

    if (!examId) return;
    const fetchExam = async () => {
      try {
        const [examRes, questionsRes] = await Promise.all([
          client.get(`/exams/${examId}`),
          client.get(`/exams/${examId}/questions`)
        ]);
        const exam = examRes.data;
        setTitle(exam.title);
        setDuration(exam.duration_minutes);
        setClassId(exam.class_id ? String(exam.class_id) : '');
        
        const formatLocal = (dtStr) => {
          if (!dtStr) return '';
          const d = new Date(dtStr);
          const pad = (n) => String(n).padStart(2, '0');
          return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };
        
        setStartAt(formatLocal(exam.start_at));
        setEndAt(formatLocal(exam.end_at));
        
        setQuestions(questionsRes.data.map(q => ({
          text: q.text,
          option_a: q.option_a,
          option_b: q.option_b,
          option_c: q.option_c,
          option_d: q.option_d,
          correct_option: q.correct_option
        })));
      } catch (err) {
        setError('Failed to load exam details for editing.');
      }
    };
    fetchExam();
  }, [examId]);

  const handleStartAtChange = (val) => {
    setStartAt(val);
    if (val && duration) {
      const startDate = new Date(val);
      if (!isNaN(startDate.getTime())) {
        const durationMins = parseInt(duration);
        if (!isNaN(durationMins)) {
          const endDate = new Date(startDate.getTime() + durationMins * 60 * 1000);
          const pad = (n) => String(n).padStart(2, '0');
          const localStr = `${endDate.getFullYear()}-${pad(endDate.getMonth()+1)}-${pad(endDate.getDate())}T${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
          setEndAt(localStr);
        }
      }
    }
  };

  const handleDurationChange = (val) => {
    setDuration(val);
    if (startAt && val) {
      const startDate = new Date(startAt);
      if (!isNaN(startDate.getTime())) {
        const durationMins = parseInt(val);
        if (!isNaN(durationMins)) {
          const endDate = new Date(startDate.getTime() + durationMins * 60 * 1000);
          const pad = (n) => String(n).padStart(2, '0');
          const localStr = `${endDate.getFullYear()}-${pad(endDate.getMonth()+1)}-${pad(endDate.getDate())}T${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
          setEndAt(localStr);
        }
      }
    }
  };

  const addQuestion = (e) => {
    e.preventDefault();
    if (!qText || !optA || !optB || !optC || !optD) {
      setError('Please fill in all question fields');
      return;
    }
    const newQ = {
      text: qText,
      option_a: optA,
      option_b: optB,
      option_c: optC,
      option_d: optD,
      correct_option: correctOpt
    };

    if (editingIdx !== null) {
      const updated = [...questions];
      updated[editingIdx] = newQ;
      setQuestions(updated);
      setEditingIdx(null);
    } else {
      setQuestions([...questions, newQ]);
    }
    
    setQText('');
    setOptA('');
    setOptB('');
    setOptC('');
    setOptD('');
    setCorrectOpt('A');
    setError('');
  };

  const deleteQuestion = (idx) => {
    setQuestions(questions.filter((_, i) => i !== idx));
    if (editingIdx === idx) {
      setEditingIdx(null);
      setQText('');
      setOptA('');
      setOptB('');
      setOptC('');
      setOptD('');
      setCorrectOpt('A');
    } else if (editingIdx !== null && editingIdx > idx) {
      setEditingIdx(editingIdx - 1);
    }
  };

  const startEdit = (idx) => {
    const q = questions[idx];
    setQText(q.text);
    setOptA(q.option_a);
    setOptB(q.option_b);
    setOptC(q.option_c);
    setOptD(q.option_d);
    setCorrectOpt(q.correct_option);
    setEditingIdx(idx);
  };

  const handleCreateExam = async (e) => {
    e.preventDefault();
    if (questions.length === 0) {
      setError('Please add at least one question to the exam.');
      return;
    }

    try {
      const payload = {
        title,
        duration_minutes: parseInt(duration),
        start_at: startAt,
        end_at: endAt,
        class_id: classId ? parseInt(classId) : null
      };

      let targetExamId = examId;
      if (examId) {
        await client.put(`/exams/${examId}`, payload);
      } else {
        const examRes = await client.post('/exams', payload);
        targetExamId = examRes.data.id;
      }
      
      await client.post(`/exams/${targetExamId}/questions`, questions);
      navigate('/teacher/exams');
    } catch (err) {
      setError('Failed to save exam. Please check input values.');
    }
  };

  const handleFileUpload = async (e, endpoint, setLoader) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoader(true);
    setError('');
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await client.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setQuestions(res.data.questions);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to parse questions from the uploaded file.');
    } finally {
      setLoader(false);
      e.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900 font-display">
              {examId ? 'Edit Proctored Exam' : 'Create Proctored Exam'}
            </h1>
            <p className="text-xs text-slate-500">Specify exam parameters, scheduling, and questions.</p>
          </div>
          <button onClick={() => navigate('/teacher/exams')} className="btn-secondary text-xs py-2">
            Back to Exams
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        {/* Form container */}
        <form onSubmit={handleCreateExam} className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 sm:p-8 space-y-8">
          
          {/* ── Parameters ── */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Exam Title</label>
              <input type="text" required value={title} onChange={e => setTitle(e.target.value)} placeholder="Final Theory Assessment" className="input" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Class Assignment</label>
              <select value={classId} onChange={e => setClassId(e.target.value)} className="input bg-white">
                <option value="">🌐 Global (Visible to All Enrolled Students)</option>
                {classList.map(c => (
                  <option key={c.id} value={c.id}>🏫 {c.name} ({c.student_count} enrolled)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Duration (Minutes)</label>
              <input type="number" required value={duration} onChange={e => handleDurationChange(e.target.value)} className="input" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Start Time</label>
              <input type="datetime-local" required value={startAt} onChange={e => handleStartAtChange(e.target.value)} className="input" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">End Time</label>
              <input type="datetime-local" required value={endAt} onChange={e => setEndAt(e.target.value)} className="input" />
            </div>
          </div>

          {/* Import options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* AI PDF Upload */}
            <div className="bg-brand-50 border border-brand-200 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-brand-800 mb-2">✨ AI-Powered PDF Import</h3>
              <p className="text-xs text-brand-650 mb-4">Upload a PDF — Gemini AI will extract and parse MCQs automatically.</p>
              <input type="file" accept=".pdf" onChange={e => handleFileUpload(e, '/exams/upload-pdf', setPdfUploading)} className="hidden" id="pdf-upload-input" disabled={pdfUploading || sheetUploading} />
              <label htmlFor="pdf-upload-input" className="inline-block btn-primary text-xs cursor-pointer">
                {pdfUploading ? 'Processing...' : 'Upload PDF'}
              </label>
            </div>

            {/* CSV / Excel Upload */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-emerald-800 mb-2">📊 Import from CSV / Excel</h3>
                <p className="text-xs text-emerald-750 mb-3 leading-relaxed">
                  Import multiple MCQs instantly using a spreadsheet. Headers must include: 
                  <span className="font-semibold block mt-1 text-emerald-905 bg-white border border-emerald-200 rounded px-2 py-1 text-[11px]">
                    Question, Option A, Option B, Option C, Option D, Correct Option
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2.5 mt-3">
                <input type="file" accept=".csv,.xlsx,.xls" onChange={e => handleFileUpload(e, '/exams/upload-sheet', setSheetUploading)} className="hidden" id="sheet-upload-input" disabled={pdfUploading || sheetUploading} />
                <label htmlFor="sheet-upload-input" className="inline-block px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer transition shadow-sm">
                  {sheetUploading ? 'Processing...' : 'Upload File'}
                </label>
                <a
                  href={`${client.defaults.baseURL}/exams/templates/questions`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2 rounded-xl border border-emerald-250 bg-white hover:bg-emerald-100/40 text-emerald-750 text-xs font-bold transition flex items-center gap-1 shadow-sm"
                >
                  📥 Download Template
                </a>
              </div>
            </div>
          </div>
          {/* Questions List */}
          <div className="space-y-3">
            <h3 className="text-base font-bold text-slate-900 font-display">Questions Added ({questions.length})</h3>
            {questions.map((q, idx) => (
              <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm relative flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-semibold text-slate-800 flex-1">{idx + 1}. {q.text}</p>
                    <span className="text-xs font-bold text-brand-600 bg-brand-50 border border-brand-100 rounded-md px-2 py-0.5 ml-2">Correct: {q.correct_option}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-650 mb-3">
                    <p>A: {q.option_a}</p>
                    <p>B: {q.option_b}</p>
                    <p>C: {q.option_c}</p>
                    <p>D: {q.option_d}</p>
                  </div>
                </div>
                <div className="flex gap-2.5 pt-2.5 border-t border-slate-200/50">
                  <button
                    type="button"
                    onClick={() => startEdit(idx)}
                    className="px-3 py-1 rounded-lg text-xs font-bold bg-white hover:bg-slate-100 border border-slate-250 text-slate-700 transition"
                  >
                    ✏ Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteQuestion(idx)}
                    className="px-3 py-1 rounded-lg text-xs font-bold bg-white hover:bg-red-50 border border-red-200 text-red-650 transition"
                  >
                    🗑 Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add Question Form */}
          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-base font-bold text-slate-900 mb-4 font-display">
              {editingIdx !== null ? `✏ Edit Question #${editingIdx + 1}` : 'Add Custom Question'}
            </h3>
            <div className="space-y-4">
              <input type="text" value={qText} onChange={e => setQText(e.target.value)} className="input" placeholder="Enter question text" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input type="text" value={optA} onChange={e => setOptA(e.target.value)} className="input" placeholder="Option A" />
                <input type="text" value={optB} onChange={e => setOptB(e.target.value)} className="input" placeholder="Option B" />
                <input type="text" value={optC} onChange={e => setOptC(e.target.value)} className="input" placeholder="Option C" />
                <input type="text" value={optD} onChange={e => setOptD(e.target.value)} className="input" placeholder="Option D" />
              </div>
              <div className="flex items-center gap-4">
                <label className="text-xs font-semibold text-slate-700">Correct Option:</label>
                <select value={correctOpt} onChange={e => setCorrectOpt(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">
                  {['A', 'B', 'C', 'D'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
                <button type="button" onClick={addQuestion} className="btn-secondary py-2 text-xs font-bold">
                  {editingIdx !== null ? '✓ Save Changes' : '+ Add to Exam'}
                </button>
                {editingIdx !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingIdx(null);
                      setQText('');
                      setOptA('');
                      setOptB('');
                      setOptC('');
                      setOptD('');
                      setCorrectOpt('A');
                    }}
                    className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>

          <button type="submit" className="w-full btn-primary py-3">
            {examId ? 'Save Changes' : 'Create Exam & Save Questions'}
          </button>
        </form>
      </div>
    </div>
  );
}
