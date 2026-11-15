import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, mapFirebaseAuthError } from '../lib/firebase';
import { parseReadableError } from '../lib/utils';
import {
  createUserProfile,
  fetchCircleMembers,
  listOwnerInvitations,
  listPendingInvitesForEmail,
  syncReminderSession,
  syncSubcollectionMemberIds,
  updateUserProfile,
} from '../services/careService';
import {
  AccountType,
  Appointment,
  CareActivityLog,
  CareCircle,
  CareMessage,
  CareNotification,
  CareRoutine,
  CareTask,
  CircleInvite,
  CircleMember,
  EmailReminderDelivery,
  HealthRecord,
  Medication,
  MedicationLog,
  OperationType,
  PermissionKey,
  RoutineLog,
  UserProfile,
} from '../types/healthcare';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface PendingSignupProfile {
  displayName: string;
  accountType: AccountType;
  phone?: string;
  emergencyContact?: string;
}

interface CareContextValue {
  firebaseUser: User | null;
  authReady: boolean;
  emailVerified: boolean;
  profile: UserProfile | null;
  profileLoading: boolean;
  circles: CareCircle[];
  circlesLoading: boolean;
  activeCircle: CareCircle | null;
  activeCircleDataLoading: boolean;
  activeCircleDataError: string | null;
  members: CircleMember[];
  currentMember: CircleMember | null;
  isCircleOwner: boolean;
  can: (permission: PermissionKey) => boolean;
  pendingInvitesForMe: CircleInvite[];
  ownerInvitations: CircleInvite[];
  refreshPendingInvites: () => Promise<void>;
  refreshOwnerInvitations: () => Promise<void>;
  refreshCircleMembers: () => Promise<void>;
  medications: Medication[];
  medicationLogs: MedicationLog[];
  appointments: Appointment[];
  healthRecords: HealthRecord[];
  routines: CareRoutine[];
  routineLogs: RoutineLog[];
  tasks: CareTask[];
  activityLogs: CareActivityLog[];
  messages: CareMessage[];
  notifications: CareNotification[];
  emailReminders: EmailReminderDelivery[];
  unreadNotificationCount: number;
  toasts: ToastItem[];
  pushToast: (type: ToastItem['type'], message: string) => void;
  dismissToast: (id: string) => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (params: {
    email: string;
    password: string;
    displayName: string;
    accountType: AccountType;
    phone?: string;
    emergencyContact?: string;
  }) => Promise<void>;
  sendResetPassword: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshVerificationStatus: () => Promise<boolean>;
  logout: () => Promise<void>;
  selectActiveCircle: (circleId: string) => Promise<void>;
}

const CareContext = createContext<CareContextValue | undefined>(undefined);

function getPendingProfileStorageKey(uid: string): string {
  return `careconnect_pending_profile_${uid}`;
}

export function CareProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [circles, setCircles] = useState<CareCircle[]>([]);
  const [circlesLoading, setCirclesLoading] = useState(true);

  const [activeCircleId, setActiveCircleId] = useState<string>('');
  const [activeCircleDataLoading, setActiveCircleDataLoading] = useState(false);
  const [activeCircleDataError, setActiveCircleDataError] = useState<string | null>(null);

  const [members, setMembers] = useState<CircleMember[]>([]);
  const [liveSelfMember, setLiveSelfMember] = useState<CircleMember | null>(null);
  const [liveSelfLoadedCircleId, setLiveSelfLoadedCircleId] = useState<string>('');
  const [pendingInvitesForMe, setPendingInvitesForMe] = useState<CircleInvite[]>([]);
  const [ownerInvitations, setOwnerInvitations] = useState<CircleInvite[]>([]);

  const [medications, setMedications] = useState<Medication[]>([]);
  const [medicationLogs, setMedicationLogs] = useState<MedicationLog[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [healthRecords, setHealthRecords] = useState<HealthRecord[]>([]);
  const [routines, setRoutines] = useState<CareRoutine[]>([]);
  const [routineLogs, setRoutineLogs] = useState<RoutineLog[]>([]);
  const [tasks, setTasks] = useState<CareTask[]>([]);
  const [activityLogs, setActivityLogs] = useState<CareActivityLog[]>([]);
  const [messages, setMessages] = useState<CareMessage[]>([]);
  const [notifications, setNotifications] = useState<CareNotification[]>([]);
  const [emailReminders, setEmailReminders] = useState<EmailReminderDelivery[]>([]);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const lastSyncedSignatureRef = useRef<string>('');
  const autoProfileAttemptedRef = useRef<Set<string>>(new Set());

  const emailVerified = Boolean(firebaseUser?.emailVerified);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback((type: ToastItem['type'], message: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5500);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const readable = mapFirebaseAuthError(error);
      pushToast('error', readable);
      throw new Error(readable);
    }
  }, [pushToast]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      try {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } catch (error) {
        const readable = mapFirebaseAuthError(error);
        throw new Error(readable);
      }
    },
    [],
  );

  const signUpWithEmail = useCallback(
    async (params: {
      email: string;
      password: string;
      displayName: string;
      accountType: AccountType;
      phone?: string;
      emergencyContact?: string;
    }) => {
      try {
        const cred = await createUserWithEmailAndPassword(auth, params.email.trim(), params.password);
        await updateProfile(cred.user, { displayName: params.displayName.trim() });

        if (typeof window !== 'undefined') {
          const pending: PendingSignupProfile = {
            displayName: params.displayName.trim(),
            accountType: params.accountType,
            phone: params.phone?.trim() || '',
            emergencyContact: params.emergencyContact?.trim() || '',
          };
          window.localStorage.setItem(getPendingProfileStorageKey(cred.user.uid), JSON.stringify(pending));
          window.sessionStorage.setItem('careconnect_preferred_role', params.accountType);
        }

        await sendEmailVerification(cred.user);
        setFirebaseUser({ ...cred.user } as User);
        pushToast('success', `Verification email sent to ${params.email.trim()}.`);
      } catch (error) {
        const readable = mapFirebaseAuthError(error);
        throw new Error(readable);
      }
    },
    [pushToast],
  );

  const sendResetPassword = useCallback(async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (error) {
      throw new Error(mapFirebaseAuthError(error));
    }
  }, []);

  const resendVerificationEmail = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Please sign in first.');
    }
    try {
      await sendEmailVerification(user);
      pushToast('success', `Verification link re-sent to ${user.email}.`);
    } catch (error) {
      const readable = mapFirebaseAuthError(error);
      pushToast('error', readable);
      throw new Error(readable);
    }
  }, [pushToast]);

  const refreshVerificationStatus = useCallback(async (): Promise<boolean> => {
    const user = auth.currentUser;
    if (!user) return false;
    await user.reload();
    await user.getIdToken(true);
    const reloaded = auth.currentUser;
    setFirebaseUser(reloaded ? ({ ...reloaded } as User) : null);
    return Boolean(reloaded?.emailVerified);
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
      setProfile(null);
      setCircles([]);
      setMembers([]);
      setLiveSelfMember(null);
      setLiveSelfLoadedCircleId('');
      setPendingInvitesForMe([]);
      setOwnerInvitations([]);
      setMessages([]);
      setNotifications([]);
      setEmailReminders([]);
      setActiveCircleId('');
      pushToast('info', 'Signed out securely from CareConnect AI.');
    } catch (error) {
      pushToast('error', parseReadableError(error));
    }
  }, [pushToast]);

  // 1. Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user || !user.emailVerified) {
        setProfile(null);
        setProfileLoading(false);
        setCircles([]);
        setCirclesLoading(false);
        setPendingInvitesForMe([]);
        setOwnerInvitations([]);
      }
    });
    return () => unsub();
  }, []);

  // 2. Private User Profile Listener (only when emailVerified is true)
  useEffect(() => {
    if (!authReady || !firebaseUser || !emailVerified) {
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    const path = `users/${firebaseUser.uid}`;
    const unsub = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      async (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserProfile;
          setProfile(data);
          if (data.activeCircleId) {
            setActiveCircleId((prev) => prev || data.activeCircleId || '');
          }
          if (typeof window !== 'undefined') {
            window.localStorage.removeItem(getPendingProfileStorageKey(firebaseUser.uid));
          }
          setProfileLoading(false);
          return;
        }

        // Auto-create Firestore profile from pre-verification signup metadata once email is verified
        if (typeof window !== 'undefined' && !autoProfileAttemptedRef.current.has(firebaseUser.uid)) {
          const rawPending = window.localStorage.getItem(getPendingProfileStorageKey(firebaseUser.uid));
          if (rawPending) {
            autoProfileAttemptedRef.current.add(firebaseUser.uid);
            try {
              const parsed = JSON.parse(rawPending) as PendingSignupProfile;
              await createUserProfile({
                uid: firebaseUser.uid,
                displayName: parsed.displayName || firebaseUser.displayName || 'CareConnect User',
                email: firebaseUser.email || '',
                accountType: parsed.accountType,
                phone: parsed.phone,
                emergencyContact: parsed.emergencyContact,
              });
              window.localStorage.removeItem(getPendingProfileStorageKey(firebaseUser.uid));
              return;
            } catch (err) {
              console.warn('Unable to auto-create pending profile:', err);
            }
          }
        }

        setProfile(null);
        setProfileLoading(false);
      },
      (error) => {
        setProfileLoading(false);
        handleFirestoreError(error, OperationType.GET, path);
      },
    );
    return () => unsub();
  }, [authReady, firebaseUser, emailVerified]);

  // 3. Pending Invitations addressed to current verified email
  const refreshPendingInvites = useCallback(async () => {
    if (!firebaseUser?.email || !emailVerified) {
      setPendingInvitesForMe([]);
      return;
    }
    try {
      const list = await listPendingInvitesForEmail(firebaseUser.email);
      setPendingInvitesForMe(list);
    } catch {
      setPendingInvitesForMe([]);
    }
  }, [firebaseUser?.email, emailVerified]);

  useEffect(() => {
    if (!authReady || !firebaseUser || !emailVerified) return;
    void refreshPendingInvites();
  }, [authReady, firebaseUser, emailVerified, refreshPendingInvites]);

  // 4. Care Circles List Listener (scoped strictly to user's membership)
  useEffect(() => {
    if (!authReady || !firebaseUser || !emailVerified || !profile) {
      setCircles([]);
      setCirclesLoading(false);
      return;
    }
    setCirclesLoading(true);
    const path = 'careCircles';
    const q = query(collection(db, 'careCircles'), where('memberIds', 'array-contains', firebaseUser.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as CareCircle);
        list.sort((a, b) => a.name.localeCompare(b.name));
        setCircles(list);
        setCirclesLoading(false);

        setActiveCircleId((prev) => {
          if (prev && list.some((c) => c.id === prev)) return prev;
          if (profile.activeCircleId && list.some((c) => c.id === profile.activeCircleId)) {
            return profile.activeCircleId;
          }
          return list[0]?.id ?? '';
        });
      },
      (error) => {
        setCirclesLoading(false);
        handleFirestoreError(error, OperationType.LIST, path);
      },
    );
    return () => unsub();
  }, [authReady, firebaseUser, emailVerified, profile]);

  const activeCircle = useMemo(
    () => circles.find((c) => c.id === activeCircleId) ?? null,
    [circles, activeCircleId],
  );

  const isCircleOwner = Boolean(firebaseUser && activeCircle && activeCircle.ownerId === firebaseUser.uid);

  const refreshOwnerInvitations = useCallback(async () => {
    if (!firebaseUser || !activeCircle || activeCircle.ownerId !== firebaseUser.uid || !emailVerified) {
      setOwnerInvitations([]);
      return;
    }
    try {
      const list = await listOwnerInvitations(firebaseUser.uid, activeCircle.id);
      setOwnerInvitations(list);
    } catch {
      setOwnerInvitations([]);
    }
  }, [firebaseUser, activeCircle, emailVerified]);

  useEffect(() => {
    void refreshOwnerInvitations();
  }, [refreshOwnerInvitations]);

  const selectActiveCircle = useCallback(
    async (circleId: string) => {
      setActiveCircleId(circleId);
      if (firebaseUser && emailVerified) {
        try {
          await updateUserProfile(firebaseUser.uid, { activeCircleId: circleId });
        } catch (error) {
          pushToast('error', parseReadableError(error));
        }
      }
    },
    [firebaseUser, emailVerified, pushToast],
  );

  // 5. Fetch Care Circle Members by circle.memberIds
  const memberIdsSignature = activeCircle ? [...activeCircle.memberIds].sort().join(',') : '';

  const refreshCircleMembers = useCallback(async () => {
    if (!authReady || !firebaseUser || !emailVerified || !activeCircle) {
      setMembers([]);
      return;
    }
    try {
      const loaded = await fetchCircleMembers(activeCircle.id, activeCircle.memberIds);
      setMembers(loaded);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    }
  }, [authReady, firebaseUser, emailVerified, activeCircle, pushToast]);

  useEffect(() => {
    if (!authReady || !firebaseUser || !emailVerified || !activeCircle) {
      setMembers([]);
      return;
    }

    let cancelled = false;
    fetchCircleMembers(activeCircle.id, activeCircle.memberIds)
      .then((loaded) => {
        if (!cancelled) setMembers(loaded);
      })
      .catch((error) => {
        if (!cancelled) pushToast('error', parseReadableError(error));
      });

    const sig = `${activeCircle.id}:${memberIdsSignature}`;
    if (lastSyncedSignatureRef.current !== sig && (isCircleOwner || activeCircle.memberIds.length > 1)) {
      lastSyncedSignatureRef.current = sig;
      void syncSubcollectionMemberIds(activeCircle.id, activeCircle.memberIds, firebaseUser.uid).catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [authReady, firebaseUser, emailVerified, activeCircle, isCircleOwner, memberIdsSignature, pushToast]);

  // 5b. Real-time permission listener on current user's member document
  useEffect(() => {
    if (!authReady || !firebaseUser || !emailVerified || !activeCircle) {
      setLiveSelfMember(null);
      setLiveSelfLoadedCircleId('');
      return;
    }

    const circleId = activeCircle.id;
    const memberPath = `careCircles/${circleId}/members/${firebaseUser.uid}`;
    const unsub = onSnapshot(
      doc(db, 'careCircles', circleId, 'members', firebaseUser.uid),
      (snap) => {
        if (snap.exists()) {
          const memberData = snap.data() as CircleMember;
          setLiveSelfMember(memberData);
          setMembers((prev) => {
            const idx = prev.findIndex((m) => m.uid === memberData.uid);
            if (idx === -1) return [...prev, memberData];
            const next = [...prev];
            next[idx] = memberData;
            return next;
          });
        } else {
          setLiveSelfMember(null);
        }
        setLiveSelfLoadedCircleId(circleId);
      },
      (err) => {
        setLiveSelfLoadedCircleId(circleId);
        handleFirestoreError(err, OperationType.GET, memberPath);
      },
    );
    return () => unsub();
  }, [authReady, firebaseUser, emailVerified, activeCircle?.id]);

  const currentMember = useMemo(() => {
    if (!firebaseUser || !activeCircle) return null;
    if (liveSelfMember && liveSelfMember.circleId === activeCircle.id) {
      return liveSelfMember;
    }
    return members.find((m) => m.uid === firebaseUser.uid) ?? null;
  }, [liveSelfMember, members, firebaseUser, activeCircle]);

  const can = useCallback(
    (permission: PermissionKey): boolean => {
      if (isCircleOwner) return true;
      if (!currentMember) return false;
      return Boolean(currentMember.permissions?.[permission]);
    },
    [isCircleOwner, currentMember],
  );

  const permissionResolved = Boolean(
    activeCircle && (isCircleOwner || liveSelfLoadedCircleId === activeCircle.id || currentMember !== null),
  );
  const canSubscribeMeds = Boolean(
    permissionResolved && (isCircleOwner || currentMember?.permissions?.viewMedications),
  );
  const canSubscribeAppts = Boolean(
    permissionResolved &&
      (isCircleOwner ||
        currentMember?.permissions?.manageAppointments ||
        currentMember?.permissions?.viewHealthInfo),
  );
  const canSubscribeRecords = Boolean(
    permissionResolved && (isCircleOwner || currentMember?.permissions?.viewHealthInfo),
  );

  // 6. Real-time listeners for active Care Circle subcollections (permission-gated)
  useEffect(() => {
    if (!authReady || !firebaseUser || !emailVerified || !activeCircle) {
      setMedications([]);
      setMedicationLogs([]);
      setAppointments([]);
      setHealthRecords([]);
      setRoutines([]);
      setRoutineLogs([]);
      setTasks([]);
      setActivityLogs([]);
      setMessages([]);
      setNotifications([]);
      setEmailReminders([]);
      setActiveCircleDataLoading(false);
      setActiveCircleDataError(null);
      return;
    }

    if (!permissionResolved) {
      setActiveCircleDataLoading(true);
      return;
    }

    setActiveCircleDataLoading(true);
    setActiveCircleDataError(null);
    const circleId = activeCircle.id;
    const uid = firebaseUser.uid;
    const expectedListeners =
      7 + (canSubscribeMeds ? 2 : 0) + (canSubscribeAppts ? 1 : 0) + (canSubscribeRecords ? 1 : 0);
    let settledCount = 0;
    const markSettled = () => {
      settledCount += 1;
      if (settledCount >= expectedListeners) {
        setActiveCircleDataLoading(false);
      }
    };

    let unsubMeds: (() => void) | undefined;
    let unsubMedLogs: (() => void) | undefined;
    if (canSubscribeMeds) {
      unsubMeds = onSnapshot(
        query(collection(db, 'careCircles', circleId, 'medications'), where('memberIds', 'array-contains', uid)),
        (snap) => {
          const items = snap.docs.map((d) => d.data() as Medication);
          items.sort((a, b) => a.name.localeCompare(b.name));
          setMedications(items);
          markSettled();
        },
        (err) => {
          markSettled();
          setActiveCircleDataError('Unable to load medications from Firestore. Please check your connection or permissions.');
          handleFirestoreError(err, OperationType.LIST, `careCircles/${circleId}/medications`);
        },
      );

      unsubMedLogs = onSnapshot(
        query(collection(db, 'careCircles', circleId, 'medicationLogs'), where('memberIds', 'array-contains', uid)),
        (snap) => {
          setMedicationLogs(snap.docs.map((d) => d.data() as MedicationLog));
          markSettled();
        },
        (err) => {
          markSettled();
          handleFirestoreError(err, OperationType.LIST, `careCircles/${circleId}/medicationLogs`);
        },
      );
    } else {
      setMedications([]);
      setMedicationLogs([]);
    }

    let unsubAppts: (() => void) | undefined;
    if (canSubscribeAppts) {
      unsubAppts = onSnapshot(
        query(collection(db, 'careCircles', circleId, 'appointments'), where('memberIds', 'array-contains', uid)),
        (snap) => {
          const items = snap.docs.map((d) => d.data() as Appointment);
          items.sort((a, b) => `${a.appointmentDate} ${a.appointmentTime}`.localeCompare(`${b.appointmentDate} ${b.appointmentTime}`));
          setAppointments(items);
          markSettled();
        },
        (err) => {
          markSettled();
          setActiveCircleDataError('Unable to load appointments from Firestore. Please check your connection or permissions.');
          handleFirestoreError(err, OperationType.LIST, `careCircles/${circleId}/appointments`);
        },
      );
    } else {
      setAppointments([]);
    }

    let unsubRecords: (() => void) | undefined;
    if (canSubscribeRecords) {
      unsubRecords = onSnapshot(
        query(collection(db, 'careCircles', circleId, 'healthRecords'), where('memberIds', 'array-contains', uid)),
        (snap) => {
          const items = snap.docs.map((d) => d.data() as HealthRecord);
          items.sort((a, b) => b.recordedDate.localeCompare(a.recordedDate));
          setHealthRecords(items);
          markSettled();
        },
        (err) => {
          markSettled();
          setActiveCircleDataError('Unable to load health records from Firestore. Please check your connection or permissions.');
          handleFirestoreError(err, OperationType.LIST, `careCircles/${circleId}/healthRecords`);
        },
      );
    } else {
      setHealthRecords([]);
    }

    const unsubRoutines = onSnapshot(
      query(collection(db, 'careCircles', circleId, 'routines'), where('memberIds', 'array-contains', uid)),
      (snap) => {
        const items = snap.docs.map((d) => d.data() as CareRoutine);
        items.sort((a, b) => a.targetTime.localeCompare(b.targetTime));
        setRoutines(items);
        markSettled();
      },
      (err) => {
        markSettled();
        handleFirestoreError(err, OperationType.LIST, `careCircles/${circleId}/routines`);
      },
    );

    const unsubRoutineLogs = onSnapshot(
      query(collection(db, 'careCircles', circleId, 'routineLogs'), where('memberIds', 'array-contains', uid)),
      (snap) => {
        setRoutineLogs(snap.docs.map((d) => d.data() as RoutineLog));
        markSettled();
      },
      (err) => {
        markSettled();
        handleFirestoreError(err, OperationType.LIST, `careCircles/${circleId}/routineLogs`);
      },
    );

    const unsubMessages = onSnapshot(
      query(collection(db, 'careCircles', circleId, 'messages'), where('memberIds', 'array-contains', uid)),
      (snap) => {
        const items = snap.docs.map((d) => d.data() as CareMessage);
        items.sort((a, b) => (b.createdAt?.toMillis?.() ?? Date.now()) - (a.createdAt?.toMillis?.() ?? Date.now()));
        setMessages(items);
        markSettled();
      },
      (err) => {
        markSettled();
        handleFirestoreError(err, OperationType.LIST, `careCircles/${circleId}/messages`);
      },
    );

    const unsubNotifs = onSnapshot(
      query(collection(db, 'careCircles', circleId, 'notifications'), where('memberIds', 'array-contains', uid)),
      (snap) => {
        const items = snap.docs.map((d) => d.data() as CareNotification);
        items.sort((a, b) => (b.createdAt?.toMillis?.() ?? Date.now()) - (a.createdAt?.toMillis?.() ?? Date.now()));
        setNotifications(items);
        markSettled();
      },
      (err) => {
        markSettled();
        handleFirestoreError(err, OperationType.LIST, `careCircles/${circleId}/notifications`);
      },
    );

    const unsubTasks = onSnapshot(
      query(collection(db, 'careCircles', circleId, 'tasks'), where('memberIds', 'array-contains', uid)),
      (snap) => {
        const items = snap.docs.map((d) => d.data() as CareTask);
        items.sort((a, b) => `${a.dueDate} ${a.dueTime}`.localeCompare(`${b.dueDate} ${b.dueTime}`));
        setTasks(items);
        markSettled();
      },
      (err) => {
        markSettled();
        handleFirestoreError(err, OperationType.LIST, `careCircles/${circleId}/tasks`);
      },
    );

    const unsubActivityLogs = onSnapshot(
      query(collection(db, 'careCircles', circleId, 'activityLogs'), where('memberIds', 'array-contains', uid)),
      (snap) => {
        const items = snap.docs.map((d) => d.data() as CareActivityLog);
        items.sort((a, b) => (b.timestamp?.toMillis?.() ?? Date.now()) - (a.timestamp?.toMillis?.() ?? Date.now()));
        setActivityLogs(items);
        markSettled();
      },
      (err) => {
        markSettled();
        handleFirestoreError(err, OperationType.LIST, `careCircles/${circleId}/activityLogs`);
      },
    );

    const unsubEmailReminders = onSnapshot(
      query(collection(db, 'careCircles', circleId, 'emailReminders'), where('memberIds', 'array-contains', uid)),
      (snap) => {
        const items = snap.docs.map((d) => d.data() as EmailReminderDelivery);
        items.sort((a, b) => (b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? Date.now()) - (a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? Date.now()));
        setEmailReminders(items);
        markSettled();
      },
      (err) => {
        markSettled();
        handleFirestoreError(err, OperationType.LIST, `careCircles/${circleId}/emailReminders`);
      },
    );

    return () => {
      unsubMeds?.();
      unsubMedLogs?.();
      unsubAppts?.();
      unsubRecords?.();
      unsubRoutines();
      unsubRoutineLogs();
      unsubMessages();
      unsubNotifs();
      unsubTasks();
      unsubActivityLogs();
      unsubEmailReminders();
    };
  }, [
    authReady,
    firebaseUser,
    emailVerified,
    activeCircle?.id,
    permissionResolved,
    canSubscribeMeds,
    canSubscribeAppts,
    canSubscribeRecords,
  ]);

  // 7. Keep backend node-cron reminder scheduler synced with active circle session
  useEffect(() => {
    if (!authReady || !firebaseUser || !emailVerified || !activeCircle) return;
    const circleId = activeCircle.id;
    void syncReminderSession(circleId, true).catch(() => {});
    const timer = window.setInterval(() => {
      void syncReminderSession(circleId, false).catch(() => {});
    }, 4 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [authReady, firebaseUser, emailVerified, activeCircle?.id, medications.length, appointments.length]);

  const visibleNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (isCircleOwner) return true;
      if (n.eventType === 'medication') return can('viewMedications');
      if (n.eventType === 'record') return can('viewHealthInfo');
      if (n.eventType === 'appointment') return can('manageAppointments') || can('viewHealthInfo');
      return true;
    });
  }, [notifications, isCircleOwner, can]);

  const visibleActivityLogs = useMemo(() => {
    return activityLogs.filter((log) => {
      if (isCircleOwner) return true;
      if (log.recordType === 'medication' || log.recordType === 'medication_log') {
        return can('viewMedications');
      }
      if (log.recordType === 'health_record') {
        return can('viewHealthInfo');
      }
      if (log.recordType === 'appointment') {
        return can('manageAppointments') || can('viewHealthInfo');
      }
      return true;
    });
  }, [activityLogs, isCircleOwner, can]);

  const unreadNotificationCount = useMemo(() => {
    if (!firebaseUser) return 0;
    return visibleNotifications.filter((n) => !n.readByUids.includes(firebaseUser.uid)).length;
  }, [visibleNotifications, firebaseUser]);

  const value: CareContextValue = {
    firebaseUser,
    authReady,
    emailVerified,
    profile,
    profileLoading,
    circles,
    circlesLoading,
    activeCircle,
    activeCircleDataLoading,
    activeCircleDataError,
    members,
    currentMember,
    isCircleOwner,
    can,
    pendingInvitesForMe,
    ownerInvitations,
    refreshPendingInvites,
    refreshOwnerInvitations,
    refreshCircleMembers,
    medications,
    medicationLogs,
    appointments,
    healthRecords,
    routines,
    routineLogs,
    tasks,
    activityLogs: visibleActivityLogs,
    messages,
    notifications: visibleNotifications,
    emailReminders,
    unreadNotificationCount,
    toasts,
    pushToast,
    dismissToast,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendResetPassword,
    resendVerificationEmail,
    refreshVerificationStatus,
    logout,
    selectActiveCircle,
  };

  return <CareContext.Provider value={value}>{children}</CareContext.Provider>;
}

export function useCare() {
  const ctx = useContext(CareContext);
  if (!ctx) {
    throw new Error('useCare must be used inside a CareProvider');
  }
  return ctx;
}
