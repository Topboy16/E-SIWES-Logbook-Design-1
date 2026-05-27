import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, AlertCircle, Loader2, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useAuth } from '../contexts/AuthContext';

export default function SignUpPage() {
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [selectedRole, setSelectedRole] = useState('student');
    const [department, setDepartment] = useState('');
    const [matricNumber, setMatricNumber] = useState('');
    const [organization, setOrganization] = useState('');
    const [staffId, setStaffId] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { signUp } = useAuth();
    const navigate = useNavigate();

    const roles = [
        { id: 'student', name: 'Student', icon: BookOpen, color: 'bg-blue-500' },
        { id: 'supervisor', name: 'Supervisor', icon: Users, color: 'bg-green-500' },
    ];

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // Client-side validation
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setIsLoading(true);

        try {
            const { error } = await signUp(email, password, selectedRole, fullName, department, matricNumber, organization, staffId);

            if (error) {
                setError(error.message);
            } else {
                setSuccess(true);
                // Redirect to login after 2 seconds
                setTimeout(() => navigate('/'), 2000);
            }
        } catch (err) {
            setError('An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
                <Card className="max-w-md mx-auto border-green-100 shadow-xl">
                    <CardContent className="p-8 text-center">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <BookOpen className="w-8 h-8 text-green-600" />
                        </div>
                        <h2 className="text-xl mb-2">Account Created!</h2>
                        <p className="text-gray-600">Check your email to confirm your account, then sign in.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

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
                    <p className="text-lg text-gray-600">Create your account</p>
                </div>

                <Card className="max-w-md mx-auto border-blue-100 shadow-xl">
                    <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-lg">
                        <CardTitle>Sign Up</CardTitle>
                        <CardDescription className="text-blue-50">
                            Fill in your details to get started
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="mt-6">
                        <form onSubmit={handleSignUp} className="space-y-4">
                            {error && (
                                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            {/* Role Selection */}
                            <div className="space-y-2">
                                <Label>Select Role</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    {roles.map((role) => (
                                        <button
                                            key={role.id}
                                            type="button"
                                            onClick={() => setSelectedRole(role.id)}
                                            className={`p-3 rounded-lg border-2 transition-all text-center ${selectedRole === role.id
                                                ? 'border-blue-600 bg-blue-50'
                                                : 'border-gray-200 hover:border-blue-300'
                                                }`}
                                        >
                                            <role.icon className={`w-5 h-5 mx-auto mb-1 ${selectedRole === role.id ? 'text-blue-600' : 'text-gray-400'
                                                }`} />
                                            <span className="text-xs font-medium">{role.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="fullName">Full Name</Label>
                                <Input id="fullName" placeholder="Enter your full name"
                                    value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="email">Email Address</Label>
                                <Input id="email" type="email" placeholder="Enter your email"
                                    value={email} onChange={(e) => setEmail(e.target.value)} required />
                            </div>

                            {/* Dynamic Fields Based on Role */}
                            {selectedRole === 'student' && (
                                <>
                                    <div className="space-y-2">
                                        <Label htmlFor="department">Department</Label>
                                        <Input id="department" placeholder="e.g. Computer Science"
                                            value={department} onChange={(e) => setDepartment(e.target.value)} required />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="matricNumber">Matriculation Number</Label>
                                        <Input id="matricNumber" placeholder="e.g. CS/2021/001"
                                            value={matricNumber} onChange={(e) => setMatricNumber(e.target.value)} required />
                                    </div>
                                </>
                            )}

                            {selectedRole === 'supervisor' && (
                                <>
                                    <div className="space-y-2">
                                        <Label htmlFor="organization">Organization / Company Name</Label>
                                        <Input id="organization" placeholder="e.g. Tech Solutions Ltd"
                                            value={organization} onChange={(e) => setOrganization(e.target.value)} required />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="staffId">Staff ID</Label>
                                        <Input id="staffId" placeholder="e.g. EMP/2023/001"
                                            value={staffId} onChange={(e) => setStaffId(e.target.value)} required />
                                    </div>
                                </>
                            )}


                            <div className="space-y-2">
                                <Label htmlFor="password">Password</Label>
                                <Input id="password" type="password" placeholder="Min. 6 characters"
                                    value={password} onChange={(e) => setPassword(e.target.value)} required />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword">Confirm Password</Label>
                                <Input id="confirmPassword" type="password" placeholder="Repeat password"
                                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                            </div>

                            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
                                {isLoading ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating Account...</>
                                ) : (
                                    'Create Account'
                                )}
                            </Button>

                            <p className="text-center text-sm text-gray-600">
                                Already have an account?{' '}
                                <Link to="/" className="text-blue-600 hover:underline font-medium">Sign In</Link>
                            </p>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
