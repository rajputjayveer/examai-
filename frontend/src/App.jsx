import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

// Public pages
import Landing from './pages/Landing';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import VerifyOtp from './pages/auth/VerifyOtp';
import ChangePassword from './pages/auth/ChangePassword';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';



// Student pages
import StudentDashboard from './pages/student/Dashboard';
import FaceEnroll from './pages/student/FaceEnroll';
import CameraCheck from './pages/student/CameraCheck';
import Instructions from './pages/student/Instructions';
import ExamRoom from './pages/student/ExamRoom';
import StudentResult from './pages/student/Result';

// Teacher pages
import TeacherExamList from './pages/teacher/ExamList';
import CreateExam from './pages/teacher/CreateExam';
import AnswerKey from './pages/teacher/AnswerKey';
import ResultsDashboard from './pages/teacher/ResultsDashboard';
import ClassAnalytics from './pages/teacher/ClassAnalytics';
import StudentReport from './pages/teacher/StudentReport';

// Admin
import AdminPanel from './pages/admin/AdminPanel';

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-4 border-brand-200 border-t-brand-600 animate-spin" />
        <p className="text-sm text-slate-500 font-medium">Loading…</p>
      </div>
    </div>
  );
}

/**
 * Used for pages that require login.
 * Unauthenticated → redirect to Landing (not /login directly).
 */
function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/" replace />;

  // Force password change on first login
  if (user.must_change_password && window.location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  // Force face enrollment for un-enrolled students
  if (
    user.role === 'student' &&
    !user.face_enrolled &&
    window.location.pathname !== '/enroll-face' &&
    window.location.pathname !== '/change-password'
  ) {
    return <Navigate to="/enroll-face" replace />;
  }

  return children;
}

/**
 * The root "/" route:
 * - Not logged in → show Landing page
 * - Logged in → redirect to role dashboard
 */
function RootRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Landing />;                                    // ← show Landing
  if (user.role === 'teacher') return <Navigate to="/teacher/exams" replace />;
  if (user.role === 'admin')   return <Navigate to="/admin" replace />;
  return <Navigate to="/student/dashboard" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* ── Root — Landing or dashboard redirect ── */}
          <Route path="/" element={<RootRoute />} />

          {/* ── Auth ── */}
          <Route path="/login"      element={<Login />} />
          <Route path="/register"   element={<Register />} />
          <Route path="/verify-otp" element={<VerifyOtp />} />
          <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* ── Admin (has its own internal login screen) ── */}
          <Route path="/admin" element={<AdminPanel />} />

          {/* ── Student ── */}
          <Route path="/enroll-face"
            element={<ProtectedRoute allowedRoles={['student']}><FaceEnroll /></ProtectedRoute>} />
          <Route path="/student/dashboard"
            element={<ProtectedRoute allowedRoles={['student']}><StudentDashboard /></ProtectedRoute>} />
          <Route path="/student/camera-check/:examId"
            element={<ProtectedRoute allowedRoles={['student']}><CameraCheck /></ProtectedRoute>} />
          <Route path="/student/instructions/:examId"
            element={<ProtectedRoute allowedRoles={['student']}><Instructions /></ProtectedRoute>} />
          <Route path="/student/exam/:attemptId"
            element={<ProtectedRoute allowedRoles={['student']}><ExamRoom /></ProtectedRoute>} />
          <Route path="/student/result/:attemptId"
            element={<ProtectedRoute allowedRoles={['student']}><StudentResult /></ProtectedRoute>} />

          {/* ── Teacher ── */}
          <Route path="/teacher/exams"
            element={<ProtectedRoute allowedRoles={['teacher']}><TeacherExamList /></ProtectedRoute>} />
          <Route path="/teacher/create-exam"
            element={<ProtectedRoute allowedRoles={['teacher']}><CreateExam /></ProtectedRoute>} />
          <Route path="/teacher/edit-exam/:examId"
            element={<ProtectedRoute allowedRoles={['teacher']}><CreateExam /></ProtectedRoute>} />
          <Route path="/teacher/exam/:examId/answer-key"
            element={<ProtectedRoute allowedRoles={['teacher']}><AnswerKey /></ProtectedRoute>} />
          <Route path="/teacher/exam/:examId/results"
            element={<ProtectedRoute allowedRoles={['teacher']}><ResultsDashboard /></ProtectedRoute>} />
          <Route path="/teacher/exam/:examId/analytics"
            element={<ProtectedRoute allowedRoles={['teacher']}><ClassAnalytics /></ProtectedRoute>} />
          <Route path="/teacher/report/:attemptId"
            element={<ProtectedRoute allowedRoles={['teacher', 'admin']}><StudentReport /></ProtectedRoute>} />

          {/* ── Fallback ── */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
