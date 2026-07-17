import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const FACE_API_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
let faceApiLoaded = false;

export default function FaceEnroll() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [qualityHint, setQualityHint] = useState('Camera off');
  const [descriptor, setDescriptor] = useState(null);
  
  const { refreshProfile } = useAuth();
  const navigate = useNavigate();

  // Load faceapi recognition models on mount
  useEffect(() => {
    async function loadModels() {
      if (faceApiLoaded) {
        setModelsReady(true);
        return;
      }
      try {
        const faceapi = window.faceapi;
        if (!faceapi) {
          setStatusMsg('Face-api library not loaded. Refreshing page may help.');
          return;
        }
        setStatusMsg('Loading AI Face Recognition models...');
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(FACE_API_MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_MODEL_URL)
        ]);
        faceApiLoaded = true;
        setModelsReady(true);
        setStatusMsg('');
        // Auto trigger camera start once models are ready
        setTimeout(() => {
          startCamera();
        }, 100);
      } catch (err) {
        setStatusMsg('Failed to load recognition models. Please check network/CDN.');
      }
    }
    loadModels();
    return () => {
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const startCamera = async () => {
    try {
      setStatusMsg('');
      let ms;
      try {
        ms = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } });
      } catch (err) {
        console.warn("Retrying with fallback video constraints:", err);
        ms = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      if (videoRef.current) videoRef.current.srcObject = ms;
      setStream(ms);
      setQualityHint('Detecting face...');
    } catch {
      setStatusMsg('Could not access camera. Please check permissions or verify no other app is using it.');
    }
  };

  // Run continuous quality checking for face centering
  useEffect(() => {
    if (!stream || !modelsReady) return;
    
    let intervalId = setInterval(async () => {
      const video = videoRef.current;
      const faceapi = window.faceapi;
      if (!video || !faceapi) return;

      try {
        const detection = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!detection) {
          setQualityHint('❌ No face detected - Center your face in the oval');
          setDescriptor(null);
        } else {
          // Check alignment limits
          const nose = detection.landmarks.getNose()[6];
          const width = video.videoWidth || 640;
          const noseXPercent = nose.x / width;

          if (noseXPercent < 0.35 || noseXPercent > 0.65) {
            setQualityHint('⚠️ Align face - Position yourself in the center');
            setDescriptor(null);
          } else {
            setQualityHint('✓ Position OK - Keep still and click capture');
            setDescriptor(Array.from(detection.descriptor));
          }
        }
      } catch (err) {
        // Silent error while checking quality
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [stream, modelsReady]);

  const handleEnroll = async () => {
    if (!descriptor) {
      setStatusMsg('Please wait until face quality check passes (green text).');
      return;
    }

    setLoading(true);
    setStatusMsg('Enrolling face reference...');
    try {
      await client.post('/students/enroll-face', {
        descriptor: descriptor
      });
      setStatusMsg('Face reference enrolled successfully! Redirecting...');
      stream?.getTracks().forEach(t => t.stop());
      await refreshProfile();
      setTimeout(() => navigate('/'), 1200);
    } catch (err) {
      setStatusMsg(err.response?.data?.detail || 'Upload failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-8">
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
                <span className={`text-xs font-medium ${i === 2 ? 'text-brand-700' : 'text-slate-405'}`}>{s}</span>
              </div>
              {i < 2 && <div className="flex-1 h-px bg-slate-200" />}
            </React.Fragment>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-card border border-slate-200 p-8">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-slate-900 font-display">Biometric Face Enrollment</h2>
            <p className="text-xs text-slate-500 mt-1">Enroll your primary face reference to enable automated exam verification</p>
          </div>

          {/* Camera frame */}
          <div className="relative aspect-video w-full rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden mb-4">
            {stream ? (
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform -scale-x-100" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                <p className="text-xs">Camera is inactive</p>
              </div>
            )}
            {/* Oval face guide overlay */}
            {stream && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-40 h-48 rounded-full border-2 border-brand-500 border-dashed opacity-75" />
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />

          {/* Quality Indicator */}
          {stream && (
            <div className={`mb-4 text-xs font-bold text-center p-2 rounded-xl border ${
              descriptor 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {qualityHint}
            </div>
          )}

          {statusMsg && (
            <div className="mb-4 rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700 text-center font-medium">
              {statusMsg}
            </div>
          )}

          <div className="space-y-3">
            {!stream ? (
              <button onClick={startCamera} disabled={!modelsReady} className="w-full btn-primary py-3 disabled:opacity-50">
                Start Enrollment Camera
              </button>
            ) : (
              <button
                onClick={handleEnroll}
                disabled={loading || !descriptor}
                className="w-full btn-primary py-3 disabled:opacity-50"
              >
                {loading ? 'Saving biometric data...' : 'Register Biometrics & Finish ✓'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
