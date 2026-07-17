import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function FaceEnroll() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const { refreshProfile } = useAuth();
  const navigate = useNavigate();

  const startCamera = async () => {
    try {
      setStatusMsg('');
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      videoRef.current.srcObject = mediaStream;
      setStream(mediaStream);
    } catch (err) {
      console.error(err);
      setStatusMsg('Could not access camera. Please check permissions.');
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas) {
      const context = canvas.getContext('2d');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg');
      setCapturedImage(dataUrl);
      
      // Stop camera stream
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      setStream(null);
    }
  };

  const uploadPhoto = async () => {
    if (!capturedImage) return;
    setLoading(true);
    try {
      // Convert data URL to Blob
      const res = await fetch(capturedImage);
      const blob = await res.blob();
      
      const formData = new FormData();
      formData.append('file', blob, 'enrollment.jpg');
      
      await client.post('/students/enroll-face', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      setStatusMsg('Face enrolled successfully!');
      await refreshProfile();
      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (err) {
      console.error(err);
      setStatusMsg('Upload failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md glass-panel glow-card rounded-2xl p-8 shadow-2xl text-center">
        <h2 className="text-2xl font-bold mb-2">Face Enrollment</h2>
        <p className="text-sm text-slate-400 mb-6">
          Capture a clear, well-lit photo of your face for verification during the exam.
        </p>

        {statusMsg && (
          <div className="mb-4 rounded-lg bg-blue-500/10 p-3 text-sm text-blue-400 border border-blue-500/20">
            {statusMsg}
          </div>
        )}

        <div className="relative aspect-video w-full rounded-lg bg-slate-900 border border-slate-800 overflow-hidden mb-6 flex items-center justify-center">
          {!capturedImage ? (
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover transform -scale-x-100" />
          ) : (
            <img src={capturedImage} alt="Captured face reference" className="w-full h-full object-cover transform -scale-x-100" />
          )}
          <canvas ref={canvasRef} width="640" height="480" className="hidden" />
        </div>

        <div className="space-y-4">
          {!stream && !capturedImage && (
            <button
              onClick={startCamera}
              className="w-full rounded-lg bg-brand-500 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              Start Camera
            </button>
          )}

          {stream && (
            <button
              onClick={capturePhoto}
              className="w-full rounded-lg bg-brand-500 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              Capture Snapshot
            </button>
          )}

          {capturedImage && (
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setCapturedImage(null);
                  startCamera();
                }}
                className="flex-1 rounded-lg border border-slate-700 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-900/50"
              >
                Retake
              </button>
              <button
                onClick={uploadPhoto}
                disabled={loading}
                className="flex-1 rounded-lg bg-green-600 py-3 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Confirm & Save'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
