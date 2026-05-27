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
}

interface AuthContextType {
    user: any;
    profile: UserProfile | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<{ error: any }>;
    signUp: (email: string, password: string, role: string, fullName: string, department?: string, matricNumber?: string, organization?: string, staffId?: string) => Promise<{ error: any }>;
    signOut: () => Promise<void>;
    updateProfile: (updates: Partial<UserProfile>) => Promise<{ error: any }>;
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
            
            // Return a default if absolutely nothing exists
            return {
                id: userId,
                email: 'user@example.com',
                role: 'student',
                full_name: 'Mock User',
            };
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

                console.log('Auth event:', event, 'initialAuthDone:', initialAuthDone, 'isSigningIn:', isSigningIn.current);

                // initializeAuth handles INITIAL_SESSION, skip entirely
                if (event === 'INITIAL_SESSION') {
                    return;
                }

                if (event === 'SIGNED_IN') {
                    // Skip redundant SIGNED_IN from page load (init already handled it)
                    // But process it if the user actually clicked "Sign In"
                    if (initialAuthDone && !isSigningIn.current) {
                        console.log('Skipping redundant SIGNED_IN — init already done, not a user action');
                        return;
                    }

                    setUser(session?.user ?? null);
                    if (session?.user) {
                        setLoading(true);
                        const profileData = await fetchProfile(session.user.id);
                        if (mounted) {
                            if (profileData && profileData.email === 'user@example.com') {
                                profileData.email = session.user.email;
                            }
                            setProfile(profileData);
                            setUser(session.user);
                            setLoading(false);
                            isSigningIn.current = false;
                        }
                    }
                    return;
                }

                if (event === 'SIGNED_OUT') {
                    if (mounted) {
                        setUser(null);
                        setProfile(null);
                        setLoading(false);
                    }
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
            if (!profileData || profileData.email === 'user@example.com') {
                // Mock a profile if none was found or we got the hardcoded default
                const db = getMockDb();
                let existing = db.profiles.find((p: any) => p.email === email);
                if (existing) {
                    profileData = existing;
                } else {
                    profileData = {
                        id: data.user.id,
                        email: data.user.email || email,
                        role: 'student', // assume student if missing
                        full_name: data.user.email?.split('@')[0] || 'User',
                    };
                    db.profiles.push(profileData);
                    saveMockDb(db);
                }
            }
            
            if (profileData) {
                setProfile(profileData);
            } else {
                isSigningIn.current = false;
                return { error: { message: 'Profile not found. Please sign up first or contact your administrator.' } };
            }
        }

        isSigningIn.current = false;
        return { error: null };
    }

    async function signUp(email: string, password: string, role: string, fullName: string, department: string = '', matricNumber: string = '', organization: string = '', staffId: string = '') {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) return { error };

        if (data.user) {
            const { error: profileError } = await supabase
                .from('profiles')
                .insert({
                    id: data.user.id,
                    email,
                    role,
                    full_name: fullName,
                    department,
                    matric_number: matricNumber,
                    organization,
                    staff_id: staffId
                });

            // If Supabase insert fails (e.g. no table), save to mockDb
            if (profileError) {
                console.warn('Saving profile to mockDb due to Supabase error:', profileError);
                const db = getMockDb();
                db.profiles.push({
                    id: data.user.id,
                    email,
                    role,
                    full_name: fullName,
                    department,
                    matric_number: matricNumber,
                    organization,
                    staff_id: staffId
                });
                saveMockDb(db);
            }

            // Explicitly fetch and set profile to avoid race condition with onAuthStateChange
            const profileData = await fetchProfile(data.user.id);
            if (profileData) {
                setProfile(profileData);
            }
        }

        return { error: null };
    }

    async function signOut() {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
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
        <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut, updateProfile }}>
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
