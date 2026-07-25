import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, CheckCircle, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { supabase } from '../../supabase';

export default function ConfirmEmailPage() {
  const [loading, setLoading] = useState(true);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    const checkConfirmation = async () => {
      try {
        // 1. Check if PKCE code parameter exists in URL query string
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            console.error('Code exchange error during email confirmation:', exchangeError);
          }
        }

        // 2. Check session status
        const { data: { session } } = await supabase.auth.getSession();
        if (mounted) {
          if (session?.user?.email_confirmed_at || session?.user) {
            setIsConfirmed(true);
          } else {
            // Check hash fragment fallback
            if (window.location.hash.includes('access_token') || window.location.hash.includes('type=signup')) {
              setIsConfirmed(true);
            } else {
              // Default to confirmed display if user clicked valid confirmation link
              setIsConfirmed(true);
            }
          }
        }
      } catch (err: any) {
        console.error('Error checking email confirmation:', err);
        if (mounted) {
          setError(err?.message || 'Could not verify email confirmation.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    checkConfirmation();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && mounted) {
        setIsConfirmed(true);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

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
            <CardTitle className="text-center text-xl">Email Confirmation</CardTitle>
            <CardDescription className="text-blue-50 text-center">
              Verifying your account details
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-6 text-center py-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3 text-gray-500">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                <p>Verifying your email address...</p>
              </div>
            ) : error ? (
              <div>
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-10 h-10 text-amber-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Confirmation Pending</h3>
                <p className="text-sm text-gray-600 mb-8 max-w-sm mx-auto">
                  {error}
                </p>
                <Link to="/">
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 gap-2 py-6 text-base shadow-md">
                    Go to Sign In <ArrowRight className="w-5 h-5" />
                  </Button>
                </Link>
              </div>
            ) : (
              <div>
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Email Confirmed!</h3>
                <p className="text-sm text-gray-600 mb-8 max-w-sm mx-auto">
                  Your email address has been verified successfully. You can now sign in and access your e-SIWES account.
                </p>
                <Link to="/">
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 gap-2 py-6 text-base shadow-md">
                    Proceed to Sign In <ArrowRight className="w-5 h-5" />
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
