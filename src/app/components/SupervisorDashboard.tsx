import { useState, useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  BookOpen, Users, LogOut, CheckCircle, Clock, MessageSquare,
  TrendingUp, Loader2, AlertCircle, XCircle, Search, User,
  ChevronLeft, ChevronRight, History, CheckSquare,
  Paperclip, Eye, X, FileText as FileTextIcon,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Checkbox } from "./ui/checkbox";
import { useAuth } from "../contexts/AuthContext";
import {
  getSupervisorPendingEntries,
  updateEntryStatus,
  addFeedback,
  getSupervisorStudents,
  getSupervisorReviewedEntries
} from "../services/feedbackService";
import { createNotification } from "../services/notificationService";
import NotificationBell from "./NotificationBell";
import { isImageFile, formatFileSize } from "../services/fileUploadService";

const ITEMS_PER_PAGE = 8;

export default function SupervisorDashboard() {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();

  const [activeTab, setActiveTab] = useState("pending");
  const [pendingEntries, setPendingEntries] = useState<any[]>([]);
  const [reviewedEntries, setReviewedEntries] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isRejectMode, setIsRejectMode] = useState(false);

  // Search & filter
  const [pendingSearch, setPendingSearch] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyFilter, setHistoryFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);

  // Batch select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  // Image preview
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => { if (user) loadData(); }, [user]);

  async function loadData() {
    setLoading(true);
    try {
      const [entriesData, studentsData, reviewedData] = await Promise.all([
        getSupervisorPendingEntries(user.id),
        getSupervisorStudents(user.id),
        getSupervisorReviewedEntries(user.id),
      ]);
      setPendingEntries(entriesData);
      setStudents(studentsData);
      setReviewedEntries(reviewedData);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  const handleApprove = async (entryId: string) => {
    setActionLoading(entryId);
    try {
      await updateEntryStatus(entryId, 'Approved');
      const entry = pendingEntries.find(e => e.id === entryId);
      if (entry) {
        await createNotification(entry.student_id, 'Entry Approved', `Your entry "${entry.title}" has been approved.`, 'approval', entryId);
      }
      await loadData();
    } catch (err: any) { setError(err.message); }
    finally { setActionLoading(null); }
  };

  const handleRequestRevisionClick = (entry: any) => {
    setSelectedEntry(entry);
    setIsRejectMode(true);
    setFeedback("");
  };

  const handleFeedbackClick = (entry: any) => {
    setSelectedEntry(entry);
    setIsRejectMode(false);
    setFeedback("");
  };

  const handleBatchApprove = async () => {
    if (selectedIds.size === 0) return;
    setBatchLoading(true);
    try {
      await Promise.all(Array.from(selectedIds).map(async (id) => {
        await updateEntryStatus(id, 'Approved');
        const entry = pendingEntries.find(e => e.id === id);
        if (entry) {
          await createNotification(entry.student_id, 'Entry Approved', `Your entry "${entry.title}" has been approved.`, 'approval', id);
        }
      }));
      setSelectedIds(new Set());
      await loadData();
    } catch (err: any) { setError(err.message); }
    finally { setBatchLoading(false); }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredPending.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPending.map(e => e.id)));
    }
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntry || !feedback.trim()) return;
    setActionLoading(selectedEntry.id);
    try {
      await addFeedback(selectedEntry.id, user.id, feedback.trim());
      if (isRejectMode) {
        await updateEntryStatus(selectedEntry.id, 'Rejected');
        await createNotification(selectedEntry.student_id, 'Entry Rejected', `Your entry "${selectedEntry.title}" needs revision. Check supervisor feedback for details.`, 'rejection', selectedEntry.id);
      } else {
        await createNotification(selectedEntry.student_id, 'New Feedback', `You received feedback on "${selectedEntry.title}".`, 'feedback', selectedEntry.id);
      }
      setFeedback("");
      setSelectedEntry(null);
      await loadData();
    } catch (err: any) { setError(err.message); }
    finally { setActionLoading(null); }
  };

  const handleLogout = async () => { await signOut(); navigate("/"); };

  // Filtered lists
  const filteredPending = useMemo(() => {
    if (!pendingSearch) return pendingEntries;
    const q = pendingSearch.toLowerCase();
    return pendingEntries.filter(e => e.title?.toLowerCase().includes(q) || e.student_name?.toLowerCase().includes(q));
  }, [pendingEntries, pendingSearch]);

  const filteredHistory = useMemo(() => {
    let result = reviewedEntries;
    if (historySearch) {
      const q = historySearch.toLowerCase();
      result = result.filter(e => e.title?.toLowerCase().includes(q) || e.student_name?.toLowerCase().includes(q));
    }
    if (historyFilter !== 'all') result = result.filter(e => e.status === historyFilter);
    return result;
  }, [reviewedEntries, historySearch, historyFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / ITEMS_PER_PAGE));
  const paginatedHistory = filteredHistory.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const approvedToday = reviewedEntries.filter(e => {
    const today = new Date().toISOString().split('T')[0];
    return e.status === 'Approved' && e.updated_at?.startsWith(today);
  }).length;

  const stats = [
    { label: "Assigned Students", value: students.length, icon: Users, color: "bg-blue-500" },
    { label: "Pending Reviews", value: pendingEntries.length, icon: Clock, color: "bg-yellow-500" },
    { label: "Approved Today", value: approvedToday, icon: CheckCircle, color: "bg-green-500" },
    { label: "Total Reviewed", value: reviewedEntries.length, icon: TrendingUp, color: "bg-purple-500" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl text-gray-900">e-SIWES Supervisor Portal</h1>
                <p className="text-xs text-gray-500">Review & Approve</p>
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
            <button onClick={() => setError("")} className="ml-auto"><XCircle className="w-4 h-4" /></button>
          </div>
        )}

        <Card className="mb-8 border-green-100 bg-gradient-to-r from-green-50 to-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl mb-1">{profile?.full_name || "Supervisor"}</h2>
                <p className="text-sm text-gray-600">Email: {profile?.email}</p>
                <p className="text-sm text-gray-600">Department: {profile?.department || "Not set"}</p>
              </div>
              <Badge className="bg-green-500">Active Supervisor</Badge>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat) => (
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
            <TabsTrigger value="pending">Pending ({pendingEntries.length})</TabsTrigger>
            <TabsTrigger value="history">Review History</TabsTrigger>
            <TabsTrigger value="students">My Students</TabsTrigger>
          </TabsList>

          {/* PENDING TAB */}
          <TabsContent value="pending">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div><CardTitle>Pending Logbook Entries</CardTitle><CardDescription>Review and approve student submissions</CardDescription></div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input placeholder="Search..." className="pl-9 w-48" value={pendingSearch} onChange={(e) => setPendingSearch(e.target.value)} />
                    </div>
                    {selectedIds.size > 0 && (
                      <Button className="bg-green-600 hover:bg-green-700 gap-2" disabled={batchLoading} onClick={handleBatchApprove}>
                        {batchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
                        Approve ({selectedIds.size})
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-green-600" /></div>
                ) : filteredPending.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <CheckCircle className="w-12 h-12 mx-auto mb-4 text-gray-300" /><p>No pending entries to review</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredPending.length > 1 && (
                      <div className="flex items-center gap-2 pb-2 border-b">
                        <Checkbox checked={selectedIds.size === filteredPending.length} onCheckedChange={toggleSelectAll} />
                        <span className="text-sm text-gray-500">Select all</span>
                      </div>
                    )}
                    {filteredPending.map((entry: any) => (
                      <div key={entry.id} className="p-6 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                        <div className="flex items-start gap-3">
                          <Checkbox checked={selectedIds.has(entry.id)} onCheckedChange={() => toggleSelect(entry.id)} className="mt-1" />
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-lg">{entry.title}</h3>
                              <Badge variant="secondary">Pending Review</Badge>
                            </div>
                            <p className="text-sm text-gray-600 mb-1">Student: {entry.student_name}</p>
                            <p className="text-sm text-gray-600 mb-3">Date: {entry.entry_date} • Hours: {entry.hours_worked}</p>
                            <p className="text-sm text-gray-700 leading-relaxed">{entry.description}</p>
                            {/* Attachments display */}
                            {entry.attachments && entry.attachments.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-gray-100">
                                <p className="text-xs text-gray-500 flex items-center gap-1 mb-2">
                                  <Paperclip className="w-3 h-3" /> {entry.attachments.length} attachment{entry.attachments.length > 1 ? 's' : ''}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {entry.attachments.map((att: any) => (
                                    isImageFile(att.type) ? (
                                      <button
                                        key={att.id}
                                        type="button"
                                        onClick={() => setPreviewImage(att.url)}
                                        className="relative group w-16 h-16 rounded-lg overflow-hidden border border-gray-200 hover:border-green-400 transition-all hover:shadow-md"
                                      >
                                        <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                                          <Eye className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                      </button>
                                    ) : (
                                      <a
                                        key={att.id}
                                        href={att.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-2 text-xs transition-colors"
                                      >
                                        <FileTextIcon className="w-4 h-4 text-gray-500" />
                                        <span className="max-w-[120px] truncate">{att.name}</span>
                                        <span className="text-gray-400">{formatFileSize(att.size)}</span>
                                      </a>
                                    )
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 pt-4 mt-4 border-t ml-7">
                          <Button onClick={() => handleApprove(entry.id)} className="bg-green-600 hover:bg-green-700 gap-2" disabled={actionLoading === entry.id}>
                            {actionLoading === entry.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Approve
                          </Button>
                          <Button onClick={() => handleRequestRevisionClick(entry)} variant="outline" className="border-red-300 text-red-600 hover:bg-red-50" disabled={actionLoading === entry.id}>
                            Request Revision
                          </Button>
                          <Button variant="outline" className="gap-2" onClick={() => handleFeedbackClick(entry)} disabled={actionLoading === entry.id}>
                            <MessageSquare className="w-4 h-4" /> Feedback
                          </Button>
                          <Dialog open={selectedEntry?.id === entry.id} onOpenChange={(open) => !open && setSelectedEntry(null)}>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>{isRejectMode ? "Request Revision & Reject" : "Add Supervisor Feedback"}</DialogTitle>
                                <DialogDescription>
                                  {isRejectMode 
                                    ? `Please explain what needs to be corrected in "${entry.title}". This will reject the entry and notify the student.` 
                                    : `Provide feedback comments to ${entry.student_name} for "${entry.title}".`}
                                </DialogDescription>
                              </DialogHeader>
                              <form onSubmit={handleSubmitFeedback} className="space-y-4 mt-4">
                                <div className="space-y-2">
                                  <Label htmlFor="feedback">Comments / Directions</Label>
                                  <Textarea 
                                    id="feedback" 
                                    placeholder={isRejectMode ? "Explain what needs to be changed (required)..." : "Enter your comments..."} 
                                    rows={5} 
                                    value={feedback} 
                                    onChange={(e) => setFeedback(e.target.value)} 
                                    required 
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <Button type="submit" className={`flex-1 ${isRejectMode ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`} disabled={actionLoading !== null}>
                                    {actionLoading !== null ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                    {isRejectMode ? "Reject & Send Comments" : "Submit Feedback"}
                                  </Button>
                                  <Button type="button" variant="outline" onClick={() => setSelectedEntry(null)}>Cancel</Button>
                                </div>
                              </form>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* REVIEW HISTORY TAB */}
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div><CardTitle>Review History</CardTitle><CardDescription>Previously reviewed entries</CardDescription></div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input placeholder="Search..." className="pl-9 w-48" value={historySearch} onChange={(e) => { setHistorySearch(e.target.value); setCurrentPage(1); }} />
                    </div>
                    <Select value={historyFilter} onValueChange={(v) => { setHistoryFilter(v); setCurrentPage(1); }}>
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="Approved">Approved</SelectItem>
                        <SelectItem value="Rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-green-600" /></div>
                ) : paginatedHistory.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <History className="w-12 h-12 mx-auto mb-4 text-gray-300" /><p>No reviewed entries found</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      {paginatedHistory.map((entry: any) => (
                        <div key={entry.id} className="p-4 border border-gray-200 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <h3 className="font-medium">{entry.title}</h3>
                              <p className="text-sm text-gray-500">{entry.student_name} • {entry.entry_date}</p>
                            </div>
                            <Badge className={entry.status === 'Approved' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}>{entry.status}</Badge>
                          </div>
                          <p className="text-sm text-gray-600 line-clamp-2">{entry.description}</p>
                        </div>
                      ))}
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t">
                        <p className="text-sm text-gray-500">Page {currentPage}/{totalPages}</p>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                          <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* MY STUDENTS TAB */}
          <TabsContent value="students">
            <Card>
              <CardHeader><CardTitle>Assigned Students</CardTitle><CardDescription>Students under your supervision</CardDescription></CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-green-600" /></div>
                ) : students.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" /><p>No students assigned yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {students.map((student: any) => (
                      <div key={student.id} className="p-4 border border-gray-200 rounded-lg">
                        <h3 className="text-lg mb-1">{student.full_name}</h3>
                        <p className="text-sm text-gray-600">{student.department || "No department"}</p>
                        <p className="text-sm text-gray-600">{student.email}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Image Preview Lightbox */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-3xl max-h-[85vh] mx-4" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-600 hover:text-gray-900 hover:scale-110 transition-all z-10"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={previewImage}
              alt="Attachment preview"
              className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
