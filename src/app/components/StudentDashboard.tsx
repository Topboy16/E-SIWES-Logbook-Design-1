import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  BookOpen, Plus, LogOut, Calendar as CalendarIcon, CheckCircle, Clock,
  FileText, Loader2, Trash2, Edit, AlertCircle, XCircle, Search,
  ChevronLeft, ChevronRight, User, TrendingUp, Zap, Download,
  Paperclip, Image as ImageIcon, X, Eye,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Progress } from "./ui/progress";
import { useAuth } from "../contexts/AuthContext";
import { getStudentEntries, createEntry, updateEntry, deleteEntry, getStudentStats, LogbookEntry } from "../services/logbookService";
import { getStudentFeedback } from "../services/feedbackService";
import { exportLogbookPDF } from "../services/pdfExport";
import NotificationBell from "./NotificationBell";
import { uploadFiles, validateFile, formatFileSize, isImageFile, Attachment } from "../services/fileUploadService";

const ENTRY_TEMPLATES = [
  { label: "Select a template...", value: "" },
  { label: "Software Development", value: "Worked on software development tasks including coding, testing, and debugging application features." },
  { label: "Database Management", value: "Performed database design, optimization and management tasks including writing queries and managing data." },
  { label: "Team Meeting", value: "Attended team meeting to discuss project progress, task assignments, and upcoming deadlines." },
  { label: "Training / Workshop", value: "Participated in a training session / workshop on relevant industry topics and best practices." },
  { label: "Documentation", value: "Prepared technical documentation, reports, and project records." },
  { label: "Research", value: "Conducted research on technologies, tools, and methodologies relevant to current projects." },
];

const ITEMS_PER_PAGE = 8;
const REQUIRED_ENTRIES = 120;

export default function StudentDashboard() {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();

  const [activeTab, setActiveTab] = useState("entries");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [entries, setEntries] = useState<LogbookEntry[]>([]);
  const [feedbackList, setFeedbackList] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalEntries: 0, approved: 0, pending: 0, totalHours: 0 });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [editingEntry, setEditingEntry] = useState<LogbookEntry | null>(null);
  const [newEntry, setNewEntry] = useState({ title: "", date: "", description: "", hours: "" });

  // File upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Blob URL previews for selected files (avoids memory leak from inline createObjectURL)
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = selectedFiles.map(f => f.type.startsWith('image/') ? URL.createObjectURL(f) : '');
    setFilePreviews(urls);
    return () => { urls.forEach(u => { if (u) URL.revokeObjectURL(u); }); };
  }, [selectedFiles]);

  // Search, filter, pagination state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);

  // Calendar state
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  useEffect(() => { if (user) loadData(); }, [user]);

  async function loadData() {
    setLoading(true);
    try {
      const [entriesData, statsData, feedbackData] = await Promise.all([
        getStudentEntries(user.id), getStudentStats(user.id), getStudentFeedback(user.id),
      ]);
      setEntries(entriesData);
      setStats(statsData);
      setFeedbackList(feedbackData);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  // Filtered + paginated entries
  const filteredEntries = useMemo(() => {
    let result = entries;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e => e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") {
      result = result.filter(e => e.status === statusFilter);
    }
    return result;
  }, [entries, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / ITEMS_PER_PAGE));
  const paginatedEntries = filteredEntries.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  useEffect(() => { setCurrentPage(1); }, [searchQuery, statusFilter]);

  // Calendar helpers
  function getLocalDateString(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const calendarEntryMap = useMemo(() => {
    const map: Record<string, LogbookEntry[]> = {};
    entries.forEach(e => {
      if (!map[e.entry_date]) map[e.entry_date] = [];
      map[e.entry_date].push(e);
    });
    return map;
  }, [entries]);

  function getCalendarDays() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  }

  function getDateString(day: number) {
    const y = calendarMonth.getFullYear();
    const m = String(calendarMonth.getMonth() + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // ---------- FILE UPLOAD HANDLERS ----------

  const handleFilesSelected = useCallback((files: FileList | File[]) => {
    setFileError("");
    const fileArray = Array.from(files);
    const validFiles: File[] = [];
    for (const file of fileArray) {
      const err = validateFile(file);
      if (err) { setFileError(err); return; }
      validFiles.push(file);
    }
    setSelectedFiles(prev => [...prev, ...validFiles].slice(0, 5)); // Max 5 files
  }, []);

  const removeSelectedFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeExistingAttachment = (id: string) => {
    setExistingAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  }, [handleFilesSelected]);

  // ---------- CRUD HANDLERS ----------

  const handleSubmitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const hoursWorked = parseInt(newEntry.hours) || 0;

      if (editingEntry) {
        // For edits, the entry already has a real database ID
        let newAttachments: Attachment[] = [];
        if (selectedFiles.length > 0) {
          newAttachments = await uploadFiles(user.id, editingEntry.id, selectedFiles);
        }
        const allAttachments = [...existingAttachments, ...newAttachments];
        const updates: any = {
          title: newEntry.title,
          description: newEntry.description,
          entry_date: newEntry.date,
          hours_worked: hoursWorked,
          attachments: allAttachments,
        };
        // Reset rejected entries back to Pending on resubmission
        if (editingEntry.status === 'Rejected') {
          updates.status = 'Pending';
        }
        await updateEntry(editingEntry.id, updates);
      } else {
        // For new entries, create first in the database to get a real database UUID (prevents orphaned files)
        const created = await createEntry(user.id, {
          title: newEntry.title,
          description: newEntry.description,
          entry_date: newEntry.date,
          hours_worked: hoursWorked,
          attachments: [],
        });

        // Now upload files using the real database entry ID
        if (selectedFiles.length > 0) {
          const newAttachments = await uploadFiles(user.id, created.id, selectedFiles);
          // Patch the entry with the uploaded files
          await updateEntry(created.id, {
            attachments: newAttachments,
          });
        }
      }
      setIsDialogOpen(false);
      setEditingEntry(null);
      setNewEntry({ title: "", date: "", description: "", hours: "" });
      setSelectedFiles([]);
      setExistingAttachments([]);
      await loadData();
    } catch (err: any) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!confirm("Are you sure you want to delete this entry?")) return;
    try { await deleteEntry(entryId); await loadData(); } catch (err: any) { setError(err.message); }
  };

  const handleEditEntry = (entry: LogbookEntry) => {
    setEditingEntry(entry);
    setNewEntry({ title: entry.title, date: entry.entry_date, description: entry.description, hours: entry.hours_worked.toString() });
    setExistingAttachments(entry.attachments || []);
    setSelectedFiles([]);
    setIsDialogOpen(true);
  };

  const handleLogout = async () => { await signOut(); navigate("/"); };

  function getStatusBadge(status: string) {
    switch (status) {
      case "Approved": return <Badge className="bg-green-500 text-white">{status}</Badge>;
      case "Rejected": return <Badge className="bg-red-500 text-white">{status}</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  }

  const progressPercent = Math.min(100, Math.round((stats.totalEntries / REQUIRED_ENTRIES) * 100));

  const statCards = [
    { label: "Total Entries", value: stats.totalEntries, icon: FileText, color: "bg-blue-500" },
    { label: "Approved", value: stats.approved, icon: CheckCircle, color: "bg-green-500" },
    { label: "Pending", value: stats.pending, icon: Clock, color: "bg-yellow-500" },
    { label: "Hours Logged", value: stats.totalHours, icon: CalendarIcon, color: "bg-purple-500" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl text-gray-900">e-SIWES Student Portal</h1>
                <p className="text-xs text-gray-500">Digital Logbook</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Dialog open={isDialogOpen} onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) { setEditingEntry(null); setNewEntry({ title: "", date: "", description: "", hours: "" }); setSelectedFiles([]); setExistingAttachments([]); setFileError(""); }
              }}>
                <DialogTrigger asChild>
                  <Button className="bg-blue-600 hover:bg-blue-700 gap-2"><Plus className="w-4 h-4" /> New Entry</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingEntry ? "Edit Logbook Entry" : "Create New Logbook Entry"}</DialogTitle>
                    <DialogDescription>{editingEntry ? "Update your entry details below" : "Record your daily activities"}</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmitEntry} className="space-y-4 mt-4">
                    {!editingEntry && (
                      <div className="space-y-2">
                        <Label>Quick Template</Label>
                        <Select onValueChange={(val) => { if (val) setNewEntry(prev => ({ ...prev, description: val })); }}>
                          <SelectTrigger><SelectValue placeholder="Select a template..." /></SelectTrigger>
                          <SelectContent>
                            {ENTRY_TEMPLATES.filter(t => t.value).map(t => (
                              <SelectItem key={t.label} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="date">Date</Label>
                      <Input id="date" type="date" value={newEntry.date} onChange={(e) => setNewEntry({ ...newEntry, date: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="title">Title</Label>
                      <Input id="title" placeholder="e.g., Database Design" value={newEntry.title} onChange={(e) => setNewEntry({ ...newEntry, title: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hours">Hours Worked</Label>
                      <Input id="hours" type="number" min="1" max="24" placeholder="8" value={newEntry.hours} onChange={(e) => setNewEntry({ ...newEntry, hours: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea id="description" placeholder="Describe what you learned..." rows={4} value={newEntry.description} onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })} required />
                    </div>

                    {/* File Upload Section */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Paperclip className="w-4 h-4" />
                        Attachments
                        <span className="text-xs text-gray-400 font-normal">(images, PDF, DOC — max 5MB each)</span>
                      </Label>

                      {/* Drop zone */}
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all ${
                          isDragging
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          accept="image/*,.pdf,.doc,.docx"
                          className="hidden"
                          onChange={(e) => e.target.files && handleFilesSelected(e.target.files)}
                        />
                        <div className="flex flex-col items-center gap-1">
                          <ImageIcon className="w-6 h-6 text-gray-400" />
                          <p className="text-sm text-gray-500">
                            {isDragging ? 'Drop files here...' : 'Click or drag files to upload'}
                          </p>
                          <p className="text-xs text-gray-400">Up to 5 files</p>
                        </div>
                      </div>

                      {fileError && (
                        <p className="text-xs text-red-500 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> {fileError}
                        </p>
                      )}

                      {/* Existing attachments (editing mode) */}
                      {existingAttachments.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs text-gray-500 font-medium">Current attachments:</p>
                          <div className="flex flex-wrap gap-2">
                            {existingAttachments.map((att) => (
                              <div key={att.id} className="group relative flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 text-xs">
                                {isImageFile(att.type) ? (
                                  <img src={att.url} alt={att.name} className="w-8 h-8 object-cover rounded" />
                                ) : (
                                  <FileText className="w-4 h-4 text-gray-500" />
                                )}
                                <span className="max-w-[100px] truncate">{att.name}</span>
                                <button
                                  type="button"
                                  onClick={() => removeExistingAttachment(att.id)}
                                  className="ml-1 text-gray-400 hover:text-red-500 transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* New file previews */}
                      {selectedFiles.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs text-gray-500 font-medium">New files to upload:</p>
                          <div className="flex flex-wrap gap-2">
                            {selectedFiles.map((file, idx) => (
                              <div key={idx} className="group relative flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs">
                                {filePreviews[idx] ? (
                                  <img src={filePreviews[idx]} alt={file.name} className="w-8 h-8 object-cover rounded" />
                                ) : (
                                  <FileText className="w-4 h-4 text-blue-500" />
                                )}
                                <div className="flex flex-col">
                                  <span className="max-w-[100px] truncate">{file.name}</span>
                                  <span className="text-gray-400">{formatFileSize(file.size)}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeSelectedFile(idx)}
                                  className="ml-1 text-gray-400 hover:text-red-500 transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={submitting}>
                      {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {selectedFiles.length > 0 ? 'Uploading & Saving...' : 'Saving...'}</> : editingEntry ? "Update Entry" : "Submit Entry"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
              <Button variant="outline" size="sm" className="gap-1" onClick={() => exportLogbookPDF(profile?.full_name || '', profile?.department || '', profile?.matric_number || '', profile?.email || '', entries, stats)}>
                <Download className="w-4 h-4" /> Export PDF
              </Button>
              <NotificationBell />
              <Link to="/profile">
                <Button variant="outline" size="sm"><User className="w-4 h-4" /></Button>
              </Link>
              <Button onClick={handleLogout} variant="outline" className="gap-2"><LogOut className="w-4 h-4" /> Logout</Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" /><span>{error}</span>
            <button onClick={() => setError("")} className="ml-auto"><XCircle className="w-4 h-4" /></button>
          </div>
        )}

        {/* Student Info + Progress */}
        <Card className="mb-8 border-blue-100 bg-gradient-to-r from-blue-50 to-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl mb-1">{profile?.full_name || "Student"}</h2>
                <p className="text-sm text-gray-600">Email: {profile?.email}</p>
                <p className="text-sm text-gray-600">Department: {profile?.department || "Not set"}</p>
              </div>
              <Badge className="bg-green-500">Active</Badge>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1 text-gray-600"><TrendingUp className="w-4 h-4" /> Progress</span>
                <span className="font-medium">{stats.totalEntries} / {REQUIRED_ENTRIES} entries ({progressPercent}%)</span>
              </div>
              <Progress value={progressPercent} className="h-3" />
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
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

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="entries">Logbook Entries</TabsTrigger>
            <TabsTrigger value="calendar">Calendar View</TabsTrigger>
            <TabsTrigger value="feedback">Supervisor Feedback</TabsTrigger>
          </TabsList>

          {/* ENTRIES TAB */}
          <TabsContent value="entries">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <CardTitle>My Logbook Entries</CardTitle>
                    <CardDescription>View and manage your daily logbook entries</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input placeholder="Search entries..." className="pl-9 w-48" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
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
                ) : paginatedEntries.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p className="text-lg mb-2">{searchQuery || statusFilter !== "all" ? "No matching entries" : "No entries yet"}</p>
                    <p className="text-sm">{searchQuery || statusFilter !== "all" ? "Try adjusting your filters" : 'Click "New Entry" to create your first logbook entry'}</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      {paginatedEntries.map((entry) => (
                        <div key={entry.id} className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-lg">{entry.title}</h3>
                                {getStatusBadge(entry.status)}
                              </div>
                              <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                                <span className="flex items-center gap-1"><CalendarIcon className="w-4 h-4" /> {entry.entry_date}</span>
                                <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {entry.hours_worked} hours</span>
                              </div>
                              <p className="text-sm text-gray-700">{entry.description}</p>
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
                                          className="relative group w-16 h-16 rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 transition-all hover:shadow-md"
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
                                          <FileText className="w-4 h-4 text-gray-500" />
                                          <span className="max-w-[120px] truncate">{att.name}</span>
                                          <span className="text-gray-400">{formatFileSize(att.size)}</span>
                                        </a>
                                      )
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                            {(entry.status === "Pending" || entry.status === "Rejected") && (
                              <div className="flex items-center gap-2 ml-4">
                                <Button variant="outline" size="sm" onClick={() => handleEditEntry(entry)}><Edit className="w-4 h-4" /></Button>
                                {entry.status === "Pending" && (
                                  <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => handleDeleteEntry(entry.id)}><Trash2 className="w-4 h-4" /></Button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-6 pt-4 border-t">
                        <p className="text-sm text-gray-500">Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredEntries.length)} of {filteredEntries.length}</p>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <span className="text-sm px-2">Page {currentPage} of {totalPages}</span>
                          <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* CALENDAR TAB */}
          <TabsContent value="calendar">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Calendar View</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm font-medium min-w-[140px] text-center">
                      {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs mt-2">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block"></span> Approved</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500 inline-block"></span> Pending</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block"></span> Rejected</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-200 inline-block"></span> No entry</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-1">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} className="text-center text-xs font-medium text-gray-500 py-2">{d}</div>
                  ))}
                  {getCalendarDays().map((day, i) => {
                    if (!day) return <div key={`empty-${i}`} className="h-12" />;
                    const dateStr = getDateString(day);
                    const dayEntries = calendarEntryMap[dateStr] || [];
                    const isToday = dateStr === getLocalDateString();
                    
                    let statusColor = 'bg-white hover:bg-gray-50';
                    if (dayEntries.length > 0) {
                      const allApproved = dayEntries.every(e => e.status === 'Approved');
                      const anyRejected = dayEntries.some(e => e.status === 'Rejected');
                      const anyPending = dayEntries.some(e => e.status === 'Pending');
                      
                      if (anyRejected) {
                        statusColor = 'bg-red-100 border-red-400 text-red-800';
                      } else if (anyPending) {
                        statusColor = 'bg-yellow-100 border-yellow-400 text-yellow-800';
                      } else if (allApproved) {
                        statusColor = 'bg-green-100 border-green-400 text-green-800';
                      }
                    }

                    const totalHoursWorked = dayEntries.reduce((sum, e) => sum + (Number(e.hours_worked) || 0), 0);

                    return (
                      <button key={day} onClick={() => {
                        if (dayEntries.length === 0) { 
                          setNewEntry({ title: "", date: dateStr, description: "", hours: "" }); 
                          setIsDialogOpen(true); 
                        }
                      }}
                        className={`h-12 rounded-lg border text-sm flex flex-col items-center justify-center transition-all ${statusColor} ${isToday ? 'ring-2 ring-blue-500' : ''}`}
                        title={dayEntries.length > 0 ? `${dayEntries.length} entries (${totalHoursWorked}h)` : 'Click to add entry'}
                      >
                        <span className="font-medium">{day}</span>
                        {dayEntries.length > 0 && <span className="text-[10px] truncate max-w-full px-1">{totalHoursWorked}h</span>}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* FEEDBACK TAB */}
          <TabsContent value="feedback">
            <Card>
              <CardHeader>
                <CardTitle>Supervisor Feedback</CardTitle>
                <CardDescription>Comments and suggestions from your supervisor</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
                ) : feedbackList.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" /><p>No feedback yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {feedbackList.map((fb: any) => (
                      <div key={fb.id} className="p-4 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-start gap-3">
                          <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                          <div>
                            <p className="text-sm mb-1">
                              <span className="font-medium">{fb.supervisor?.full_name || "Supervisor"}</span>{" "}
                              · {new Date(fb.created_at).toLocaleDateString()}
                            </p>
                            <p className="text-xs text-gray-500 mb-2">Re: {fb.entry?.title || "Entry"}</p>
                            <p className="text-sm text-gray-700">{fb.comment}</p>
                          </div>
                        </div>
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
