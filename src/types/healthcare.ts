import type { Timestamp } from 'firebase/firestore';

export type AccountType = 'elderly' | 'family' | 'caretaker';
export type MemberRole = 'patient' | 'family' | 'caretaker';
export type MedicationStatus = 'active' | 'paused' | 'completed';
export type DoseStatus = 'taken' | 'skipped' | 'pending';
export type VisitType = 'in_person' | 'telehealth' | 'home_visit';
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled';
export type RecordType = 'vital_sign' | 'lab_result' | 'diagnosis' | 'immunization' | 'clinical_note';
export type RoutineCategory = 'hydration' | 'mobility' | 'nutrition' | 'sleep' | 'hygiene' | 'therapy';
export type MessageCategory = 'update' | 'alert' | 'question' | 'routine_note';
export type NotificationSeverity = 'info' | 'warning' | 'urgent';
export type NotificationEventType = 'medication' | 'appointment' | 'message' | 'record' | 'member';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  accountType: AccountType;
  phone?: string;
  emergencyContact?: string;
  activeCircleId?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type InvitationStatus = 'pending' | 'accepted' | 'revoked';

export interface MemberPermissions {
  viewHealthInfo: boolean;
  viewMedications: boolean;
  addMedications: boolean;
  editMedications: boolean;
  manageAppointments: boolean;
  viewAdherenceReports: boolean;
}

export type PermissionKey = keyof MemberPermissions;

export interface CircleInvite {
  inviteCode: string;
  circleId: string;
  circleName: string;
  patientName: string;
  ownerUid: string;
  ownerName: string;
  invitedEmail: string;
  invitedRole: 'family' | 'caretaker';
  relation: string;
  permissions: MemberPermissions;
  status: InvitationStatus;
  acceptedByUid?: string;
  expiresAt: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CareCircle {
  id: string;
  name: string;
  patientName: string;
  patientAge: number;
  bloodType?: string;
  allergies?: string;
  primaryPhysician?: string;
  ownerId: string;
  memberIds: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CircleMember {
  uid: string;
  circleId: string;
  displayName: string;
  email: string;
  memberRole: MemberRole;
  relation: string;
  isCoordinator: boolean;
  permissions: MemberPermissions;
  inviteCodeUsed: string;
  submittedPasscodeHash?: string;
  joinedAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Medication {
  id: string;
  circleId: string;
  name: string;
  dosage: string;
  frequency: string;
  scheduledTimes: string[];
  instructions?: string;
  prescribedBy?: string;
  remainingQuantity?: number;
  refillThreshold?: number;
  status: MedicationStatus;
  createdByUid: string;
  memberIds: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface MedicationLog {
  id: string;
  circleId: string;
  medicationId: string;
  medicationName: string;
  dosage: string;
  dateKey: string;
  scheduledTime: string;
  status: DoseStatus;
  notes?: string;
  loggedByUid: string;
  loggedByName: string;
  memberIds: string[];
  loggedAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Appointment {
  id: string;
  circleId: string;
  title: string;
  doctorName: string;
  specialty?: string;
  clinicName?: string;
  location?: string;
  appointmentDate: string;
  appointmentTime: string;
  visitType: VisitType;
  prepNotes?: string;
  outcomeNotes?: string;
  status: AppointmentStatus;
  createdByUid: string;
  memberIds: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface HealthRecord {
  id: string;
  circleId: string;
  recordType: RecordType;
  title: string;
  recordedDate: string;
  providerName?: string;
  metricValue?: string;
  metricUnit?: string;
  summary?: string;
  flagged: boolean;
  createdByUid: string;
  memberIds: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CareRoutine {
  id: string;
  circleId: string;
  title: string;
  category: RoutineCategory;
  targetTime: string;
  instructions?: string;
  active: boolean;
  createdByUid: string;
  memberIds: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface RoutineLog {
  id: string;
  circleId: string;
  routineId: string;
  dateKey: string;
  completed: boolean;
  completedByUid: string;
  completedByName: string;
  memberIds: string[];
  completedAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CareMessage {
  id: string;
  circleId: string;
  senderUid: string;
  senderName: string;
  senderRole: MemberRole;
  category: MessageCategory;
  body: string;
  urgent: boolean;
  memberIds: string[];
  createdAt?: Timestamp;
}

export interface CareNotification {
  id: string;
  circleId: string;
  title: string;
  detail: string;
  severity: NotificationSeverity;
  eventType: NotificationEventType;
  createdByUid: string;
  readByUids: string[];
  memberIds: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface MedicationGuideResponse {
  dailyOverview: string;
  timeBlocks: Array<{
    period: string;
    items: string[];
    mealTip: string;
  }>;
  pharmacistQuestions: string[];
  disclaimer: string;
}

export interface AppointmentPrepResponse {
  visitSummary: string;
  checklist: string[];
  questionsForDoctor: string[];
  disclaimer: string;
}

export interface CareSummaryResponse {
  headline: string;
  highlights: string[];
  attentionItems: string[];
  nextActions: string[];
  disclaimer: string;
}

export type AppSection =
  | 'overview'
  | 'medications'
  | 'appointments'
  | 'records'
  | 'routines'
  | 'messages'
  | 'circle';
