import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import AdminPanel from './pages/admin/AdminPanel';
import JoinExam from './pages/student/JoinExam';


// Student pages
import StudentDashboard from './pages/student/Dashboard';
import FaceEnroll from './pages/student/FaceEnroll';
import Instructions from './pages/student/Instructions';
import ExamRoom from './pages/student/ExamRoom';
import StudentResult from './pages/student/Result';

// Teacher pages
import TeacherExamList from './pages/teacher/ExamList';
import CreateExam from './pages/teacher/CreateExam';
import AnswerKey from './pages/teacher/AnswerKey';
import ResultsDashboard from './pages/teacher/ResultsDashboard';
import StudentReport from './pages/teacher/StudentReport';

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  // Force face enrollment for students
  if (user.role === 'student' && !user.face_enrolled && window.location.pathname !== '/enroll-face') {
    return <Navigate to="/enroll-face" replace />;
  }

  return children;
}

function DashboardRouter() {
  const { user } = useAuth();
  if (user.role === 'teacher') {
    return <Navigate to="/teacher/exams" replace />;
  }
  return <Navigate to="/student/dashboard" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/exam/join/:examId" element={<JoinExam />} />


          {/* Fallback routing based on role */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardRouter />
              </ProtectedRoute>
            }
          />

          {/* Student Protected Routes */}
          <Route
            path="/enroll-face"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <FaceEnroll />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/dashboard"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/instructions/:examId"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <Instructions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/exam/:attemptId"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <ExamRoom />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/result/:attemptId"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <StudentResult />
              </ProtectedRoute>
            }
          />

          {/* Teacher Protected Routes */}
          <Route
            path="/teacher/exams"
            element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <TeacherExamList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/create-exam"
            element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <CreateExam />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/exam/:examId/answer-key"
            element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <AnswerKey />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/exam/:examId/results"
            element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <ResultsDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/report/:attemptId"
            element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <StudentReport />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
