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
  syncSubcollectionMemberIds,
  updateUserProfile,
} from '../services/careService';
import {
  AccountType,
  Appointment,
  CareCircle,
  CareMessage,
  CareNotification,
  CareRoutine,
  CircleInvite,
  CircleMember,
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
  medications: Medication[];
  medicationLogs: MedicationLog[];
  appointments: Appointment[];
  healthRecords: HealthRecord[];
  routines: CareRoutine[];
  routineLogs: RoutineLog[];
  messages: CareMessage[];
  notifications: CareNotification[];
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
  const [pendingInvitesForMe, setPendingInvitesForMe] = useState<CircleInvite[]>([]);
  const [ownerInvitations, setOwnerInvitations] = useState<CircleInvite[]>([]);

  const [medications, setMedications] = useState<Medication[]>([]);
  const [medicationLogs, setMedicationLogs] = useState<MedicationLog[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [healthRecords, setHealthRecords] = useState<HealthRecord[]>([]);
  const [routines, setRoutines] = useState<CareRoutine[]>([]);
  const [routineLogs, setRoutineLogs] = useState<RoutineLog[]>([]);
  const [messages, setMessages] = useState<CareMessage[]>([]);
  const [notifications, setNotifications] = useState<CareNotification[]>([]);

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
      setPendingInvitesForMe([]);
      setOwnerInvitations([]);
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
    if (lastSyncedSignatureRef.current !== sig && activeCircle.memberIds.length > 1) {
      lastSyncedSignatureRef.current = sig;
      void syncSubcollectionMemberIds(activeCircle.id, activeCircle.memberIds, firebaseUser.uid).catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [authReady, firebaseUser, emailVerified, activeCircle, memberIdsSignature, pushToast]);

  // 6. Real-time listeners for active Care Circle subcollections
  useEffect(() => {
    if (!authReady || !firebaseUser || !emailVerified || !activeCircle) {
      setMedications([]);
      setMedicationLogs([]);
      setAppointments([]);
      setHealthRecords([]);
      setRoutines([]);
      setRoutineLogs([]);
      setMessages([]);
      setNotifications([]);
      setActiveCircleDataLoading(false);
      setActiveCircleDataError(null);
      return;
    }

    setActiveCircleDataLoading(true);
    setActiveCircleDataError(null);
    const circleId = activeCircle.id;
    const uid = firebaseUser.uid;
    let settledCount = 0;
    const markSettled = () => {
      settledCount += 1;
      if (settledCount >= 8) {
        setActiveCircleDataLoading(false);
      }
    };

    const unsubMeds = onSnapshot(
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

    const unsubMedLogs = onSnapshot(
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

    const unsubAppts = onSnapshot(
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

    const unsubRecords = onSnapshot(
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

    return () => {
      unsubMeds();
      unsubMedLogs();
      unsubAppts();
      unsubRecords();
      unsubRoutines();
      unsubRoutineLogs();
      unsubMessages();
      unsubNotifs();
    };
  }, [authReady, firebaseUser, emailVerified, activeCircle]);

  const currentMember = useMemo(
    () => (firebaseUser ? members.find((m) => m.uid === firebaseUser.uid) ?? null : null),
    [members, firebaseUser],
  );

  const can = useCallback(
    (permission: PermissionKey): boolean => {
      if (isCircleOwner) return true;
      if (!currentMember) return false;
      return Boolean(currentMember.permissions?.[permission]);
    },
    [isCircleOwner, currentMember],
  );

  const unreadNotificationCount = useMemo(() => {
    if (!firebaseUser) return 0;
    return notifications.filter((n) => !n.readByUids.includes(firebaseUser.uid)).length;
  }, [notifications, firebaseUser]);

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
    medications,
    medicationLogs,
    appointments,
    healthRecords,
    routines,
    routineLogs,
    messages,
    notifications,
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
