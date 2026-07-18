import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function CameraCheck() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const [faceOk, setFaceOk] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let stream;
    let audioCtx;
    let rafId;
    let faceapiReady = false;

    const setup = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (videoRef.current) videoRef.current.srcObject = stream;

        // ── Mic level meter ────────────────────────────────────────────────
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const meterLoop = () => {
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length;
          setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
          rafId = requestAnimationFrame(meterLoop);
        };
        meterLoop();

        // ── Face detection via face-api.js ─────────────────────────────────
        if (!window.faceapi) {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
          document.body.appendChild(script);
          await new Promise(resolve => { script.onload = resolve; });
        }
        await window.faceapi.nets.tinyFaceDetector.loadFromUri(
          'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model'
        );
        faceapiReady = true;

        const detectLoop = async () => {
          if (faceapiReady && videoRef.current && videoRef.current.readyState === 4) {
            const detection = await window.faceapi.detectSingleFace(
              videoRef.current, new window.faceapi.TinyFaceDetectorOptions()
            );
            setFaceOk(!!detection);
          }
          setTimeout(detectLoop, 800);
        };
        detectLoop();
      } catch {
        setError('Could not access camera/microphone. Please allow permissions and reload.');
      }
    };

    setup();
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (audioCtx) audioCtx.close();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  const canContinue = faceOk;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-8 max-w-lg w-full">
        {/* Header */}
        <div className="mb-5">
          <h1 className="text-xl font-bold text-slate-900 font-display">Test your camera &amp; mic</h1>
          <p className="text-sm text-slate-500 mt-1">Fix any lighting or camera issues now — before your timer starts.</p>
        </div>

        {error ? (
          <div className="space-y-4 mb-5 animate-fade-in">
            <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 font-bold">
              {error}
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">How to allow permissions:</h3>
              <ol className="list-decimal list-inside text-xs text-slate-650 space-y-2 leading-relaxed">
                <li>Click the <strong>lock icon 🔒</strong> in your browser address bar (left of the URL).</li>
                <li>Find <strong>Microphone</strong> and <strong>Camera</strong> in the menu.</li>
                <li>Toggle both permissions to <strong>Allow</strong>.</li>
                <li>Click the reload button on your browser or refresh the page below.</li>
              </ol>
              <button
                onClick={() => window.location.reload()}
                className="mt-2.5 w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs transition shadow-sm"
              >
                🔄 Refresh &amp; Retry
              </button>
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full rounded-xl bg-slate-900 mb-4"
              style={{ transform: 'scaleX(-1)' }}
            />

            {/* Face detection status */}
            <div className="flex items-center gap-2 mb-4">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${faceOk ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} />
              <span className="text-sm font-medium text-slate-700">
                {faceOk ? 'Face detected clearly ✓' : 'No face detected — center yourself in frame'}
              </span>
            </div>

            {/* Mic level bar */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Microphone level</span>
                <span className="text-xs text-slate-400">{micLevel > 5 ? 'Picking up sound ✓' : 'Speak to test…'}</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-500 transition-all duration-100 rounded-full"
                  style={{ width: `${micLevel}%` }}
                />
              </div>
            </div>
          </>
        )}

        <button
          disabled={!canContinue}
          onClick={() => navigate(`/student/instructions/${examId}`)}
          className={`w-full py-2.5 rounded-xl font-semibold text-sm transition ${
            canContinue
              ? 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          {canContinue ? 'Continue to Instructions →' : 'Waiting for a clear face…'}
        </button>

        <p className="text-center text-xs text-slate-400 mt-3">
          Ensure you're in a well-lit area with your face fully visible before continuing.
        </p>
      </div>
    </div>
  );
}
