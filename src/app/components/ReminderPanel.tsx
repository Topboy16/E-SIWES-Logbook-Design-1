import { useState, useEffect, useCallback } from 'react';
import {
  Bell, Send, GraduationCap, UserCheck, Loader2,
  CheckCircle2, AlertTriangle, Mail, Users,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { supabase } from '../../supabase';
import {
  getStudentsMissingLogToday,
  getSupervisorsWithMoreThanOneStudent,
} from '../services/adminService';

// ─── Types ────────────────────────────────────────────────────────────────────

type StudentScope = 'all' | 'missing';

interface SendResult {
  role: 'student' | 'supervisor';
  emailsSent: number;
  emailsFailed: number;
  notifsSent: number;
}

interface ReminderPanelProps {
  students: any[];
  supervisors: any[];
}

// ─── Default message templates ────────────────────────────────────────────────

const DEFAULT_STUDENT_SUBJECT = '📋 Reminder: Fill Your Logbook Entry Today';
const DEFAULT_STUDENT_BODY =
  `Hi there,

This is a friendly reminder that you have SIWES activities to log today.

Please log into the E-SIWES portal and fill in your logbook entry before the day ends. Consistent and timely logging is a key part of your SIWES evaluation.

Stay on track — every day counts!

Regards,
E-SIWES Administration`;

const DEFAULT_SUPERVISOR_SUBJECT = '👀 Action Required: Review Your Assigned Students';
const DEFAULT_SUPERVISOR_BODY =
  `Dear Supervisor,

Please take a moment to check on your assigned SIWES students.

Some of them may have pending logbook entries awaiting your review and approval. Your timely feedback helps students stay motivated and on schedule.

Kindly log in to the E-SIWES portal to review their submissions.

Thank you,
E-SIWES Administration`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReminderPanel({ students, supervisors }: ReminderPanelProps) {
  // Student section
  const [studentScope, setStudentScope] = useState<StudentScope>('missing');
  const [studentSubject, setStudentSubject] = useState(DEFAULT_STUDENT_SUBJECT);
  const [studentBody, setStudentBody] = useState(DEFAULT_STUDENT_BODY);
  const [includeStudents, setIncludeStudents] = useState(true);

  // Supervisor section
  const [supervisorSubject, setSupervisorSubject] = useState(DEFAULT_SUPERVISOR_SUBJECT);
  const [supervisorBody, setSupervisorBody] = useState(DEFAULT_SUPERVISOR_BODY);
  const [includeSupervisors, setIncludeSupervisors] = useState(true);

  // Live recipient preview counts
  const [missingCount, setMissingCount] = useState<number | null>(null);
  const [qualifiedSupCount, setQualifiedSupCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);

  // Send state
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[] | null>(null);
  const [sendError, setSendError] = useState('');

  // Load live counts on mount
  const loadCounts = useCallback(async () => {
    setCountLoading(true);
    try {
      const [missing, qualSups] = await Promise.all([
        getStudentsMissingLogToday(),
        getSupervisorsWithMoreThanOneStudent(),
      ]);
      setMissingCount(missing.length);
      setQualifiedSupCount(qualSups.length);
    } catch {
      setMissingCount(null);
      setQualifiedSupCount(null);
    } finally {
      setCountLoading(false);
    }
  }, []);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  // Computed recipient count labels
  const studentCount = studentScope === 'all' ? students.length : (missingCount ?? '…');
  const supervisorCount = qualifiedSupCount ?? '…';

  const canSend = (includeStudents || includeSupervisors) && !sending;

  // ─── Send handler ─────────────────────────────────────────────────────────

  async function handleSendAll() {
    setSending(true);
    setSendError('');
    setResults(null);

    try {
      // Resolve actual recipient lists
      let studentRecipients: any[] = [];
      let supervisorRecipients: any[] = [];

      if (includeStudents) {
        studentRecipients =
          studentScope === 'all' ? students : await getStudentsMissingLogToday();
      }
      if (includeSupervisors) {
        supervisorRecipients = await getSupervisorsWithMoreThanOneStudent();
      }

      // Build payloads (only non-empty groups)
      const payloads = [];
      if (includeStudents && studentRecipients.length > 0) {
        payloads.push({
          role: 'student',
          recipients: studentRecipients.map((r) => ({
            id: r.id,
            email: r.email,
            full_name: r.full_name || r.email,
          })),
          subject: studentSubject,
          body: studentBody,
        });
      }
      if (includeSupervisors && supervisorRecipients.length > 0) {
        payloads.push({
          role: 'supervisor',
          recipients: supervisorRecipients.map((r) => ({
            id: r.id,
            email: r.email,
            full_name: r.full_name || r.email,
          })),
          subject: supervisorSubject,
          body: supervisorBody,
        });
      }

      if (payloads.length === 0) {
        setSendError('No eligible recipients found for the selected options.');
        setSending(false);
        return;
      }

      // Call edge function
      const { data, error } = await supabase.functions.invoke('send-reminder', {
        body: { payloads },
      });

      if (error) throw new Error(error.message);
      setResults(data.results as SendResult[]);
    } catch (err: any) {
      setSendError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setSending(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Header card */}
      <Card className="border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <Bell className="w-5 h-5" />
            Send Reminders
          </CardTitle>
          <CardDescription className="text-blue-700/70">
            Compose and send real email + in-app reminders to students and supervisors all at once.
            Only admins can trigger this.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* ── STUDENT SECTION ── */}
      <Card className={`transition-opacity ${!includeStudents ? 'opacity-60' : ''}`}>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-base">Students</CardTitle>
                <CardDescription className="text-xs">
                  {countLoading ? (
                    <span className="flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Counting…
                    </span>
                  ) : (
                    <>
                      <Badge variant="secondary" className="mr-1">{studentCount}</Badge>
                      will receive this reminder
                    </>
                  )}
                </CardDescription>
              </div>
            </div>
            {/* Include toggle */}
            <button
              onClick={() => setIncludeStudents((v) => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors ${includeStudents ? 'bg-blue-600' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${includeStudents ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Scope radio */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Who to remind</Label>
            <RadioGroup
              value={studentScope}
              onValueChange={(v) => setStudentScope(v as StudentScope)}
              className="gap-0"
            >
              <label className={`flex items-start gap-3 px-4 py-3 rounded-t-lg border cursor-pointer transition-colors
                ${studentScope === 'all' ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                <RadioGroupItem value="all" id="scope-all" className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium">All students</p>
                  <p className="text-xs text-gray-500">
                    Every registered student ({students.length} total)
                  </p>
                </div>
              </label>
              <label className={`flex items-start gap-3 px-4 py-3 rounded-b-lg border-x border-b cursor-pointer transition-colors
                ${studentScope === 'missing' ? 'bg-amber-50 border-amber-300 border' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                <RadioGroupItem value="missing" id="scope-missing" className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    Students without a log today
                    {missingCount !== null && (
                      <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 text-xs">
                        {missingCount} students
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    Only students with no entry filed today — skips those who already logged
                  </p>
                </div>
              </label>
            </RadioGroup>
          </div>

          {/* Message fields */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="s-subject" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Email Subject
              </Label>
              <input
                id="s-subject"
                type="text"
                value={studentSubject}
                onChange={(e) => setStudentSubject(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-body" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Message Body
              </Label>
              <Textarea
                id="s-body"
                value={studentBody}
                onChange={(e) => setStudentBody(e.target.value)}
                rows={7}
                className="resize-y text-sm font-mono leading-relaxed"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── SUPERVISOR SECTION ── */}
      <Card className={`transition-opacity ${!includeSupervisors ? 'opacity-60' : ''}`}>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center">
                <UserCheck className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <CardTitle className="text-base">Supervisors</CardTitle>
                <CardDescription className="text-xs">
                  {countLoading ? (
                    <span className="flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Counting…
                    </span>
                  ) : (
                    <>
                      <Badge variant="secondary" className="mr-1">{supervisorCount}</Badge>
                      supervisors with &gt;1 assigned student
                    </>
                  )}
                </CardDescription>
              </div>
            </div>
            {/* Include toggle */}
            <button
              onClick={() => setIncludeSupervisors((v) => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors ${includeSupervisors ? 'bg-purple-600' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${includeSupervisors ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Scope info (fixed rule: > 1 student) */}
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-purple-50 border border-purple-100">
            <Users className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-purple-700">
              Only supervisors with <strong>more than 1 assigned student</strong> will receive this reminder.
              Supervisors with 0 or 1 student are excluded.
            </p>
          </div>

          {/* Message fields */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sup-subject" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Email Subject
              </Label>
              <input
                id="sup-subject"
                type="text"
                value={supervisorSubject}
                onChange={(e) => setSupervisorSubject(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-body" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Message Body
              </Label>
              <Textarea
                id="sup-body"
                value={supervisorBody}
                onChange={(e) => setSupervisorBody(e.target.value)}
                rows={7}
                className="resize-y text-sm font-mono leading-relaxed"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── SEND ALL BUTTON ── */}
      <div className="flex flex-col gap-4">
        {sendError && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p className="text-sm">{sendError}</p>
          </div>
        )}

        <Button
          onClick={handleSendAll}
          disabled={!canSend}
          size="lg"
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white gap-2 shadow-md"
        >
          {sending ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Sending reminders…</>
          ) : (
            <><Mail className="w-5 h-5" /><Send className="w-4 h-4" /> Send All Reminders Now</>
          )}
        </Button>

        {/* Result summary */}
        {results && results.length > 0 && (
          <div className="rounded-xl border border-green-200 bg-green-50 divide-y divide-green-100 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              <p className="text-sm font-semibold text-green-800">Reminders dispatched successfully</p>
            </div>
            {results.map((r) => (
              <div key={r.role} className="px-4 py-3 flex items-center gap-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${r.role === 'student' ? 'bg-blue-100' : 'bg-purple-100'}`}>
                  {r.role === 'student'
                    ? <GraduationCap className="w-4 h-4 text-blue-600" />
                    : <UserCheck className="w-4 h-4 text-purple-600" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 capitalize">{r.role}s</p>
                  <p className="text-xs text-gray-500">
                    {r.emailsSent} email{r.emailsSent !== 1 ? 's' : ''} sent
                    {r.emailsFailed > 0 && ` · ${r.emailsFailed} failed`}
                    {' · '}{r.notifsSent} in-app notification{r.notifsSent !== 1 ? 's' : ''}
                  </p>
                </div>
                {r.emailsFailed === 0
                  ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                  : <AlertTriangle className="w-4 h-4 text-amber-500" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
