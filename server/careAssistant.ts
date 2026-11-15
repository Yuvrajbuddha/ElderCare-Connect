import { GoogleGenAI, ThinkingLevel, type Content } from '@google/genai';
import { getFirestoreDoc, queryFirestoreSubcollection } from './firestoreRest.js';

export interface AssistantCaller {
  uid: string;
  idToken: string;
  name: string;
}

export interface AssistantHistoryTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AssistantResult {
  reply: string;
  generatedAt: string;
  permissionsUsed: {
    viewMedications: boolean;
    viewAppointments: boolean;
    viewHealthInfo: boolean;
  };
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

function getZonedNow(timeZone: string): {
  dateKey: string;
  minutesOfDay: number;
  dateLabel: string;
  timeLabel: string;
} {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const dateKey = `${map.year}-${map.month}-${map.day}`;
  const hour = Number(map.hour) % 24;
  const minute = Number(map.minute);

  const dateLabel = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(now);

  const timeLabel = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(now);

  return {
    dateKey,
    minutesOfDay: hour * 60 + minute,
    dateLabel,
    timeLabel,
  };
}

function parseHHMMToMinutes(hhmm: string): number | null {
  const match = String(hhmm || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function format12h(hhmm: string): string {
  const mins = parseHHMMToMinutes(hhmm);
  if (mins === null) return hhmm;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function getOffsetDateKey(baseDateKey: string, deltaDays: number): string {
  const [y, m, d] = baseDateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export async function runCareAssistant(params: {
  ai: GoogleGenAI;
  modelName: string;
  circleId: string;
  message: string;
  history: AssistantHistoryTurn[];
  timeZone?: string;
  gracePeriodMinutes: number;
  caller: AssistantCaller;
}): Promise<AssistantResult> {
  const circle = await getFirestoreDoc(`careCircles/${params.circleId}`, params.caller.idToken);
  if (!circle) {
    throw Object.assign(new Error('You are not an authorized member of this Care Circle.'), {
      statusCode: 403,
    });
  }

  const isOwner = circle.ownerId === params.caller.uid;
  const member = await getFirestoreDoc(
    `careCircles/${params.circleId}/members/${params.caller.uid}`,
    params.caller.idToken,
  );
  if (!isOwner && !member) {
    throw Object.assign(new Error('Membership record not found for this Care Circle.'), {
      statusCode: 403,
    });
  }

  const perms = (member?.permissions as Record<string, unknown> | undefined) ?? {};
  const canViewMedications = isOwner || perms.viewMedications === true;
  const canViewAppointments =
    isOwner || perms.manageAppointments === true || perms.viewHealthInfo === true;
  const canViewHealthInfo = isOwner || perms.viewHealthInfo === true;

  const tz = normalizeTimeZone(params.timeZone);
  const nowInfo = getZonedNow(tz);
  const sevenDaysAgoKey = getOffsetDateKey(nowInfo.dateKey, -7);

  // Fetch only collections the authenticated caller is permitted to read
  const [rawMeds, rawMedLogs, rawAppts, rawRoutines, rawRoutineLogs] = await Promise.all([
    canViewMedications
      ? queryFirestoreSubcollection({
          parentDocPath: `careCircles/${params.circleId}`,
          collectionId: 'medications',
          memberUid: params.caller.uid,
          bearerToken: params.caller.idToken,
          limit: 100,
        })
      : Promise.resolve([]),
    canViewMedications
      ? queryFirestoreSubcollection({
          parentDocPath: `careCircles/${params.circleId}`,
          collectionId: 'medicationLogs',
          memberUid: params.caller.uid,
          bearerToken: params.caller.idToken,
          limit: 200,
        })
      : Promise.resolve([]),
    canViewAppointments
      ? queryFirestoreSubcollection({
          parentDocPath: `careCircles/${params.circleId}`,
          collectionId: 'appointments',
          memberUid: params.caller.uid,
          bearerToken: params.caller.idToken,
          limit: 100,
        })
      : Promise.resolve([]),
    queryFirestoreSubcollection({
      parentDocPath: `careCircles/${params.circleId}`,
      collectionId: 'routines',
      memberUid: params.caller.uid,
      bearerToken: params.caller.idToken,
      limit: 50,
    }),
    queryFirestoreSubcollection({
      parentDocPath: `careCircles/${params.circleId}`,
      collectionId: 'routineLogs',
      memberUid: params.caller.uid,
      bearerToken: params.caller.idToken,
      limit: 100,
    }),
  ]);

  let medicationContext: Record<string, unknown>;
  if (!canViewMedications) {
    medicationContext = {
      accessGranted: false,
      note: 'Medication data is not shared with this account.',
    };
  } else {
    const activeMeds = rawMeds
      .filter((m) => m.status === 'active')
      .map((m) => ({
        id: String(m.id || ''),
        name: String(m.name || ''),
        dosage: String(m.dosage || ''),
        frequency: String(m.frequency || ''),
        scheduledTimes: Array.isArray(m.scheduledTimes)
          ? (m.scheduledTimes as string[]).map((t) => String(t))
          : [],
        instructions: typeof m.instructions === 'string' ? m.instructions : '',
        remainingQuantity: typeof m.remainingQuantity === 'number' ? m.remainingQuantity : undefined,
      }));

    const todaysDoses = activeMeds
      .flatMap((med) =>
        med.scheduledTimes.map((time24) => {
          const log = rawMedLogs.find(
            (l) =>
              l.medicationId === med.id &&
              l.dateKey === nowInfo.dateKey &&
              l.scheduledTime === time24,
          );
          const schedMins = parseHHMMToMinutes(time24);
          const rawStatus = typeof log?.status === 'string' ? log.status : 'pending';
          const isOverdueUnconfirmed =
            rawStatus === 'pending' &&
            schedMins !== null &&
            nowInfo.minutesOfDay - schedMins >= params.gracePeriodMinutes;

          return {
            medicationName: med.name,
            dosage: med.dosage,
            scheduledTime24h: time24,
            scheduledTime12h: format12h(time24),
            instructions: med.instructions,
            status: rawStatus,
            overduePastGracePeriod: isOverdueUnconfirmed,
            loggedByName: typeof log?.loggedByName === 'string' ? log.loggedByName : '',
          };
        }),
      )
      .sort((a, b) => a.scheduledTime24h.localeCompare(b.scheduledTime24h));

    const pendingToday = todaysDoses.filter((d) => d.status === 'pending');
    const nextMedicineToday = pendingToday[0] ?? null;
    const missedOrSkippedToday = todaysDoses.filter(
      (d) => d.status === 'missed' || d.status === 'skipped' || d.overduePastGracePeriod,
    );

    const recentMissedLogs = rawMedLogs
      .filter(
        (l) =>
          (l.status === 'missed' || l.status === 'skipped') &&
          typeof l.dateKey === 'string' &&
          l.dateKey >= sevenDaysAgoKey &&
          l.dateKey <= nowInfo.dateKey,
      )
      .map((l) => ({
        medicationName: String(l.medicationName || ''),
        dosage: String(l.dosage || ''),
        dateKey: String(l.dateKey || ''),
        scheduledTime12h: format12h(String(l.scheduledTime || '')),
        status: String(l.status || ''),
      }))
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
      .slice(0, 10);

    medicationContext = {
      accessGranted: true,
      activeMedicinesCount: activeMeds.length,
      activeMedicines: activeMeds.map((m) => ({
        name: m.name,
        dosage: m.dosage,
        frequency: m.frequency,
        scheduledTimes12h: m.scheduledTimes.map(format12h),
        instructions: m.instructions,
        remainingQuantity: m.remainingQuantity,
      })),
      todaysDoses,
      nextMedicineToday,
      missedOrOverdueToday: missedOrSkippedToday,
      recentMissedOrSkippedLast7Days: recentMissedLogs,
    };
  }

  let appointmentContext: Record<string, unknown>;
  if (!canViewAppointments) {
    appointmentContext = {
      accessGranted: false,
      note: 'Appointment data is not shared with this account.',
    };
  } else {
    const upcomingAppointments = rawAppts
      .filter(
        (a) =>
          a.status === 'scheduled' &&
          typeof a.appointmentDate === 'string' &&
          a.appointmentDate >= nowInfo.dateKey,
      )
      .map((a) => ({
        reason: String(a.title || ''),
        doctorName: String(a.doctorName || ''),
        hospitalName: typeof a.clinicName === 'string' ? a.clinicName : '',
        dateKey: String(a.appointmentDate || ''),
        time24h: String(a.appointmentTime || ''),
        time12h: format12h(String(a.appointmentTime || '')),
        visitType: String(a.visitType || 'in_person'),
      }))
      .sort((a, b) => `${a.dateKey} ${a.time24h}`.localeCompare(`${b.dateKey} ${b.time24h}`))
      .slice(0, 10);

    appointmentContext = {
      accessGranted: true,
      nextAppointment: upcomingAppointments[0] ?? null,
      upcomingAppointments,
      todaysAppointments: upcomingAppointments.filter((a) => a.dateKey === nowInfo.dateKey),
    };
  }

  const dailyRoutines = rawRoutines
    .filter((r) => r.active !== false)
    .map((r) => {
      const doneToday = rawRoutineLogs.some(
        (l) => l.routineId === r.id && l.dateKey === nowInfo.dateKey && l.completed === true,
      );
      return {
        title: String(r.title || ''),
        category: String(r.category || ''),
        targetTime12h: format12h(String(r.targetTime || '')),
        completedToday: doneToday,
      };
    });

  const databaseSnapshot = {
    currentDate: nowInfo.dateLabel,
    currentDateKey: nowInfo.dateKey,
    currentLocalTime: nowInfo.timeLabel,
    patientName: String(circle.patientName || 'Patient'),
    callerName: params.caller.name || String(member?.displayName || 'Care Member'),
    callerRole: isOwner ? 'patient' : String(member?.memberRole || 'family'),
    ...(canViewHealthInfo
      ? {
          primaryPhysician:
            typeof circle.primaryPhysician === 'string' ? circle.primaryPhysician : '',
        }
      : {}),
    emergencyContact:
      typeof circle.emergencyContact === 'string' ? circle.emergencyContact : '',
    medications: medicationContext,
    appointments: appointmentContext,
    dailyRoutines,
  };

  const systemInstruction = [
    'You are the CareConnect AI Healthcare Routine Assistant helping an elderly individual or authorized care team member understand their daily healthcare routine.',
    '',
    'CORE GROUNDING RULES:',
    '- Answer ONLY using facts from the VERIFIED FIRESTORE DATABASE SNAPSHOT provided below.',
    '- NEVER invent, guess, or assume any medication names, dosages, times, missed logs, doctors, hospitals, or appointment dates.',
    '- Respect access permissions strictly: if accessGranted is false for medications or appointments, clearly explain that this information is not shared with the user account and ask the Care Circle owner for permission.',
    '- If there are no medicines or no upcoming appointments in the snapshot, state that clearly and calmly.',
    '',
    'MEDICAL SAFETY RULES (STRICT):',
    '- NEVER diagnose any disease or condition.',
    '- NEVER prescribe medicine or recommend starting/stopping a treatment.',
    '- NEVER suggest or change any medication dosage or schedule.',
    '- If the user asks for medical advice, reports symptoms, asks about drug interactions/side effects, or asks whether to change a dose, politely explain that you cannot give medical advice and recommend contacting their doctor or pharmacist.',
    '',
    'STYLE FOR SENIOR ACCESSIBILITY:',
    '- Use warm, calm, simple plain English.',
    '- Keep responses concise and easy to scan with short sentences or simple bullet points.',
    '- Use 12-hour times (e.g., 8:00 AM).',
    '- End with a short reminder to contact a doctor for medical advice when relevant.',
    '',
    'VERIFIED FIRESTORE DATABASE SNAPSHOT:',
    JSON.stringify(databaseSnapshot),
  ].join('\n');

  const safeHistory = params.history
    .slice(-6)
    .filter((h) => h && typeof h.text === 'string' && h.text.trim().length > 0);

  const contents: Content[] = [
    ...safeHistory.map((h) => ({
      role: (h.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
      parts: [{ text: h.text.trim().slice(0, 1000) }],
    })),
    {
      role: 'user',
      parts: [{ text: params.message.trim().slice(0, 600) }],
    },
  ];

  const response = await params.ai.models.generateContent({
    model: params.modelName,
    contents,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const replyText = (response.text ?? '').trim();
  if (!replyText) {
    throw new Error('The assistant did not return a response. Please try asking again.');
  }

  return {
    reply: replyText,
    generatedAt: new Date().toISOString(),
    permissionsUsed: {
      viewMedications: canViewMedications,
      viewAppointments: canViewAppointments,
      viewHealthInfo: canViewHealthInfo,
    },
  };
}
