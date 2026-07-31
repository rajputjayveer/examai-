import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAudioVAD } from '../../hooks/useAudioVAD';

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
      faceapi.nets.faceLandmark68Net.loadFromUri(FACE_API_MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_MODEL_URL)
    ]);
    faceApiReady = true;
    console.log('[SecureExam] face-api.js tinyFaceDetector + faceLandmark68Net + faceRecognitionNet loaded ✓');
  } catch (e) {
    console.warn('[SecureExam] face-api.js failed to load — face detection disabled:', e.message);
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
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Proctoring state
  const [faceCount, setFaceCount] = useState(1);    // 1 = normal
  const [violationMsg, setViolationMsg] = useState('');
  const [violationFlash, setViolationFlash] = useState(false);
  const [totalViolations, setTotalViolations] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const faceIntervalRef = useRef(null);
  const identityIntervalRef = useRef(null);
  const timerRef = useRef(null);
  const isSubmittingRef = useRef(false); // prevents fullscreen_exit flag on intentional submit

  // VAD: expose the live stream to the hook via state so it re-runs on mount
  const [vadStream, setVadStream] = useState(null);

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
      const ms = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240 },
        audio: true
      });
      setPermissionDenied(false);
      streamRef.current = ms;
      if (videoRef.current) videoRef.current.srcObject = ms;

      // Load face-api.js models then start detection loop
      await loadFaceApi();
      if (faceApiReady) {
        faceIntervalRef.current = setInterval(detectFaces, 3000); // every 3s
      }

      // Send identity-check snapshot every 30s
      identityIntervalRef.current = setInterval(sendIdentityCheck, 30000);

      // ── Expose stream for Silero VAD hook ─────────────────────────────────
      // setVadStream triggers the useAudioVAD hook to start real-time detection
      setVadStream(ms);
    } catch {
      setPermissionDenied(true);
      triggerViolation('camera_denied', 'Camera/Microphone access denied during exam');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(t => t.stop());
      } catch (e) {
        console.warn('Failed to stop streamRef tracks:', e);
      }
      streamRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      try {
        const srcStream = videoRef.current.srcObject;
        if (srcStream && typeof srcStream.getTracks === 'function') {
          srcStream.getTracks().forEach(t => t.stop());
        }
      } catch (e) {
        console.warn('Failed to stop srcObject tracks:', e);
      }
      videoRef.current.srcObject = null;
    }
    clearInterval(faceIntervalRef.current);
    clearInterval(identityIntervalRef.current);
    clearTimeout(timerRef.current);
    setVadStream(null);
  };

  // ── Real face detection via face-api.js ─────────────────────────────────────
  const detectFaces = async () => {
    const video = videoRef.current;
    if (!video || !window.faceapi || !faceApiReady) return;

    try {
      const detections = await window.faceapi.detectAllFaces(
        video,
        new window.faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 })
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

  const sendIdentityCheck = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    try {
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, 320, 240);
      const snapshot = canvas.toDataURL('image/jpeg', 0.7);

      const res = await client.post('/proctoring/identity-check', {
        attempt_id: parseInt(attemptId),
        snapshot: snapshot
      });
      if (res.data?.verified === false) {
        triggerViolation('identity_mismatch', '⚠ Identity check failed — face does not match enrollment');
      }
    } catch (e) {
      console.warn('Identity check failed to reach server', e);
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

      if (type !== 'speech_detected') {
        const res = await client.post('/proctoring/violation', {
          attempt_id: parseInt(attemptId),
          type: type,
          snapshot: snapshot
        });

        if (res.data?.auto_submitted) {
          setViolationMsg('⚠ Maximum violations reached — your exam has been auto-submitted.');
          stopCamera();
          if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          }
          setTimeout(() => {
            window.location.href = `/student/result/${attemptId}`;
          }, 2000);
        }
      }
    } catch { /* silent */ }
  }, [attemptId, navigate]);

  // ── Silero VAD — Real-time speech detection (browser-side ONNX) ─────────────
  const { vadStatus, vadProb, audioRms, isRecording } = useAudioVAD({
    stream: vadStream,
    onSpeechDetected: useCallback(async (audioBlob) => {
      // 1. Instantly show violation warning to student
      triggerViolation('speech_detected', '🔇 Speech detected — please remain silent during the exam.');

      // 2. Upload audio evidence clip to server via standard /proctoring/violation call
      try {
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            await client.post('/proctoring/violation', {
              attempt_id: parseInt(attemptId),
              type: 'speech_detected',
              audio_data: reader.result,   // base64 data URL of the .webm clip
            });
          } catch { /* silent — violation UI already shown */ }
        };
        reader.readAsDataURL(audioBlob);
      } catch { /* silent */ }
    }, [attemptId, triggerViolation]),
  });

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
      // Ignore fullscreen exit when student intentionally submits the exam
      if (!document.fullscreenElement && !isSubmittingRef.current) {
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
    isSubmittingRef.current = true;   // must be BEFORE exitFullscreen to avoid false violation
    setSubmitting(true);
    stopCamera();
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    try {
      await client.post(`/attempts/${attemptId}/submit`);
      window.location.href = `/student/result/${attemptId}`;
    } catch {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  };

  const confirmSubmit = () => {
    // Enforce all questions answered before manual submit
    const unanswered = questions.length - answeredCount;
    if (unanswered > 0) {
      setViolationMsg(`⚠ Please answer all questions before submitting. ${unanswered} question${unanswered > 1 ? 's' : ''} remaining.`);
      setViolationFlash(true);
      setTimeout(() => { setViolationFlash(false); setViolationMsg(''); }, 4000);
      return;
    }
    setShowConfirmModal(true);
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

  if (permissionDenied) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl text-center space-y-5 border border-slate-200">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900 font-display">Camera &amp; Microphone Required</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            This proctored exam strictly requires active camera and microphone permissions. You cannot start or view the exam until access is granted.
          </p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-left text-xs text-slate-500 space-y-1">
          <p className="font-semibold text-slate-700">How to enable access:</p>
          <p>1. Click the lock 🔒 icon in your browser URL address bar.</p>
          <p>2. Set <strong>Camera</strong> and <strong>Microphone</strong> to <strong>Allow</strong>.</p>
          <p>3. Click the button below to retry.</p>
        </div>
        <button
          onClick={startCamera}
          className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition shadow-md"
        >
          Grant Permissions &amp; Retry
        </button>
      </div>
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
            <span className="font-bold text-slate-900 text-sm font-display hidden sm:block">SecureExam AI</span>
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

            {/* VAD (Voice) status indicator */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${
              vadStatus === 'active'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : vadStatus === 'error'
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700 animate-pulse'
            }`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
              {vadStatus === 'active' ? 'Mic OK' : vadStatus === 'error' ? 'Mic Err' : 'Mic…'}
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

      {/* ── Fixed top-right violation toast (non-obstructive UI) ── */}
      {violationMsg && (
        <div className="fixed top-20 right-4 z-50 max-w-sm bg-red-600 text-white shadow-lg rounded-xl py-3 px-4 text-xs font-bold flex items-center gap-2 border border-red-500 animate-slide-up">
          <svg className="w-4 h-4 text-white flex-shrink-0 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{violationMsg}</span>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 animate-scale-up space-y-4">
            <div className="flex items-center justify-center w-12 h-12 bg-amber-50 rounded-full border border-amber-200 mx-auto text-amber-500">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-950 font-display">Submit Exam?</h3>
              <p className="text-xs text-slate-500">Are you sure you want to submit your exam answers? This action is permanent and cannot be undone.</p>
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-250 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  handleSubmit();
                }}
                className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition shadow-sm"
              >
                Yes, Submit
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Main Workspace ── */}
        <div className="flex flex-col gap-5">
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
                {currentQ === questions.length - 1 ? (
                  <button
                    onClick={confirmSubmit}
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold transition shadow-sm disabled:opacity-50"
                  >
                    {submitting ? 'Submitting…' : 'Submit Exam ✓'}
                  </button>
                ) : (
                  <button
                    onClick={() => setCurrentQ(q => Math.min(questions.length - 1, q + 1))}
                    className="btn-primary"
                  >
                    Next →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Bottom Grid Info: Navigator + Proctoring status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Question Navigator */}
            <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-card p-5">
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
                          ? 'border-emerald-400 bg-emerald-55 text-emerald-700'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-brand-300'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-400" />Answered</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-brand-600" />Current</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded border-2 border-slate-350 bg-white" />Skipped</span>
              </div>
            </div>

            {/* Proctoring Status Summary */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">AI Proctoring Guards</h3>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Biometric Integrity</span>
                    <span className="font-bold text-emerald-600">Active</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Browser Focus Guard</span>
                    <span className="font-bold text-emerald-600">Active</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Noise &amp; Voice Guard</span>
                    <span className="font-bold text-emerald-600">Active</span>
                  </div>
                  {vadStatus === 'active' && (
                    <div className="pt-1.5 border-t border-slate-100 text-[10px] space-y-1">
                      <div className="flex justify-between text-slate-500 font-medium">
                        <span>Mic Input Level:</span>
                        <span className="font-mono font-bold text-slate-700">{(audioRms * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between text-slate-500 font-medium">
                        <span>AI Voice Confidence:</span>
                        <span className={`font-mono font-bold ${vadProb >= 0.50 ? 'text-amber-600 animate-pulse' : 'text-slate-700'}`}>
                          {(vadProb * 100).toFixed(0)}%
                        </span>
                      </div>
                      {isRecording && (
                        <div className="text-red-600 font-bold animate-pulse text-right text-[9px] pt-0.5">
                          🔴 Capturing spoken speech...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-650 font-semibold">Total Warnings:</span>
                <span className={`font-bold ${totalViolations > 0 ? 'text-red-650 animate-pulse' : 'text-slate-700'}`}>
                  {totalViolations} / 5 allowed
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Live Floating Webcam Corner Thumbnail ── */}
      <div className="fixed bottom-4 right-4 z-40 bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border-2 border-slate-700 w-44 sm:w-48 aspect-video">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        {faceCount !== 1 && (
          <div className="absolute inset-0 border-4 border-red-500 pointer-events-none animate-pulse" />
        )}
        <div className={`absolute bottom-2 left-2 px-2 py-0.5 rounded-lg text-[9px] font-bold ${
          faceCount === 1 ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white animate-pulse'
        }`}>
          {faceCount === 0 ? '⚠ No Face' : faceCount === 1 ? '✓ Face OK' : `⚠ ${faceCount} Faces`}
        </div>
      </div>

      <canvas ref={canvasRef} width="320" height="240" className="hidden" />
    </div>
  );
}
