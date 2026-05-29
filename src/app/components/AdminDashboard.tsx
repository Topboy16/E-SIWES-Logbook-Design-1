import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  BookOpen, Users, CheckCircle, Clock, LogOut, FileText,
  TrendingUp, Loader2, AlertCircle, XCircle, Search, User,
  ChevronLeft, ChevronRight, BarChart3, UserPlus,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Label } from './ui/label';
import { useAuth } from '../contexts/AuthContext';
import { getAllStudents, getAllSupervisors, getAllEntries, getSystemStats, assignSupervisor } from '../services/adminService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import NotificationBell from './NotificationBell';

const ITEMS_PER_PAGE = 10;

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();

  const [activeTab, setActiveTab] = useState('overview');
  const [students, setStudents] = useState<any[]>([]);
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [recentEntries, setRecentEntries] = useState<any[]>([]);
  const [allEntries, setAllEntries] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalStudents: 0, totalSupervisors: 0, pendingApprovals: 0, completedLogs: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Search & filter
  const [studentSearch, setStudentSearch] = useState('');
  const [supervisorSearch, setSupervisorSearch] = useState('');
  const [entrySearch, setEntrySearch] = useState('');
  const [entryStatusFilter, setEntryStatusFilter] = useState('all');

  // Pagination
  const [studentPage, setStudentPage] = useState(1);
  const [supervisorPage, setSupervisorPage] = useState(1);

  // Assignment dialog
  const [assignDialog, setAssignDialog] = useState<any>(null);
  const [selectedSupervisorId, setSelectedSupervisorId] = useState('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [studentsData, supervisorsData, entriesData, statsData] = await Promise.all([
        getAllStudents(), getAllSupervisors(), getAllEntries(), getSystemStats(),
      ]);
      setStudents(studentsData || []);
      setSupervisors(supervisorsData || []);
      setAllEntries(entriesData || []);
      setRecentEntries((entriesData || []).slice(0, 10));
      setStats(statsData);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  const handleLogout = async () => { await signOut(); navigate('/'); };

  const handleAssign = async () => {
    if (!assignDialog || !selectedSupervisorId) return;
    setAssigning(true);
    try {
      await assignSupervisor(assignDialog.id, selectedSupervisorId);
      setAssignDialog(null);
      setSelectedSupervisorId('');
      await loadData();
    } catch (err: any) { setError(err.message); }
    finally { setAssigning(false); }
  };

  // Filtered lists
  const filteredStudents = useMemo(() => {
    if (!studentSearch) return students;
    const q = studentSearch.toLowerCase();
    return students.filter(s => s.full_name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) || s.department?.toLowerCase().includes(q));
  }, [students, studentSearch]);

  const filteredSupervisors = useMemo(() => {
    if (!supervisorSearch) return supervisors;
    const q = supervisorSearch.toLowerCase();
    return supervisors.filter(s => s.full_name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q));
  }, [supervisors, supervisorSearch]);

  const filteredEntries = useMemo(() => {
    let result = allEntries;
    if (entrySearch) {
      const q = entrySearch.toLowerCase();
      result = result.filter(e => e.title?.toLowerCase().includes(q) || e.student?.full_name?.toLowerCase().includes(q));
    }
    if (entryStatusFilter !== 'all') result = result.filter(e => e.status === entryStatusFilter);
    return result;
  }, [allEntries, entrySearch, entryStatusFilter]);

  // Pagination helpers
  const paginatedStudents = filteredStudents.slice((studentPage - 1) * ITEMS_PER_PAGE, studentPage * ITEMS_PER_PAGE);
  const studentTotalPages = Math.max(1, Math.ceil(filteredStudents.length / ITEMS_PER_PAGE));
  const paginatedSupervisors = filteredSupervisors.slice((supervisorPage - 1) * ITEMS_PER_PAGE, supervisorPage * ITEMS_PER_PAGE);
  const supervisorTotalPages = Math.max(1, Math.ceil(filteredSupervisors.length / ITEMS_PER_PAGE));

  // Analytics data
  const statusChartData = useMemo(() => [
    { name: 'Approved', value: allEntries.filter(e => e.status === 'Approved').length, color: '#22c55e' },
    { name: 'Pending', value: allEntries.filter(e => e.status === 'Pending').length, color: '#eab308' },
    { name: 'Rejected', value: allEntries.filter(e => e.status === 'Rejected').length, color: '#ef4444' },
  ], [allEntries]);

  const departmentChartData = useMemo(() => {
    const depts: Record<string, number> = {};
    allEntries.forEach(e => {
      const dept = e.student?.department || 'Unknown';
      depts[dept] = (depts[dept] || 0) + 1;
    });
    return Object.entries(depts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [allEntries]);

  const monthlyChartData = useMemo(() => {
    const months: Record<string, number> = {};
    allEntries.forEach(e => {
      const month = e.entry_date?.substring(0, 7) || 'Unknown';
      months[month] = (months[month] || 0) + 1;
    });
    return Object.entries(months).sort().slice(-6).map(([name, entries]) => ({ name, entries }));
  }, [allEntries]);

  const statCards = [
    { label: 'Total Students', value: stats.totalStudents, icon: Users, color: 'bg-blue-500' },
    { label: 'Active Supervisors', value: stats.totalSupervisors, icon: Users, color: 'bg-green-500' },
    { label: 'Pending Approvals', value: stats.pendingApprovals, icon: Clock, color: 'bg-yellow-500' },
    { label: 'Completed Logs', value: stats.completedLogs, icon: CheckCircle, color: 'bg-purple-500' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              {/* Admin Passport Photo or fallback icon */}
              <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 bg-blue-600">
                {profile?.passport_photo_url ? (
                  <img src={profile.passport_photo_url} alt={profile.full_name} className="w-full h-full object-cover" />
                ) : (
                  <BookOpen className="w-6 h-6 text-white" />
                )}
              </div>
              <div>
                <h1 className="text-xl text-gray-900">e-SIWES Admin</h1>
                <p className="text-xs text-gray-500">Management Dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <NotificationBell />
              <Link to="/profile"><Button variant="outline" size="sm"><User className="w-4 h-4" /></Button></Link>
              <Button onClick={handleLogout} variant="outline" className="gap-2"><LogOut className="w-4 h-4" /> Logout</Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <AlertCircle className="w-5 h-5" /><span>{error}</span>
            <button onClick={() => setError('')} className="ml-auto"><XCircle className="w-4 h-4" /></button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {statCards.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">{stat.label}</p>
                    <p className="text-3xl mt-2">{loading ? <Loader2 className="w-6 h-6 animate-spin" /> : stat.value}</p>
                  </div>
                  <div className={`w-12 h-12 ${stat.color} rounded-lg flex items-center justify-center`}>
                    <stat.icon className="w-6 h-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="students">Students</TabsTrigger>
            <TabsTrigger value="supervisors">Supervisors</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div><CardTitle>Recent Logbook Entries</CardTitle><CardDescription>Latest submissions from students</CardDescription></div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input placeholder="Search..." className="pl-9 w-48" value={entrySearch} onChange={(e) => setEntrySearch(e.target.value)} />
                    </div>
                    <Select value={entryStatusFilter} onValueChange={setEntryStatusFilter}>
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Approved">Approved</SelectItem>
                        <SelectItem value="Rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
                ) : (
                  <div className="space-y-3">
                    {(entrySearch || entryStatusFilter !== 'all' ? filteredEntries.slice(0, 20) : recentEntries).map((entry: any) => (
                      <div key={entry.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{entry.student?.full_name || 'Unknown'}</p>
                          <p className="text-xs text-gray-500">{entry.title}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500">{entry.entry_date}</span>
                          <Badge variant={entry.status === 'Approved' ? 'default' : 'secondary'}>{entry.status}</Badge>
                        </div>
                      </div>
                    ))}
                    {filteredEntries.length === 0 && <p className="text-center py-8 text-gray-500">No matching entries</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* STUDENTS TAB */}
          <TabsContent value="students">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div><CardTitle>Student Management</CardTitle><CardDescription>View all registered students</CardDescription></div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input placeholder="Search students..." className="pl-9 w-56" value={studentSearch} onChange={(e) => { setStudentSearch(e.target.value); setStudentPage(1); }} />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Supervisor</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedStudents.map((student: any) => {
                          const sup = supervisors.find((s: any) => s.id === student.supervisor_id);
                          return (
                            <TableRow key={student.id}>
                              <TableCell className="font-medium">{student.full_name}</TableCell>
                              <TableCell>{student.email}</TableCell>
                              <TableCell>{student.department || '—'}</TableCell>
                              <TableCell>{sup ? sup.full_name : <span className="text-gray-400">Unassigned</span>}</TableCell>
                              <TableCell>
                                <Button variant="outline" size="sm" className="gap-1" onClick={() => { setAssignDialog(student); setSelectedSupervisorId(student.supervisor_id || ''); }}>
                                  <UserPlus className="w-3 h-3" /> Assign
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    {studentTotalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t">
                        <p className="text-sm text-gray-500">Showing {(studentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(studentPage * ITEMS_PER_PAGE, filteredStudents.length)} of {filteredStudents.length}</p>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" disabled={studentPage === 1} onClick={() => setStudentPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                          <span className="text-sm">Page {studentPage}/{studentTotalPages}</span>
                          <Button variant="outline" size="sm" disabled={studentPage === studentTotalPages} onClick={() => setStudentPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SUPERVISORS TAB */}
          <TabsContent value="supervisors">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div><CardTitle>Supervisor Management</CardTitle><CardDescription>Active supervisors</CardDescription></div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input placeholder="Search supervisors..." className="pl-9 w-56" value={supervisorSearch} onChange={(e) => { setSupervisorSearch(e.target.value); setSupervisorPage(1); }} />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
                ) : paginatedSupervisors.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" /><p>No supervisors found</p>
                  </div>
                ) : (
                  <>
                    <Table>
                      <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Department</TableHead><TableHead>Students</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {paginatedSupervisors.map((sup: any) => {
                          const assignedCount = students.filter((s: any) => s.supervisor_id === sup.id).length;
                          return (
                            <TableRow key={sup.id}>
                              <TableCell className="font-medium">{sup.full_name}</TableCell>
                              <TableCell>{sup.email}</TableCell>
                              <TableCell>{sup.department || '—'}</TableCell>
                              <TableCell><Badge variant="secondary">{assignedCount}</Badge></TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    {supervisorTotalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t">
                        <p className="text-sm text-gray-500">Page {supervisorPage}/{supervisorTotalPages}</p>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" disabled={supervisorPage === 1} onClick={() => setSupervisorPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                          <Button variant="outline" size="sm" disabled={supervisorPage === supervisorTotalPages} onClick={() => setSupervisorPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ANALYTICS TAB */}
          <TabsContent value="analytics">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle>Entry Status Distribution</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={statusChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                        {statusChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Entries by Department</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={departmentChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader><CardTitle>Entries Over Time</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={monthlyChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="entries" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Assign Supervisor Dialog */}
        <Dialog open={!!assignDialog} onOpenChange={(open) => !open && setAssignDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign Supervisor</DialogTitle>
              <DialogDescription>Assign a supervisor to {assignDialog?.full_name}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Select Supervisor</Label>
                <Select value={selectedSupervisorId} onValueChange={setSelectedSupervisorId}>
                  <SelectTrigger><SelectValue placeholder="Choose a supervisor..." /></SelectTrigger>
                  <SelectContent>
                    {supervisors.map((sup: any) => (
                      <SelectItem key={sup.id} value={sup.id}>{sup.full_name} — {sup.department || 'No dept'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={!selectedSupervisorId || assigning} onClick={handleAssign}>
                  {assigning ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Assign'}
                </Button>
                <Button variant="outline" onClick={() => setAssignDialog(null)}>Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
