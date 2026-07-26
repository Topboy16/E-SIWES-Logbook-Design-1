import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, LogOut, Save, Loader2, AlertCircle, CheckCircle, ArrowLeft, Camera, User, KeyRound } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useAuth } from '../contexts/AuthContext';
import { uploadPassportPhoto } from '../services/storageService';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { profile, signOut, updateProfile } = useAuth();

  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [department, setDepartment] = useState(profile?.department || '');
  const [matricNumber, setMatricNumber] = useState(profile?.matric_number || '');
  const [organization, setOrganization] = useState(profile?.organization || '');
  const [staffId, setStaffId] = useState(profile?.staff_id || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [passportPreview, setPassportPreview] = useState<string>(profile?.passport_photo_url || '');
  const [newPassportFile, setNewPassportFile] = useState<File | null>(null);
  const previewUrlRef = useRef<string>('');
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Sync profile fields when profile loads asynchronously
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setDepartment(profile.department || '');
      setMatricNumber(profile.matric_number || '');
      setOrganization(profile.organization || '');
      setStaffId(profile.staff_id || '');
      if (profile.passport_photo_url) setPassportPreview(profile.passport_photo_url);
    }
  }, [profile?.id]);

  const handlePhotoSelected = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPEG, PNG, etc.)');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Passport photo must be under 2MB.');
      return;
    }
    // Revoke previous preview URL to avoid memory leak
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    previewUrlRef.current = objectUrl;
    setPassportPreview(objectUrl);
    setNewPassportFile(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const updates: Record<string, string> = {
        full_name: fullName,
        department,
      };

      // Include role-specific fields
      if (profile?.role === 'student') {
        updates.matric_number = matricNumber;
      }
      if (profile?.role === 'supervisor' || profile?.role === 'admin') {
        updates.organization = organization;
        updates.staff_id = staffId;
      }

      // Upload passport photo to Supabase Storage if changed
      if (newPassportFile && profile?.id) {
        try {
          const photoUrl = await uploadPassportPhoto(profile.id, newPassportFile);
          updates.passport_photo_url = photoUrl;
        } catch (uploadErr: any) {
          console.warn('Photo upload failed, skipping:', uploadErr?.message);
          // Non-fatal — continue saving other profile fields
        }
      }

      const { error: updateError } = await updateProfile(updates as any);

      if (updateError) throw updateError;
      setSuccess('Profile updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const roleColorMap: Record<string, string> = {
    student: 'bg-blue-600',
    supervisor: 'bg-green-600',
    admin: 'bg-purple-600',
  };
  const roleBtnMap: Record<string, string> = {
    student: 'bg-blue-600 hover:bg-blue-700',
    supervisor: 'bg-green-600 hover:bg-green-700',
    admin: 'bg-purple-600 hover:bg-purple-700',
  };
  const headerBg = roleColorMap[profile?.role || 'student'] || 'bg-blue-600';
  const btnColor = roleBtnMap[profile?.role || 'student'] || 'bg-blue-600 hover:bg-blue-700';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 ${headerBg} rounded-full flex items-center justify-center`}>
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl text-gray-900">Profile Settings</h1>
                <p className="text-xs text-gray-500">Update your information</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" className="gap-2" onClick={() => navigate(-1)}>
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
              <Button onClick={handleLogout} variant="outline" className="gap-2">
                <LogOut className="w-4 h-4" /> Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <AlertCircle className="w-5 h-5" /><span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mb-6 flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
            <CheckCircle className="w-5 h-5" /><span>{success}</span>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>
              Update your profile details. Role: <span className="font-medium capitalize">{profile?.role}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              {/* Passport Photo */}
              <div className="flex flex-col items-center gap-3 pb-4 border-b border-gray-100">
                <div
                  onClick={() => photoInputRef.current?.click()}
                  className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-gray-200 hover:border-blue-400 cursor-pointer transition-all group bg-gray-100 flex items-center justify-center"
                >
                  {passportPreview ? (
                    <img src={passportPreview} alt="Passport" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-10 h-10 text-gray-400" />
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="w-6 h-6 text-white" />
                  </div>
                </div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePhotoSelected(file);
                  }}
                />
                <p className="text-xs text-gray-400">Click to change passport photo</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email (cannot be changed)</Label>
                <Input id="email" value={profile?.email || ''} disabled className="bg-gray-100" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input id="department" value={department} onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Computer Science" />
              </div>

              {profile?.role === 'student' && (
                <div className="space-y-2">
                  <Label htmlFor="matricNumber">Matric Number</Label>
                  <Input id="matricNumber" value={matricNumber} onChange={(e) => setMatricNumber(e.target.value)}
                    placeholder="e.g. CS/2021/001" />
                </div>
              )}

              {(profile?.role === 'supervisor' || profile?.role === 'admin') && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="organization">Organization</Label>
                    <Input id="organization" value={organization} onChange={(e) => setOrganization(e.target.value)}
                      placeholder="e.g. Tech Solutions Ltd" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="staffId">Staff ID</Label>
                    <Input id="staffId" value={staffId} onChange={(e) => setStaffId(e.target.value)}
                      placeholder="e.g. EMP/2023/001" />
                  </div>
                </>
              )}

              <Button type="submit" className={`w-full ${btnColor}`} disabled={saving}>
                {saving ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                ) : (
                  <><Save className="w-4 h-4 mr-2" /> Save Changes</>
                )}
              </Button>

              {/* Change Password */}
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-2">Need to update your password?</p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => navigate('/forgot-password')}
                >
                  <KeyRound className="w-4 h-4" /> Change Password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

