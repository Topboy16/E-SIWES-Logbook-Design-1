import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { seedAdminIfNeeded } from './services/mockDb';
import LoginPage from './components/LoginPage';
import SignUpPage from './components/SignUpPage';
import ForgotPasswordPage from './components/ForgotPasswordPage';
import ResetPasswordPage from './components/ResetPasswordPage';
import ProfilePage from './components/ProfilePage';
import CompleteProfilePage from './components/CompleteProfilePage';
import AdminDashboard from './components/AdminDashboard';
import StudentDashboard from './components/StudentDashboard';
import SupervisorDashboard from './components/SupervisorDashboard';

// Seed admin profile on first load if none exists
const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
if (adminEmail) {
  seedAdminIfNeeded(adminEmail);
}

// Protected Route component — redirects to login if not authenticated
function ProtectedRoute({ children, allowedRole }: { children: React.ReactNode; allowedRole: string }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

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
            <div className="min-h-screen flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
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
      <Route
        path="/complete-profile"
        element={
          loading ? (
            <div className="min-h-screen flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
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
      <Route
        path="/supervisor"
        element={
          <ProtectedRoute allowedRole="supervisor">
            <SupervisorDashboard />
          </ProtectedRoute>
        }
      />
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
