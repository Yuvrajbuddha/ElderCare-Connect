import nodemailer from 'nodemailer';
import { Resend } from 'resend';

export type EmailProviderName = 'resend' | 'smtp' | 'unconfigured';

export type ReminderEmailType =
  | 'medication_due'
  | 'medication_missed'
  | 'appointment_24h'
  | 'appointment_2h'
  | 'test_email';

export interface EmailProviderStatus {
  configured: boolean;
  provider: EmailProviderName;
  fromAddress: string;
}

export interface SendEmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  ok: boolean;
  provider: EmailProviderName;
  messageId?: string;
  error?: string;
}

export function getEmailProviderStatus(): EmailProviderStatus {
  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  const smtpHost = (process.env.SMTP_HOST || '').trim();
  const smtpUser = (process.env.SMTP_USER || '').trim();
  const smtpPass = (process.env.SMTP_PASS || '').trim();

  if (resendKey) {
    return {
      configured: true,
      provider: 'resend',
      fromAddress: (process.env.EMAIL_FROM || 'CareConnect AI <onboarding@resend.dev>').trim(),
    };
  }

  if (smtpHost && smtpUser && smtpPass) {
    return {
      configured: true,
      provider: 'smtp',
      fromAddress: (process.env.EMAIL_FROM || process.env.SMTP_FROM || smtpUser).trim(),
    };
  }

  return {
    configured: false,
    provider: 'unconfigured',
    fromAddress: '',
  };
}

export async function sendEmail(payload: SendEmailPayload): Promise<SendEmailResult> {
  const status = getEmailProviderStatus();
  if (!status.configured) {
    return {
      ok: false,
      provider: 'unconfigured',
      error:
        'Email delivery is not configured on the server. Set RESEND_API_KEY (or SMTP_HOST, SMTP_USER, SMTP_PASS) in environment Secrets.',
    };
  }

  if (status.provider === 'resend') {
    try {
      const resend = new Resend((process.env.RESEND_API_KEY || '').trim());
      const response = await resend.emails.send({
        from: status.fromAddress,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      });

      if (response.error) {
        return {
          ok: false,
          provider: 'resend',
          error: response.error.message || 'Resend rejected the email request.',
        };
      }

      return {
        ok: true,
        provider: 'resend',
        messageId: response.data?.id || '',
      };
    } catch (error) {
      return {
        ok: false,
        provider: 'resend',
        error: error instanceof Error ? error.message : 'Unexpected Resend email error.',
      };
    }
  }

  try {
    const port = Number(process.env.SMTP_PORT || 587);
    const secure =
      String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
    const transporter = nodemailer.createTransport({
      host: (process.env.SMTP_HOST || '').trim(),
      port,
      secure,
      auth: {
        user: (process.env.SMTP_USER || '').trim(),
        pass: (process.env.SMTP_PASS || '').trim(),
      },
    });

    const info = await transporter.sendMail({
      from: status.fromAddress,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });

    return {
      ok: true,
      provider: 'smtp',
      messageId: info.messageId || '',
    };
  } catch (error) {
    return {
      ok: false,
      provider: 'smtp',
      error: error instanceof Error ? error.message : 'Unexpected SMTP email error.',
    };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function format12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export function buildCareConnectEmail(params: {
  type: ReminderEmailType;
  recipientName: string;
  patientName: string;
  appUrl: string;
  medicationName?: string;
  dosage?: string;
  scheduledTime?: string;
  instructions?: string;
  graceMinutes?: number;
  doctorName?: string;
  hospitalName?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  reason?: string;
}): Omit<SendEmailPayload, 'to'> {
  const recipient = escapeHtml(params.recipientName || 'Care Member');
  const patient = escapeHtml(params.patientName || 'Care Recipient');
  const appUrl = escapeHtml(params.appUrl || 'https://careconnect.ai');

  let badgeText = 'Care Reminder';
  let badgeBg = '#ECFDF5';
  let badgeColor = '#065F46';
  let subject = 'CareConnect AI Reminder';
  let headline = 'CareConnect AI Update';
  let intro = '';
  let rows: Array<{ label: string; value: string }> = [];
  let textLines: string[] = [];

  if (params.type === 'medication_due') {
    const med = params.medicationName || 'Scheduled Medicine';
    const dose = params.dosage || '';
    const timeLabel = format12h(params.scheduledTime || '');
    badgeText = 'Medication Due';
    subject = `Medication Due: ${med}${dose ? ` (${dose})` : ''} for ${params.patientName}`;
    headline = `Time for ${escapeHtml(med)}`;
    intro = `Hello ${recipient}, this is a friendly reminder that ${patient}'s scheduled medication dose is now due.`;
    rows = [
      { label: 'Patient', value: patient },
      { label: 'Medicine', value: `${escapeHtml(med)}${dose ? ` (${escapeHtml(dose)})` : ''}` },
      { label: 'Scheduled Time', value: escapeHtml(timeLabel) },
      ...(params.instructions
        ? [{ label: 'Instructions', value: escapeHtml(params.instructions) }]
        : []),
    ];
    textLines = [
      `CareConnect AI - Medication Due Reminder`,
      ``,
      `Hello ${params.recipientName},`,
      `${params.patientName}'s medication dose is now due:`,
      `- Medicine: ${med}${dose ? ` (${dose})` : ''}`,
      `- Scheduled Time: ${timeLabel}`,
      ...(params.instructions ? [`- Instructions: ${params.instructions}`] : []),
      ``,
      `Please confirm the dose in CareConnect AI: ${params.appUrl}`,
    ];
  } else if (params.type === 'medication_missed') {
    const med = params.medicationName || 'Scheduled Medicine';
    const dose = params.dosage || '';
    const timeLabel = format12h(params.scheduledTime || '');
    const grace = params.graceMinutes ?? 30;
    badgeText = 'Missed Medication Alert';
    badgeBg = '#FEF2F2';
    badgeColor = '#B91C1C';
    subject = `Missed Dose Alert: ${med} for ${params.patientName}`;
    headline = `Unconfirmed Medication Dose`;
    intro = `Hello ${recipient}, ${patient}'s scheduled medication dose was not confirmed within ${grace} minutes of its scheduled time and has been marked as missed.`;
    rows = [
      { label: 'Patient', value: patient },
      { label: 'Medicine', value: `${escapeHtml(med)}${dose ? ` (${escapeHtml(dose)})` : ''}` },
      { label: 'Scheduled Time', value: escapeHtml(timeLabel) },
      { label: 'Status', value: 'Missed (Unconfirmed)' },
    ];
    textLines = [
      `CareConnect AI - Missed Medication Alert`,
      ``,
      `Hello ${params.recipientName},`,
      `${params.patientName}'s dose was not confirmed within ${grace} minutes and has been marked as missed:`,
      `- Medicine: ${med}${dose ? ` (${dose})` : ''}`,
      `- Scheduled Time: ${timeLabel}`,
      ``,
      `Please check in or log the dose in CareConnect AI: ${params.appUrl}`,
    ];
  } else if (params.type === 'appointment_24h' || params.type === 'appointment_2h') {
    const isTwoHour = params.type === 'appointment_2h';
    const doctor = params.doctorName || 'Doctor';
    const hospital = params.hospitalName || 'Clinic / Hospital';
    const date = params.appointmentDate || '';
    const timeLabel = format12h(params.appointmentTime || '');
    const reason = params.reason || 'Doctor Visit';

    badgeText = isTwoHour ? 'Appointment in 2 Hours' : 'Appointment Tomorrow (24h)';
    badgeBg = isTwoHour ? '#FEF3C7' : '#ECFDF5';
    badgeColor = isTwoHour ? '#92400E' : '#065F46';
    subject = isTwoHour
      ? `Reminder: Appointment in 2 Hours with ${doctor} (${params.patientName})`
      : `Reminder: Appointment Tomorrow with ${doctor} (${params.patientName})`;
    headline = isTwoHour ? 'Doctor Visit in 2 Hours' : 'Upcoming Doctor Appointment Tomorrow';
    intro = isTwoHour
      ? `Hello ${recipient}, ${patient} has an upcoming doctor appointment in about 2 hours.`
      : `Hello ${recipient}, this is a 24-hour reminder for ${patient}'s upcoming doctor appointment.`;
    rows = [
      { label: 'Patient', value: patient },
      { label: 'Doctor Name', value: escapeHtml(doctor) },
      { label: 'Hospital Name', value: escapeHtml(hospital) },
      { label: 'Date & Time', value: `${escapeHtml(date)} at ${escapeHtml(timeLabel)}` },
      { label: 'Reason for Visit', value: escapeHtml(reason) },
    ];
    textLines = [
      `CareConnect AI - Appointment Reminder`,
      ``,
      `Hello ${params.recipientName},`,
      isTwoHour
        ? `${params.patientName} has a doctor appointment in 2 hours:`
        : `${params.patientName} has a doctor appointment tomorrow:`,
      `- Doctor: ${doctor}`,
      `- Hospital: ${hospital}`,
      `- Date & Time: ${date} at ${timeLabel}`,
      `- Reason: ${reason}`,
      ``,
      `View details in CareConnect AI: ${params.appUrl}`,
    ];
  } else {
    badgeText = 'Email System Verification';
    subject = 'CareConnect AI — Email Reminders Active';
    headline = 'Your Email Reminders Are Connected';
    intro = `Hello ${recipient}, this confirmation email verifies that CareConnect AI email reminders for ${patient}'s Care Circle are working properly.`;
    rows = [
      { label: 'Care Circle', value: patient },
      { label: 'Recipient', value: recipient },
      { label: 'Reminders Covered', value: 'Medication due/missed & 24h / 2h appointment alerts' },
    ];
    textLines = [
      `CareConnect AI - Email Reminders Active`,
      ``,
      `Hello ${params.recipientName},`,
      `This test email confirms that CareConnect AI email reminders for ${params.patientName} are configured and delivering properly.`,
      ``,
      `Manage your reminder preferences anytime in Settings: ${params.appUrl}`,
    ];
  }

  const rowsHtml = rows
    .map(
      (r) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #E5E7EB;color:#6B7280;font-size:14px;width:38%;vertical-align:top;">${r.label}</td>
        <td style="padding:10px 0;border-bottom:1px solid #E5E7EB;color:#111827;font-size:15px;font-weight:600;vertical-align:top;">${r.value}</td>
      </tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1F2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F3F4F6;padding:28px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;background-color:#FFFFFF;border-radius:16px;border:1px solid #E5E7EB;overflow:hidden;">
          <tr>
            <td style="background-color:#065F46;padding:22px 28px;">
              <span style="color:#FFFFFF;font-size:20px;font-weight:700;letter-spacing:-0.01em;">CareConnect AI</span>
              <div style="color:#D1FAE5;font-size:13px;margin-top:4px;">Elderly Healthcare &amp; Family Coordination</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <span style="display:inline-block;background-color:${badgeBg};color:${badgeColor};font-size:12px;font-weight:700;padding:6px 12px;border-radius:8px;">
                ${escapeHtml(badgeText)}
              </span>
              <h1 style="margin:16px 0 10px 0;font-size:22px;line-height:1.3;color:#111827;">
                ${headline}
              </h1>
              <p style="margin:0 0 22px 0;font-size:16px;line-height:1.6;color:#374151;">
                ${intro}
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F9FAFB;border:1px solid #E5E7EB;border-radius:12px;padding:8px 18px;">
                ${rowsHtml}
              </table>

              <div style="margin-top:24px;">
                <a href="${appUrl}" style="display:inline-block;background-color:#065F46;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:700;padding:12px 22px;border-radius:10px;">
                  Open CareConnect AI
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color:#F9FAFB;border-top:1px solid #E5E7EB;padding:16px 28px;font-size:12px;line-height:1.5;color:#6B7280;">
              You received this automated care reminder because email notifications are enabled in your CareConnect AI Settings. You can turn medication or appointment email reminders off anytime in Settings.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject,
    html,
    text: textLines.join('\n'),
  };
}
