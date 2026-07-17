import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';

// ─── Face Detection via face-api.js (loaded from CDN in index.html) ──────────
const FACE_API_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
let faceApiReady = false;
let faceApiLoading = false;

async function loadFaceApi() {
  if (faceApiReady || faceApiLoading) return;
  faceApiLoading = true;
  try {
    const faceapi = window.faceapi;
    if (!faceapi) return;
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(FACE_API_MODEL_URL)
    ]);
    faceApiReady = true;
    console.log('[ExamGuard] face-api.js tinyFaceDetector + faceLandmark68Net loaded ✓');
  } catch (e) {
    console.warn('[ExamGuard] face-api.js failed to load — face detection disabled:', e.message);
  }
}

export default function ExamRoom() {
  const { attemptId } = useParams();
  const navigate = useNavigate();

  // Exam data
  const [attempt, setAttempt] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});       // { questionId: 'A'|'B'|'C'|'D' }
  const [currentQ, setCurrentQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Proctoring state
  const [faceCount, setFaceCount] = useState(1);    // 1 = normal
  const [violationMsg, setViolationMsg] = useState('');
  const [violationFlash, setViolationFlash] = useState(false);
  const [totalViolations, setTotalViolations] = useState(0);

  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const faceIntervalRef = useRef(null);
  const identityIntervalRef = useRef(null);
  const timerRef = useRef(null);

  // ── Load exam data ──────────────────────────────────────────────────────────
  useEffect(() => {
    client.get(`/attempts/${attemptId}/questions`)
      .then(res => {
        const { attempt: att, questions: qs } = res.data;
        setAttempt(att);
        setQuestions(qs);
        // Calculate remaining time (seconds)
        const endAt = new Date(att.end_at).getTime();
        setTimeLeft(Math.max(0, Math.floor((endAt - Date.now()) / 1000)));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [attemptId]);

  // ── Countdown timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (timeLeft === null) return;
    if (timeLeft <= 0) { handleSubmit(); return; }
    timerRef.current = setTimeout(() => setTimeLeft(t => Math.max(0, t - 1)), 1000);
    return () => clearTimeout(timerRef.current);
  }, [timeLeft]);

  // ── Start webcam + face detection ───────────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    startCamera();
    return stopCamera;
  }, [loading]);

  const startCamera = async () => {
    try {
      const ms = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
      streamRef.current = ms;
      if (videoRef.current) videoRef.current.srcObject = ms;

      // Load face-api.js models then start detection loop
      await loadFaceApi();
      if (faceApiReady) {
        faceIntervalRef.current = setInterval(detectFaces, 3000); // every 3s
      }

      // Send identity-check snapshot every 30s
      identityIntervalRef.current = setInterval(sendIdentityCheck, 30000);
    } catch {
      logViolation('camera_denied', 'Camera access denied during exam');
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    clearInterval(faceIntervalRef.current);
    clearInterval(identityIntervalRef.current);
    clearTimeout(timerRef.current);
  };

  // ── Real face detection via face-api.js ─────────────────────────────────────
  const detectFaces = async () => {
    const video = videoRef.current;
    if (!video || !window.faceapi || !faceApiReady) return;

    try {
      const detections = await window.faceapi.detectAllFaces(
        video,
        new window.faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
      ).withFaceLandmarks();

      const count = detections.length;
      setFaceCount(count);

      if (count === 0) {
        triggerViolation('no_face', '⚠ No face detected — please stay visible');
      } else if (count > 1) {
        triggerViolation('multiple_faces', `⚠ ${count} faces detected — only you should be present`);
      } else {
        // Gaze/Head turning detection using landmark offsets (yaw approximation)
        const landmarks = detections[0].landmarks;
        const leftEye = landmarks.getLeftEye()[0];
        const rightEye = landmarks.getRightEye()[3];
        const nose = landmarks.getNose()[6]; // tip of nose

        if (leftEye && rightEye && nose) {
          const distToLeft = nose.x - leftEye.x;
          const distToRight = rightEye.x - nose.x;
          const ratio = distToLeft / (distToRight || 1);

          // If ratio is off-balance, candidate has turned their head away from center
          if (ratio < 0.4 || ratio > 2.5) {
            triggerViolation('look_away', '⚠ Warning: Looking away from the screen detected.');
          }
        }
      }
    } catch (e) {
      // Fallback tiny detector only in case landmarks fails
      try {
        const simpleDetect = await window.faceapi.detectAllFaces(
          video,
          new window.faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
        );
        setFaceCount(simpleDetect.length);
      } catch {}
    }
  };

  // ── Send periodic identity-check snapshot to backend ────────────────────────
  const sendIdentityCheck = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, 320, 240);
    const snapshot = canvas.toDataURL('image/jpeg', 0.7);

    try {
      const res = await client.post('/proctoring/identity-check', {
        attempt_id: parseInt(attemptId),
        snapshot,
      });
      if (res.data?.match === false) {
        triggerViolation('identity_mismatch', '⚠ Face does not match enrolled identity');
      }
    } catch {
      // Non-critical; proceed silently
    }
  };

  // ── Log violation to backend ─────────────────────────────────────────────────
  const triggerViolation = useCallback(async (type, msg) => {
    setViolationMsg(msg);
    setViolationFlash(true);
    setTotalViolations(v => v + 1);
    setTimeout(() => setViolationFlash(false), 2500);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      let snapshot = "";
      if (video && canvas) {
        canvas.getContext('2d').drawImage(video, 0, 0, 320, 240);
        snapshot = canvas.toDataURL('image/jpeg', 0.6);
      }

      await client.post('/proctoring/violation', {
        attempt_id: parseInt(attemptId),
        type: type,
        snapshot: snapshot
      });
    } catch { /* silent */ }
  }, [attemptId]);

  // ── Tab-switch, Copy-Paste, and Fullscreen Guards ───────────────────────────
  useEffect(() => {
    // Force fullscreen
    const requestFs = () => {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    };

    requestFs();

    const onVisibilityChange = () => {
      if (document.hidden) {
        triggerViolation('tab_switch', '⚠ Tab switched — stay on the exam page');
      }
    };

    const onBlur = () => {
      triggerViolation('window_blur', '⚠ Window lost focus — keep exam in foreground');
    };

    const onCopy = (e) => {
      e.preventDefault();
      triggerViolation('copy_paste', '⚠ Copying text is blocked during the exam!');
    };

    const onContextMenu = (e) => {
      e.preventDefault();
      triggerViolation('right_click', '⚠ Right-click options are disabled!');
    };

    const onKeyDown = (e) => {
      // Block Ctrl+C, Ctrl+V, Cmd+C, Cmd+V
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'v' || e.key === 'i' || e.key === 'u')) {
        e.preventDefault();
        triggerViolation('copy_paste', '⚠ Copy-paste combinations are disabled!');
      }
    };

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        triggerViolation('fullscreen_exit', '⚠ Fullscreen mode exited! Stay in fullscreen to avoid flag.');
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);
    document.addEventListener('copy', onCopy);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [triggerViolation]);

  // ── Answer handler ───────────────────────────────────────────────────────────
  const handleAnswer = async (questionId, selected) => {
    setAnswers(prev => ({ ...prev, [questionId]: selected }));
    try {
      await client.post(`/attempts/${attemptId}/answer`, {
        question_id: questionId,
        selected_option: selected,
      });
    } catch { /* silent — answer already stored client-side */ }
  };

  // ── Submit exam ──────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    stopCamera();
    try {
      await client.post(`/attempts/${attemptId}/submit`);
      navigate(`/student/result/${attemptId}`);
    } catch {
      setSubmitting(false);
    }
  };

  const confirmSubmit = () => {
    if (window.confirm('Are you sure you want to submit the exam? This cannot be undone.')) {
      handleSubmit();
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const answeredCount = Object.keys(answers).length;
  const progress = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0;
  const isLowTime = timeLeft !== null && timeLeft < 300; // < 5 min

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-4 border-brand-200 border-t-brand-600 animate-spin" />
    </div>
  );

  const q = questions[currentQ];

  return (
    <div className={`min-h-screen bg-slate-50 transition-all duration-300 ${violationFlash ? 'outline outline-4 outline-red-500' : ''}`}>

      {/* ── Top bar ─── */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          {/* Brand */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <span className="font-bold text-slate-900 text-sm font-display hidden sm:block">ExamGuard AI</span>
          </div>

          {/* Exam title */}
          <h1 className="flex-1 text-sm font-semibold text-slate-700 truncate">{attempt?.exam_title || 'Exam'}</h1>

          {/* Stats */}
          <div className="flex items-center gap-4">
            {/* Violation count */}
            {totalViolations > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 border border-red-200">
                <svg className="w-3.5 h-3.5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <span className="text-xs font-bold text-red-700">{totalViolations}</span>
              </div>
            )}

            {/* Face count indicator */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${
              faceCount === 1
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : faceCount === 0
                  ? 'bg-red-50 border-red-200 text-red-700 animate-pulse'
                  : 'bg-amber-50 border-amber-200 text-amber-700 animate-pulse'
            }`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
              {faceCount === 0 ? 'No face' : faceCount === 1 ? 'Face OK' : `${faceCount} faces!`}
            </div>

            {/* Timer */}
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-mono font-bold text-sm ${
              isLowTime
                ? 'bg-red-600 text-white animate-pulse'
                : 'bg-slate-100 text-slate-700 border border-slate-200'
            }`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {timeLeft !== null ? formatTime(timeLeft) : '--:--'}
            </div>

            {/* Submit */}
            <button
              id="submit-exam-btn"
              onClick={confirmSubmit}
              disabled={submitting}
              className="px-4 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit Exam'}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-slate-100">
          <div
            className="h-1 bg-brand-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      {/* ── Violation alert banner ── */}
      {violationMsg && (
        <div className="sticky top-16 z-10 bg-red-600 text-white text-center py-2 px-4 text-sm font-semibold animate-fade-in">
          {violationMsg}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* ── Left: Question panel ── */}
        <div className="lg:col-span-3 flex flex-col gap-5">
          {/* Question card */}
          {q && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 sm:p-8 animate-fade-in">
              {/* Q number + progress */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-brand-600 text-white text-sm font-bold flex items-center justify-center">
                    {currentQ + 1}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">of {questions.length}</span>
                </div>
                <span className="text-xs text-slate-500">{answeredCount}/{questions.length} answered</span>
              </div>

              {/* Question text */}
              <p className="text-slate-900 font-medium text-base leading-relaxed mb-6">
                {q.text}
              </p>

              {/* Options */}
              <div className="space-y-3">
                {['A', 'B', 'C', 'D'].map(opt => {
                  const text = q[`option_${opt.toLowerCase()}`];
                  if (!text) return null;
                  const selected = answers[q.id] === opt;
                  return (
                    <button
                      key={opt}
                      id={`option-${opt}`}
                      onClick={() => handleAnswer(q.id, opt)}
                      className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 text-left transition-all duration-150 ${
                        selected
                          ? 'border-brand-500 bg-brand-50 text-brand-800'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50/40'
                      }`}
                    >
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border-2 transition-all ${
                        selected ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-300 text-slate-500'
                      }`}>
                        {opt}
                      </span>
                      <span className="text-sm font-medium flex-1">{text}</span>
                      {selected && (
                        <svg className="w-4 h-4 text-brand-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between mt-8 pt-5 border-t border-slate-100">
                <button
                  onClick={() => setCurrentQ(q => Math.max(0, q - 1))}
                  disabled={currentQ === 0}
                  className="btn-secondary disabled:opacity-40"
                >
                  ← Previous
                </button>
                <button
                  onClick={() => setCurrentQ(q => Math.min(questions.length - 1, q + 1))}
                  disabled={currentQ === questions.length - 1}
                  className="btn-primary"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* Question navigator grid */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Question Navigator</h3>
            <div className="flex flex-wrap gap-2">
              {questions.map((qs, i) => (
                <button
                  key={qs.id}
                  onClick={() => setCurrentQ(i)}
                  className={`w-9 h-9 rounded-lg text-xs font-bold border-2 transition-all ${
                    i === currentQ
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : answers[qs.id]
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-brand-300'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-400" />Answered</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-brand-600" />Current</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border-2 border-slate-300 bg-white" />Skipped</span>
            </div>
          </div>
        </div>

        {/* ── Right: Proctoring panel ── */}
        <div className="flex flex-col gap-4">
          {/* Live webcam */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Live Camera</span>
              <span className={`w-2 h-2 rounded-full ${faceCount === 1 ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} />
            </div>
            <div className="relative bg-slate-900 aspect-video">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }} // mirror
              />
              {/* Overlay: violation border */}
              {faceCount !== 1 && (
                <div className="absolute inset-0 border-4 border-red-500 rounded pointer-events-none animate-pulse" />
              )}
              {/* Status pill */}
              <div className={`absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-xs font-bold ${
                faceCount === 1 ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
              }`}>
                {faceCount === 0 ? '⚠ No Face' : faceCount === 1 ? '✓ Verified' : `⚠ ${faceCount} Faces`}
              </div>
            </div>
          </div>
          <canvas ref={canvasRef} width="320" height="240" className="hidden" />

          {/* Proctoring status */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Proctoring Status</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Face Detection</span>
                <span className={`font-semibold ${faceApiReady ? 'text-emerald-600' : 'text-amber-500'}`}>
                  {faceApiReady ? '● Active' : '○ Loading'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Tab Guard</span>
                <span className="font-semibold text-emerald-600">● Active</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Identity Checks</span>
                <span className="font-semibold text-emerald-600">● Every 30s</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-slate-600 font-medium">Violations</span>
                <span className={`font-bold ${totalViolations > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {totalViolations}
                </span>
              </div>
            </div>
          </div>

          {/* Exam info */}
          <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4">
            <h3 className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">Exam Info</h3>
            <p className="text-xs text-brand-700">Questions: <span className="font-bold">{questions.length}</span></p>
            <p className="text-xs text-brand-700 mt-1">Answered: <span className="font-bold">{answeredCount}</span></p>
            <p className="text-xs text-brand-700 mt-1">Remaining: <span className="font-bold">{questions.length - answeredCount}</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}
