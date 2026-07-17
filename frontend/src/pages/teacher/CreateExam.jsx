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
    
    // Clear inputs
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
      // Create Exam
      const examRes = await client.post('/exams', {
        title,
        duration_minutes: parseInt(duration),
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString()
      });
      
      // Save Questions
      await client.post(`/exams/${examRes.data.id}/questions`, questions);
      
      navigate('/teacher/exams');
    } catch (err) {
      console.error(err);
      setError('Failed to create exam. Please check input values.');
    }
  };

  const [uploading, setUploading] = useState(false);

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
      console.error(err);
      setError(err.response?.data?.detail || 'Failed to parse PDF questions using Gemini.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-4xl mx-auto glass-panel border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <h2 className="text-2xl font-bold mb-2 text-white">Create New Exam</h2>
        
        {/* PDF Question Extractor Box */}
        <div className="mb-6 bg-slate-900/40 border border-slate-850 p-5 rounded-xl">
          <h3 className="text-sm font-semibold text-slate-350 mb-2">AI PDF Question & Answer Key Extractor</h3>
          <p className="text-xs text-slate-400 mb-4">
            Upload an exam question paper PDF. Gemini will automatically extract the MCQ questions, options, and build the correct answer key.
          </p>
          <div className="flex items-center gap-4">
            <input
              type="file"
              accept=".pdf"
              onChange={handlePdfUpload}
              disabled={uploading}
              className="block w-full text-xs text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-brand-500/10 file:text-brand-450 hover:file:bg-brand-500/20 disabled:opacity-50"
            />
            {uploading && <span className="text-xs text-brand-500 animate-pulse font-semibold">Gemini processing...</span>}
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-red-500/10 p-3 text-sm text-red-400 border border-red-500/20">
            {error}
          </div>
        )}

        <form onSubmit={handleCreateExam} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-300">Exam Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2.5 text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                placeholder="Midterm Exam"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300">Duration (Minutes)</label>
              <input
                type="number"
                required
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2.5 text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300">Start Time</label>
              <input
                type="datetime-local"
                required
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2.5 text-white focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300">End Time</label>
              <input
                type="datetime-local"
                required
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2.5 text-white focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Question Builder */}
          <div className="border-t border-slate-800 pt-6">
            <h3 className="text-lg font-semibold mb-4 text-slate-200">Add Questions</h3>
            <div className="space-y-4 bg-slate-900/30 p-4 rounded-xl border border-slate-850">
              <div>
                <label className="block text-xs font-semibold text-slate-400">Question Text</label>
                <textarea
                  value={qText}
                  onChange={(e) => setQText(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2.5 text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none h-20 resize-none"
                  placeholder="What is the capital of France?"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400">Option A</label>
                  <input
                    type="text"
                    value={optA}
                    onChange={(e) => setOptA(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2.5 text-white focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400">Option B</label>
                  <input
                    type="text"
                    value={optB}
                    onChange={(e) => setOptB(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2.5 text-white focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400">Option C</label>
                  <input
                    type="text"
                    value={optC}
                    onChange={(e) => setOptC(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2.5 text-white focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400">Option D</label>
                  <input
                    type="text"
                    value={optD}
                    onChange={(e) => setOptD(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2.5 text-white focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400">Correct Option</label>
                <select
                  value={correctOpt}
                  onChange={(e) => setCorrectOpt(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2.5 text-white focus:border-brand-500 focus:outline-none"
                >
                  <option value="A">Option A</option>
                  <option value="B">Option B</option>
                  <option value="C">Option C</option>
                  <option value="D">Option D</option>
                </select>
              </div>
              <button
                type="button"
                onClick={addQuestion}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-sm font-semibold rounded-lg border border-slate-700 text-slate-200 transition"
              >
                Add Question to Exam ({questions.length} added)
              </button>
            </div>
          </div>

          {/* List of current questions */}
          {questions.length > 0 && (
            <div className="space-y-2 mt-4">
              <h4 className="font-semibold text-sm text-slate-400">Questions added:</h4>
              <div className="max-h-40 overflow-y-auto space-y-2 pr-2">
                {questions.map((q, idx) => (
                  <div key={idx} className="bg-slate-900/20 border border-slate-850 p-3 rounded-lg text-sm flex justify-between">
                    <span>{idx + 1}. {q.text}</span>
                    <span className="text-green-500 font-bold">Ans: {q.correct_option}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="submit"
            className="w-full mt-6 py-3 bg-brand-500 hover:bg-brand-600 rounded-lg text-sm font-bold text-white transition"
          >
            Save Exam
          </button>
        </form>
      </div>
    </div>
  );
}
