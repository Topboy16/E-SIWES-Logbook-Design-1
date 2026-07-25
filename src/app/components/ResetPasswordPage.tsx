import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, AlertCircle, Loader2, CheckCircle, ArrowRight, KeyRound } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { supabase } from '../../supabase';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifyingSession, setIsVerifyingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    const checkRecoverySession = async () => {
      try {
        // 1. Check if URL contains PKCE code parameter
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            console.error('PKCE exchange error:', exchangeError);
          }
        }

        // 2. Check if active session exists (Supabase sets session automatically from recovery link)
        const { data: { session } } = await supabase.auth.getSession();
        if (mounted) {
          if (session) {
            setHasValidSession(true);
          } else {
            // Check hash fragment fallback
            if (window.location.hash.includes('access_token') || window.location.hash.includes('type=recovery')) {
              setHasValidSession(true);
            } else {
              setHasValidSession(false);
            }
          }
        }
      } catch (err) {
        console.error('Error verifying recovery session:', err);
      } finally {
        if (mounted) {
          setIsVerifyingSession(false);
        }
      }
    };

    checkRecoverySession();

    // Listen for auth events (e.g. PASSWORD_RECOVERY)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        if (mounted) {
          setHasValidSession(true);
          setIsVerifyingSession(false);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Password validation
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        if (error.message.toLowerCase().includes('session') || error.status === 400) {
          setError('Your password reset session has expired or is invalid. Please request a new link.');
        } else {
          setError(error.message);
        }
      } else {
        setSuccess(true);
        // Automatically redirect to login page after 3 seconds
        setTimeout(() => navigate('/'), 3000);
      }
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
              <BookOpen className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl text-blue-900 font-bold">e-SIWES</h1>
          </div>
        </div>

        <Card className="border-blue-100 shadow-xl">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-lg">
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5" /> Set New Password
            </CardTitle>
            <CardDescription className="text-blue-50">
              Please enter and confirm your new password below
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-6">
            {isVerifyingSession ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3 text-gray-500">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <p className="text-sm">Verifying password reset link...</p>
              </div>
            ) : !hasValidSession && !success ? (
              <div className="text-center py-4">
                <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Invalid or Expired Link</h3>
                <p className="text-sm text-gray-600 mb-6">
                  This password reset link is missing, invalid, or has already expired. Please request a fresh link.
                </p>
                <Link to="/forgot-password">
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 gap-2">
                    Request New Reset Link
                  </Button>
                </Link>
              </div>
            ) : success ? (
              <div className="text-center py-4">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Password Updated!</h3>
                <p className="text-sm text-gray-600 mb-6">
                  Your password has been reset successfully. Redirecting you to sign in...
                </p>
                <Link to="/">
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 gap-2">
                    Go to Sign In <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter new password (min. 6 chars)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 mt-2"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Updating Password...
                    </>
                  ) : (
                    'Update Password'
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
