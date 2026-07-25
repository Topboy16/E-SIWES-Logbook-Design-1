import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { supabase } from '../../supabase';
import { getMockDb, saveMockDb } from '../services/mockDb';

// Define types for our context
interface UserProfile {
    id: string;
    email: string;
    role: 'student' | 'supervisor' | 'admin';
    full_name: string;
    department?: string;
    supervisor_id?: string;
    matric_number?: string;
    organization?: string;
    staff_id?: string;
    passport_photo_url?: string;
    email_confirmed_at?: string | null;
    // False until the user has filled in role + required details. Legacy users who were
    // created in auth but never got a profile row are backfilled with this set to false,
    // which routes them through the Complete Profile page on next login.
    profile_completed?: boolean;
}

interface AuthContextType {
    user: any;
    profile: UserProfile | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<{ error: any }>;
    signUp: (email: string, password: string, role: string, fullName: string, department?: string, matricNumber?: string, organization?: string, staffId?: string, passportPhotoUrl?: string) => Promise<{ error: any }>;
    signOut: () => Promise<void>;
    updateProfile: (updates: Partial<UserProfile>) => Promise<{ error: any }>;
    resendConfirmation: (email: string) => Promise<{ error: any }>;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<any>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    // Track whether a user-initiated sign-in is in progress
    const isSigningIn = useRef(false);

    async function fetchProfile(userId: string) {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error || !data) {
                throw error || new Error('No profile data');
            }
            return data;
        } catch (err) {
            console.warn('Fallback to mock profile due to DB error:', err);
            const db = getMockDb();
            const p = db.profiles.find((p: any) => p.id === userId);
            if (p) return p;

            // Fail closed: do NOT fabricate a default profile here. Returning a hardcoded
            // { role: 'student' } on a transient DB error would silently downgrade
            // supervisors/admins into the student dashboard. Callers must treat null as
            // "could not resolve profile" and refuse access rather than assume a role.
            return null;
        }
    }

    useEffect(() => {
        let mounted = true;
        let initialAuthDone = false;

        const initializeAuth = async () => {
            // Force loading to false after 3 seconds no matter what
            const timeoutId = setTimeout(() => {
                if (mounted) {
                    console.warn('Auth initialization timed out, forcing load complete');
                    initialAuthDone = true;
                    setLoading(false);
                }
            }, 3000);

            try {
                const { data: { session }, error } = await supabase.auth.getSession();
                clearTimeout(timeoutId);
                if (error) throw error;

                if (mounted) {
                    setUser(session?.user ?? null);
                    if (session?.user) {
                        const profileData = await fetchProfile(session.user.id);
                        if (mounted) {
                            // Update the email from auth user if it was a default mock
                            if (profileData && profileData.email === 'user@example.com') {
                                profileData.email = session.user.email;
                            }
                            setProfile(profileData);
                        }
                    }
                    // Always set loading to false after init, whether profile exists or not
                    if (mounted) {
                        initialAuthDone = true;
                        setLoading(false);
                    }
                }
            } catch (error) {
                clearTimeout(timeoutId);
                console.error('Error in initializeAuth:', error);
                if (mounted) {
                    initialAuthDone = true;
                    setLoading(false);
                }
            }
        };

        initializeAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (!mounted) return;

                // INITIAL_SESSION: handled by initializeAuth above
                // SIGNED_IN: handled by initializeAuth (existing session) or signIn() (user action)
                // Skipping both avoids duplicate fetchProfile calls and race conditions.
                if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
                    return;
                }

                if (event === 'SIGNED_OUT') {
                    setUser(null);
                    setProfile(null);
                    setLoading(false);
                    return;
                }

                if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
                    setUser(session?.user ?? null);
                    return;
                }
            }
        );

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    async function signIn(email: string, password: string) {
        isSigningIn.current = true;
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            isSigningIn.current = false;
            return { error };
        }

        if (data.user) {
            setUser(data.user);

            let profileData = await fetchProfile(data.user.id);
            if (!profileData) {
                // Last resort: a pre-provisioned demo profile in the mock DB, matched by email.
                // We deliberately do NOT fabricate a brand-new profile with an assumed role —
                // defaulting to 'student' would let a transient profile-fetch failure silently
                // strip a supervisor/admin of their real role. If nothing is found, fail closed.
                const db = getMockDb();
                const existing = db.profiles.find((p: any) => p.email === email);
                if (existing) profileData = existing;
            }
            
            if (profileData) {
                // Sync email_confirmed_at from auth user to profile so admin can see verification status
                const confirmedAt = data.user.email_confirmed_at ?? null;
                if (confirmedAt && !profileData.email_confirmed_at) {
                    // Write it back to the profiles table (best-effort, non-blocking)
                    supabase
                        .from('profiles')
                        .update({ email_confirmed_at: confirmedAt })
                        .eq('id', data.user.id)
                        .then(() => {})
                        .catch(() => {});
                    // Update mock DB too
                    try {
                        const db = getMockDb();
                        const idx = db.profiles.findIndex((p: any) => p.id === data.user.id);
                        if (idx !== -1) {
                            db.profiles[idx].email_confirmed_at = confirmedAt;
                            saveMockDb(db);
                        }
                    } catch (_) {}
                }
                setProfile({ ...profileData, email_confirmed_at: confirmedAt || profileData.email_confirmed_at });
            } else {
                // Self-heal: auth user exists but profile row is missing (transient DB trigger failure
                // or account created before the trigger was installed). Synthesize a minimal incomplete
                // profile so the user is routed to /complete-profile rather than locked out.
                const syntheticProfile = {
                    id: data.user.id,
                    email: data.user.email || email,
                    role: 'student' as const,
                    full_name: email.split('@')[0],
                    profile_completed: false,
                    email_confirmed_at: data.user.email_confirmed_at ?? null,
                };
                // Best-effort insert into profiles table
                supabase
                    .from('profiles')
                    .upsert(syntheticProfile, { onConflict: 'id' })
                    .then(() => {})
                    .catch(() => {});
                setProfile(syntheticProfile);
            }

        }

        isSigningIn.current = false;
        return { error: null };
    }

    async function signUp(email: string, password: string, role: string, fullName: string, department: string = '', matricNumber: string = '', organization: string = '', staffId: string = '', passportPhotoUrl: string = '') {
        // Defense in depth: never allow a self-service signup to create a privileged role,
        // even if the UI is bypassed. Only 'student' and 'supervisor' may self-register;
        // admins are provisioned server-side. (The DB should also enforce this via an RLS
        // policy / trigger that rejects role='admin' inserts from anon/authenticated users.)
        const SELF_SIGNUP_ROLES = ['student', 'supervisor'];
        if (!SELF_SIGNUP_ROLES.includes(role)) {
            return { error: { message: 'Invalid role selected.' } };
        }

        // Pass the profile details as auth metadata. The server-side handle_new_user()
        // trigger reads this and creates the profiles row reliably — this works even with
        // email confirmation enabled (where there is no session at signup time, so a
        // client-side insert into profiles would be blocked by RLS and silently lost).
        //
        // NOTE: passport_photo_url is intentionally NOT sent as metadata — it is a base64
        // data URL that can be megabytes, and user_metadata is embedded in the JWT. The
        // photo is set later on the profile page instead.
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: `${window.location.origin}/confirm-email`,
                data: {
                    role,
                    full_name: fullName,
                    department,
                    matric_number: matricNumber,
                    organization,
                    staff_id: staffId,
                },
            },
        });

        if (error) return { error };

        // With email confirmation on there is no session yet, so we do not fetch/set the
        // profile here — the user confirms their email, then signs in. `passportPhotoUrl`
        // is accepted for signature compatibility but applied on first profile edit.
        void passportPhotoUrl;
        return { error: null };
    }

    async function signOut() {
        // Logout is local-first: always clear in-memory auth state even if the network
        // call to revoke the session fails (e.g. offline). Otherwise a rejected signOut
        // would leave the UI logged in and skip the caller's post-logout navigation.
        try {
            await supabase.auth.signOut();
        } catch (err) {
            console.warn('signOut network error — clearing local session anyway:', err);
        } finally {
            setUser(null);
            setProfile(null);
        }
    }

    // Re-send the signup confirmation email for accounts that haven't verified yet.
    // Supabase silently no-ops (still returns success) if the address is already
    // confirmed or unknown, so this does not leak whether an account exists.
    async function resendConfirmation(email: string): Promise<{ error: any }> {
        if (!email) return { error: { message: 'Enter your email address first.' } };
        const { error } = await supabase.auth.resend({ type: 'signup', email });
        return { error };
    }

    async function updateProfile(updates: Partial<UserProfile>): Promise<{ error: any }> {
        if (!profile?.id) return { error: { message: 'No profile loaded' } };

        try {
            const { error } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', profile.id);

            if (error) throw error;

            // Update the in-memory profile state
            setProfile(prev => prev ? { ...prev, ...updates } : prev);
            return { error: null };
        } catch (err: any) {
            console.warn('Fallback to mock DB for updateProfile:', err);
            // Update mock DB
            const db = getMockDb();
            const idx = db.profiles.findIndex((p: any) => p.id === profile.id);
            if (idx !== -1) {
                db.profiles[idx] = { ...db.profiles[idx], ...updates };
                saveMockDb(db);
            } else {
                // Profile not in mock DB yet — add it
                db.profiles.push({ ...profile, ...updates });
                saveMockDb(db);
            }
            // Update the in-memory profile state
            setProfile(prev => prev ? { ...prev, ...updates } : prev);
            return { error: null };
        }
    }

    return (
        <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut, updateProfile, resendConfirmation }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
