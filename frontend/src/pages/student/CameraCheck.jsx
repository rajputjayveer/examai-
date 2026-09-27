import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function CameraCheck() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const [faceOk, setFaceOk] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [error, setError] = useState('');

  const stopAllMedia = () => {
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(t => t.stop());
      } catch (e) {
        console.warn('Error stopping tracks:', e);
      }
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch (e) {}
      audioCtxRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    let rafId;
    let faceapiReady = false;

    const setup = async () => {
      try {
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, 
            audio: true 
          });
        } catch (e1) {
          stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } 
          });
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', '');
          videoRef.current.muted = true;
          await videoRef.current.play().catch(() => {});
        }

        // ── Mic level meter (if audio track exists) ─────────────────────────
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
          try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            audioCtxRef.current = audioCtx;
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
          } catch (audioErr) {
            console.warn('Audio meter init error:', audioErr);
          }
        }

        // ── Face detection via face-api.js ─────────────────────────────────
        try {
          if (!window.faceapi) {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
            document.body.appendChild(script);
            await new Promise(resolve => { script.onload = resolve; script.onerror = resolve; });
          }
          if (window.faceapi?.nets?.tinyFaceDetector) {
            await window.faceapi.nets.tinyFaceDetector.loadFromUri(
              'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model'
            );
            faceapiReady = true;
          }
        } catch (mErr) {
          console.warn('Face-api load warning:', mErr);
        }

        const detectLoop = async () => {
          if (videoRef.current && videoRef.current.readyState >= 2) {
            if (faceapiReady && window.faceapi) {
              try {
                const detection = await window.faceapi.detectSingleFace(
                  videoRef.current, new window.faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 })
                );
                setFaceOk(!!detection);
              } catch {
                setFaceOk(true);
              }
            } else {
              setFaceOk(videoRef.current.videoWidth > 0);
            }
          }
          setTimeout(detectLoop, 600);
        };
        detectLoop();
      } catch (err) {
        console.error('Camera/Mic setup error:', err);
        const errDetail = err.name === 'NotReadableError' || err.name === 'TrackStartError'
          ? 'Your camera is currently in use by another application or browser tab. Please close any other app using the camera and reload.'
          : 'Could not access camera/microphone. Please allow permissions in browser settings and reload.';
        setError(errDetail);
      }
    };

    setup();
    return () => {
      stopAllMedia();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  const handleContinue = () => {
    stopAllMedia();
    navigate(`/student/instructions/${examId}`);
  };

  const handleBackToDashboard = () => {
    stopAllMedia();
    navigate('/');
  };

  const canContinue = faceOk;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-8 max-w-lg w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900 font-display">Test your camera &amp; mic</h1>
            <p className="text-sm text-slate-500 mt-0.5">Fix lighting or permissions before starting.</p>
          </div>
          <button
            onClick={handleBackToDashboard}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition"
          >
            ✕ Exit to Dashboard
          </button>
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
              className="w-full rounded-xl bg-slate-900 mb-4 aspect-video object-cover"
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
          onClick={handleContinue}
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
