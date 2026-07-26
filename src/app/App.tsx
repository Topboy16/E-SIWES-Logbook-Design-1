import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { seedAdminIfNeeded } from './services/mockDb';
import LoginPage from './components/LoginPage';
import SignUpPage from './components/SignUpPage';
import ForgotPasswordPage from './components/ForgotPasswordPage';
import ResetPasswordPage from './components/ResetPasswordPage';
import ConfirmEmailPage from './components/ConfirmEmailPage';
import ProfilePage from './components/ProfilePage';
import CompleteProfilePage from './components/CompleteProfilePage';
import AdminDashboard from './components/AdminDashboard';
import StudentDashboard from './components/StudentDashboard';
import SupervisorDashboard from './components/SupervisorDashboard';
import { BookOpen } from 'lucide-react';

// Branded full-screen loading spinner
function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-blue-50 to-white">
      <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center shadow-lg">
        <BookOpen className="w-9 h-9 text-white" />
      </div>
      <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600" />
      <p className="text-sm text-gray-400 tracking-wide">Loading e-SIWES...</p>
    </div>
  );
}

// Seed admin profile on first load if none exists
const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
if (adminEmail) {
  seedAdminIfNeeded(adminEmail);
}

// Protected Route component — redirects to login if not authenticated
function ProtectedRoute({ children, allowedRole }: { children: React.ReactNode; allowedRole: string }) {
  const { user, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  if (!user || !profile) {
    return <Navigate to="/" />;
  }

  // Users whose profile was never fully provisioned (e.g. legacy accounts backfilled
  // after profiles moved server-side) must finish it before reaching any dashboard.
  if (!profile.profile_completed) {
    return <Navigate to="/complete-profile" />;
  }

  if (profile.role !== allowedRole) {
    return <Navigate to={`/${profile.role}`} />;
  }

  return <>{children}</>;
}

// Where a signed-in user with a loaded profile belongs: the completion step if their
// profile is unfinished, otherwise their role dashboard.
function homePathFor(profile: { role: string; profile_completed?: boolean }) {
  return profile.profile_completed ? `/${profile.role}` : '/complete-profile';
}

function AppRoutes() {
  const { user, profile, loading } = useAuth();

  return (
    <Routes>
      {/* Public routes — show spinner while auth is initializing to prevent login flash */}
      <Route
        path="/"
        element={
          loading ? (
            <LoadingScreen />
          ) : user && profile ? (
            <Navigate to={homePathFor(profile)} />
          ) : (
            <LoginPage />
          )
        }
      />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/confirm-email" element={<ConfirmEmailPage />} />
      <Route
        path="/complete-profile"
        element={
          loading ? (
            <LoadingScreen />
          ) : !user || !profile ? (
            <Navigate to="/" />
          ) : profile.profile_completed ? (
            <Navigate to={`/${profile.role}`} />
          ) : (
            <CompleteProfilePage />
          )
        }
      />
      <Route path="/profile" element={user ? <ProfilePage /> : <Navigate to="/" />} />

      {/* Protected routes — loading handled by ProtectedRoute */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRole="admin">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student"
        element={
          <ProtectedRoute allowedRole="student">
            <StudentDashboard />
          </ProtectedRoute>
        }
      />
      <Route path="/supervisor"
        element={
          <ProtectedRoute allowedRole="supervisor">
            <SupervisorDashboard />
          </ProtectedRoute>
        }
      />
      {/* 404 catch-all */}
      <Route path="*" element={
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-blue-50 to-white">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center shadow-lg">
            <BookOpen className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-6xl font-bold text-gray-300">404</h1>
          <p className="text-gray-500 text-lg">Page not found</p>
          <a href="/" className="mt-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
            Go to Sign In
          </a>
        </div>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
