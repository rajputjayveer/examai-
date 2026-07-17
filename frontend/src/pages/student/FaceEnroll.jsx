import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const STEPS = [
  { title: 'Face Straight', hint: 'Look directly at the camera' },
  { title: 'Turn Slightly Left', hint: 'Turn your head a little to the left' },
  { title: 'Turn Slightly Right', hint: 'Turn your head a little to the right' },
];

export default function FaceEnroll() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [step, setStep] = useState(0); // which photo we're capturing
  const [captured, setCaptured] = useState([]); // base64 snapshots
  const [statusMsg, setStatusMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const { refreshProfile } = useAuth();
  const navigate = useNavigate();

  const startCamera = async () => {
    try {
      setStatusMsg('');
      const ms = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } });
      videoRef.current.srcObject = ms;
      setStream(ms);
    } catch {
      setStatusMsg('Could not access camera. Please allow camera permissions and try again.');
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const next = [...captured, dataUrl];
    setCaptured(next);

    if (next.length < STEPS.length) {
      setStep(next.length);
      setStatusMsg(`Photo ${next.length} captured! Now: ${STEPS[next.length].hint}`);
    } else {
      // All photos captured — stop camera
      stream?.getTracks().forEach(t => t.stop());
      setStream(null);
      setStatusMsg('All 3 photos captured! Click "Save & Continue" to complete enrollment.');
    }
  };

  const uploadPhotos = async () => {
    if (captured.length === 0) return;
    setLoading(true);
    setStatusMsg('Uploading face data…');
    try {
      // Upload the first photo as reference (backend saves it)
      const res = await fetch(captured[0]);
      const blob = await res.blob();
      const formData = new FormData();
      formData.append('file', blob, 'enrollment.jpg');
      await client.post('/students/enroll-face', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setStatusMsg('Face enrolled successfully! Redirecting…');
      await refreshProfile();
      setTimeout(() => navigate('/'), 1500);
    } catch {
      setStatusMsg('Upload failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const retake = () => {
    setCaptured([]);
    setStep(0);
    setStatusMsg('');
    startCamera();
  };

  const allCaptured = captured.length >= STEPS.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-slate-100 flex items-center justify-center px-4 py-8">
      {/* Blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-brand-200 opacity-20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg animate-slide-up">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6 px-2">
          {['Account Details', 'Verify Email', 'Face Enroll'].map((s, i) => (
            <React.Fragment key={s}>
              <div className="flex items-center gap-1.5">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  i < 2 ? 'bg-brand-200 text-brand-700' : 'bg-brand-600 text-white'
                }`}>
                  {i < 2 ? '✓' : i + 1}
                </div>
                <span className={`text-xs font-medium ${i === 2 ? 'text-brand-700' : 'text-slate-400'}`}>{s}</span>
              </div>
              {i < 2 && <div className="flex-1 h-px bg-slate-200" />}
            </React.Fragment>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-card border border-slate-200 p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-brand-50 rounded-2xl mb-3">
              <svg className="w-6 h-6 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 font-display">Face Enrollment</h2>
            <p className="text-sm text-slate-500 mt-1">We'll capture 3 photos for identity verification during exams</p>
          </div>

          {/* Photo progress */}
          <div className="flex gap-3 mb-5 justify-center">
            {STEPS.map((s, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div className={`w-16 h-16 rounded-xl border-2 overflow-hidden flex items-center justify-center ${
                  captured[i] ? 'border-emerald-400 bg-emerald-50' : i === step && stream ? 'border-brand-400 bg-brand-50 animate-pulse' : 'border-slate-200 bg-slate-50'
                }`}>
                  {captured[i] ? (
                    <img src={captured[i]} alt={`Photo ${i+1}`} className="w-full h-full object-cover" />
                  ) : (
                    <svg className={`w-6 h-6 ${i === step && stream ? 'text-brand-400' : 'text-slate-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                  )}
                </div>
                <span className="text-xs text-slate-500">{s.title}</span>
              </div>
            ))}
          </div>

          {/* Camera view */}
          <div className="relative aspect-video w-full rounded-xl bg-slate-100 border border-slate-200 overflow-hidden mb-5">
            {!allCaptured ? (
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-emerald-700">All photos captured!</p>
                </div>
              </div>
            )}
            {/* Oval face guide overlay */}
            {stream && !allCaptured && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-36 h-44 rounded-full border-2 border-brand-400 border-dashed opacity-60" />
              </div>
            )}
          </div>
          <canvas ref={canvasRef} width="640" height="480" className="hidden" />

          {statusMsg && (
            <div className="mb-4 rounded-xl bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700 text-center">
              {statusMsg}
            </div>
          )}

          {/* Current step instruction */}
          {stream && !allCaptured && (
            <div className="mb-4 text-center text-sm text-slate-600">
              <span className="font-semibold text-brand-700">Step {step + 1}/3:</span> {STEPS[step].hint}
            </div>
          )}

          <div className="space-y-3">
            {!stream && !allCaptured && (
              <button onClick={startCamera} className="w-full btn-primary py-3">
                Start Camera
              </button>
            )}
            {stream && !allCaptured && (
              <button onClick={capturePhoto} className="w-full btn-primary py-3">
                📸 Capture Photo {step + 1} of {STEPS.length}
              </button>
            )}
            {allCaptured && (
              <div className="flex gap-3">
                <button onClick={retake} className="flex-1 btn-secondary py-3">
                  Retake
                </button>
                <button onClick={uploadPhotos} disabled={loading} className="flex-1 btn-primary py-3 disabled:opacity-60">
                  {loading ? 'Saving…' : 'Save & Continue'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
