import { auth } from '../lib/firebase';
import type {
  Appointment,
  AppointmentPrepResponse,
  CareAssistantResponse,
  CareMessage,
  CareSummaryResponse,
  HealthRecord,
  Medication,
  MedicationGuideResponse,
} from '../types/healthcare';

async function postAiJson<T>(endpoint: string, payload: unknown): Promise<T> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in with a verified account to use AI assistance.');
  }
  const idToken = await user.getIdToken();

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Unable to reach AI care service.');
  }
  return data as T;
}

export function fetchMedicationGuide(params: {
  circleId: string;
  patientName: string;
  patientAge: number;
  allergies?: string;
  medications: Medication[];
}): Promise<MedicationGuideResponse> {
  return postAiJson<MedicationGuideResponse>('/api/ai/medication-guide', params);
}

export function fetchAppointmentPrep(params: {
  circleId: string;
  patientName: string;
  allergies?: string;
  appointment: Appointment;
  activeMedications: Medication[];
  recentRecords: HealthRecord[];
}): Promise<AppointmentPrepResponse> {
  return postAiJson<AppointmentPrepResponse>('/api/ai/appointment-prep', params);
}

export function fetchCareSummary(params: {
  circleId: string;
  patientName: string;
  adherenceStats: { taken: number; skipped: number; total: number };
  medications: Medication[];
  upcomingAppointments: Appointment[];
  recentRecords: HealthRecord[];
  recentMessages: CareMessage[];
}): Promise<CareSummaryResponse> {
  return postAiJson<CareSummaryResponse>('/api/ai/care-summary', params);
}

export function askCareAssistant(params: {
  circleId: string;
  message: string;
  history: Array<{ role: 'user' | 'assistant'; text: string }>;
}): Promise<CareAssistantResponse> {
  const timeZone =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'
      : 'America/Los_Angeles';
  return postAiJson<CareAssistantResponse>('/api/ai/assistant', {
    ...params,
    timeZone,
  });
}
