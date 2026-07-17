import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';

export default function ExamRoom() {
  const { attemptId } = useParams();
  const [attempt, setAttempt] = useState(null);
  const [exam, setExam] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [violations, setViolations] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const navigate = useNavigate();

  // Load exam and attempt data
  useEffect(() => {
    client.get(`/reports/${attemptId}`)
      .then(res => {
        setAttempt(res.data.attempt);
        // Fetch exam
        return client.get(`/exams/${res.data.attempt.exam_id}`);
      })
      .then(res => {
        setExam(res.data);
        setQuestions(res.data.questions);
        setTimeLeft(res.data.duration_minutes * 60);
      })
      .catch(err => {
        console.error(err);
      });
  }, [attemptId]);

  // Timer logic
  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  // Webcam setup & client-side proctoring initialization
  useEffect(() => {
    const initWebcam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Camera access failed in exam room:", err);
      }
    };
    initWebcam();

    // Tab-switch visibility checker
    const handleVisibilityChange = () => {
      if (document.hidden) {
        logViolation("tab_switch");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const logViolation = async (type) => {
    setViolations(prev => prev + 1);
    
    // Capture canvas frame
    let snapshot = "";
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas) {
      const context = canvas.getContext('2d');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      snapshot = canvas.toDataURL('image/jpeg');
    }

    try {
      await client.post('/proctoring/violation', {
        attempt_id: parseInt(attemptId),
        type: type,
        snapshot: snapshot
      });
    } catch (err) {
      console.error("Failed to submit violation to server:", err);
    }
  };

  const selectOption = async (questionId, option) => {
    setSelectedAnswers(prev => ({ ...prev, [questionId]: option }));
    try {
      await client.post(`/attempts/${attemptId}/answer`, {
        question_id: questionId,
        selected_option: option
      });
    } catch (err) {
      console.error("Failed to auto-save answer:", err);
    }
  };

  const handleSubmit = async () => {
    try {
      await client.post(`/attempts/${attemptId}/submit`);
      navigate(`/student/result/${attemptId}`);
    } catch (err) {
      console.error(err);
      setStatusMsg("Failed to submit exam attempt.");
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!exam || questions.length === 0) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">Loading Exam Room...</div>;
  }

  const currentQ = questions[currentIdx];

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col md:flex-row p-6 gap-6">
      {/* Left Column: Exam questions */}
      <div className="flex-1 glass-panel rounded-2xl p-8 border border-slate-800 flex flex-col justify-between">
        <div>
          <header className="flex justify-between items-center mb-6 pb-4 border-b border-slate-800">
            <div>
              <h2 className="text-xl font-bold">{exam.title}</h2>
              <p className="text-slate-400 text-sm">Question {currentIdx + 1} of {questions.length}</p>
            </div>
            <div className="px-4 py-2 bg-slate-900 rounded-lg text-brand-500 font-mono font-bold">
              {formatTime(timeLeft)}
            </div>
          </header>

          <div className="mb-8">
            <h3 className="text-lg text-slate-200 mb-6 font-medium">{currentQ.text}</h3>
            <div className="space-y-4">
              {['A', 'B', 'C', 'D'].map(opt => {
                const optText = currentQ[`option_${opt.toLowerCase()}`];
                const isSelected = selectedAnswers[currentQ.id] === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => selectOption(currentQ.id, opt)}
                    className={`w-full text-left px-5 py-4 rounded-xl border transition flex items-center gap-3 ${
                      isSelected
                        ? 'bg-brand-500/10 border-brand-500 text-white'
                        : 'border-slate-800 bg-slate-900/30 hover:bg-slate-900/50 text-slate-400'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold ${
                      isSelected ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-700 text-slate-500'
                    }`}>
                      {opt}
                    </span>
                    {optText}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <footer className="flex justify-between items-center mt-8 pt-4 border-t border-slate-800">
          <button
            onClick={() => setCurrentIdx(prev => Math.max(0, prev - 1))}
            disabled={currentIdx === 0}
            className="px-5 py-2.5 rounded-lg border border-slate-800 hover:bg-slate-900 text-sm font-semibold disabled:opacity-50"
          >
            Previous
          </button>
          
          {currentIdx < questions.length - 1 ? (
            <button
              onClick={() => setCurrentIdx(prev => prev + 1)}
              className="px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-sm font-semibold text-white"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="px-6 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-sm font-bold text-white transition"
            >
              Submit Exam
            </button>
          )}
        </footer>
      </div>

      {/* Right Column: Video Monitor / Navigation Widget */}
      <div className="w-full md:w-80 flex flex-col gap-6">
        {/* Proctoring camera feed preview */}
        <div className="glass-panel border border-slate-800 rounded-2xl p-6 text-center">
          <h4 className="text-sm font-bold text-slate-400 mb-3 flex items-center justify-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
            Proctoring Active
          </h4>
          <div className="aspect-video w-full rounded-lg bg-slate-900 overflow-hidden mb-4 border border-slate-850">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform -scale-x-100" />
            <canvas ref={canvasRef} width="320" height="240" className="hidden" />
          </div>
          <div className="flex justify-around text-xs text-slate-400">
            <div>
              <p className="font-bold text-red-500">{violations}</p>
              <p>Violations</p>
            </div>
            <div>
              <p className="font-bold text-brand-500">1</p>
              <p>Faces detected</p>
            </div>
          </div>
        </div>

        {/* Questions Navigator */}
        <div className="glass-panel border border-slate-800 rounded-2xl p-6">
          <h4 className="text-sm font-bold text-slate-300 mb-4">Question Navigator</h4>
          <div className="grid grid-cols-5 gap-2">
            {questions.map((q, idx) => {
              const isAnswered = selectedAnswers[q.id] !== undefined;
              const isCurrent = idx === currentIdx;
              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentIdx(idx)}
                  className={`w-10 h-10 rounded-lg text-sm font-medium flex items-center justify-center border transition ${
                    isCurrent
                      ? 'border-brand-500 bg-brand-500/20 text-brand-400 font-bold'
                      : isAnswered
                      ? 'border-slate-800 bg-slate-900 text-slate-200'
                      : 'border-slate-850 bg-transparent text-slate-500 hover:border-slate-800'
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
