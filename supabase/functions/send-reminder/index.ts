// Supabase Edge Function: send-reminder (v2 — Security Hardened)
// Sends real emails via Resend and writes in-app notifications to the DB.
//
// Changes from v1:
//   - HTML escaping: all user-supplied strings are escaped before insertion
//     into the email template (prevents HTML/link injection by an admin).
//   - Server-side recipient resolution: client sends a SCOPE ('all_students',
//     'all_supervisors', 'missing_log') instead of a full recipient list.
//     The server queries the database itself — the client never controls who
//     gets emailed.
//   - Batch cap: maximum 200 recipients per scope to prevent runaway sends.
//
// Required secrets (set via `supabase secrets set`):
//   RESEND_API_KEY             – your Resend API key
//   RESEND_FROM_EMAIL          – e.g. "E-SIWES <noreply@yourdomain.com>"
//   SUPABASE_SERVICE_ROLE_KEY  – auto-injected by Supabase at runtime
//   SUPABASE_URL               – auto-injected by Supabase at runtime

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_RECIPIENTS = 200;

// ─── HTML escaping ────────────────────────────────────────────────────────────
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Email template ───────────────────────────────────────────────────────────
function buildHtml(recipientName: string, body: string, role: 'student' | 'supervisor') {
  const accentColor = role === 'student' ? '#2563eb' : '#7c3aed';
  const roleLabel   = role === 'student' ? 'Student' : 'Supervisor';
  // All dynamic values are escaped before insertion
  const safeName = escapeHtml(recipientName);
  const safeBody = escapeHtml(body).replace(/\n/g, '<br/>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>E-SIWES Reminder</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:${accentColor};padding:28px 40px;text-align:center;">
              <p style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">E-SIWES Logbook</p>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">${escapeHtml(roleLabel)} Reminder</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 12px;font-size:15px;color:#374151;">Hello, <strong>${safeName}</strong>,</p>
              <div style="font-size:15px;color:#4b5563;line-height:1.7;">${safeBody}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #e5e7eb;" />
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                This is an automated reminder from the E-SIWES Logbook system.<br/>
                Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Scope types ──────────────────────────────────────────────────────────────
type Scope = 'all_students' | 'all_supervisors' | 'missing_log';

interface ReminderRequest {
  studentScope?: 'all_students' | 'missing_log';   // undefined = don't send to students
  supervisorScope?: 'all_supervisors';              // undefined = don't send to supervisors
  studentSubject: string;
  studentBody: string;
  supervisorSubject: string;
  supervisorBody: string;
}

interface Recipient {
  id: string;
  email: string;
  full_name: string;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const RESEND_FROM    = Deno.env.get('RESEND_FROM_EMAIL') ?? 'E-SIWES <noreply@esiwes.com>';
    const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY secret not set' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── Authorization: must be an admin ──────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: userData, error: userErr } = await adminClient.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: callerProfile, error: profileErr } = await adminClient
      .from('profiles').select('role').eq('id', userData.user.id).single();
    if (profileErr || callerProfile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    const body: ReminderRequest = await req.json();

    const results: { scope: Scope; emailsSent: number; emailsFailed: number; notifsSent: number }[] = [];

    // ── Helper: send one batch ────────────────────────────────────────────────
    async function sendBatch(
      scope: Scope,
      recipients: Recipient[],
      subject: string,
      messageBody: string,
      role: 'student' | 'supervisor'
    ) {
      // Cap at MAX_RECIPIENTS
      const capped = recipients.slice(0, MAX_RECIPIENTS);
      let emailsSent = 0, emailsFailed = 0, notifsSent = 0;

      await Promise.all(capped.map(async (r) => {
        // 1. Email via Resend
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: RESEND_FROM,
              to: [r.email],
              subject: escapeHtml(subject),
              html: buildHtml(r.full_name, messageBody, role),
            }),
          });
          if (res.ok) { emailsSent++; }
          else {
            console.error(`Email failed for ${r.email}:`, await res.text());
            emailsFailed++;
          }
        } catch (e) {
          console.error(`Email exception for ${r.email}:`, e);
          emailsFailed++;
        }

        // 2. In-app notification (best-effort)
        try {
          await adminClient.from('notifications').insert({
            user_id: r.id,
            title: subject,
            message: messageBody,
            type: 'info',
            read: false,
          });
          notifsSent++;
        } catch (e) {
          console.warn('Notification insert failed:', e);
        }
      }));

      results.push({ scope, emailsSent, emailsFailed, notifsSent });
    }

    // ── Resolve recipients server-side by scope ───────────────────────────────

    // Student scopes
    if (body.studentScope === 'all_students') {
      const { data } = await adminClient
        .from('profiles')
        .select('id, email, full_name')
        .eq('role', 'student')
        .limit(MAX_RECIPIENTS);
      if (data && data.length > 0) {
        await sendBatch('all_students', data, body.studentSubject, body.studentBody, 'student');
      }
    }

    if (body.studentScope === 'missing_log') {
      const today = new Date().toISOString().split('T')[0];
      // Students who have NOT filed an entry today
      const { data: allStudents } = await adminClient
        .from('profiles').select('id, email, full_name').eq('role', 'student').limit(MAX_RECIPIENTS);
      const { data: filedToday } = await adminClient
        .from('logbook_entries').select('student_id').gte('entry_date', today).lte('entry_date', today);

      const filedIds = new Set((filedToday || []).map((e: any) => e.student_id));
      const missing = (allStudents || []).filter((s: any) => !filedIds.has(s.id));

      if (missing.length > 0) {
        await sendBatch('missing_log', missing, body.studentSubject, body.studentBody, 'student');
      }
    }

    // ── Single assignment notification ────────────────────────────────────────
    if ((body as any).assignmentNotification) {
      const { studentId, supervisorId } = (body as any).assignmentNotification;
      const { data: student } = await adminClient.from('profiles').select('id, email, full_name').eq('id', studentId).single();
      const { data: supervisor } = await adminClient.from('profiles').select('full_name, organization, department').eq('id', supervisorId).single();

      if (student && supervisor) {
        const supervisorLabel = supervisor.organization || supervisor.department || 'e-SIWES Supervisor';
        const subject = `🎓 Supervisor Assigned: ${supervisor.full_name}`;
        const messageBody = `Hello ${student.full_name || student.email},\n\nYou have been assigned to supervisor ${supervisor.full_name} (${supervisorLabel}) for your SIWES industrial training.\n\nPlease log in to your e-SIWES account to view your assignment status and record your daily logbook entries.`;

        await sendBatch('all_students', [student], subject, messageBody, 'student');
      }
    }

    // Supervisor scope
    if (body.supervisorScope === 'all_supervisors') {
      // Supervisors who have at least one assigned student
      const { data: sups } = await adminClient
        .from('profiles')
        .select('id, email, full_name')
        .eq('role', 'supervisor')
        .limit(MAX_RECIPIENTS);

      // Filter to those with >0 assigned students
      const qualifiedSups: Recipient[] = [];
      for (const sup of sups || []) {
        const { count } = await adminClient
          .from('profiles').select('*', { count: 'exact', head: true })
          .eq('supervisor_id', sup.id).eq('role', 'student');
        if ((count ?? 0) > 0) qualifiedSups.push(sup);
      }

      if (qualifiedSups.length > 0) {
        await sendBatch('all_supervisors', qualifiedSups, body.supervisorSubject, body.supervisorBody, 'supervisor');
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
