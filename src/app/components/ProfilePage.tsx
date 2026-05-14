import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, LogOut, Save, Loader2, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useAuth } from '../contexts/AuthContext';

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
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

