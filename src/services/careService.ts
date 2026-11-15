import {
  Timestamp,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError } from '../lib/firebase';
import {
  clipString,
  generateId,
  generateInviteCode,
  generatePasscode,
  getOffsetDateKey,
  getTodayKey,
} from '../lib/utils';
import {
  AccountType,
  ActivityRecordType,
  Appointment,
  AppointmentStatus,
  CareCircle,
  CareMessage,
  CareNotification,
  CareRoutine,
  CareTask,
  CareTaskCategory,
  CareTaskPriority,
  CareTaskStatus,
  CircleInvite,
  CircleMember,
  DoseStatus,
  HealthRecord,
  Medication,
  MedicationAssistanceMode,
  MedicationLog,
  MedicationStatus,
  MemberPermissions,
  MemberRole,
  MessageCategory,
  NotificationEventType,
  NotificationSeverity,
  OperationType,
  PermissionKey,
  RecordType,
  RoutineCategory,
  RoutineLog,
  UserProfile,
  VisitType,
} from '../types/healthcare';

export const ALL_PERMISSIONS_TRUE: MemberPermissions = {
  viewHealthInfo: true,
  viewMedications: true,
  addMedications: true,
  editMedications: true,
  manageAppointments: true,
  viewAdherenceReports: true,
};

export const DEFAULT_PERMISSIONS_BY_ROLE: Record<'family' | 'caretaker', MemberPermissions> = {
  family: {
    viewHealthInfo: true,
    viewMedications: true,
    addMedications: false,
    editMedications: false,
    manageAppointments: true,
    viewAdherenceReports: true,
  },
  caretaker: {
    viewHealthInfo: true,
    viewMedications: true,
    addMedications: true,
    editMedications: false,
    manageAppointments: true,
    viewAdherenceReports: true,
  },
};

export type SimplePermissionKey = 'viewHealthcareInfo' | 'manageMedicines' | 'manageAppointments';

export interface SimplePermissions {
  viewHealthcareInfo: boolean;
  manageMedicines: boolean;
  manageAppointments: boolean;
}

export const SIMPLE_PERMISSION_DEFINITIONS: Array<{
  key: SimplePermissionKey;
  label: string;
  description: string;
}> = [
  {
    key: 'viewHealthcareInfo',
    label: 'View healthcare information',
    description: 'See health updates, records, and medicine schedule.',
  },
  {
    key: 'manageMedicines',
    label: 'Manage medicines',
    description: 'Add medicines and mark daily doses as taken.',
  },
  {
    key: 'manageAppointments',
    label: 'Manage appointments',
    description: 'Add, update, or cancel doctor appointments.',
  },
];

export const DEFAULT_SIMPLE_PERMISSIONS_BY_ROLE: Record<'family' | 'caretaker', SimplePermissions> = {
  family: {
    viewHealthcareInfo: true,
    manageMedicines: false,
    manageAppointments: true,
  },
  caretaker: {
    viewHealthcareInfo: true,
    manageMedicines: true,
    manageAppointments: true,
  },
};

export function toSimplePermissions(perms?: MemberPermissions): SimplePermissions {
  if (!perms) {
    return { ...DEFAULT_SIMPLE_PERMISSIONS_BY_ROLE.family };
  }
  return {
    viewHealthcareInfo: Boolean(perms.viewHealthInfo || perms.viewAdherenceReports),
    manageMedicines: Boolean(perms.addMedications || perms.editMedications),
    manageAppointments: Boolean(perms.manageAppointments),
  };
}

export function fromSimplePermissions(simple: SimplePermissions): MemberPermissions {
  return {
    viewHealthInfo: simple.viewHealthcareInfo,
    viewAdherenceReports: simple.viewHealthcareInfo,
    viewMedications: simple.viewHealthcareInfo || simple.manageMedicines,
    addMedications: simple.manageMedicines,
    editMedications: simple.manageMedicines,
    manageAppointments: simple.manageAppointments,
  };
}

export function summarizeSimplePermissions(perms?: MemberPermissions): string[] {
  const simple = toSimplePermissions(perms);
  return SIMPLE_PERMISSION_DEFINITIONS.filter((p) => simple[p.key]).map((p) => p.label);
}

export function formatMemberRoleLabel(role: MemberRole): string {
  if (role === 'patient') return 'elderly user';
  if (role === 'caretaker') return 'caretaker';
  return 'family member';
}

export const PERMISSION_DEFINITIONS: Array<{
  key: PermissionKey;
  label: string;
  description: string;
}> = [
  {
    key: 'viewHealthInfo',
    label: 'View Healthcare Information',
    description: 'View & record vitals, lab panels, and clinical notes',
  },
  {
    key: 'viewMedications',
    label: 'View Medication Schedules',
    description: 'View prescriptions, dosages, and daily dose timetables',
  },
  {
    key: 'addMedications',
    label: 'Add Medication Entries',
    description: 'Add new prescriptions and log taken/skipped daily doses',
  },
  {
    key: 'editMedications',
    label: 'Edit Medication Entries',
    description: 'Modify dosage instructions, refill counts, or remove prescriptions',
  },
  {
    key: 'manageAppointments',
    label: 'Manage Appointments',
    description: 'Schedule, edit, and prepare doctor visits & AI checklists',
  },
  {
    key: 'viewAdherenceReports',
    label: 'View Adherence Reports',
    description: 'Inspect adherence metrics and generate AI care summaries',
  },
];

export async function hashInvitePasscode(inviteCode: string, passcode: string): Promise<string> {
  const normalizedCode = inviteCode.trim().toUpperCase();
  const normalizedPasscode = passcode.trim().toUpperCase();
  const data = new TextEncoder().encode(`${normalizedCode}:${normalizedPasscode}`);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles';
  } catch {
    return 'America/Los_Angeles';
  }
}

export async function createUserProfile(params: {
  uid: string;
  displayName: string;
  email: string;
  accountType: AccountType;
  phone?: string;
  emergencyContact?: string;
}): Promise<void> {
  const path = `users/${params.uid}`;
  try {
    await setDoc(doc(db, 'users', params.uid), {
      uid: params.uid,
      displayName: clipString(params.displayName, 100) || 'CareConnect User',
      email: clipString(params.email.toLowerCase(), 160),
      accountType: params.accountType,
      phone: clipString(params.phone, 40),
      emergencyContact: clipString(params.emergencyContact, 160),
      activeCircleId: '',
      medicationEmailReminders: true,
      appointmentEmailReminders: true,
      timeZone: clipString(getBrowserTimeZone(), 80),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateUserProfile(
  uid: string,
  updates: Partial<
    Pick<
      UserProfile,
      | 'displayName'
      | 'phone'
      | 'emergencyContact'
      | 'activeCircleId'
      | 'medicationEmailReminders'
      | 'appointmentEmailReminders'
      | 'timeZone'
    >
  >,
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.displayName !== undefined) payload.displayName = clipString(updates.displayName, 100);
    if (updates.phone !== undefined) payload.phone = clipString(updates.phone, 40);
    if (updates.emergencyContact !== undefined) payload.emergencyContact = clipString(updates.emergencyContact, 160);
    if (updates.activeCircleId !== undefined) payload.activeCircleId = clipString(updates.activeCircleId, 128);
    if (updates.medicationEmailReminders !== undefined) {
      payload.medicationEmailReminders = Boolean(updates.medicationEmailReminders);
    }
    if (updates.appointmentEmailReminders !== undefined) {
      payload.appointmentEmailReminders = Boolean(updates.appointmentEmailReminders);
    }
    if (updates.timeZone !== undefined) payload.timeZone = clipString(updates.timeZone, 80);
    await updateDoc(doc(db, 'users', uid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateEmailReminderPreferences(params: {
  uid: string;
  circleIds: string[];
  medicationEmailReminders: boolean;
  appointmentEmailReminders: boolean;
}): Promise<void> {
  const path = `users/${params.uid}`;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', params.uid), {
      medicationEmailReminders: params.medicationEmailReminders,
      appointmentEmailReminders: params.appointmentEmailReminders,
      timeZone: clipString(getBrowserTimeZone(), 80),
      updatedAt: serverTimestamp(),
    });
    for (const circleId of params.circleIds) {
      batch.update(doc(db, 'careCircles', circleId, 'members', params.uid), {
        medicationEmailReminders: params.medicationEmailReminders,
        appointmentEmailReminders: params.appointmentEmailReminders,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function createCareCircle(params: {
  ownerUid: string;
  ownerName: string;
  ownerEmail: string;
  circleName: string;
  patientName: string;
  patientAge: number;
  bloodType?: string;
  allergies?: string;
  primaryPhysician?: string;
  emergencyContact?: string;
  relation?: string;
}): Promise<string> {
  const circleId = generateId('circle');
  const path = `careCircles/${circleId}`;

  try {
    const batch = writeBatch(db);

    batch.set(doc(db, 'careCircles', circleId), {
      id: circleId,
      name: clipString(params.circleName, 120),
      patientName: clipString(params.patientName, 120),
      patientAge: Math.max(0, Math.min(130, Math.round(params.patientAge))),
      bloodType: clipString(params.bloodType, 16),
      allergies: clipString(params.allergies, 500),
      primaryPhysician: clipString(params.primaryPhysician, 120),
      emergencyContact: clipString(params.emergencyContact, 160),
      ownerId: params.ownerUid,
      memberIds: [params.ownerUid],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'careCircles', circleId, 'members', params.ownerUid), {
      uid: params.ownerUid,
      circleId,
      displayName: clipString(params.ownerName, 100) || 'Care Owner',
      email: clipString(params.ownerEmail.toLowerCase(), 160),
      memberRole: 'patient',
      relation: clipString(params.relation, 80) || 'Self (Owner)',
      isCoordinator: true,
      permissions: ALL_PERMISSIONS_TRUE,
      inviteCodeUsed: '',
      submittedPasscodeHash: '',
      medicationEmailReminders: true,
      appointmentEmailReminders: true,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.update(doc(db, 'users', params.ownerUid), {
      activeCircleId: circleId,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return circleId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateCareCircleDetails(
  circleId: string,
  updates: {
    name: string;
    patientName: string;
    patientAge: number;
    bloodType?: string;
    allergies?: string;
    primaryPhysician?: string;
    emergencyContact?: string;
  },
): Promise<void> {
  const path = `careCircles/${circleId}`;
  try {
    const payload: Record<string, unknown> = {
      name: clipString(updates.name, 120),
      patientName: clipString(updates.patientName, 120),
      patientAge: Math.max(0, Math.min(130, Math.round(updates.patientAge))),
      bloodType: clipString(updates.bloodType, 16),
      allergies: clipString(updates.allergies, 500),
      primaryPhysician: clipString(updates.primaryPhysician, 120),
      updatedAt: serverTimestamp(),
    };
    if (updates.emergencyContact !== undefined) {
      payload.emergencyContact = clipString(updates.emergencyContact, 160);
    }
    await updateDoc(doc(db, 'careCircles', circleId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateCareCircleEmergencyContact(
  circleId: string,
  emergencyContact: string,
): Promise<void> {
  const path = `careCircles/${circleId}`;
  try {
    await updateDoc(doc(db, 'careCircles', circleId), {
      emergencyContact: clipString(emergencyContact, 160),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function createSecureInvitation(params: {
  circle: CareCircle;
  ownerUid: string;
  ownerName: string;
  invitedEmail: string;
  invitedRole: 'family' | 'caretaker';
  relation: string;
  permissions: MemberPermissions;
  expiresInHours: number;
}): Promise<{ inviteCode: string; passcode: string; expiresAt: Date }> {
  const normalizedEmail = params.invitedEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Please enter a valid email address for the invited family member or caretaker.');
  }

  const inviteCode = generateInviteCode();
  const passcode = generatePasscode(6);
  const passcodeHash = await hashInvitePasscode(inviteCode, passcode);
  const expiresAtDate = new Date(Date.now() + Math.max(1, params.expiresInHours) * 3600 * 1000);
  const expiresAtTs = Timestamp.fromDate(expiresAtDate);
  const path = `circleInvites/${inviteCode}`;

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'circleInvites', inviteCode), {
      inviteCode,
      circleId: params.circle.id,
      circleName: clipString(params.circle.name, 120),
      patientName: clipString(params.circle.patientName, 120),
      ownerUid: params.ownerUid,
      ownerName: clipString(params.ownerName, 100),
      invitedEmail: clipString(normalizedEmail, 160),
      invitedRole: params.invitedRole,
      relation:
        clipString(params.relation, 80) ||
        (params.invitedRole === 'caretaker' ? 'Caretaker' : 'Family Member'),
      permissions: params.permissions,
      status: 'pending',
      expiresAt: expiresAtTs,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'circleInvites', inviteCode, 'secret', 'hash'), {
      passcodeHash,
      ownerUid: params.ownerUid,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
    return { inviteCode, passcode, expiresAt: expiresAtDate };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function revokeInvitation(inviteCode: string): Promise<void> {
  const path = `circleInvites/${inviteCode}`;
  try {
    await updateDoc(doc(db, 'circleInvites', inviteCode), {
      status: 'revoked',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateInvitationPermissions(
  inviteCode: string,
  permissions: MemberPermissions,
): Promise<void> {
  const path = `circleInvites/${inviteCode}`;
  try {
    await updateDoc(doc(db, 'circleInvites', inviteCode), {
      permissions,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function listOwnerInvitations(ownerUid: string, circleId: string): Promise<CircleInvite[]> {
  const path = 'circleInvites';
  try {
    const q = query(collection(db, 'circleInvites'), where('ownerUid', '==', ownerUid));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as CircleInvite)
      .filter((inv) => inv.circleId === circleId)
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function listPendingInvitesForEmail(email: string): Promise<CircleInvite[]> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return [];
  const path = 'circleInvites';
  try {
    const q = query(collection(db, 'circleInvites'), where('invitedEmail', '==', normalized));
    const snap = await getDocs(q);
    const now = Date.now();
    return snap.docs
      .map((d) => d.data() as CircleInvite)
      .filter(
        (inv) =>
          inv.status === 'pending' &&
          inv.expiresAt &&
          typeof inv.expiresAt.toMillis === 'function' &&
          inv.expiresAt.toMillis() > now,
      )
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function verifyInvitationWithServer(params: {
  inviteCode: string;
  passcode: string;
}): Promise<{
  invite: {
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
    expiresAt: string;
  };
  submittedPasscodeHash: string;
}> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in with a verified email account to accept an invitation.');
  }
  const idToken = await user.getIdToken(true);
  const response = await fetch('/api/auth/verify-invitation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      inviteCode: params.inviteCode.trim().toUpperCase(),
      passcode: params.passcode.trim().toUpperCase(),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Unable to verify invitation.');
  }
  return data;
}

export async function acceptInvitationWithPasscode(params: {
  inviteCode: string;
  passcode: string;
  uid: string;
  displayName: string;
  email: string;
  relationOverride?: string;
  existingCircleIds: string[];
}): Promise<{ circleId: string; circleName: string; alreadyMember: boolean }> {
  const normalizedCode = params.inviteCode.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (normalizedCode.length < 6) {
    throw new Error('Please enter a valid Care Circle invitation code (e.g., CARE-XXXXXX).');
  }
  if (!params.passcode.trim()) {
    throw new Error('Please enter the 6-character security passcode from your invitation.');
  }

  const verified = await verifyInvitationWithServer({
    inviteCode: normalizedCode,
    passcode: params.passcode,
  });

  const { invite, submittedPasscodeHash } = verified;

  if (params.existingCircleIds.includes(invite.circleId)) {
    await updateUserProfile(params.uid, { activeCircleId: invite.circleId });
    return { circleId: invite.circleId, circleName: invite.circleName, alreadyMember: true };
  }

  const circlePath = `careCircles/${invite.circleId}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'careCircles', invite.circleId, 'members', params.uid), {
      uid: params.uid,
      circleId: invite.circleId,
      displayName: clipString(params.displayName, 100) || 'Care Member',
      email: clipString(params.email.toLowerCase(), 160),
      memberRole: invite.invitedRole,
      relation:
        clipString(params.relationOverride, 80) ||
        invite.relation ||
        (invite.invitedRole === 'caretaker' ? 'Caretaker' : 'Family Member'),
      isCoordinator: false,
      permissions: invite.permissions,
      inviteCodeUsed: invite.inviteCode,
      submittedPasscodeHash,
      medicationEmailReminders: true,
      appointmentEmailReminders: true,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'careCircles', invite.circleId), {
      memberIds: arrayUnion(params.uid),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'circleInvites', invite.inviteCode), {
      status: 'accepted',
      acceptedByUid: params.uid,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'users', params.uid), {
      activeCircleId: invite.circleId,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Missing or insufficient permissions') || msg.includes('PERMISSION_DENIED')) {
      throw new Error(
        'Passcode verification failed or invitation expired/revoked. Please check the 6-character passcode with the elderly Care Circle owner.',
      );
    }
    handleFirestoreError(error, OperationType.WRITE, circlePath);
  }

  const joinedCircleSnap = await getDoc(doc(db, 'careCircles', invite.circleId));
  if (joinedCircleSnap.exists()) {
    const joinedCircle = joinedCircleSnap.data() as CareCircle;
    await createNotification({
      circleId: invite.circleId,
      memberIds: joinedCircle.memberIds,
      createdByUid: params.uid,
      title: `${params.displayName} accepted Care Circle invitation`,
      detail: `Joined as ${invite.invitedRole} (${params.relationOverride?.trim() || invite.relation}).`,
      severity: 'info',
      eventType: 'member',
    });
  }

  return { circleId: invite.circleId, circleName: invite.circleName, alreadyMember: false };
}

export async function updateMemberPermissions(params: {
  circleId: string;
  memberUid: string;
  permissions: MemberPermissions;
  relation: string;
}): Promise<void> {
  const path = `careCircles/${params.circleId}/members/${params.memberUid}`;
  try {
    await updateDoc(doc(db, 'careCircles', params.circleId, 'members', params.memberUid), {
      permissions: params.permissions,
      relation: clipString(params.relation, 80) || 'Care Member',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function removeCircleMember(params: {
  circleId: string;
  targetUid: string;
  updatedMemberIds: string[];
}): Promise<void> {
  const path = `careCircles/${params.circleId}/members/${params.targetUid}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'careCircles', params.circleId, 'members', params.targetUid));
    batch.update(doc(db, 'careCircles', params.circleId), {
      memberIds: params.updatedMemberIds,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchCircleMembers(circleId: string, memberIds: string[]): Promise<CircleMember[]> {
  const results = await Promise.all(
    memberIds.map(async (uid) => {
      const path = `careCircles/${circleId}/members/${uid}`;
      try {
        const snap = await getDoc(doc(db, 'careCircles', circleId, 'members', uid));
        return snap.exists() ? (snap.data() as CircleMember) : null;
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, path);
      }
    }),
  );
  return results.filter((m): m is CircleMember => m !== null);
}

export async function syncSubcollectionMemberIds(circleId: string, memberIds: string[], currentUid: string): Promise<void> {
  const subcollections = [
    'medications',
    'medicationLogs',
    'appointments',
    'healthRecords',
    'routines',
    'routineLogs',
    'messages',
    'notifications',
    'tasks',
    'activityLogs',
    'emailReminders',
  ] as const;

  const sortedTarget = [...memberIds].sort().join(',');

  for (const sub of subcollections) {
    const colPath = `careCircles/${circleId}/${sub}`;
    try {
      const q = query(collection(db, 'careCircles', circleId, sub), where('memberIds', 'array-contains', currentUid));
      const snap = await getDocs(q);
      const needsSync = snap.docs.filter((d) => {
        const current = (d.data().memberIds as string[] | undefined) ?? [];
        return [...current].sort().join(',') !== sortedTarget;
      });
      if (needsSync.length === 0) continue;

      const batch = writeBatch(db);
      for (const docSnap of needsSync) {
        if (sub === 'messages' || sub === 'activityLogs') {
          batch.update(docSnap.ref, { memberIds });
        } else {
          batch.update(docSnap.ref, { memberIds, updatedAt: serverTimestamp() });
        }
      }
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, colPath);
    }
  }
}

// -----------------------------------------------------------------------------
// Immutable Care Activity Audit Logs
// -----------------------------------------------------------------------------
export async function createActivityLog(params: {
  circleId: string;
  memberIds: string[];
  userId: string;
  actorName: string;
  actorRole: MemberRole;
  action: string;
  recordId: string;
  recordType: ActivityRecordType;
  detail?: string;
}): Promise<string> {
  const id = generateId('act');
  const path = `careCircles/${params.circleId}/activityLogs/${id}`;
  try {
    await setDoc(doc(db, 'careCircles', params.circleId, 'activityLogs', id), {
      id,
      circleId: params.circleId,
      elderlyProfileId: params.circleId,
      userId: params.userId,
      actorName: clipString(params.actorName, 100) || 'Care Member',
      actorRole: params.actorRole,
      action: clipString(params.action, 160) || 'Performed care action',
      recordId: clipString(params.recordId, 128) || id,
      recordType: params.recordType,
      detail: clipString(params.detail, 400),
      memberIds: params.memberIds,
      timestamp: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// -----------------------------------------------------------------------------
// Notifications
// -----------------------------------------------------------------------------
export async function createNotification(params: {
  circleId: string;
  memberIds: string[];
  createdByUid: string;
  title: string;
  detail: string;
  severity: NotificationSeverity;
  eventType: NotificationEventType;
}): Promise<void> {
  const id = generateId('notif');
  const path = `careCircles/${params.circleId}/notifications/${id}`;
  try {
    await setDoc(doc(db, 'careCircles', params.circleId, 'notifications', id), {
      id,
      circleId: params.circleId,
      title: clipString(params.title, 140),
      detail: clipString(params.detail, 400),
      severity: params.severity,
      eventType: params.eventType,
      createdByUid: params.createdByUid,
      readByUids: [params.createdByUid],
      memberIds: params.memberIds,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function markNotificationRead(circleId: string, notification: CareNotification, uid: string): Promise<void> {
  if (notification.readByUids.includes(uid)) return;
  const path = `careCircles/${circleId}/notifications/${notification.id}`;
  try {
    await updateDoc(doc(db, 'careCircles', circleId, 'notifications', notification.id), {
      readByUids: arrayUnion(uid),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markAllNotificationsRead(circleId: string, notifications: CareNotification[], uid: string): Promise<void> {
  const unread = notifications.filter((n) => !n.readByUids.includes(uid));
  if (unread.length === 0) return;
  const path = `careCircles/${circleId}/notifications`;
  try {
    const batch = writeBatch(db);
    for (const notif of unread) {
      batch.update(doc(db, 'careCircles', circleId, 'notifications', notif.id), {
        readByUids: arrayUnion(uid),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// -----------------------------------------------------------------------------
// Medications & Dose Logs
// -----------------------------------------------------------------------------
export async function createMedication(params: {
  circleId: string;
  memberIds: string[];
  createdByUid: string;
  actorName?: string;
  actorRole?: MemberRole;
  name: string;
  dosage: string;
  frequency: string;
  scheduledTimes: string[];
  instructions?: string;
  prescribedBy?: string;
  remainingQuantity?: number;
  refillThreshold?: number;
  status?: MedicationStatus;
}): Promise<string> {
  const id = generateId('med');
  const path = `careCircles/${params.circleId}/medications/${id}`;
  try {
    await setDoc(doc(db, 'careCircles', params.circleId, 'medications', id), {
      id,
      circleId: params.circleId,
      name: clipString(params.name, 120),
      dosage: clipString(params.dosage, 80),
      frequency: clipString(params.frequency, 80),
      scheduledTimes: params.scheduledTimes.slice(0, 6),
      instructions: clipString(params.instructions, 400),
      prescribedBy: clipString(params.prescribedBy, 120),
      remainingQuantity: Math.max(0, Math.min(5000, Number(params.remainingQuantity ?? 30))),
      refillThreshold: Math.max(0, Math.min(500, Number(params.refillThreshold ?? 7))),
      status: params.status ?? 'active',
      createdByUid: params.createdByUid,
      memberIds: params.memberIds,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await createActivityLog({
      circleId: params.circleId,
      memberIds: params.memberIds,
      userId: params.createdByUid,
      actorName: params.actorName || 'Care Member',
      actorRole: params.actorRole ?? 'patient',
      action: `Medicine added: ${params.name} (${params.dosage})`,
      recordId: id,
      recordType: 'medication',
      detail: `${params.frequency} · Times: ${params.scheduledTimes.slice(0, 6).join(', ')}`,
    });

    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateMedication(
  circleId: string,
  medicationId: string,
  updates: {
    name: string;
    dosage?: string;
    frequency: string;
    scheduledTimes: string[];
    instructions?: string;
    prescribedBy?: string;
    remainingQuantity?: number;
    refillThreshold?: number;
    status: MedicationStatus;
  },
  actorMeta?: {
    memberIds: string[];
    uid: string;
    name: string;
    role: MemberRole;
  },
): Promise<void> {
  const path = `careCircles/${circleId}/medications/${medicationId}`;
  try {
    const payload: Record<string, unknown> = {
      name: clipString(updates.name, 120),
      frequency: clipString(updates.frequency, 80),
      scheduledTimes: updates.scheduledTimes.slice(0, 6),
      instructions: clipString(updates.instructions, 400),
      prescribedBy: clipString(updates.prescribedBy, 120),
      remainingQuantity: Math.max(0, Math.min(5000, Number(updates.remainingQuantity ?? 0))),
      refillThreshold: Math.max(0, Math.min(500, Number(updates.refillThreshold ?? 5))),
      status: updates.status,
      updatedAt: serverTimestamp(),
    };

    // Caretakers are strictly prevented from modifying prescribed medication dosages
    if (actorMeta?.role !== 'caretaker' && updates.dosage !== undefined) {
      payload.dosage = clipString(updates.dosage, 80);
    }

    await updateDoc(doc(db, 'careCircles', circleId, 'medications', medicationId), payload);

    if (actorMeta) {
      await createActivityLog({
        circleId,
        memberIds: actorMeta.memberIds,
        userId: actorMeta.uid,
        actorName: actorMeta.name,
        actorRole: actorMeta.role,
        action: `Medicine updated: ${updates.name}`,
        recordId: medicationId,
        recordType: 'medication',
        detail: `${updates.frequency} · Status: ${updates.status}`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteMedication(circleId: string, medicationId: string): Promise<void> {
  const path = `careCircles/${circleId}/medications/${medicationId}`;
  try {
    await deleteDoc(doc(db, 'careCircles', circleId, 'medications', medicationId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function logMedicationDose(params: {
  circleId: string;
  memberIds: string[];
  medication: Medication;
  existingLog?: MedicationLog;
  dateKey: string;
  scheduledTime: string;
  status: DoseStatus;
  assistanceMode?: MedicationAssistanceMode;
  notes?: string;
  uid: string;
  userName: string;
  actorRole?: MemberRole;
}): Promise<void> {
  const safeTime = params.scheduledTime.replace(/[^0-9A-Za-z]/g, '');
  const logId = params.existingLog?.id ?? `medlog_${params.medication.id}_${params.dateKey}_${safeTime}`.slice(0, 128);
  const path = `careCircles/${params.circleId}/medicationLogs/${logId}`;
  const resolvedRole: MemberRole = params.actorRole ?? 'patient';
  const resolvedMode: MedicationAssistanceMode =
    params.assistanceMode ?? (resolvedRole === 'patient' ? 'self' : 'assisted');

  const modeVerb =
    resolvedMode === 'administered'
      ? 'administered'
      : resolvedMode === 'assisted'
        ? 'assisted'
        : 'taken';

  try {
    const batch = writeBatch(db);
    if (params.existingLog) {
      batch.update(doc(db, 'careCircles', params.circleId, 'medicationLogs', logId), {
        status: params.status,
        assistanceMode: resolvedMode,
        notes: clipString(params.notes, 300),
        loggedByUid: params.uid,
        loggedByName: clipString(params.userName, 100),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(doc(db, 'careCircles', params.circleId, 'medicationLogs', logId), {
        id: logId,
        circleId: params.circleId,
        medicationId: params.medication.id,
        medicationName: clipString(params.medication.name, 120),
        dosage: clipString(params.medication.dosage, 80),
        dateKey: params.dateKey,
        scheduledTime: clipString(params.scheduledTime, 10),
        status: params.status,
        assistanceMode: resolvedMode,
        notes: clipString(params.notes, 300),
        loggedByUid: params.uid,
        loggedByName: clipString(params.userName, 100),
        memberIds: params.memberIds,
        loggedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const wasTaken = params.existingLog?.status === 'taken';
    const currentQty = params.medication.remainingQuantity ?? 0;
    const threshold = params.medication.refillThreshold ?? 7;

    let nextQtyAfterTake = currentQty;
    if (!wasTaken && params.status === 'taken' && currentQty > 0) {
      nextQtyAfterTake = Math.max(0, currentQty - 1);
      batch.update(doc(db, 'careCircles', params.circleId, 'medications', params.medication.id), {
        remainingQuantity: nextQtyAfterTake,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();

    const actionText =
      params.status === 'taken'
        ? resolvedMode === 'administered'
          ? `Medicine given: ${params.medication.name} (${params.medication.dosage})`
          : resolvedMode === 'assisted'
            ? `Medicine assisted: ${params.medication.name} (${params.medication.dosage})`
            : `Medicine confirmed: ${params.medication.name} (${params.medication.dosage})`
        : params.status === 'skipped'
          ? `Medicine skipped: ${params.medication.name} (${params.medication.dosage})`
          : `Medicine reset to pending: ${params.medication.name} (${params.medication.dosage})`;

    await createActivityLog({
      circleId: params.circleId,
      memberIds: params.memberIds,
      userId: params.uid,
      actorName: params.userName,
      actorRole: resolvedRole,
      action: actionText,
      recordId: logId,
      recordType: 'medication_log',
      detail: `Scheduled ${params.scheduledTime} on ${params.dateKey}${params.notes ? ` · ${params.notes}` : ''}`,
    });

    if (!wasTaken && params.status === 'taken' && currentQty > 0 && nextQtyAfterTake <= threshold) {
      await createNotification({
        circleId: params.circleId,
        memberIds: params.memberIds,
        createdByUid: params.uid,
        title: `Refill needed soon: ${params.medication.name}`,
        detail: `${nextQtyAfterTake} doses remaining (threshold ${threshold}). Dose ${modeVerb} and logged by ${params.userName}.`,
        severity: 'warning',
        eventType: 'medication',
      });
    } else if (params.status === 'taken') {
      await createNotification({
        circleId: params.circleId,
        memberIds: params.memberIds,
        createdByUid: params.uid,
        title: `Medication ${modeVerb}: ${params.medication.name} (${params.medication.dosage})`,
        detail: `${params.scheduledTime} dose logged as ${modeVerb} by ${params.userName}${params.notes ? ` — ${params.notes}` : '.'}`,
        severity: 'info',
        eventType: 'medication',
      });
    } else if (params.status === 'skipped') {
      await createNotification({
        circleId: params.circleId,
        memberIds: params.memberIds,
        createdByUid: params.uid,
        title: `Medication missed/skipped: ${params.medication.name} (${params.scheduledTime})`,
        detail: `${params.userName} marked the ${params.scheduledTime} dose as skipped${params.notes ? `: ${params.notes}` : '.'}`,
        severity: 'warning',
        eventType: 'medication',
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// -----------------------------------------------------------------------------
// Appointments
// -----------------------------------------------------------------------------
export async function createAppointment(params: {
  circleId: string;
  memberIds: string[];
  createdByUid: string;
  createdByName: string;
  actorRole?: MemberRole;
  title: string;
  doctorName: string;
  specialty?: string;
  clinicName?: string;
  location?: string;
  appointmentDate: string;
  appointmentTime: string;
  visitType: VisitType;
  prepNotes?: string;
}): Promise<string> {
  const id = generateId('appt');
  const path = `careCircles/${params.circleId}/appointments/${id}`;
  try {
    await setDoc(doc(db, 'careCircles', params.circleId, 'appointments', id), {
      id,
      circleId: params.circleId,
      title: clipString(params.title, 140),
      doctorName: clipString(params.doctorName, 120),
      specialty: clipString(params.specialty, 100),
      clinicName: clipString(params.clinicName, 140),
      location: clipString(params.location, 240),
      appointmentDate: params.appointmentDate,
      appointmentTime: clipString(params.appointmentTime, 10),
      visitType: params.visitType,
      prepNotes: clipString(params.prepNotes, 600),
      outcomeNotes: '',
      status: 'scheduled',
      createdByUid: params.createdByUid,
      memberIds: params.memberIds,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await createNotification({
      circleId: params.circleId,
      memberIds: params.memberIds,
      createdByUid: params.createdByUid,
      title: `Appointment scheduled: ${params.title}`,
      detail: `With ${params.doctorName} on ${params.appointmentDate} at ${params.appointmentTime}. Added by ${params.createdByName}.`,
      severity: 'info',
      eventType: 'appointment',
    });

    await createActivityLog({
      circleId: params.circleId,
      memberIds: params.memberIds,
      userId: params.createdByUid,
      actorName: params.createdByName,
      actorRole: params.actorRole ?? 'patient',
      action: `Appointment added: ${params.title}`,
      recordId: id,
      recordType: 'appointment',
      detail: `With ${params.doctorName} on ${params.appointmentDate} at ${params.appointmentTime}`,
    });

    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateAppointment(
  circleId: string,
  appointmentId: string,
  updates: {
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
  },
  notificationMeta?: {
    memberIds: string[];
    actorUid: string;
    actorName: string;
    actorRole?: MemberRole;
  },
): Promise<void> {
  const path = `careCircles/${circleId}/appointments/${appointmentId}`;
  try {
    await updateDoc(doc(db, 'careCircles', circleId, 'appointments', appointmentId), {
      title: clipString(updates.title, 140),
      doctorName: clipString(updates.doctorName, 120),
      specialty: clipString(updates.specialty, 100),
      clinicName: clipString(updates.clinicName, 140),
      location: clipString(updates.location, 240),
      appointmentDate: updates.appointmentDate,
      appointmentTime: clipString(updates.appointmentTime, 10),
      visitType: updates.visitType,
      prepNotes: clipString(updates.prepNotes, 600),
      outcomeNotes: clipString(updates.outcomeNotes, 800),
      status: updates.status,
      updatedAt: serverTimestamp(),
    });

    if (notificationMeta) {
      if (updates.status === 'completed') {
        await createNotification({
          circleId,
          memberIds: notificationMeta.memberIds,
          createdByUid: notificationMeta.actorUid,
          title: `Appointment completed: ${updates.title}`,
          detail: `Visit with ${updates.doctorName} on ${updates.appointmentDate} marked completed by ${notificationMeta.actorName}.`,
          severity: 'info',
          eventType: 'appointment',
        });
      } else if (updates.status === 'cancelled') {
        await createNotification({
          circleId,
          memberIds: notificationMeta.memberIds,
          createdByUid: notificationMeta.actorUid,
          title: `Appointment cancelled: ${updates.title}`,
          detail: `Visit with ${updates.doctorName} on ${updates.appointmentDate} at ${updates.appointmentTime} was cancelled by ${notificationMeta.actorName}.`,
          severity: 'warning',
          eventType: 'appointment',
        });
      }

      await createActivityLog({
        circleId,
        memberIds: notificationMeta.memberIds,
        userId: notificationMeta.actorUid,
        actorName: notificationMeta.actorName,
        actorRole: notificationMeta.actorRole ?? 'patient',
        action:
          updates.status === 'completed'
            ? `Appointment completed: ${updates.title}`
            : updates.status === 'cancelled'
              ? `Appointment cancelled: ${updates.title}`
              : `Appointment updated: ${updates.title}`,
        recordId: appointmentId,
        recordType: 'appointment',
        detail: `${updates.doctorName} · ${updates.appointmentDate}${updates.outcomeNotes ? ` · ${updates.outcomeNotes}` : ''}`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteAppointment(circleId: string, appointmentId: string): Promise<void> {
  const path = `careCircles/${circleId}/appointments/${appointmentId}`;
  try {
    await deleteDoc(doc(db, 'careCircles', circleId, 'appointments', appointmentId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// -----------------------------------------------------------------------------
// Health Records & Unusual Observations
// -----------------------------------------------------------------------------
export async function createHealthRecord(params: {
  circleId: string;
  memberIds: string[];
  createdByUid: string;
  createdByName: string;
  actorRole?: MemberRole;
  recordType: RecordType;
  title: string;
  recordedDate: string;
  providerName?: string;
  metricValue?: string;
  metricUnit?: string;
  summary?: string;
  flagged: boolean;
}): Promise<string> {
  const id = generateId('rec');
  const path = `careCircles/${params.circleId}/healthRecords/${id}`;
  try {
    await setDoc(doc(db, 'careCircles', params.circleId, 'healthRecords', id), {
      id,
      circleId: params.circleId,
      recordType: params.recordType,
      title: clipString(params.title, 140),
      recordedDate: params.recordedDate,
      providerName: clipString(params.providerName, 120),
      metricValue: clipString(params.metricValue, 80),
      metricUnit: clipString(params.metricUnit, 40),
      summary: clipString(params.summary, 1200),
      flagged: params.flagged,
      createdByUid: params.createdByUid,
      memberIds: params.memberIds,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (params.flagged) {
      await createNotification({
        circleId: params.circleId,
        memberIds: params.memberIds,
        createdByUid: params.createdByUid,
        title: `Flagged healthcare update: ${params.title}`,
        detail: `${params.metricValue ? `${params.metricValue} ${params.metricUnit ?? ''} — ` : ''}${params.summary || 'Marked for care team review'} (${params.createdByName}).`,
        severity: 'urgent',
        eventType: 'record',
      });
    } else {
      await createNotification({
        circleId: params.circleId,
        memberIds: params.memberIds,
        createdByUid: params.createdByUid,
        title: `New healthcare update: ${params.title}`,
        detail: `${params.metricValue ? `${params.metricValue} ${params.metricUnit ?? ''} · ` : ''}Recorded by ${params.createdByName}.`,
        severity: 'info',
        eventType: 'record',
      });
    }

    await createActivityLog({
      circleId: params.circleId,
      memberIds: params.memberIds,
      userId: params.createdByUid,
      actorName: params.createdByName,
      actorRole: params.actorRole ?? 'patient',
      action: params.flagged ? `Flagged health record: ${params.title}` : `Added health record: ${params.title}`,
      recordId: id,
      recordType: 'health_record',
      detail: `${params.metricValue ? `${params.metricValue} ${params.metricUnit ?? ''}`.trim() : params.recordType} (${params.recordedDate})`,
    });

    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function reportUnusualObservation(params: {
  circleId: string;
  memberIds: string[];
  canCreateHealthRecord: boolean;
  observerUid: string;
  observerName: string;
  observerRole: MemberRole;
  observationTitle: string;
  observedDate: string;
  urgency: 'warning' | 'urgent';
  vitalReading?: string;
  vitalUnit?: string;
  summary: string;
}): Promise<string> {
  const summaryText = clipString(params.summary, 1100);
  const titleText = clipString(params.observationTitle, 140);
  let targetRecordId = '';

  if (params.canCreateHealthRecord) {
    const recId = generateId('rec');
    const recPath = `careCircles/${params.circleId}/healthRecords/${recId}`;
    try {
      await setDoc(doc(db, 'careCircles', params.circleId, 'healthRecords', recId), {
        id: recId,
        circleId: params.circleId,
        recordType: 'clinical_note',
        title: titleText,
        recordedDate: params.observedDate,
        providerName: clipString(params.observerName, 120),
        metricValue: clipString(params.vitalReading, 80),
        metricUnit: clipString(params.vitalUnit, 40),
        summary: summaryText,
        flagged: true,
        createdByUid: params.observerUid,
        memberIds: params.memberIds,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      targetRecordId = recId;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, recPath);
    }
  }

  const msgId = generateId('msg');
  const msgPath = `careCircles/${params.circleId}/messages/${msgId}`;
  try {
    const readingPrefix = params.vitalReading
      ? ` [Measurement: ${params.vitalReading}${params.vitalUnit ? ` ${params.vitalUnit}` : ''}]`
      : '';
    await setDoc(doc(db, 'careCircles', params.circleId, 'messages', msgId), {
      id: msgId,
      circleId: params.circleId,
      senderUid: params.observerUid,
      senderName: clipString(params.observerName, 100),
      senderRole: params.observerRole,
      category: 'alert',
      body: clipString(`Unusual Observation — ${titleText}${readingPrefix}: ${summaryText}`, 1500),
      urgent: params.urgency === 'urgent',
      memberIds: params.memberIds,
      createdAt: serverTimestamp(),
    });
    if (!targetRecordId) {
      targetRecordId = msgId;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, msgPath);
  }

  await createNotification({
    circleId: params.circleId,
    memberIds: params.memberIds,
    createdByUid: params.observerUid,
    title: `Unusual observation reported: ${titleText}`,
    detail: `${params.vitalReading ? `${params.vitalReading} ${params.vitalUnit ?? ''} — ` : ''}${summaryText} (${params.observerName})`,
    severity: params.urgency,
    eventType: params.canCreateHealthRecord ? 'record' : 'message',
  });

  await createActivityLog({
    circleId: params.circleId,
    memberIds: params.memberIds,
    userId: params.observerUid,
    actorName: params.observerName,
    actorRole: params.observerRole,
    action: `Reported unusual observation: ${titleText}`,
    recordId: targetRecordId,
    recordType: 'observation',
    detail: `${params.urgency.toUpperCase()}${params.vitalReading ? ` · ${params.vitalReading} ${params.vitalUnit ?? ''}`.trim() : ''} · ${summaryText}`,
  });

  return targetRecordId;
}

export async function updateHealthRecord(
  circleId: string,
  recordId: string,
  updates: {
    recordType: RecordType;
    title: string;
    recordedDate: string;
    providerName?: string;
    metricValue?: string;
    metricUnit?: string;
    summary?: string;
    flagged: boolean;
  },
  actorMeta?: {
    memberIds: string[];
    uid: string;
    name: string;
    role: MemberRole;
  },
): Promise<void> {
  const path = `careCircles/${circleId}/healthRecords/${recordId}`;
  try {
    await updateDoc(doc(db, 'careCircles', circleId, 'healthRecords', recordId), {
      recordType: updates.recordType,
      title: clipString(updates.title, 140),
      recordedDate: updates.recordedDate,
      providerName: clipString(updates.providerName, 120),
      metricValue: clipString(updates.metricValue, 80),
      metricUnit: clipString(updates.metricUnit, 40),
      summary: clipString(updates.summary, 1200),
      flagged: updates.flagged,
      updatedAt: serverTimestamp(),
    });

    if (actorMeta) {
      await createActivityLog({
        circleId,
        memberIds: actorMeta.memberIds,
        userId: actorMeta.uid,
        actorName: actorMeta.name,
        actorRole: actorMeta.role,
        action: `Updated health record: ${updates.title}`,
        recordId,
        recordType: 'health_record',
        detail: `${updates.metricValue ? `${updates.metricValue} ${updates.metricUnit ?? ''}`.trim() : updates.recordType} (${updates.recordedDate})`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteHealthRecord(circleId: string, recordId: string): Promise<void> {
  const path = `careCircles/${circleId}/healthRecords/${recordId}`;
  try {
    await deleteDoc(doc(db, 'careCircles', circleId, 'healthRecords', recordId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// -----------------------------------------------------------------------------
// Daily Care Routines & Logs
// -----------------------------------------------------------------------------
export async function createCareRoutine(params: {
  circleId: string;
  memberIds: string[];
  createdByUid: string;
  createdByName?: string;
  actorRole?: MemberRole;
  title: string;
  category: RoutineCategory;
  targetTime: string;
  instructions?: string;
}): Promise<string> {
  const id = generateId('rout');
  const path = `careCircles/${params.circleId}/routines/${id}`;
  try {
    await setDoc(doc(db, 'careCircles', params.circleId, 'routines', id), {
      id,
      circleId: params.circleId,
      title: clipString(params.title, 120),
      category: params.category,
      targetTime: clipString(params.targetTime, 10),
      instructions: clipString(params.instructions, 400),
      active: true,
      createdByUid: params.createdByUid,
      memberIds: params.memberIds,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (params.createdByName) {
      await createActivityLog({
        circleId: params.circleId,
        memberIds: params.memberIds,
        userId: params.createdByUid,
        actorName: params.createdByName,
        actorRole: params.actorRole ?? 'patient',
        action: `Created daily care routine: ${params.title}`,
        recordId: id,
        recordType: 'routine',
        detail: `${params.category} · Target ${params.targetTime}`,
      });
    }

    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateCareRoutine(
  circleId: string,
  routineId: string,
  updates: {
    title: string;
    category: RoutineCategory;
    targetTime: string;
    instructions?: string;
    active: boolean;
  },
): Promise<void> {
  const path = `careCircles/${circleId}/routines/${routineId}`;
  try {
    await updateDoc(doc(db, 'careCircles', circleId, 'routines', routineId), {
      title: clipString(updates.title, 120),
      category: updates.category,
      targetTime: clipString(updates.targetTime, 10),
      instructions: clipString(updates.instructions, 400),
      active: updates.active,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCareRoutine(circleId: string, routineId: string): Promise<void> {
  const path = `careCircles/${circleId}/routines/${routineId}`;
  try {
    await deleteDoc(doc(db, 'careCircles', circleId, 'routines', routineId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function toggleRoutineCompletion(params: {
  circleId: string;
  memberIds: string[];
  routine: CareRoutine;
  existingLog?: RoutineLog;
  dateKey: string;
  completed: boolean;
  uid: string;
  userName: string;
  actorRole?: MemberRole;
}): Promise<void> {
  const logId = params.existingLog?.id ?? `routlog_${params.routine.id}_${params.dateKey}`.slice(0, 128);
  const path = `careCircles/${params.circleId}/routineLogs/${logId}`;
  try {
    if (params.existingLog) {
      await updateDoc(doc(db, 'careCircles', params.circleId, 'routineLogs', logId), {
        completed: params.completed,
        completedByUid: params.uid,
        completedByName: clipString(params.userName, 100),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'careCircles', params.circleId, 'routineLogs', logId), {
        id: logId,
        circleId: params.circleId,
        routineId: params.routine.id,
        dateKey: params.dateKey,
        completed: params.completed,
        completedByUid: params.uid,
        completedByName: clipString(params.userName, 100),
        memberIds: params.memberIds,
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await createActivityLog({
      circleId: params.circleId,
      memberIds: params.memberIds,
      userId: params.uid,
      actorName: params.userName,
      actorRole: params.actorRole ?? 'caretaker',
      action: params.completed
        ? `Completed daily routine: ${params.routine.title}`
        : `Reopened daily routine: ${params.routine.title}`,
      recordId: logId,
      recordType: 'routine',
      detail: `${params.routine.category} · ${params.dateKey}`,
    });

    if (params.completed) {
      await createNotification({
        circleId: params.circleId,
        memberIds: params.memberIds,
        createdByUid: params.uid,
        title: `Routine completed: ${params.routine.title}`,
        detail: `${params.userName} logged ${params.routine.category} routine completion for ${params.dateKey}.`,
        severity: 'info',
        eventType: 'member',
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// -----------------------------------------------------------------------------
// Daily Care Tasks (Caretaker Task Management System)
// -----------------------------------------------------------------------------
export async function createCareTask(params: {
  circleId: string;
  memberIds: string[];
  title: string;
  category: CareTaskCategory;
  dueDate: string;
  dueTime: string;
  priority: CareTaskPriority;
  notes?: string;
  assignedToUid?: string;
  assignedToName?: string;
  createdByUid: string;
  createdByName: string;
  actorRole: MemberRole;
}): Promise<string> {
  const id = generateId('task');
  const path = `careCircles/${params.circleId}/tasks/${id}`;
  try {
    await setDoc(doc(db, 'careCircles', params.circleId, 'tasks', id), {
      id,
      circleId: params.circleId,
      title: clipString(params.title, 140),
      category: params.category,
      dueDate: params.dueDate,
      dueTime: clipString(params.dueTime, 10),
      priority: params.priority,
      status: 'pending',
      notes: clipString(params.notes, 500),
      assignedToUid: clipString(params.assignedToUid, 128),
      assignedToName: clipString(params.assignedToName, 100),
      createdByUid: params.createdByUid,
      createdByName: clipString(params.createdByName, 100),
      completedByUid: '',
      completedByName: '',
      memberIds: params.memberIds,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await createActivityLog({
      circleId: params.circleId,
      memberIds: params.memberIds,
      userId: params.createdByUid,
      actorName: params.createdByName,
      actorRole: params.actorRole,
      action: `Created care task: ${params.title}`,
      recordId: id,
      recordType: 'task',
      detail: `Due ${params.dueDate} at ${params.dueTime} · Priority: ${params.priority}`,
    });

    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateCareTaskStatus(params: {
  circleId: string;
  memberIds: string[];
  task: CareTask;
  nextStatus: CareTaskStatus;
  actorUid: string;
  actorName: string;
  actorRole: MemberRole;
  notes?: string;
}): Promise<void> {
  const path = `careCircles/${params.circleId}/tasks/${params.task.id}`;
  try {
    const updates: Record<string, unknown> = {
      status: params.nextStatus,
      completedByUid: params.nextStatus === 'completed' ? params.actorUid : '',
      completedByName: params.nextStatus === 'completed' ? clipString(params.actorName, 100) : '',
      updatedAt: serverTimestamp(),
    };
    if (params.notes !== undefined) {
      updates.notes = clipString(params.notes, 500);
    }

    await updateDoc(doc(db, 'careCircles', params.circleId, 'tasks', params.task.id), updates);

    const actionVerb =
      params.nextStatus === 'completed'
        ? 'Completed care task'
        : params.nextStatus === 'in_progress'
          ? 'Started care task'
          : 'Reopened care task';

    await createActivityLog({
      circleId: params.circleId,
      memberIds: params.memberIds,
      userId: params.actorUid,
      actorName: params.actorName,
      actorRole: params.actorRole,
      action: `${actionVerb}: ${params.task.title}`,
      recordId: params.task.id,
      recordType: 'task',
      detail: `${params.task.category} · Due ${params.task.dueDate} at ${params.task.dueTime}`,
    });

    if (params.nextStatus === 'completed') {
      await createNotification({
        circleId: params.circleId,
        memberIds: params.memberIds,
        createdByUid: params.actorUid,
        title: `Care task completed: ${params.task.title}`,
        detail: `${params.actorName} completed this ${params.task.category.replace('_', ' ')} task.`,
        severity: 'info',
        eventType: 'member',
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCareTask(params: {
  circleId: string;
  memberIds: string[];
  taskId: string;
  taskTitle: string;
  actorUid: string;
  actorName: string;
  actorRole: MemberRole;
}): Promise<void> {
  const path = `careCircles/${params.circleId}/tasks/${params.taskId}`;
  try {
    await deleteDoc(doc(db, 'careCircles', params.circleId, 'tasks', params.taskId));
    await createActivityLog({
      circleId: params.circleId,
      memberIds: params.memberIds,
      userId: params.actorUid,
      actorName: params.actorName,
      actorRole: params.actorRole,
      action: `Removed care task: ${params.taskTitle}`,
      recordId: params.taskId,
      recordType: 'task',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// -----------------------------------------------------------------------------
// Care Messages
// -----------------------------------------------------------------------------
export async function sendCareMessage(params: {
  circleId: string;
  memberIds: string[];
  senderUid: string;
  senderName: string;
  senderRole: MemberRole;
  category: MessageCategory;
  body: string;
  urgent: boolean;
}): Promise<string> {
  const id = generateId('msg');
  const path = `careCircles/${params.circleId}/messages/${id}`;
  try {
    await setDoc(doc(db, 'careCircles', params.circleId, 'messages', id), {
      id,
      circleId: params.circleId,
      senderUid: params.senderUid,
      senderName: clipString(params.senderName, 100),
      senderRole: params.senderRole,
      category: params.category,
      body: clipString(params.body, 1500),
      urgent: params.urgent,
      memberIds: params.memberIds,
      createdAt: serverTimestamp(),
    });

    await createActivityLog({
      circleId: params.circleId,
      memberIds: params.memberIds,
      userId: params.senderUid,
      actorName: params.senderName,
      actorRole: params.senderRole,
      action: params.urgent ? 'Posted urgent care note' : `Added ${params.category.replace('_', ' ')} care note`,
      recordId: id,
      recordType: 'message',
      detail: clipString(params.body, 200),
    });

    if (params.urgent) {
      await createNotification({
        circleId: params.circleId,
        memberIds: params.memberIds,
        createdByUid: params.senderUid,
        title: `Urgent note from ${params.senderName}`,
        detail: clipString(params.body, 300),
        severity: 'urgent',
        eventType: 'message',
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteCareMessage(circleId: string, messageId: string): Promise<void> {
  const path = `careCircles/${circleId}/messages/${messageId}`;
  try {
    await deleteDoc(doc(db, 'careCircles', circleId, 'messages', messageId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// -----------------------------------------------------------------------------
// Starter Clinical Kit (Real Firestore Batch Seed on Explicit User Click)
// -----------------------------------------------------------------------------
export async function seedStarterCareData(params: {
  circle: CareCircle;
  uid: string;
  userName: string;
  userRole: MemberRole;
}): Promise<void> {
  const { circle, uid, userName, userRole } = params;
  const path = `careCircles/${circle.id}/seed`;
  const today = getTodayKey();
  const nextWeek = getOffsetDateKey(5);
  const twoWeeks = getOffsetDateKey(12);
  const yesterday = getOffsetDateKey(-1);

  try {
    const batch = writeBatch(db);

    const meds = [
      {
        id: generateId('med'),
        name: 'Lisinopril',
        dosage: '10 mg',
        frequency: 'Once daily',
        scheduledTimes: ['08:00'],
        instructions: 'Take each morning with a full glass of water.',
        prescribedBy: circle.primaryPhysician || 'Dr. Elena Rostova',
        remainingQuantity: 24,
        refillThreshold: 7,
      },
      {
        id: generateId('med'),
        name: 'Metformin ER',
        dosage: '500 mg',
        frequency: 'Twice daily',
        scheduledTimes: ['08:00', '19:30'],
        instructions: 'Take with breakfast and evening meal to prevent stomach upset.',
        prescribedBy: circle.primaryPhysician || 'Dr. Elena Rostova',
        remainingQuantity: 18,
        refillThreshold: 10,
      },
      {
        id: generateId('med'),
        name: 'Vitamin D3',
        dosage: '1000 IU',
        frequency: 'Once daily',
        scheduledTimes: ['12:30'],
        instructions: 'Take after lunch for optimal absorption.',
        prescribedBy: circle.primaryPhysician || 'Dr. Elena Rostova',
        remainingQuantity: 42,
        refillThreshold: 10,
      },
    ];

    for (const med of meds) {
      batch.set(doc(db, 'careCircles', circle.id, 'medications', med.id), {
        ...med,
        circleId: circle.id,
        status: 'active',
        createdByUid: uid,
        memberIds: circle.memberIds,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const appts = [
      {
        id: generateId('appt'),
        title: 'Cardiology & Blood Pressure Review',
        doctorName: 'Dr. Marcus Vance',
        specialty: 'Cardiology',
        clinicName: 'Mercy Senior Heart Center',
        location: 'Suite 410, 820 Elmwood Ave',
        appointmentDate: nextWeek,
        appointmentTime: '10:30',
        visitType: 'in_person' as VisitType,
        prepNotes: 'Bring 7-day morning blood pressure log and updated medication list.',
      },
      {
        id: generateId('appt'),
        title: 'Quarterly Primary Care Telehealth Check-In',
        doctorName: circle.primaryPhysician || 'Dr. Elena Rostova',
        specialty: 'Geriatric Medicine',
        clinicName: 'Oakridge Family Health',
        location: 'Secure Video Consultation',
        appointmentDate: twoWeeks,
        appointmentTime: '14:00',
        visitType: 'telehealth' as VisitType,
        prepNotes: 'Review fasting glucose trends and refill Lisinopril prescription.',
      },
    ];

    for (const appt of appts) {
      batch.set(doc(db, 'careCircles', circle.id, 'appointments', appt.id), {
        ...appt,
        circleId: circle.id,
        outcomeNotes: '',
        status: 'scheduled',
        createdByUid: uid,
        memberIds: circle.memberIds,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const records = [
      {
        id: generateId('rec'),
        recordType: 'vital_sign' as RecordType,
        title: 'Morning Blood Pressure Reading',
        recordedDate: today,
        providerName: 'Home Cuff Monitor',
        metricValue: '126/78',
        metricUnit: 'mmHg',
        summary: 'Resting sitting reading after 5 minutes calm rest; pulse 68 bpm.',
        flagged: false,
      },
      {
        id: generateId('rec'),
        recordType: 'lab_result' as RecordType,
        title: 'HbA1c & Comprehensive Metabolic Panel',
        recordedDate: yesterday,
        providerName: 'Oakridge Diagnostic Lab',
        metricValue: '6.6',
        metricUnit: '% HbA1c',
        summary: 'Stable glycemic control within target geriatric range; kidney function eGFR nominal.',
        flagged: false,
      },
    ];

    for (const rec of records) {
      batch.set(doc(db, 'careCircles', circle.id, 'healthRecords', rec.id), {
        ...rec,
        circleId: circle.id,
        createdByUid: uid,
        memberIds: circle.memberIds,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const routines = [
      {
        id: generateId('rout'),
        title: 'Morning Hydration (16 oz Warm Water)',
        category: 'hydration' as RoutineCategory,
        targetTime: '07:30',
        instructions: 'Drink slowly before morning medications.',
      },
      {
        id: generateId('rout'),
        title: '15-Minute Gentle Garden Walk & Balance',
        category: 'mobility' as RoutineCategory,
        targetTime: '10:00',
        instructions: 'Supportive walking shoes; stay on flat walkway.',
      },
      {
        id: generateId('rout'),
        title: 'Evening Wind-Down & Foot Check',
        category: 'hygiene' as RoutineCategory,
        targetTime: '20:30',
        instructions: 'Warm rinse, lotion, and prepare next-day pill organizer.',
      },
    ];

    for (const r of routines) {
      batch.set(doc(db, 'careCircles', circle.id, 'routines', r.id), {
        ...r,
        circleId: circle.id,
        active: true,
        createdByUid: uid,
        memberIds: circle.memberIds,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const msgId = generateId('msg');
    batch.set(doc(db, 'careCircles', circle.id, 'messages', msgId), {
      id: msgId,
      circleId: circle.id,
      senderUid: uid,
      senderName: clipString(userName, 100),
      senderRole: userRole,
      category: 'update',
      body: `Initialized ${circle.patientName}'s daily care schedule, appointments, and baseline records. Issue a time-limited invitation from Care Circle Settings to connect family members or caretakers.`,
      urgent: false,
      memberIds: circle.memberIds,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// -----------------------------------------------------------------------------
// Automatic Email Reminder Sync & Verification
// -----------------------------------------------------------------------------
export interface ReminderServiceStatus {
  configured: boolean;
  provider: 'resend' | 'smtp' | 'unconfigured';
  gracePeriodMinutes: number;
  schedulerActive: boolean;
}

export async function fetchReminderServiceStatus(): Promise<ReminderServiceStatus> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in first.');
  }
  const idToken = await user.getIdToken();
  const response = await fetch('/api/reminders/status', {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Unable to check email reminder service status.');
  }
  return data as ReminderServiceStatus;
}

export async function syncReminderSession(circleId: string, runNow = true): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified || !circleId) return;
  const idToken = await user.getIdToken();
  const response = await fetch('/api/reminders/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      circleId,
      timeZone: getBrowserTimeZone(),
      runNow,
    }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Unable to sync email reminders.');
  }
}

export async function sendTestReminderEmailRequest(circleId: string): Promise<{
  ok: boolean;
  provider: string;
  messageId?: string;
  deliveryId?: string;
}> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in with a verified email account first.');
  }
  const idToken = await user.getIdToken(true);
  const response = await fetch('/api/reminders/test-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ circleId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Failed to deliver test reminder email.');
  }
  return data;
}
