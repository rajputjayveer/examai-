import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';

export default function AnswerKey() {
  const { examId } = useParams();
  const [questions, setQuestions] = useState([]);
  const [keys, setKeys] = useState({}); // { questionId: 'A'|'B'|'C'|'D' }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    client.get(`/exams/${examId}/questions`)
      .then(res => {
        setQuestions(res.data);
        const initialKeys = {};
        res.data.forEach(q => {
          if (q.correct_option) initialKeys[q.id] = q.correct_option;
        });
        setKeys(initialKeys);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [examId]);

  const handleSelect = (qId, option) => {
    setKeys(prev => ({ ...prev, [qId]: option }));
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus('');
    const payload = Object.entries(keys).map(([qId, option]) => ({
      question_id: parseInt(qId),
      correct_option: option
    }));

    try {
      await client.post(`/exams/${examId}/answer-key`, payload);
      setStatus('Answer key updated and auto-evaluation completed!');
      setTimeout(() => navigate('/teacher/exams'), 1500);
    } catch {
      setStatus('Failed to upload answer key.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-4 border-brand-200 border-t-brand-600 animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-card p-6 sm:p-8">
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-xl font-bold text-slate-900 font-display">Configure Answer Key</h1>
            <p className="text-xs text-slate-500">Provide correct answers to trigger automatic marking</p>
          </div>
          <button onClick={() => navigate('/teacher/exams')} className="btn-secondary py-2 text-xs">
            Back
          </button>
        </div>

        {status && (
          <div className="mb-6 rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-755 font-semibold text-center">
            {status}
          </div>
        )}

        <div className="space-y-5">
          {questions.map((q, idx) => (
            <div key={q.id} className="p-5 border border-slate-200 rounded-xl bg-slate-50">
              <p className="font-semibold text-slate-800 text-sm mb-3">{idx + 1}. {q.text}</p>
              <div className="flex flex-wrap gap-2">
                {['A', 'B', 'C', 'D'].map(opt => {
                  const label = q[`option_${opt.toLowerCase()}`];
                  const active = keys[q.id] === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => handleSelect(q.id, opt)}
                      className={`flex-1 min-w-[120px] px-4 py-2.5 rounded-lg border text-left text-xs font-semibold transition ${
                        active
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="font-bold mr-1.5">{opt}:</span> {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 pt-5 border-t border-slate-200">
          <button
            onClick={handleSave}
            disabled={saving || Object.keys(keys).length < questions.length}
            className="w-full btn-primary py-3 disabled:opacity-50"
          >
            {saving ? 'Saving and evaluating exam papers...' : 'Save Answer Key & Run Auto-Evaluation'}
          </button>
        </div>
      </div>
    </div>
  );
}
