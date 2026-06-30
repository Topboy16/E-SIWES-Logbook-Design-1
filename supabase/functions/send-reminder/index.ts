// Supabase Edge Function: send-reminder
// Sends real emails via Resend and writes in-app notifications to the DB.
//
// Required secrets (set via `supabase secrets set`):
//   RESEND_API_KEY   – your Resend API key
//   SUPABASE_SERVICE_ROLE_KEY – auto-injected by Supabase at runtime
//   SUPABASE_URL              – auto-injected by Supabase at runtime
//   RESEND_FROM_EMAIL  – e.g. "E-SIWES <noreply@yourdomain.com>"

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReminderRecipient {
  id: string;
  email: string;
  full_name: string;
}

interface ReminderPayload {
  /** 'student' | 'supervisor' */
  role: 'student' | 'supervisor';
  recipients: ReminderRecipient[];
  subject: string;
  body: string;
}

// ─── HTML email template ─────────────────────────────────────────────────────
function buildHtml(recipientName: string, body: string, role: 'student' | 'supervisor') {
  const accentColor = role === 'student' ? '#2563eb' : '#7c3aed';
  const roleLabel = role === 'student' ? 'Student' : 'Supervisor';
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
          <!-- Header -->
          <tr>
            <td style="background:${accentColor};padding:28px 40px;text-align:center;">
              <p style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">📘 E-SIWES Logbook</p>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">${roleLabel} Reminder</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 12px;font-size:15px;color:#374151;">Hello, <strong>${recipientName}</strong>,</p>
              <div style="font-size:15px;color:#4b5563;line-height:1.7;white-space:pre-wrap;">${body}</div>
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #e5e7eb;" />
            </td>
          </tr>
          <!-- Footer -->
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

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const RESEND_FROM = Deno.env.get('RESEND_FROM_EMAIL') ?? 'E-SIWES <noreply@esiwes.com>';
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY secret not set' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Admin-client with service role (bypasses RLS for notification inserts)
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ─── AUTHORIZATION ──────────────────────────────────────────────────────────
    // This function sends real emails and writes notifications for arbitrary users via
    // the service-role key. Without this gate it is an open relay: any caller could spam
    // arbitrary inboxes and inject in-app notifications. Require a valid session whose
    // profile role is 'admin' before doing anything.
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: userData, error: userErr } = await adminClient.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: callerProfile, error: profileErr } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();
    if (profileErr || callerProfile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // ────────────────────────────────────────────────────────────────────────────

    const { payloads }: { payloads: ReminderPayload[] } = await req.json();

    const results: { role: string; emailsSent: number; emailsFailed: number; notifsSent: number }[] = [];

    for (const payload of payloads) {
      let emailsSent = 0;
      let emailsFailed = 0;
      let notifsSent = 0;

      await Promise.all(
        payload.recipients.map(async (recipient) => {
          // 1. Send real email via Resend
          try {
            const emailRes = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: RESEND_FROM,
                to: [recipient.email],
                subject: payload.subject,
                html: buildHtml(recipient.full_name, payload.body, payload.role),
              }),
            });
            if (emailRes.ok) {
              emailsSent++;
            } else {
              const errBody = await emailRes.text();
              console.error(`Email failed for ${recipient.email}:`, errBody);
              emailsFailed++;
            }
          } catch (e) {
            console.error(`Email exception for ${recipient.email}:`, e);
            emailsFailed++;
          }

          // 2. Insert in-app notification (best-effort — don't fail the whole batch)
          try {
            await adminClient.from('notifications').insert({
              user_id: recipient.id,
              title: payload.subject,
              message: payload.body,
              type: 'info',
              read: false,
            });
            notifsSent++;
          } catch (e) {
            console.warn('In-app notification insert failed:', e);
          }
        })
      );

      results.push({ role: payload.role, emailsSent, emailsFailed, notifsSent });
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
