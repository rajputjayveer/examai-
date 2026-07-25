import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function JoinExam() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const examIdParam = searchParams.get('examId');
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [statusMsg, setStatusMsg] = useState('Verifying exam join token...');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (loading) return;

    // Direct token join flow from email notification link
    if (token) {
      if (!user) {
        // Save target next URL to resume post-login
        const nextUrl = `/join-exam?token=${encodeURIComponent(token)}`;
        sessionStorage.setItem('pendingNextUrl', nextUrl);
        navigate(`/login?next=${encodeURIComponent(nextUrl)}`, { replace: true });
        return;
      }

      if (user.role !== 'student') {
        setErrorMsg('Exam join links are for student accounts only.');
        return;
      }

      // User logged in as student, validate token with backend
      client.get(`/exams/join/${token}`)
        .then(res => {
          const targetExamId = res.data.exam_id;
          setStatusMsg('Token verified! Redirecting to biometric check...');
          navigate(`/student/camera-check/${targetExamId}`, { replace: true });
        })
        .catch(err => {
          const detail = err.response?.data?.detail || 'Invalid or expired exam join link.';
          setErrorMsg(detail);
        });
      return;
    }

    // Direct examId param fallback
    if (examIdParam) {
      if (!user) {
        sessionStorage.setItem('pendingExamJoin', examIdParam);
        navigate('/login', { replace: true });
        return;
      }
      if (user.role === 'student') {
        navigate(`/student/camera-check/${examIdParam}`, { replace: true });
      } else {
        navigate('/', { replace: true });
      }
      return;
    }

    // If no token or examId provided
    navigate('/', { replace: true });
  }, [token, examIdParam, user, loading, navigate]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-8 max-w-md w-full text-center space-y-4">
        {errorMsg ? (
          <>
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto text-xl font-bold">
              ✕
            </div>
            <h2 className="text-lg font-bold text-slate-900 font-display">Exam Access Error</h2>
            <p className="text-xs text-red-600 font-medium">{errorMsg}</p>
            <button
              onClick={() => navigate('/student/dashboard')}
              className="btn-primary w-full py-2.5 text-xs font-bold mt-2"
            >
              Return to Student Dashboard
            </button>
          </>
        ) : (
          <>
            <div className="w-10 h-10 rounded-full border-4 border-brand-200 border-t-brand-600 animate-spin mx-auto" />
            <h2 className="text-base font-semibold text-slate-800 font-display">{statusMsg}</h2>
            <p className="text-xs text-slate-400">Preserving portal login and biometric verification security steps...</p>
          </>
        )}
      </div>
    </div>
  );
}
