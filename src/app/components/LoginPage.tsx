import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { BookOpen, AlertCircle, Loader2, MailCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useAuth } from '../contexts/AuthContext';

// Detects the "email not confirmed" failure across Supabase versions (code or message).
function isEmailNotConfirmed(error: any): boolean {
  const code = (error?.code || '').toLowerCase();
  const msg = (error?.message || '').toLowerCase();
  return code === 'email_not_confirmed' || msg.includes('not confirmed') || msg.includes('confirm your email');
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [resendMessage, setResendMessage] = useState('');
  const { signIn, resendConfirmation, user, profile } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNeedsConfirmation(false);
    setResendState('idle');
    setResendMessage('');
    setIsLoading(true);

    try {
      const { error } = await signIn(email, password);
      if (error) {
        if (isEmailNotConfirmed(error)) {
          setNeedsConfirmation(true);
          setError('Your email address hasn\'t been confirmed yet. Check your inbox for the confirmation link, or resend it below.');
        } else {
          setError(error.message);
        }
      }
    } catch (err: any) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setResendState('sending');
    setResendMessage('');
    const { error } = await resendConfirmation(email);
    if (error) {
      setResendState('idle');
      setResendMessage(error.message || 'Could not resend the email. Please try again shortly.');
      return;
    }
    setResendState('sent');
    setResendMessage(`Confirmation email sent to ${email}. It may take a minute to arrive — check your spam folder too.`);
  };

  useEffect(() => {
    if (user && profile) {
      // Respect the profile-completion gate rather than jumping straight to the role
      // dashboard (ProtectedRoute would bounce an incomplete profile anyway).
      navigate(profile.profile_completed ? `/${profile.role}` : '/complete-profile', { replace: true });
    }
  }, [user, profile, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
              <BookOpen className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl text-blue-900">e-SIWES</h1>
          </div>
          <p className="text-lg text-gray-600">Student Industrial Work Experience Scheme</p>
          <p className="text-sm text-gray-500 mt-1">Digital Logbook Management System</p>
        </div>

        <Card className="max-w-md mx-auto border-blue-100 shadow-xl">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-lg">
            <CardTitle>Sign In to Your Account</CardTitle>
            <CardDescription className="text-blue-50">
              Enter your credentials to continue
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-6">
            <form onSubmit={handleLogin} className="space-y-6">
              {error && (
                <div className={`flex flex-col gap-2 p-3 border rounded-lg text-sm ${needsConfirmation ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                  {needsConfirmation && (
                    <div className="pl-6">
                      {resendState === 'sent' ? (
                        <p className="flex items-center gap-1.5 text-green-700">
                          <MailCheck className="w-4 h-4 flex-shrink-0" /> {resendMessage}
                        </p>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={handleResend}
                            disabled={resendState === 'sending'}
                            className="inline-flex items-center gap-1.5 font-medium text-amber-900 underline underline-offset-2 hover:text-amber-950 disabled:opacity-60"
                          >
                            {resendState === 'sending'
                              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</>
                              : <>Resend confirmation email</>}
                          </button>
                          {resendMessage && <p className="mt-1 text-red-600">{resendMessage}</p>}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" type="email" placeholder="Enter your email"
                  value={email} onChange={(e) => setEmail(e.target.value)} required className="border-gray-300" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link to="/forgot-password" className="text-xs text-blue-600 hover:underline">
                    Forgot Password?
                  </Link>
                </div>
                <Input id="password" type="password" placeholder="Enter your password"
                  value={password} onChange={(e) => setPassword(e.target.value)} required className="border-gray-300" />
              </div>

              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
                {isLoading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing In...</>
                ) : (
                  'Sign In'
                )}
              </Button>

              <p className="text-center text-sm text-gray-600">
                Don't have an account?{' '}
                <Link to="/signup" className="text-blue-600 hover:underline font-medium">Sign Up</Link>
              </p>
            </form>
          </CardContent>
        </Card>

        <div className="text-center mt-6 text-sm text-gray-500">
          <p>© 2026 e-SIWES Digital Logbook System. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
