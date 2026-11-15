import crypto from 'node:crypto';
import cron, { type ScheduledTask } from 'node-cron';
import {
  buildCareConnectEmail,
  getEmailProviderStatus,
  sendEmail,
  type ReminderEmailType,
} from './emailService.js';
import {
  createFirestoreDocWithServerTime,
  getFirestoreDoc,
  getServiceAccountAccessToken,
  listFirestoreCollection,
  updateFirestoreDocWithServerTime,
} from './firestoreRest.js';

interface RegisteredCircleSession {
  circleId: string;
  idToken: string;
  uid: string;
  timeZone: string;
  expMs: number;
}

interface CircleRecord {
  id: string;
  patientName: string;
  ownerId: string;
  memberIds: string[];
}

interface MemberRecord {
  uid: string;
  displayName: string;
  email: string;
  memberRole: 'patient' | 'family' | 'caretaker';
  permissions?: Record<string, boolean>;
  medicationEmailReminders?: boolean;
  appointmentEmailReminders?: boolean;
}

interface MedicationRecord {
  id: string;
  name: string;
  dosage: string;
  scheduledTimes: string[];
  instructions?: string;
  status: string;
}

interface MedicationLogRecord {
  id: string;
  medicationId: string;
  dateKey: string;
  scheduledTime: string;
  status: string;
}

interface AppointmentRecord {
  id: string;
  title: string;
  doctorName: string;
  clinicName?: string;
  appointmentDate: string;
  appointmentTime: string;
  status: string;
}

export interface ProcessCircleSummary {
  circleId: string;
  emailsSent: number;
  emailsFailed: number;
  dosesMarkedMissed: number;
  skippedDuplicates: number;
}

const activeSessions = new Map<string, RegisteredCircleSession>();
const inFlightDeliveries = new Set<string>();
let cronTask: ScheduledTask | null = null;
let cronRunning = false;

export function getGracePeriodMinutes(): number {
  const parsed = Number(process.env.MEDICATION_GRACE_PERIOD_MINUTES || 30);
  if (Number.isNaN(parsed)) return 30;
  return Math.max(5, Math.min(240, Math.round(parsed)));
}

function getAppUrl(): string {
  return (process.env.APP_URL || 'https://careconnect.ai').trim();
}

function normalizeTimeZone(tz?: string): string {
  const candidate = (tz || '').trim();
  if (!candidate) return 'America/Los_Angeles';
  try {
    Intl.DateTimeFormat('en-US', { timeZone: candidate });
    return candidate;
  } catch {
    return 'America/Los_Angeles';
  }
}

function getZonedDateTimeParts(date: Date, timeZone: string): { dateKey: string; minutesOfDay: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const dateKey = `${map.year}-${map.month}-${map.day}`;
  const hour = Number(map.hour) % 24;
  const minute = Number(map.minute);
  return { dateKey, minutesOfDay: hour * 60 + minute };
}

function parseHHMMToMinutes(hhmm: string): number | null {
  const match = String(hhmm || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function getZonedLocalEpochMs(dateKey: string, hhmm: string, timeZone: string): number | null {
  const dateMatch = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const mins = parseHHMMToMinutes(hhmm);
  if (!dateMatch || mins === null) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Math.floor(mins / 60);
  const minute = mins % 60;

  const targetUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const guessParts = getZonedDateTimeParts(new Date(targetUtc), timeZone);
  const [gy, gm, gd] = guessParts.dateKey.split('-').map(Number);
  const guessWallUtc = Date.UTC(
    gy,
    gm - 1,
    gd,
    Math.floor(guessParts.minutesOfDay / 60),
    guessParts.minutesOfDay % 60,
    0,
    0,
  );
  return targetUtc + (targetUtc - guessWallUtc);
}

function makeDeliveryId(prefix: string, rawKey: string): string {
  const cleaned = `${prefix}_${rawKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  if (cleaned.length <= 120) return cleaned;
  const hash = crypto.createHash('sha256').update(rawKey).digest('hex').slice(0, 24);
  return `${prefix}_${hash}`;
}

function clip(value: string | undefined, max: number): string {
  const str = String(value ?? '').trim();
  return str.length > max ? str.slice(0, max) : str;
}

export function registerCircleSession(session: {
  circleId: string;
  idToken: string;
  uid: string;
  timeZone?: string;
  expMs: number;
}): void {
  activeSessions.set(session.circleId, {
    circleId: session.circleId,
    idToken: session.idToken,
    uid: session.uid,
    timeZone: normalizeTimeZone(session.timeZone),
    expMs: session.expMs,
  });
}

async function deliverAndRecordEmail(params: {
  circle: CircleRecord;
  bearerToken: string;
  actorUid: string;
  deliveryId: string;
  reminderType: ReminderEmailType;
  targetId: string;
  dateKey?: string;
  scheduledTime?: string;
  recipient: MemberRecord;
  emailContent: { subject: string; html: string; text: string };
}): Promise<'sent' | 'failed' | 'duplicate'> {
  const lockKey = `${params.circle.id}:${params.deliveryId}`;
  if (inFlightDeliveries.has(lockKey)) {
    return 'duplicate';
  }
  inFlightDeliveries.add(lockKey);

  try {
    const docPath = `careCircles/${params.circle.id}/emailReminders/${params.deliveryId}`;
    const existing = await getFirestoreDoc(docPath, params.bearerToken);

    if (existing) {
      if (existing.status === 'sent') {
        return 'duplicate';
      }
      const attempts = Number(existing.attempts || 1);
      if (attempts >= 3) {
        return 'duplicate';
      }
      if (existing.provider === 'unconfigured' && !getEmailProviderStatus().configured) {
        return 'duplicate';
      }
    }

    const sendResult = await sendEmail({
      to: params.recipient.email,
      subject: params.emailContent.subject,
      html: params.emailContent.html,
      text: params.emailContent.text,
    });

    const nextStatus = sendResult.ok ? 'sent' : 'failed';
    const attempts = existing ? Number(existing.attempts || 1) + 1 : 1;

    if (existing) {
      await updateFirestoreDocWithServerTime(
        docPath,
        {
          status: nextStatus,
          provider: sendResult.provider,
          providerMessageId: clip(sendResult.messageId, 200),
          errorMessage: clip(sendResult.error, 500),
          attempts,
          subject: clip(params.emailContent.subject, 200),
        },
        ['updatedAt'],
        params.bearerToken,
      );
    } else {
      await createFirestoreDocWithServerTime(
        docPath,
        {
          id: params.deliveryId,
          circleId: params.circle.id,
          reminderType: params.reminderType,
          targetId: clip(params.targetId, 128),
          dateKey: clip(params.dateKey, 10),
          scheduledTime: clip(params.scheduledTime, 10),
          recipientUid: params.recipient.uid,
          recipientEmail: clip(params.recipient.email.toLowerCase(), 160),
          recipientName: clip(params.recipient.displayName || 'Care Member', 100),
          subject: clip(params.emailContent.subject, 200),
          status: nextStatus,
          provider: sendResult.provider,
          providerMessageId: clip(sendResult.messageId, 200),
          errorMessage: clip(sendResult.error, 500),
          attempts,
          createdByUid: params.actorUid,
          memberIds: params.circle.memberIds.slice(0, 15),
        },
        ['createdAt', 'updatedAt'],
        params.bearerToken,
      );
    }

    return nextStatus;
  } finally {
    inFlightDeliveries.delete(lockKey);
  }
}

async function markDoseMissedInFirestore(params: {
  circle: CircleRecord;
  med: MedicationRecord;
  existingLog?: MedicationLogRecord;
  dateKey: string;
  scheduledTime: string;
  graceMinutes: number;
  actorUid: string;
  bearerToken: string;
}): Promise<boolean> {
  const safeTime = params.scheduledTime.replace(/[^0-9A-Za-z]/g, '');
  const logId =
    params.existingLog?.id ??
    `medlog_${params.med.id}_${params.dateKey}_${safeTime}`.slice(0, 128);
  const logPath = `careCircles/${params.circle.id}/medicationLogs/${logId}`;

  try {
    if (params.existingLog) {
      await updateFirestoreDocWithServerTime(
        logPath,
        {
          status: 'missed',
          assistanceMode: 'self',
          notes: `Marked missed automatically after ${params.graceMinutes} minute grace period`,
          loggedByUid: params.actorUid,
          loggedByName: 'CareConnect Reminder',
        },
        ['updatedAt'],
        params.bearerToken,
      );
    } else {
      await createFirestoreDocWithServerTime(
        logPath,
        {
          id: logId,
          circleId: params.circle.id,
          medicationId: params.med.id,
          medicationName: clip(params.med.name, 120),
          dosage: clip(params.med.dosage, 80),
          dateKey: params.dateKey,
          scheduledTime: clip(params.scheduledTime, 10),
          status: 'missed',
          assistanceMode: 'self',
          notes: `Marked missed automatically after ${params.graceMinutes} minute grace period`,
          loggedByUid: params.actorUid,
          loggedByName: 'CareConnect Reminder',
          memberIds: params.circle.memberIds.slice(0, 15),
        },
        ['loggedAt', 'updatedAt'],
        params.bearerToken,
      );
    }

    const notifId = makeDeliveryId('notif_miss', `${params.med.id}_${params.dateKey}_${safeTime}`);
    const existingNotif = await getFirestoreDoc(
      `careCircles/${params.circle.id}/notifications/${notifId}`,
      params.bearerToken,
    );
    if (!existingNotif) {
      await createFirestoreDocWithServerTime(
        `careCircles/${params.circle.id}/notifications/${notifId}`,
        {
          id: notifId,
          circleId: params.circle.id,
          title: clip(`Missed dose: ${params.med.name} (${params.med.dosage})`, 140),
          detail: clip(
            `Scheduled for ${params.scheduledTime} on ${params.dateKey} and unconfirmed after ${params.graceMinutes} minutes.`,
            400,
          ),
          severity: 'warning',
          eventType: 'medication',
          createdByUid: params.actorUid,
          readByUids: [],
          memberIds: params.circle.memberIds.slice(0, 15),
        },
        ['createdAt', 'updatedAt'],
        params.bearerToken,
      );
    }

    const actId = makeDeliveryId('act_miss', `${params.med.id}_${params.dateKey}_${safeTime}`);
    const existingAct = await getFirestoreDoc(
      `careCircles/${params.circle.id}/activityLogs/${actId}`,
      params.bearerToken,
    );
    if (!existingAct) {
      await createFirestoreDocWithServerTime(
        `careCircles/${params.circle.id}/activityLogs/${actId}`,
        {
          id: actId,
          circleId: params.circle.id,
          elderlyProfileId: params.circle.id,
          userId: params.actorUid,
          actorName: 'CareConnect Reminder',
          actorRole: 'patient',
          action: clip(`Missed dose: ${params.med.name} (${params.med.dosage})`, 160),
          recordId: logId,
          recordType: 'medication_log',
          detail: clip(`Scheduled ${params.scheduledTime} on ${params.dateKey}`, 400),
          memberIds: params.circle.memberIds.slice(0, 15),
        },
        ['timestamp'],
        params.bearerToken,
      );
    }

    return true;
  } catch (err) {
    // Non-owners without add/edit medication permissions cannot write medicationLogs; email alert still proceeds.
    console.warn(`[ReminderScheduler] Unable to mark missed log for ${logId}:`, err);
    return false;
  }
}

export async function processCircleReminders(params: {
  circleId: string;
  bearerToken: string;
  actorUid: string;
  timeZone: string;
  isServiceAccount?: boolean;
}): Promise<ProcessCircleSummary> {
  const summary: ProcessCircleSummary = {
    circleId: params.circleId,
    emailsSent: 0,
    emailsFailed: 0,
    dosesMarkedMissed: 0,
    skippedDuplicates: 0,
  };

  const rawCircle = await getFirestoreDoc(`careCircles/${params.circleId}`, params.bearerToken);
  if (!rawCircle) return summary;

  const circle: CircleRecord = {
    id: String(rawCircle.id || params.circleId),
    patientName: String(rawCircle.patientName || 'Care Recipient'),
    ownerId: String(rawCircle.ownerId || ''),
    memberIds: Array.isArray(rawCircle.memberIds) ? (rawCircle.memberIds as string[]) : [],
  };
  if (circle.memberIds.length === 0) return summary;

  const [rawMembers, rawMeds, rawMedLogs, rawAppts] = await Promise.all([
    listFirestoreCollection(`careCircles/${circle.id}/members`, params.bearerToken),
    listFirestoreCollection(`careCircles/${circle.id}/medications`, params.bearerToken),
    listFirestoreCollection(`careCircles/${circle.id}/medicationLogs`, params.bearerToken),
    listFirestoreCollection(`careCircles/${circle.id}/appointments`, params.bearerToken),
  ]);

  const members: MemberRecord[] = rawMembers
    .map((m) => ({
      uid: String(m.uid || ''),
      displayName: String(m.displayName || 'Care Member'),
      email: String(m.email || '').trim().toLowerCase(),
      memberRole: (m.memberRole as MemberRecord['memberRole']) || 'family',
      permissions: (m.permissions as Record<string, boolean> | undefined) ?? {},
      medicationEmailReminders: m.medicationEmailReminders as boolean | undefined,
      appointmentEmailReminders: m.appointmentEmailReminders as boolean | undefined,
    }))
    .filter((m) => m.uid && m.email.includes('@'));

  const actorUid = params.isServiceAccount ? circle.ownerId || params.actorUid : params.actorUid;
  const callerMember = members.find((m) => m.uid === actorUid);
  const canActorWriteMedLog =
    params.isServiceAccount ||
    actorUid === circle.ownerId ||
    Boolean(callerMember?.permissions?.addMedications || callerMember?.permissions?.editMedications);

  const now = new Date();
  const nowMs = now.getTime();
  const { dateKey: todayKey, minutesOfDay: nowMinutes } = getZonedDateTimeParts(now, params.timeZone);
  const graceMinutes = getGracePeriodMinutes();
  const appUrl = getAppUrl();

  // ---------------------------------------------------------------------------
  // 1. Medication Reminders (Due Now + Grace Period Missed Escalation)
  // ---------------------------------------------------------------------------
  const activeMeds: MedicationRecord[] = rawMeds
    .filter((m) => m.status === 'active')
    .map((m) => ({
      id: String(m.id || ''),
      name: String(m.name || ''),
      dosage: String(m.dosage || ''),
      scheduledTimes: Array.isArray(m.scheduledTimes) ? (m.scheduledTimes as string[]) : [],
      instructions: typeof m.instructions === 'string' ? m.instructions : '',
      status: String(m.status || 'active'),
    }))
    .filter((m) => m.id && m.name);

  const medLogs: MedicationLogRecord[] = rawMedLogs.map((l) => ({
    id: String(l.id || ''),
    medicationId: String(l.medicationId || ''),
    dateKey: String(l.dateKey || ''),
    scheduledTime: String(l.scheduledTime || ''),
    status: String(l.status || 'pending'),
  }));

  for (const med of activeMeds) {
    for (const scheduledTime of med.scheduledTimes) {
      const schedMins = parseHHMMToMinutes(scheduledTime);
      if (schedMins === null) continue;

      const existingLog = medLogs.find(
        (l) =>
          l.medicationId === med.id &&
          l.dateKey === todayKey &&
          l.scheduledTime === scheduledTime,
      );

      // Rule 4: Stop further reminders once dose is confirmed (taken / skipped / missed)
      if (
        existingLog &&
        (existingLog.status === 'taken' ||
          existingLog.status === 'skipped' ||
          existingLog.status === 'missed')
      ) {
        continue;
      }

      const minutesSinceDue = nowMinutes - schedMins;
      if (minutesSinceDue < 0) {
        continue; // Not due yet
      }

      const safeTime = scheduledTime.replace(/[^0-9A-Za-z]/g, '');

      // Rule 1: Dose is due and still within grace period -> send Medication Due email
      if (minutesSinceDue < graceMinutes) {
        const dueRecipients = members.filter(
          (m) =>
            (m.uid === circle.ownerId || m.permissions?.viewMedications === true) &&
            m.medicationEmailReminders !== false,
        );

        for (const recipient of dueRecipients) {
          const deliveryId = makeDeliveryId(
            'meddue',
            `${med.id}_${todayKey}_${safeTime}_${recipient.uid}`,
          );
          const emailContent = buildCareConnectEmail({
            type: 'medication_due',
            recipientName: recipient.displayName,
            patientName: circle.patientName,
            appUrl,
            medicationName: med.name,
            dosage: med.dosage,
            scheduledTime,
            instructions: med.instructions,
          });
          const outcome = await deliverAndRecordEmail({
            circle,
            bearerToken: params.bearerToken,
            actorUid,
            deliveryId,
            reminderType: 'medication_due',
            targetId: med.id,
            dateKey: todayKey,
            scheduledTime,
            recipient,
            emailContent,
          });
          if (outcome === 'sent') summary.emailsSent += 1;
          else if (outcome === 'failed') summary.emailsFailed += 1;
          else summary.skippedDuplicates += 1;
        }
        continue;
      }

      // Rule 2 & 3: Grace period passed without confirmation -> mark missed & alert family/caretakers
      if (canActorWriteMedLog) {
        const marked = await markDoseMissedInFirestore({
          circle,
          med,
          existingLog,
          dateKey: todayKey,
          scheduledTime,
          graceMinutes,
          actorUid,
          bearerToken: params.bearerToken,
        });
        if (marked) summary.dosesMarkedMissed += 1;
      }

      const missedRecipients = members.filter(
        (m) =>
          (m.uid === circle.ownerId ||
            (m.memberRole !== 'patient' && m.permissions?.viewMedications === true)) &&
          m.medicationEmailReminders !== false,
      );

      for (const recipient of missedRecipients) {
        const deliveryId = makeDeliveryId(
          'medmiss',
          `${med.id}_${todayKey}_${safeTime}_${recipient.uid}`,
        );
        const emailContent = buildCareConnectEmail({
          type: 'medication_missed',
          recipientName: recipient.displayName,
          patientName: circle.patientName,
          appUrl,
          medicationName: med.name,
          dosage: med.dosage,
          scheduledTime,
          graceMinutes,
        });
        const outcome = await deliverAndRecordEmail({
          circle,
          bearerToken: params.bearerToken,
          actorUid,
          deliveryId,
          reminderType: 'medication_missed',
          targetId: med.id,
          dateKey: todayKey,
          scheduledTime,
          recipient,
          emailContent,
        });
        if (outcome === 'sent') summary.emailsSent += 1;
        else if (outcome === 'failed') summary.emailsFailed += 1;
        else summary.skippedDuplicates += 1;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Appointment Reminders (24 hours before & 2 hours before)
  // ---------------------------------------------------------------------------
  const scheduledAppts: AppointmentRecord[] = rawAppts
    .filter((a) => a.status === 'scheduled')
    .map((a) => ({
      id: String(a.id || ''),
      title: String(a.title || ''),
      doctorName: String(a.doctorName || ''),
      clinicName: typeof a.clinicName === 'string' ? a.clinicName : '',
      appointmentDate: String(a.appointmentDate || ''),
      appointmentTime: String(a.appointmentTime || ''),
      status: String(a.status || 'scheduled'),
    }))
    .filter((a) => a.id && a.appointmentDate && a.appointmentTime);

  const apptRecipients = members.filter(
    (m) =>
      (m.uid === circle.ownerId ||
        m.permissions?.manageAppointments === true ||
        m.permissions?.viewHealthInfo === true) &&
      m.appointmentEmailReminders !== false,
  );

  for (const appt of scheduledAppts) {
    const apptEpochMs = getZonedLocalEpochMs(
      appt.appointmentDate,
      appt.appointmentTime,
      params.timeZone,
    );
    if (apptEpochMs === null) continue;

    const hoursUntil = (apptEpochMs - nowMs) / 3_600_000;
    if (hoursUntil <= 0 || hoursUntil > 24) continue;

    const reminderType: ReminderEmailType =
      hoursUntil <= 2 ? 'appointment_2h' : 'appointment_24h';
    const prefix = reminderType === 'appointment_2h' ? 'appt2h' : 'appt24h';

    for (const recipient of apptRecipients) {
      const deliveryId = makeDeliveryId(prefix, `${appt.id}_${recipient.uid}`);
      const emailContent = buildCareConnectEmail({
        type: reminderType,
        recipientName: recipient.displayName,
        patientName: circle.patientName,
        appUrl,
        doctorName: appt.doctorName,
        hospitalName: appt.clinicName || 'Clinic / Hospital',
        appointmentDate: appt.appointmentDate,
        appointmentTime: appt.appointmentTime,
        reason: appt.title,
      });
      const outcome = await deliverAndRecordEmail({
        circle,
        bearerToken: params.bearerToken,
        actorUid,
        deliveryId,
        reminderType,
        targetId: appt.id,
        dateKey: appt.appointmentDate,
        scheduledTime: appt.appointmentTime,
        recipient,
        emailContent,
      });
      if (outcome === 'sent') summary.emailsSent += 1;
      else if (outcome === 'failed') summary.emailsFailed += 1;
      else summary.skippedDuplicates += 1;
    }
  }

  return summary;
}

export async function runReminderCronTick(): Promise<void> {
  if (cronRunning) return;
  cronRunning = true;

  try {
    const nowMs = Date.now();
    const saToken = await getServiceAccountAccessToken();

    if (saToken) {
      const circles = await listFirestoreCollection('careCircles', saToken);
      for (const c of circles) {
        const circleId = String(c.id || '');
        if (!circleId) continue;
        const registered = activeSessions.get(circleId);
        const tz = registered?.timeZone || 'America/Los_Angeles';
        try {
          await processCircleReminders({
            circleId,
            bearerToken: saToken,
            actorUid: String(c.ownerId || 'system'),
            timeZone: tz,
            isServiceAccount: true,
          });
        } catch (err) {
          console.error(`[ReminderScheduler] Cron failed for circle ${circleId}:`, err);
        }
      }
      return;
    }

    for (const [circleId, session] of activeSessions.entries()) {
      if (session.expMs <= nowMs + 15_000) {
        activeSessions.delete(circleId);
        continue;
      }
      try {
        await processCircleReminders({
          circleId: session.circleId,
          bearerToken: session.idToken,
          actorUid: session.uid,
          timeZone: session.timeZone,
        });
      } catch (err) {
        console.error(`[ReminderScheduler] Session cron failed for circle ${circleId}:`, err);
      }
    }
  } finally {
    cronRunning = false;
  }
}

export function startReminderScheduler(): void {
  if (cronTask) return;
  cronTask = cron.schedule('* * * * *', () => {
    void runReminderCronTick();
  });
}

export function isReminderSchedulerActive(): boolean {
  return cronTask !== null;
}

export async function sendTestReminderEmail(params: {
  circleId: string;
  bearerToken: string;
  callerUid: string;
  callerEmail: string;
  callerName: string;
}): Promise<{
  ok: boolean;
  provider: string;
  messageId?: string;
  error?: string;
  deliveryId: string;
}> {
  const rawCircle = await getFirestoreDoc(`careCircles/${params.circleId}`, params.bearerToken);
  if (!rawCircle) {
    throw Object.assign(new Error('You are not an authorized member of this Care Circle.'), {
      statusCode: 403,
    });
  }

  const circle: CircleRecord = {
    id: String(rawCircle.id || params.circleId),
    patientName: String(rawCircle.patientName || 'Care Recipient'),
    ownerId: String(rawCircle.ownerId || ''),
    memberIds: Array.isArray(rawCircle.memberIds) ? (rawCircle.memberIds as string[]) : [],
  };

  const deliveryId = makeDeliveryId('test', `${Date.now()}_${params.callerUid}`);
  const emailContent = buildCareConnectEmail({
    type: 'test_email',
    recipientName: params.callerName || 'CareConnect User',
    patientName: circle.patientName,
    appUrl: getAppUrl(),
  });

  const sendResult = await sendEmail({
    to: params.callerEmail,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
  });

  const nextStatus = sendResult.ok ? 'sent' : 'failed';
  await createFirestoreDocWithServerTime(
    `careCircles/${circle.id}/emailReminders/${deliveryId}`,
    {
      id: deliveryId,
      circleId: circle.id,
      reminderType: 'test_email',
      targetId: 'test',
      dateKey: new Date().toISOString().slice(0, 10),
      scheduledTime: new Date().toISOString().slice(11, 16),
      recipientUid: params.callerUid,
      recipientEmail: clip(params.callerEmail.toLowerCase(), 160),
      recipientName: clip(params.callerName || 'Care Member', 100),
      subject: clip(emailContent.subject, 200),
      status: nextStatus,
      provider: sendResult.provider,
      providerMessageId: clip(sendResult.messageId, 200),
      errorMessage: clip(sendResult.error, 500),
      attempts: 1,
      createdByUid: params.callerUid,
      memberIds: circle.memberIds.slice(0, 15),
    },
    ['createdAt', 'updatedAt'],
    params.bearerToken,
  );

  return {
    ok: sendResult.ok,
    provider: sendResult.provider,
    messageId: sendResult.messageId,
    error: sendResult.error,
    deliveryId,
  };
}
