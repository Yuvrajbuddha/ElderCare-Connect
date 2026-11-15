import express, { type Request, type Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { runCareAssistant, type AssistantHistoryTurn } from './server/careAssistant.js';
import { getEmailProviderStatus } from './server/emailService.js';
import {
  getGracePeriodMinutes,
  isReminderSchedulerActive,
  processCircleReminders,
  registerCircleSession,
  sendTestReminderEmail,
  startReminderScheduler,
} from './server/reminderScheduler.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MODEL_NAME = 'gemini-4-hydrogen';

interface FirebaseAppletConfig {
  projectId: string;
  firestoreDatabaseId: string;
}

function loadFirebaseConfig(): FirebaseAppletConfig {
  const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw) as FirebaseAppletConfig;
}

const FIREBASE_CONFIG = loadFirebaseConfig();

// -----------------------------------------------------------------------------
// Firebase ID Token Cryptographic Verification (Google X.509 Certs + RS256)
// -----------------------------------------------------------------------------
interface CertCache {
  certs: Record<string, string>;
  expiresAtMs: number;
}

let certCache: CertCache | null = null;

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (certCache && certCache.expiresAtMs > now) {
    return certCache.certs;
  }

  const response = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
  );
  if (!response.ok) {
    throw new Error('Unable to fetch Google public certificates for token verification.');
  }

  const certs = (await response.json()) as Record<string, string>;
  const cacheControl = response.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;

  certCache = {
    certs,
    expiresAtMs: now + Math.max(60, maxAgeSec) * 1000,
  };
  return certs;
}

function decodeBase64Url(segment: string): Buffer {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

interface VerifiedCaller {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
  idToken: string;
  expMs: number;
}

async function verifyFirebaseBearerToken(req: Request): Promise<VerifiedCaller> {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw Object.assign(new Error('Missing authorization token. Please sign in again.'), { statusCode: 401 });
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw Object.assign(new Error('Invalid authentication token format.'), { statusCode: 401 });
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  let header: { alg?: string; kid?: string };
  let payload: Record<string, unknown>;

  try {
    header = JSON.parse(decodeBase64Url(headerB64).toString('utf-8')) as { alg?: string; kid?: string };
    payload = JSON.parse(decodeBase64Url(payloadB64).toString('utf-8')) as Record<string, unknown>;
  } catch {
    throw Object.assign(new Error('Malformed authentication token.'), { statusCode: 401 });
  }

  if (header.alg !== 'RS256' || !header.kid) {
    throw Object.assign(new Error('Unsupported authentication token algorithm.'), { statusCode: 401 });
  }

  const certs = await getGooglePublicCerts();
  const certPem = certs[header.kid];
  if (!certPem) {
    // Refresh certs once in case Google rotated keys
    certCache = null;
    const refreshed = await getGooglePublicCerts();
    if (!refreshed[header.kid]) {
      throw Object.assign(new Error('Authentication key could not be verified.'), { statusCode: 401 });
    }
  }

  const activePem = (certCache?.certs ?? certs)[header.kid];
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();

  const signature = decodeBase64Url(signatureB64);
  if (!verifier.verify(activePem, signature)) {
    throw Object.assign(new Error('Invalid authentication token signature.'), { statusCode: 401 });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${FIREBASE_CONFIG.projectId}`;
  const exp = Number(payload.exp || 0);
  const iat = Number(payload.iat || 0);
  const sub = typeof payload.sub === 'string' ? payload.sub : '';

  if (
    payload.aud !== FIREBASE_CONFIG.projectId ||
    payload.iss !== expectedIssuer ||
    !sub ||
    exp <= nowSec ||
    iat > nowSec + 300
  ) {
    throw Object.assign(new Error('Authentication session has expired or is invalid.'), { statusCode: 401 });
  }

  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
  const emailVerified = payload.email_verified === true;
  if (!emailVerified || !email) {
    throw Object.assign(new Error('Please verify your email address before performing this action.'), {
      statusCode: 403,
    });
  }

  return {
    uid: sub,
    email,
    emailVerified,
    name: typeof payload.name === 'string' ? payload.name : '',
    idToken,
    expMs: exp * 1000,
  };
}

// -----------------------------------------------------------------------------
// Authoritative Firestore REST Lookup (Evaluates Firestore Rules as Caller)
// -----------------------------------------------------------------------------
type FirestoreValue =
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { nullValue: null }
  | { mapValue: { fields?: Record<string, FirestoreValue> } }
  | { arrayValue: { values?: FirestoreValue[] } };

function decodeFirestoreValue(val: FirestoreValue): unknown {
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return val.doubleValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('mapValue' in val) {
    const out: Record<string, unknown> = {};
    const fields = val.mapValue.fields ?? {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = decodeFirestoreValue(v);
    }
    return out;
  }
  if ('arrayValue' in val) {
    return (val.arrayValue.values ?? []).map(decodeFirestoreValue);
  }
  return null;
}

async function fetchFirestoreDocAsCaller(
  docPath: string,
  idToken: string,
): Promise<Record<string, unknown> | null> {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/${FIREBASE_CONFIG.firestoreDatabaseId}/documents/${docPath}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (response.status === 404 || response.status === 403) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Firestore authorization lookup failed (${response.status}).`);
  }

  const body = (await response.json()) as { fields?: Record<string, FirestoreValue> };
  if (!body.fields) return null;

  const decoded: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body.fields)) {
    decoded[k] = decodeFirestoreValue(v);
  }
  return decoded;
}

type PermissionKey =
  | 'viewHealthInfo'
  | 'viewMedications'
  | 'addMedications'
  | 'editMedications'
  | 'manageAppointments'
  | 'viewAdherenceReports';

async function authorizeCirclePermission(
  circleId: unknown,
  caller: VerifiedCaller,
  requiredAnyOf: PermissionKey[],
): Promise<void> {
  if (typeof circleId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(circleId)) {
    throw Object.assign(new Error('A valid Care Circle ID is required.'), { statusCode: 400 });
  }

  const circle = await fetchFirestoreDocAsCaller(`careCircles/${circleId}`, caller.idToken);
  if (!circle) {
    throw Object.assign(new Error('You are not an authorized member of this Care Circle.'), { statusCode: 403 });
  }

  if (circle.ownerId === caller.uid) {
    return;
  }

  const member = await fetchFirestoreDocAsCaller(
    `careCircles/${circleId}/members/${caller.uid}`,
    caller.idToken,
  );
  if (!member) {
    throw Object.assign(new Error('Membership record not found for this Care Circle.'), { statusCode: 403 });
  }

  const permissions = (member.permissions as Record<string, unknown> | undefined) ?? {};
  const allowed = requiredAnyOf.some((perm) => permissions[perm] === true);
  if (!allowed) {
    throw Object.assign(
      new Error('You do not have permission in this Care Circle to run this AI request.'),
      { statusCode: 403 },
    );
  }
}

// -----------------------------------------------------------------------------
// Invitation Verification Rate Limiter
// -----------------------------------------------------------------------------
interface AttemptTracker {
  failures: number;
  resetAtMs: number;
}

const inviteAttempts = new Map<string, AttemptTracker>();
const MAX_INVITE_FAILURES = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

function checkInviteRateLimit(key: string): void {
  const now = Date.now();
  const entry = inviteAttempts.get(key);
  if (!entry) return;
  if (now > entry.resetAtMs) {
    inviteAttempts.delete(key);
    return;
  }
  if (entry.failures >= MAX_INVITE_FAILURES) {
    const minsLeft = Math.max(1, Math.ceil((entry.resetAtMs - now) / 60000));
    throw Object.assign(
      new Error(`Too many failed verification attempts. Try again in ${minsLeft} minute(s).`),
      { statusCode: 429 },
    );
  }
}

function recordInviteFailure(key: string): void {
  const now = Date.now();
  const entry = inviteAttempts.get(key);
  if (!entry || now > entry.resetAtMs) {
    inviteAttempts.set(key, { failures: 1, resetAtMs: now + ATTEMPT_WINDOW_MS });
  } else {
    entry.failures += 1;
  }
}

function clearInviteFailures(key: string): void {
  inviteAttempts.delete(key);
}

// -----------------------------------------------------------------------------
// Gemini AI Client & Error Mapping
// -----------------------------------------------------------------------------
function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function mapRouteError(error: unknown): { status: number; message: string } {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const statusCode = Number((error as { statusCode: unknown }).statusCode);
    const msg = error instanceof Error ? error.message : 'Authorization error.';
    if (statusCode >= 400 && statusCode < 600) {
      return { status: statusCode, message: msg };
    }
  }
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes('GEMINI_API_KEY')) {
    return { status: 503, message: 'AI assistant is not configured. Please check the server Gemini API key in Settings > Secrets.' };
  }
  if (raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID') || raw.includes('403') || raw.includes('400')) {
    return { status: 400, message: 'Unable to authenticate with Gemini API. Please verify your API key in Settings > Secrets.' };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return { status: 429, message: 'AI request quota reached temporarily. Please wait a moment and try again.' };
  }
  return { status: 500, message: 'Unable to process request right now. Please try again shortly.' };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'CareConnect AI' });
  });

  // Server-side invitation validation & passcode hashing with rate limiting
  app.post('/api/auth/verify-invitation', async (req: Request, res: Response) => {
    try {
      const caller = await verifyFirebaseBearerToken(req);
      const rawCode = String(req.body?.inviteCode ?? '').trim().toUpperCase();
      const rawPasscode = String(req.body?.passcode ?? '').trim().toUpperCase();

      if (!/^[A-Z0-9-]{6,20}$/.test(rawCode)) {
        res.status(400).json({ error: 'Please enter a valid invitation code (e.g., CARE-XXXXXX).' });
        return;
      }
      if (!/^[A-Z0-9]{4,16}$/.test(rawPasscode)) {
        res.status(400).json({ error: 'Please enter the security passcode shared with your invitation.' });
        return;
      }

      const rateKey = `${caller.uid}:${rawCode}`;
      checkInviteRateLimit(rateKey);

      const invite = await fetchFirestoreDocAsCaller(`circleInvites/${rawCode}`, caller.idToken);
      if (!invite) {
        recordInviteFailure(rateKey);
        res.status(403).json({
          error: 'Invitation not found or not issued to your verified email address.',
        });
        return;
      }

      if (invite.invitedEmail !== caller.email) {
        recordInviteFailure(rateKey);
        res.status(403).json({
          error: 'This invitation belongs to a different email address.',
        });
        return;
      }

      if (invite.status !== 'pending') {
        res.status(409).json({
          error:
            invite.status === 'accepted'
              ? 'This invitation has already been accepted.'
              : 'This invitation has been revoked by the Care Circle owner.',
        });
        return;
      }

      const expiresAtMs = typeof invite.expiresAt === 'string' ? Date.parse(invite.expiresAt) : 0;
      if (!expiresAtMs || expiresAtMs <= Date.now()) {
        res.status(410).json({
          error: 'This invitation has expired. Ask the elderly individual to issue a new invitation.',
        });
        return;
      }

      const submittedPasscodeHash = crypto
        .createHash('sha256')
        .update(`${rawCode}:${rawPasscode}`)
        .digest('hex');

      clearInviteFailures(rateKey);
      res.json({
        ok: true,
        invite: {
          inviteCode: invite.inviteCode,
          circleId: invite.circleId,
          circleName: invite.circleName,
          patientName: invite.patientName,
          ownerUid: invite.ownerUid,
          ownerName: invite.ownerName,
          invitedEmail: invite.invitedEmail,
          invitedRole: invite.invitedRole,
          relation: invite.relation,
          permissions: invite.permissions,
          expiresAt: invite.expiresAt,
        },
        submittedPasscodeHash,
      });
    } catch (error) {
      const mapped = mapRouteError(error);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/ai/medication-guide', async (req: Request, res: Response) => {
    try {
      const caller = await verifyFirebaseBearerToken(req);
      const { circleId, patientName, patientAge, allergies, medications } = req.body ?? {};
      await authorizeCirclePermission(circleId, caller, ['viewMedications']);

      if (!Array.isArray(medications) || medications.length === 0) {
        res.status(400).json({ error: 'At least one active medication is required to generate a care guide.' });
        return;
      }

      const ai = getAiClient();
      const safeMeds = medications.slice(0, 20).map((m: Record<string, unknown>) => ({
        name: String(m.name || '').slice(0, 120),
        dosage: String(m.dosage || '').slice(0, 80),
        frequency: String(m.frequency || '').slice(0, 80),
        scheduledTimes: Array.isArray(m.scheduledTimes) ? m.scheduledTimes.slice(0, 6) : [],
        instructions: String(m.instructions || '').slice(0, 300),
      }));

      const prompt = [
        `Create a calm, easy-to-follow daily medication guide for an elderly patient and their care circle.`,
        `Patient: ${String(patientName || 'Patient').slice(0, 100)}, Age: ${Number(patientAge || 75)}.`,
        `Known Allergies: ${String(allergies || 'None listed').slice(0, 300)}.`,
        `Medications: ${JSON.stringify(safeMeds)}`,
        `Organize into clear daily time periods (Morning, Afternoon, Evening/Bedtime as applicable), include plain-language meal/hydration tips from the instructions provided, and suggest 3-4 practical questions for their pharmacist or physician. Never diagnose or prescribe changes.`,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          systemInstruction:
            'You are a careful, compassionate geriatric care coordination assistant. Use warm, clear, non-alarmist language suitable for elderly patients and family caregivers. Always remind users to confirm medical decisions with their pharmacist or doctor.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              dailyOverview: { type: Type.STRING },
              timeBlocks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    period: { type: Type.STRING },
                    items: { type: Type.ARRAY, items: { type: Type.STRING } },
                    mealTip: { type: Type.STRING },
                  },
                  required: ['period', 'items', 'mealTip'],
                },
              },
              pharmacistQuestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              disclaimer: { type: Type.STRING },
            },
            required: ['dailyOverview', 'timeBlocks', 'pharmacistQuestions', 'disclaimer'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (error) {
      const mapped = mapRouteError(error);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/ai/appointment-prep', async (req: Request, res: Response) => {
    try {
      const caller = await verifyFirebaseBearerToken(req);
      const { circleId, patientName, allergies, appointment, activeMedications, recentRecords } = req.body ?? {};
      await authorizeCirclePermission(circleId, caller, ['manageAppointments', 'viewHealthInfo']);

      if (!appointment || !appointment.title || !appointment.doctorName) {
        res.status(400).json({ error: 'Appointment details are required.' });
        return;
      }

      const ai = getAiClient();
      const prompt = [
        `Prepare a concise, helpful doctor visit preparation brief for ${String(patientName || 'the patient').slice(0, 100)}.`,
        `Allergies: ${String(allergies || 'None listed').slice(0, 300)}.`,
        `Upcoming Appointment: ${JSON.stringify({
          title: String(appointment.title).slice(0, 140),
          doctorName: String(appointment.doctorName).slice(0, 120),
          specialty: String(appointment.specialty || '').slice(0, 100),
          appointmentDate: String(appointment.appointmentDate || '').slice(0, 20),
          visitType: String(appointment.visitType || '').slice(0, 30),
          prepNotes: String(appointment.prepNotes || '').slice(0, 400),
        })}`,
        `Active Medications: ${JSON.stringify(Array.isArray(activeMedications) ? activeMedications.slice(0, 15) : [])}`,
        `Recent Health Records/Vitals: ${JSON.stringify(Array.isArray(recentRecords) ? recentRecords.slice(0, 10) : [])}`,
        `Provide a brief visit summary, a practical checklist of items to bring, and 4-5 tailored questions to ask the clinician.`,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          systemInstruction:
            'You are a geriatric care visit coordinator helping elderly patients and family members prepare for medical appointments. Be concise, respectful, practical, and never provide medical diagnoses.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              visitSummary: { type: Type.STRING },
              checklist: { type: Type.ARRAY, items: { type: Type.STRING } },
              questionsForDoctor: { type: Type.ARRAY, items: { type: Type.STRING } },
              disclaimer: { type: Type.STRING },
            },
            required: ['visitSummary', 'checklist', 'questionsForDoctor', 'disclaimer'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (error) {
      const mapped = mapRouteError(error);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/ai/care-summary', async (req: Request, res: Response) => {
    try {
      const caller = await verifyFirebaseBearerToken(req);
      const {
        circleId,
        patientName,
        adherenceStats,
        medications,
        upcomingAppointments,
        recentRecords,
        recentMessages,
      } = req.body ?? {};
      await authorizeCirclePermission(circleId, caller, ['viewAdherenceReports']);

      const ai = getAiClient();
      const prompt = [
        `Generate a clear Care Circle Handoff & Family Summary for ${String(patientName || 'Patient').slice(0, 100)}.`,
        `Today's Medication Adherence: ${JSON.stringify(adherenceStats || {})}`,
        `Medications & Refill Status: ${JSON.stringify(Array.isArray(medications) ? medications.slice(0, 15) : [])}`,
        `Upcoming Appointments: ${JSON.stringify(Array.isArray(upcomingAppointments) ? upcomingAppointments.slice(0, 6) : [])}`,
        `Recent Health Records & Vitals: ${JSON.stringify(Array.isArray(recentRecords) ? recentRecords.slice(0, 10) : [])}`,
        `Recent Care Team Notes: ${JSON.stringify(Array.isArray(recentMessages) ? recentMessages.slice(0, 10) : [])}`,
        `Synthesize into a calm headline, positive highlights, items needing attention (missed doses, low medication stock, flagged records, urgent notes), and concrete next actions for the care circle.`,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          systemInstruction:
            'You are a calm, objective care coordination assistant summarizing elderly care logs for family members and caretakers. Stick strictly to the provided data; never invent readings or events.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING },
              highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
              attentionItems: { type: Type.ARRAY, items: { type: Type.STRING } },
              nextActions: { type: Type.ARRAY, items: { type: Type.STRING } },
              disclaimer: { type: Type.STRING },
            },
            required: ['headline', 'highlights', 'attentionItems', 'nextActions', 'disclaimer'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (error) {
      const mapped = mapRouteError(error);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/ai/assistant', async (req: Request, res: Response) => {
    try {
      const caller = await verifyFirebaseBearerToken(req);
      const circleId = String(req.body?.circleId || '').trim();
      const message = String(req.body?.message || '').trim();
      const timeZone = String(req.body?.timeZone || 'America/Los_Angeles').trim();
      const rawHistory = Array.isArray(req.body?.history) ? req.body.history : [];

      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(circleId)) {
        res.status(400).json({ error: 'A valid Care Circle ID is required.' });
        return;
      }
      if (!message || message.length > 600) {
        res.status(400).json({ error: 'Please enter a question (up to 600 characters).' });
        return;
      }

      const history: AssistantHistoryTurn[] = rawHistory
        .slice(-6)
        .filter(
          (item: unknown): item is { role: unknown; text: unknown } =>
            Boolean(item) && typeof item === 'object',
        )
        .map((item: { role: unknown; text: unknown }) => ({
          role: item.role === 'assistant' ? 'assistant' : 'user',
          text: String(item.text || '').slice(0, 1000),
        }));

      const result = await runCareAssistant({
        ai: getAiClient(),
        modelName: MODEL_NAME,
        circleId,
        message,
        history,
        timeZone,
        gracePeriodMinutes: getGracePeriodMinutes(),
        caller: {
          uid: caller.uid,
          idToken: caller.idToken,
          name: caller.name,
        },
      });

      res.json(result);
    } catch (error) {
      const mapped = mapRouteError(error);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  // ---------------------------------------------------------------------------
  // Automatic Email Reminders API (Status, Cron Session Sync, Real Test Email)
  // ---------------------------------------------------------------------------
  app.get('/api/reminders/status', async (req: Request, res: Response) => {
    try {
      await verifyFirebaseBearerToken(req);
      const emailStatus = getEmailProviderStatus();
      res.json({
        configured: emailStatus.configured,
        provider: emailStatus.provider,
        gracePeriodMinutes: getGracePeriodMinutes(),
        schedulerActive: isReminderSchedulerActive(),
      });
    } catch (error) {
      const mapped = mapRouteError(error);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/reminders/sync', async (req: Request, res: Response) => {
    try {
      const caller = await verifyFirebaseBearerToken(req);
      const circleId = String(req.body?.circleId || '').trim();
      const timeZone = String(req.body?.timeZone || 'America/Los_Angeles').trim();
      const runNow = req.body?.runNow !== false;

      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(circleId)) {
        res.status(400).json({ error: 'A valid Care Circle ID is required.' });
        return;
      }

      const circle = await fetchFirestoreDocAsCaller(`careCircles/${circleId}`, caller.idToken);
      if (!circle) {
        res.status(403).json({ error: 'You are not an authorized member of this Care Circle.' });
        return;
      }

      registerCircleSession({
        circleId,
        idToken: caller.idToken,
        uid: caller.uid,
        timeZone,
        expMs: caller.expMs,
      });

      const summary = runNow
        ? await processCircleReminders({
            circleId,
            bearerToken: caller.idToken,
            actorUid: caller.uid,
            timeZone,
          })
        : null;

      const emailStatus = getEmailProviderStatus();
      res.json({
        ok: true,
        configured: emailStatus.configured,
        provider: emailStatus.provider,
        gracePeriodMinutes: getGracePeriodMinutes(),
        summary,
      });
    } catch (error) {
      const mapped = mapRouteError(error);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/reminders/test-email', async (req: Request, res: Response) => {
    try {
      const caller = await verifyFirebaseBearerToken(req);
      const circleId = String(req.body?.circleId || '').trim();

      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(circleId)) {
        res.status(400).json({ error: 'A valid Care Circle ID is required.' });
        return;
      }

      const result = await sendTestReminderEmail({
        circleId,
        bearerToken: caller.idToken,
        callerUid: caller.uid,
        callerEmail: caller.email,
        callerName: caller.name || caller.email.split('@')[0],
      });

      if (!result.ok) {
        res.status(503).json({
          ok: false,
          provider: result.provider,
          deliveryId: result.deliveryId,
          error: result.error || 'Email delivery failed.',
        });
        return;
      }

      res.json(result);
    } catch (error) {
      const mapped = mapRouteError(error);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    startReminderScheduler();
    console.log(`CareConnect AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start CareConnect AI server:', err);
  process.exit(1);
});
