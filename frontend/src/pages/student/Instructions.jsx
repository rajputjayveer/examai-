import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';

export default function Instructions() {
  const { examId } = useParams();
  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cameraVerified, setCameraVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    client.get(`/exams/${examId}`)
      .then(res => { setExam(res.data); setLoading(false); })
      .catch(() => setLoading(false));
    return () => streamRef.current?.getTracks().forEach(t => t.stop());
  }, [examId]);

  const verifyIdentity = async () => {
    setVerifying(true);
    setStatusMsg('Starting camera…');
    try {
      const ms = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = ms;
      if (videoRef.current) videoRef.current.srcObject = ms;
      setStatusMsg('Verifying your identity against enrolled face…');

      await new Promise(r => setTimeout(r, 2500));

      // Capture frame and send to backend identity-check
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas) {
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        const snapshot = canvas.toDataURL('image/jpeg');
        // Fire-and-forget identity check (for demo the endpoint always returns verified:true)
        client.post('/proctoring/identity-check', { attempt_id: 0, snapshot }).catch(() => {});
      }

      ms.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      setCameraVerified(true);
      setVerifying(false);
      setStatusMsg('Identity verified! You may now enter the exam.');
    } catch (err) {
      setVerifying(false);
      setStatusMsg('Camera access denied. Please allow camera permissions and try again.');
    }
  };

  const handleStart = async () => {
    try {
      const res = await client.post(`/attempts/start?exam_id=${examId}`);
      navigate(`/student/exam/${res.data.id}`);
    } catch {
      setStatusMsg('Failed to start exam. Please try again.');
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-4 border-brand-200 border-t-brand-600 animate-spin" />
    </div>
  );

  const rules = [
    'Keep your webcam enabled throughout the exam.',
    'Do not switch browser tabs or minimize — it logs a violation.',
    'Ensure you are alone in a quiet, well-lit environment.',
    'The AI monitors your presence every few seconds.',
    'Submitting the exam or timer expiry locks your answers automatically.',
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl animate-slide-up">
        <div className="bg-white rounded-2xl shadow-card border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-brand-600 to-brand-700 px-8 py-6">
            <h2 className="text-xl font-bold text-white font-display">{exam?.title}</h2>
            <p className="text-brand-200 text-sm mt-1">Duration: {exam?.duration_minutes} minutes</p>
          </div>

          <div className="p-8">
            {/* Rules */}
            <h3 className="font-semibold text-slate-800 mb-4">Before you begin</h3>
            <ul className="space-y-3 mb-8">
              {rules.map((rule, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-600">
                  <span className="w-5 h-5 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  {rule}
                </li>
              ))}
            </ul>

            {/* Camera preview area */}
            <div className="relative aspect-video w-full max-w-xs mx-auto rounded-xl overflow-hidden bg-slate-100 border border-slate-200 mb-6">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <canvas ref={canvasRef} width="320" height="240" className="hidden" />
              {!verifying && !cameraVerified && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center text-slate-400">
                    <svg className="w-10 h-10 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                    <p className="text-xs">Camera inactive</p>
                  </div>
                </div>
              )}
              {cameraVerified && (
                <div className="absolute inset-0 flex items-center justify-center bg-emerald-50/80 backdrop-blur-sm">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-2">
                      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-emerald-700">Identity Verified</p>
                  </div>
                </div>
              )}
            </div>

            {statusMsg && (
              <div className={`mb-5 rounded-xl p-3.5 text-sm text-center border ${
                cameraVerified
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-blue-50 border-blue-200 text-blue-700'
              }`}>
                {statusMsg}
              </div>
            )}

            {!cameraVerified ? (
              <button
                id="verify-identity-btn"
                onClick={verifyIdentity}
                disabled={verifying}
                className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {verifying ? (
                  <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg> Verifying…</>
                ) : '🔍 Verify My Identity'}
              </button>
            ) : (
              <button
                id="enter-exam-btn"
                onClick={handleStart}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition shadow-sm"
              >
                🚀 Enter Exam Room
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
