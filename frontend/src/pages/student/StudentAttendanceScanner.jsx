import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';

// ── Device fingerprint ───────────────────────────────────────────────────────
function getDeviceFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('ExamGuardAI2026', 2, 15);
    ctx.fillStyle = 'rgba(102,204,0,0.7)';
    ctx.fillText('ExamGuardAI2026', 4, 17);
    const data = canvas.toDataURL();
    let hash = 0;
    const combined = `${data}|${screen.width}x${screen.height}|${navigator.userAgent}`;
    for (let i = 0; i < combined.length; i++) hash = ((hash << 5) - hash + combined.charCodeAt(i)) | 0;
    return 'dev_' + Math.abs(hash).toString(16) + '_' + screen.width;
  } catch { return 'dev_fallback_' + Math.random().toString(36).substring(2, 12); }
}

export default function StudentAttendanceScanner() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState('check');
  const [errorMsg, setErrorMsg] = useState(null);
  const [successData, setSuccessData] = useState(null);
  const [coords, setCoords] = useState(null);
  const [geoStatus, setGeoStatus] = useState('acquiring'); // acquiring | locked | unavailable

  // QR data (captured in scanning step)
  const [qrPayload, setQrPayload] = useState(null);

  // Face step
  const [faceCapturing, setFaceCapturing] = useState(false);
  const [faceSnapshot, setFaceSnapshot] = useState(null);     // base64 data URL
  const [faceStatus, setFaceStatus] = useState('idle');       // idle | capturing | captured | timeout

  // Camera state (QR scanner step)
  const [cameraError, setCameraError] = useState(null);

  const videoRef    = useRef(null);
  const faceVideoRef = useRef(null);
  const streamRef   = useRef(null);
  const faceStreamRef = useRef(null);
  const rafRef      = useRef(null);
  const scannedRef  = useRef(false);
  const faceTimerRef = useRef(null);
  const scanCanvasRef = useRef(null);
  const qrFileInputRef = useRef(null);
  const faceFileInputRef = useRef(null);

  // ── GPS ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) { setGeoStatus('unavailable'); return; }
    navigator.geolocation.getCurrentPosition(
      p => { setCoords({ lat: p.coords.latitude, lon: p.coords.longitude }); setGeoStatus('locked'); },
      ()  => setGeoStatus('unavailable'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }, []);

  // ── Open QR camera ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'scanning') return;
    scannedRef.current = false;
    setCameraError(null);

    const startCamera = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Browser live camera API not available on this connection. Please use "Take Photo of Projector" below or check Chrome flags.');
        return;
      }

      let stream = null;
      const constraintAttempts = [
        { video: { facingMode: { ideal: 'environment' } }, audio: false },
        { video: { facingMode: 'environment' }, audio: false },
        { video: true, audio: false }
      ];

      for (const constraints of constraintAttempts) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (stream) break;
        } catch (e) {
          console.warn('getUserMedia attempt failed with constraints:', constraints, e);
        }
      }

      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch (err) {
          console.error('All getUserMedia attempts failed:', err);
          const errDetail = err.name === 'NotAllowedError' 
            ? 'Permission denied. Please check Android Settings ➔ Apps ➔ Chrome ➔ Permissions ➔ Camera ➔ Allow.'
            : `${err.name || 'Error'}: ${err.message || 'Camera blocked'}`;
          setCameraError(errDetail);
          return;
        }
      }

      try {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', '');
          videoRef.current.muted = true;
          await videoRef.current.play();
          startUniversalQrScanning();
        }
      } catch (playErr) {
        console.error('Video play error:', playErr);
        setCameraError('Failed to play video stream: ' + playErr.message);
      }
    };

    startCamera();
    return () => { stopQrCamera(); if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [step]);

  const stopQrCamera = () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  };

  const startUniversalQrScanning = () => {
    if (!scanCanvasRef.current) {
      scanCanvasRef.current = document.createElement('canvas');
    }
    const canvas = scanCanvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const scan = () => {
      if (scannedRef.current || !videoRef.current) return;
      const v = videoRef.current;
      if (v.readyState === v.HAVE_ENOUGH_DATA) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth'
        });

        if (code && code.data) {
          scannedRef.current = true;
          stopQrCamera();
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
          onQrDecoded(code.data);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(scan);
    };
    rafRef.current = requestAnimationFrame(scan);
  };

  // ── Open Face camera ───────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'face') return;
    setFaceStatus('idle');
    setFaceSnapshot(null);

    const startFaceCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false
        });
        faceStreamRef.current = stream;
        if (faceVideoRef.current) {
          faceVideoRef.current.srcObject = stream;
          faceVideoRef.current.setAttribute('playsinline', '');
          await faceVideoRef.current.play();
        }
      } catch {
        setFaceStatus('skip');
      }
    };
    startFaceCamera();

    return () => stopFaceCamera();
  }, [step]);

  const stopFaceCamera = () => {
    if (faceStreamRef.current) { faceStreamRef.current.getTracks().forEach(t => t.stop()); faceStreamRef.current = null; }
    if (faceTimerRef.current) clearTimeout(faceTimerRef.current);
  };

  const captureface = () => {
    if (!faceVideoRef.current) return;
    setFaceCapturing(true);
    setFaceStatus('capturing');

    faceTimerRef.current = setTimeout(() => {
      const v = faceVideoRef.current;
      if (!v) { setFaceCapturing(false); setFaceStatus('idle'); return; }
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth || 320;
      canvas.height = v.videoHeight || 240;
      canvas.getContext('2d').drawImage(v, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      setFaceSnapshot(dataUrl);
      setFaceStatus('captured');
      setFaceCapturing(false);
      stopFaceCamera();
    }, 500);
  };

  // ── Face selfie upload fallback with downscaling ──────────────────────────
  const handleFacePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const img = new Image();
    const reader = new FileReader();
    reader.onload = (event) => {
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        const maxDim = 800;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
          else { w = Math.round((w * maxDim) / h); h = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setFaceSnapshot(dataUrl);
        setFaceStatus('captured');
        stopFaceCamera();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // ── QR decoded callback ─────────────────────────────────────────────────────
  const onQrDecoded = (text) => {
    try {
      const payload = JSON.parse(text);
      if (payload.type !== 'EXAMGUARD_ATTENDANCE' || !payload.session_id || !payload.token) {
        throw new Error('Invalid QR code. Please scan the ExamGuard projector screen.');
      }
      if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
      setQrPayload(payload);
      setStep('face');        // ← proceed to face capture
    } catch (err) {
      setErrorMsg(err.message || 'Invalid QR code scanned.');
      setStep('error');
    }
  };

  // ── Photo upload fallback for QR step (using jsQR + downscale) ─────────────
  const handleQrPhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    scannedRef.current = false;

    try {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (event) => {
        img.onload = () => {
          let w = img.width;
          let h = img.height;
          const maxDim = 1000;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
            else { w = Math.round((w * maxDim) / h); h = maxDim; }
          }

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'attemptBoth'
          });

          if (code && code.data) {
            scannedRef.current = true;
            stopQrCamera();
            onQrDecoded(code.data);
          } else {
            setErrorMsg('No QR code detected in the photo. Please make sure the projector QR is in focus and try again.');
            setStep('error');
          }
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setErrorMsg('Failed to process image: ' + err.message);
      setStep('error');
    }
  };

  // ── Final submit (after QR + Face) ─────────────────────────────────────────
  const handleSubmit = async () => {
    if (!qrPayload) return;
    setStep('submitting');
    setErrorMsg(null);

    // Jitter for 30-35 student load smoothing
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 1200) + 200));

    try {
      const deviceHash = getDeviceFingerprint();
      const res = await client.post('/attendance/check-in', {
        session_id: qrPayload.session_id,
        token: qrPayload.token,
        student_lat: coords?.lat ?? null,
        student_lon: coords?.lon ?? null,
        device_hash: deviceHash,
        snapshot: faceSnapshot || null
      });
      setSuccessData(res.data);
      setStep('success');
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || err.message || 'Attendance verification failed.');
      setStep('error');
    }
  };

  const handleRetry = () => {
    setErrorMsg(null);
    setCameraError(null);
    setQrPayload(null);
    setFaceSnapshot(null);
    setStep('scanning');
  };

  // ──────────────────────────────────────────────────────────────────────────
  //  SHARED HEADER
  // ──────────────────────────────────────────────────────────────────────────
  const Header = ({ title, showBack = true, backTo = 'check' }) => (
    <header className="bg-white border-b border-slate-200 shadow-sm px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
      {showBack && (
        <button
          onClick={() => { stopQrCamera(); stopFaceCamera(); setStep(backTo); }}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
      )}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>
        <span className="font-extrabold text-slate-900 font-display text-sm">{title}</span>
      </div>

      {/* Step indicator */}
      <div className="ml-auto flex items-center gap-1.5">
        {[['QR', 'scanning'], ['Face', 'face'], ['Done', 'success']].map(([label, s]) => (
          <span key={s}
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
              step === s ? 'bg-brand-600 text-white border-brand-600' :
              (step === 'submitting' && s === 'face') || (step === 'success' && s !== 'success') ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
              step === 'success' && s === 'success' ? 'bg-emerald-600 text-white border-emerald-600' :
              'bg-slate-100 text-slate-400 border-slate-200'
            }`}>
            {label}
          </span>
        ))}
      </div>
    </header>
  );

  // ──────────────────────────────────────────────────────────────────────────
  //  STEP: check (intro)
  // ──────────────────────────────────────────────────────────────────────────
  if (step === 'check') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header title="Mark Attendance" showBack={false} />
        <div className="flex-1 flex flex-col items-center justify-center p-5">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 w-full max-w-sm space-y-5">
            {/* GPS */}
            <div className={`flex items-center gap-3 p-3 rounded-xl border text-xs font-semibold ${
              geoStatus === 'locked' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
              geoStatus === 'acquiring' ? 'bg-amber-50 border-amber-200 text-amber-700' :
              'bg-slate-50 border-slate-200 text-slate-600'
            }`}>
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                geoStatus === 'locked' ? 'bg-emerald-500' :
                geoStatus === 'acquiring' ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'
              }`} />
              {geoStatus === 'locked' && 'GPS locked — classroom location ready'}
              {geoStatus === 'acquiring' && 'Acquiring GPS location…'}
              {geoStatus === 'unavailable' && 'GPS unavailable — may affect verification'}
            </div>

            {/* Icon + title */}
            <div className="text-center space-y-1.5 pt-2">
              <div className="w-16 h-16 bg-brand-50 rounded-2xl border border-brand-100 flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                </svg>
              </div>
              <h2 className="text-base font-bold text-slate-900 font-display">Scan Projector QR Code</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Step 1: Scan QR → Step 2: Take selfie → Attendance confirmed
              </p>
            </div>

            <button onClick={() => setStep('scanning')} className="btn-primary w-full py-3 text-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              </svg>
              Open QR Scanner
            </button>

            <div className="relative flex items-center">
              <div className="border-t border-slate-200 flex-1" />
              <span className="px-3 text-xs text-slate-400 font-medium">or</span>
              <div className="border-t border-slate-200 flex-1" />
            </div>

            <div className="relative w-full">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleQrPhotoUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              />
              <button
                type="button"
                className="btn-secondary w-full py-3 text-sm flex items-center justify-center gap-2 shadow-xs pointer-events-none"
              >
                📸 Take Photo of Screen
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  STEP: scanning (QR live camera)
  // ──────────────────────────────────────────────────────────────────────────
  if (step === 'scanning') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header title="Scan QR Code" backTo="check" />
        <div className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
          {cameraError ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 w-full max-w-sm text-center space-y-4">
              <div className="w-14 h-14 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center mx-auto text-2xl">
                📷
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm font-display">Camera Stream Blocked</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Browser restricted live video on local IP. Tap below to capture the projector QR code directly with your phone camera.
                </p>
              </div>

              <div className="relative w-full">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleQrPhotoUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                />
                <button
                  type="button"
                  className="btn-primary w-full py-3.5 text-sm flex items-center justify-center gap-2 shadow-sm pointer-events-none font-bold"
                >
                  📸 Take Photo of Projector
                </button>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-left text-[11px] text-slate-600 space-y-1.5">
                <p className="font-bold text-slate-800">💡 To unlock live video stream on Android:</p>
                <p>1. Open a new tab in Chrome: <code className="bg-slate-200 px-1 rounded text-[10px]">chrome://flags</code></p>
                <p>2. Search: <strong>unsafely-treat-insecure-origin-as-secure</strong></p>
                <p>3. Enter: <code className="bg-slate-200 px-1 rounded text-[10px]">http://10.139.190.3:3000</code> ➔ Set to <strong>Enabled</strong> ➔ Relaunch.</p>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-sm space-y-3">
              <div className="relative rounded-2xl overflow-hidden bg-black border-2 border-brand-600 shadow-lg"
                style={{ aspectRatio: '1/1' }}>
                <video ref={videoRef} muted playsInline autoPlay className="w-full h-full object-cover" />
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-4 left-4 w-8 h-8 border-t-4 border-l-4 border-brand-400 rounded-tl-lg" />
                  <div className="absolute top-4 right-4 w-8 h-8 border-t-4 border-r-4 border-brand-400 rounded-tr-lg" />
                  <div className="absolute bottom-4 left-4 w-8 h-8 border-b-4 border-l-4 border-brand-400 rounded-bl-lg" />
                  <div className="absolute bottom-4 right-4 w-8 h-8 border-b-4 border-r-4 border-brand-400 rounded-br-lg" />
                  <div className="absolute left-6 right-6 h-0.5 bg-brand-500 animate-pulse shadow-[0_0_8px_rgba(37,99,235,0.8)]"
                    style={{ top: '50%' }} />
                </div>
              </div>

              <p className="text-center text-xs text-slate-500 font-medium">
                Point camera at the projector QR code
              </p>

              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold ${
                geoStatus === 'locked' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}>
                <span className={`w-2 h-2 rounded-full ${geoStatus === 'locked' ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}`} />
                {geoStatus === 'locked' ? 'GPS Geofence Active' : 'GPS acquiring…'}
              </div>

              <div className="relative w-full">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleQrPhotoUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                />
                <button
                  type="button"
                  className="btn-secondary w-full py-2.5 text-xs flex items-center justify-center gap-2 pointer-events-none"
                >
                  📸 Take Photo of Screen Instead
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  STEP: face (selfie capture)
  // ──────────────────────────────────────────────────────────────────────────
  if (step === 'face') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header title="Face Verification" backTo="check" />

        <div className="flex-1 flex flex-col items-center justify-center p-5">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6 w-full max-w-sm space-y-5">
            {/* QR confirmed badge */}
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              QR code verified ✓ — Session #{qrPayload?.session_id}
            </div>

            <div className="text-center space-y-1">
              <div className="w-14 h-14 bg-brand-50 rounded-2xl border border-brand-100 flex items-center justify-center mx-auto">
                <span className="text-2xl">🤳</span>
              </div>
              <h2 className="text-sm font-bold text-slate-900 font-display">Take a Selfie</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Look straight at the camera. Your face will be matched against your enrolled profile photo.
              </p>
            </div>

            {/* Camera viewfinder or captured photo */}
            {faceStatus === 'captured' && faceSnapshot ? (
              <div className="space-y-3">
                <div className="rounded-2xl overflow-hidden border-2 border-emerald-500 shadow" style={{ aspectRatio: '4/3' }}>
                  <img src={faceSnapshot} alt="Captured selfie" className="w-full h-full object-cover" />
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Photo captured — ready to submit
                </div>
                <button onClick={() => { setFaceStatus('idle'); setFaceSnapshot(null); }}
                  className="btn-secondary w-full py-2.5 text-xs">
                  🔄 Retake Photo
                </button>
              </div>
            ) : faceStatus === 'skip' ? (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  Live camera stream unavailable. Please tap below to take a selfie using your phone's native camera.
                </div>
                <div className="relative w-full">
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    onChange={handleFacePhotoUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                  />
                  <button
                    type="button"
                    className="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2 shadow-xs pointer-events-none font-bold"
                  >
                    🤳 Open Phone Camera for Selfie
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative rounded-2xl overflow-hidden bg-black border-2 border-brand-200 shadow"
                  style={{ aspectRatio: '4/3' }}>
                  <video ref={faceVideoRef} muted playsInline autoPlay
                    className="w-full h-full object-cover scale-x-[-1]" />
                  {/* Oval guide overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-32 h-40 border-2 border-brand-400 border-dashed rounded-full opacity-60" />
                  </div>
                </div>
                <p className="text-xs text-center text-slate-400">Centre your face in the oval</p>
              </div>
            )}

            {/* Action buttons */}
            {faceStatus !== 'captured' && faceStatus !== 'skip' && (
              <div className="space-y-2">
                <button onClick={captureface} disabled={faceCapturing}
                  className="btn-primary w-full py-3 text-sm disabled:opacity-70 flex items-center justify-center gap-2 shadow-xs">
                  {faceCapturing ? (
                    <><span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> Capturing…</>
                  ) : '📸 Capture Selfie'}
                </button>

                <div className="relative w-full">
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    onChange={handleFacePhotoUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                  />
                  <button
                    type="button"
                    className="btn-secondary w-full py-2.5 text-xs flex items-center justify-center gap-2 pointer-events-none"
                  >
                    🤳 Take Selfie with Phone Camera
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!faceSnapshot && faceStatus !== 'skip'}
              className="btn-success w-full py-3 text-sm disabled:opacity-40 shadow-xs"
            >
              ✅ Submit Attendance
            </button>

            {(!faceSnapshot && faceStatus !== 'skip') && (
              <button onClick={() => { setFaceStatus('skip'); }}
                className="w-full text-xs text-slate-400 hover:text-slate-600 transition py-1 text-center">
                Skip face capture (attendance may be flagged)
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  STEP: submitting
  // ──────────────────────────────────────────────────────────────────────────
  if (step === 'submitting') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-8 text-center max-w-xs w-full space-y-4">
          <div className="w-14 h-14 rounded-full border-4 border-brand-600 border-t-transparent animate-spin mx-auto" />
          <div>
            <h3 className="font-bold text-slate-900 font-display text-sm">Verifying Attendance…</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Checking QR token · GPS · Device lock · Face match
            </p>
          </div>
          <p className="text-[10px] text-slate-400">This may take up to 15 seconds for face verification</p>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  STEP: error
  // ──────────────────────────────────────────────────────────────────────────
  if (step === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header title="Mark Attendance" showBack={false} />
        <div className="flex-1 flex flex-col items-center justify-center p-5">
          <div className="bg-white rounded-2xl border border-red-200 shadow-card p-6 w-full max-w-sm text-center space-y-4">
            <div className="w-14 h-14 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-center mx-auto">
              <span className="text-2xl">⚠️</span>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm font-display">Attendance Failed</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">{errorMsg}</p>
            </div>
            <button onClick={handleRetry} className="btn-primary w-full py-2.5 text-sm">Try Again</button>
            <button onClick={() => navigate('/student/dashboard')} className="btn-secondary w-full py-2.5 text-xs">
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  STEP: success
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header title="SecureExam AI" showBack={false} />
      <div className="flex-1 flex flex-col items-center justify-center p-5">
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-card p-6 w-full max-w-sm text-center space-y-5 animate-fade-in">
          <div className="w-20 h-20 bg-emerald-50 border-2 border-emerald-400 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-10 h-10 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900 font-display">Attendance Marked!</h2>
            <p className="text-xs text-emerald-600 font-semibold mt-0.5">QR · GPS · Device · Face — all verified</p>
          </div>

          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-left space-y-2.5">
            {[
              { label: 'Student', value: user?.name },
              { label: 'Status', value: 'PRESENT', green: true },
              { label: 'Distance', value: successData?.distance_meters != null ? `${successData.distance_meters}m from classroom` : 'In Classroom' },
              { label: 'Time', value: new Date().toLocaleTimeString() },
            ].map(({ label, value, green }) => (
              <div key={label} className="flex justify-between items-center text-xs">
                <span className="text-slate-500">{label}</span>
                <span className={`font-semibold ${green ? 'text-emerald-600' : 'text-slate-800'}`}>{value}</span>
              </div>
            ))}
          </div>

          <button onClick={() => navigate('/student/dashboard')} className="btn-primary w-full py-3 text-sm">
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
