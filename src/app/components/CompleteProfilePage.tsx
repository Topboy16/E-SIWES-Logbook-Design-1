import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, AlertCircle, Loader2, Users, Camera, LogOut } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useAuth } from '../contexts/AuthContext';
import { uploadPassportPhoto } from '../services/storageService';

// Roles a user may self-assign. Admin is deliberately excluded — admins are provisioned
// server-side, never self-selected (mirrors the SignUpPage / signUp() restriction).
const SELECTABLE_ROLES = [
  { id: 'student', name: 'Student', icon: BookOpen, color: 'text-blue-600' },
  { id: 'supervisor', name: 'Supervisor', icon: Users, color: 'text-green-600' },
];

// Shown to users whose auth account exists but whose profile is missing/incomplete
// (e.g. accounts created before profiles were provisioned server-side). They land here
// on login and fill in the details that were never captured, then proceed to their dashboard.
export default function CompleteProfilePage() {
  const navigate = useNavigate();
  const { user, profile, updateProfile, signOut } = useAuth();

  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('student');
  const [department, setDepartment] = useState('');
  const [matricNumber, setMatricNumber] = useState('');
  const [organization, setOrganization] = useState('');
  const [staffId, setStaffId] = useState('');
  const [passportPhoto, setPassportPhoto] = useState<File | null>(null);
  const [passportPreview, setPassportPreview] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Prefill from whatever the profile already has (backfilled rows carry email + a
  // placeholder role and full_name derived from the email prefix).
  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name && profile.full_name !== profile.email?.split('@')[0] ? profile.full_name : '');
    if (profile.role === 'student' || profile.role === 'supervisor') setRole(profile.role);
    setDepartment(profile.department || '');
    setMatricNumber(profile.matric_number || '');
    setOrganization(profile.organization || '');
    setStaffId(profile.staff_id || '');
    if (profile.passport_photo_url) setPassportPreview(profile.passport_photo_url);
  }, [profile]);

  // fileToDataUrl removed — photo upload now uses storageService (Supabase Storage)

  const handlePhotoSelected = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPEG, PNG, etc.)');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Passport photo must be under 2MB.');
      return;
    }
    setError('');
    setPassportPhoto(file);
    setPassportPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!fullName.trim()) { setError('Please enter your full name.'); return; }
    if (role === 'student' && (!department.trim() || !matricNumber.trim())) {
      setError('Department and matriculation number are required for students.');
      return;
    }
    if (role === 'supervisor' && (!organization.trim() || !staffId.trim())) {
      setError('Organization and staff ID are required for supervisors.');
      return;
    }

    setIsLoading(true);
    try {
      let passportPhotoUrl = passportPreview.startsWith('http') ? passportPreview : '';
      if (passportPhoto && user?.id) {
        try {
          passportPhotoUrl = await uploadPassportPhoto(user.id, passportPhoto);
        } catch (uploadErr: any) {
          console.warn('Photo upload failed, skipping:', uploadErr?.message);
          // Non-fatal — continue saving profile without photo
        }
      }

      const { error: updateError } = await updateProfile({
        full_name: fullName.trim(),
        role: role as 'student' | 'supervisor',
        department: role === 'student' ? department.trim() : '',
        matric_number: role === 'student' ? matricNumber.trim() : '',
        organization: role === 'supervisor' ? organization.trim() : '',
        staff_id: role === 'supervisor' ? staffId.trim() : '',
        passport_photo_url: passportPhotoUrl || '',
        profile_completed: true,
      });

      if (updateError) {
        setError(updateError.message || 'Could not save your profile. Please try again.');
        return;
      }
      navigate(`/${role}`);
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => { await signOut(); navigate('/'); };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center">
              <BookOpen className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl text-blue-900">e-SIWES</h1>
          </div>
          <p className="text-gray-600">One more step — complete your profile</p>
        </div>

        <Card className="border-blue-100 shadow-xl">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-lg">
            <CardTitle>Complete Your Profile</CardTitle>
            <CardDescription className="text-blue-50">
              We need a few details before you can continue{user?.email ? ` (${user.email})` : ''}.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Role */}
              <div className="space-y-2">
                <Label>I am a</Label>
                <div className="grid grid-cols-2 gap-2">
                  {SELECTABLE_ROLES.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRole(r.id)}
                      className={`p-3 rounded-lg border-2 transition-all text-center ${
                        role === r.id ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      <r.icon className={`w-5 h-5 mx-auto mb-1 ${role === r.id ? r.color : 'text-gray-400'}`} />
                      <span className="text-xs font-medium">{r.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Passport */}
              <div className="space-y-2">
                <Label>Passport Photograph <span className="text-gray-400 font-normal">(optional)</span></Label>
                <div className="flex flex-col items-center gap-2">
                  <div
                    onClick={() => photoInputRef.current?.click()}
                    className="relative w-24 h-24 rounded-full border-2 border-dashed border-gray-300 hover:border-blue-400 cursor-pointer transition-all group overflow-hidden bg-gray-50 flex items-center justify-center"
                  >
                    {passportPreview ? (
                      <img src={passportPreview} alt="Passport preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-gray-400 group-hover:text-blue-500">
                        <Camera className="w-7 h-7" />
                        <span className="text-[10px] font-medium">Upload</span>
                      </div>
                    )}
                  </div>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoSelected(f); }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input id="fullName" placeholder="Enter your full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>

              {role === 'student' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="department">Department</Label>
                    <Input id="department" placeholder="e.g. Computer Science" value={department} onChange={(e) => setDepartment(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="matricNumber">Matriculation Number</Label>
                    <Input id="matricNumber" placeholder="e.g. CS/2021/001" value={matricNumber} onChange={(e) => setMatricNumber(e.target.value)} required />
                  </div>
                </>
              )}

              {role === 'supervisor' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="organization">Organization / Company Name</Label>
                    <Input id="organization" placeholder="e.g. Tech Solutions Ltd" value={organization} onChange={(e) => setOrganization(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="staffId">Staff ID</Label>
                    <Input id="staffId" placeholder="e.g. EMP/2023/001" value={staffId} onChange={(e) => setStaffId(e.target.value)} required />
                  </div>
                </>
              )}

              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
                {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : 'Save & Continue'}
              </Button>

              <button type="button" onClick={handleSignOut} className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
                <LogOut className="w-3.5 h-3.5" /> Sign out
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
