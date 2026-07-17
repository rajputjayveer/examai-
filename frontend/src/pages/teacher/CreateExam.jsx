import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';

export default function CreateExam() {
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(60);
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  
  const [questions, setQuestions] = useState([]);
  const [qText, setQText] = useState('');
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const [optC, setOptC] = useState('');
  const [optD, setOptD] = useState('');
  const [correctOpt, setCorrectOpt] = useState('A');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  
  const navigate = useNavigate();

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
    setQuestions([...questions, newQ]);
    
    setQText('');
    setOptA('');
    setOptB('');
    setOptC('');
    setOptD('');
    setCorrectOpt('A');
    setError('');
  };

  const handleCreateExam = async (e) => {
    e.preventDefault();
    if (questions.length === 0) {
      setError('Please add at least one question to the exam.');
      return;
    }

    try {
      const examRes = await client.post('/exams', {
        title,
        duration_minutes: parseInt(duration),
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString()
      });
      await client.post(`/exams/${examRes.data.id}/questions`, questions);
      navigate('/teacher/exams');
    } catch {
      setError('Failed to create exam. Please check input values.');
    }
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError('');
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await client.post('/exams/upload-pdf', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setQuestions(res.data.questions);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to parse PDF questions using Gemini.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-card p-6 sm:p-8">
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-xl font-bold text-slate-900 font-display">Create Proctored Exam</h1>
            <p className="text-xs text-slate-500">Configure exam settings and input questions</p>
          </div>
          <button onClick={() => navigate('/teacher/exams')} className="btn-secondary py-2 text-xs">
            Back
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-750 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleCreateExam} className="space-y-6">
          {/* Exam Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Exam Title</label>
              <input type="text" required value={title} onChange={e => setTitle(e.target.value)} className="input" placeholder="Midterm Exam" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Duration (minutes)</label>
              <input type="number" required value={duration} onChange={e => setDuration(e.target.value)} className="input" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Start Time</label>
              <input type="datetime-local" required value={startAt} onChange={e => setStartAt(e.target.value)} className="input" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">End Time</label>
              <input type="datetime-local" required value={endAt} onChange={e => setEndAt(e.target.value)} className="input" />
            </div>
          </div>

          {/* AI PDF Upload */}
          <div className="bg-brand-50 border border-brand-200 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-brand-800 mb-2">✨ AI-Powered Question Paper Import</h3>
            <p className="text-xs text-brand-650 mb-4">Upload a PDF containing multiple-choice questions. Gemini AI will automatically extract and parse them into the exam.</p>
            <input type="file" accept=".pdf" onChange={handlePdfUpload} className="hidden" id="pdf-upload-input" disabled={uploading} />
            <label htmlFor="pdf-upload-input" className="inline-block btn-primary text-xs cursor-pointer">
              {uploading ? 'Processing PDF with Gemini...' : 'Upload PDF Exam Paper'}
            </label>
          </div>

          {/* Questions List */}
          <div className="space-y-3">
            <h3 className="text-base font-bold text-slate-900 font-display">Questions Added ({questions.length})</h3>
            {questions.map((q, idx) => (
              <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm relative">
                <span className="absolute top-4 right-4 text-xs font-bold text-brand-600">Correct: {q.correct_option}</span>
                <p className="font-semibold text-slate-800 mb-2">{idx + 1}. {q.text}</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-650">
                  <p>A: {q.option_a}</p>
                  <p>B: {q.option_b}</p>
                  <p>C: {q.option_c}</p>
                  <p>D: {q.option_d}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Add Question Form */}
          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-base font-bold text-slate-900 mb-4 font-display">Add Custom Question</h3>
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
                <button type="button" onClick={addQuestion} className="btn-secondary py-2 text-xs font-bold">+ Add to Exam</button>
              </div>
            </div>
          </div>

          <button type="submit" className="w-full btn-primary py-3">Create Exam & Save Questions</button>
        </form>
      </div>
    </div>
  );
}
