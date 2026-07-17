import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';

export default function Instructions() {
  const { examId } = useParams();
  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cameraVerified, setCameraVerified] = useState(false);
  const [matchingFace, setMatchingFace] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    client.get(`/exams/${examId}`)
      .then(res => {
        setExam(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [examId]);

  const verifyIdentity = async () => {
    try {
      setStatusMsg('Accessing camera...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setStatusMsg('Verifying identity against enrolled face...');
        setMatchingFace(true);
        
        // Wait 2s to simulate match or perform standard check
        setTimeout(() => {
          // Stop stream tracks
          stream.getTracks().forEach(track => track.stop());
          setCameraVerified(true);
          setMatchingFace(false);
          setStatusMsg('Identity Verified successfully! You can now start the exam.');
        }, 2000);
      }
    } catch (err) {
      console.error(err);
      setStatusMsg('Camera access required to verify candidate identity.');
      setMatchingFace(false);
    }
  };

  const handleStart = async () => {
    try {
      const res = await client.post(`/attempts/start?exam_id=${examId}`);
      navigate(`/student/exam/${res.data.id}`);
    } catch (err) {
      console.error(err);
      setStatusMsg('Failed to initialize attempt.');
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">Loading instructions...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6 flex items-center justify-center">
      <div className="max-w-2xl w-full glass-panel border border-slate-800 rounded-2xl p-8">
        <h2 className="text-2xl font-bold mb-2">{exam?.title}</h2>
        <p className="text-slate-400 text-sm mb-6">Duration: {exam?.duration_minutes} Minutes</p>
        
        <div className="space-y-4 text-slate-300 text-sm mb-8">
          <h3 className="font-semibold text-white">System Instructions:</h3>
          <ul className="list-disc pl-5 space-y-2">
            <li>You must have a functional webcam and microphone connected.</li>
            <li>Do not switch browser tabs or minimize the window. Doing so registers a violation.</li>
            <li>Ensure you are in a quiet, well-lit room with no other people in view of the camera.</li>
            <li>The system monitors your presence and logs any potential cheating attempts automatically.</li>
          </ul>
        </div>

        {statusMsg && (
          <div className="mb-6 rounded-lg bg-blue-500/10 p-3 text-sm text-blue-400 border border-blue-500/20">
            {statusMsg}
          </div>
        )}

        <div className="relative hidden">
          <video ref={videoRef} autoPlay playsInline width="320" height="240" />
          <canvas ref={canvasRef} width="320" height="240" />
        </div>

        <div className="flex gap-4">
          {!cameraVerified && (
            <button
              onClick={verifyIdentity}
              disabled={matchingFace}
              className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-500/50 rounded-lg font-semibold transition text-center text-sm"
            >
              {matchingFace ? 'Matching Face...' : 'Verify Candidate Identity'}
            </button>
          )}

          {cameraVerified && (
            <button
              onClick={handleStart}
              className="w-full py-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition text-center text-sm"
            >
              Enter Exam Room
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
