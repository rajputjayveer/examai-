import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function JoinExam() {
  const { examId } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    if (user) {
      if (user.role === 'student') {
        navigate(`/student/instructions/${examId}`);
      } else {
        navigate('/');
      }
    } else {
      // Save examId to join after login
      sessionStorage.setItem('pendingExamJoin', examId);
      navigate('/login');
    }
  }, [examId, user, loading, navigate]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-550">
      Redirecting you to the exam room...
    </div>
  );
}
