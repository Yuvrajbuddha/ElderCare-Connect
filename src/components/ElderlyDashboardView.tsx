import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  CalendarPlus,
  Check,
  CheckCircle2,
  Clock,
  FileHeart,
  HeartHandshake,
  MessageSquare,
  Phone,
  Pill,
  ShieldAlert,
  Square,
  Stethoscope,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCare } from '../context/CareContext';
import {
  formatDateDisplay,
  formatTime12h,
  formatTimestampRelative,
  getOffsetDateKey,
  getTodayKey,
  parseReadableError,
} from '../lib/utils';
import {
  createAppointment,
  logMedicationDose,
  seedStarterCareData,
  sendCareMessage,
  updateAppointment,
  updateUserProfile,
} from '../services/careService';
import type { AppSection, Medication, MedicationLog, VisitType } from '../types/healthcare';
import { Modal } from './ui/Modal';

interface ElderlyDashboardViewProps {
  onNavigate: (section: AppSection) => void;
}

interface DoseSlot {
  key: string;
  medication: Medication;
  time: string;
  log?: MedicationLog;
  scheduledDateTime: Date;
}

interface ActivityEntry {
  id: string;
  kind: 'medication' | 'appointment' | 'record' | 'routine' | 'message';
  title: string;
  actor: string;
  timestampMs: number;
  timeLabel: string;
}

function parseTimeToDate(dateKey: string, time24: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = time24.split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, Number.isNaN(hh) ? 8 : hh, Number.isNaN(mm) ? 0 : mm, 0, 0);
}

function formatCountdownText(targetDate: Date, now: Date): { label: string; isDueNow: boolean; isOverdue: boolean } {
  const diffMs = targetDate.getTime() - now.getTime();
  const absMins = Math.floor(Math.abs(diffMs) / 60000);
  const absSecs = Math.floor((Math.abs(diffMs) % 60000) / 1000);

  if (diffMs <= 0) {
    if (absMins < 5) {
      return { label: 'Due right now', isDueNow: true, isOverdue: false };
    }
    if (absMins < 60) {
      return { label: `Due ${absMins} min ago`, isDueNow: true, isOverdue: true };
    }
    const hrs = Math.floor(absMins / 60);
    const remMins = absMins % 60;
    return {
      label: remMins > 0 ? `Due ${hrs} hr ${remMins} min ago` : `Due ${hrs} hr ago`,
      isDueNow: true,
      isOverdue: true,
    };
  }

  if (absMins === 0) {
    return { label: `In ${absSecs} sec`, isDueNow: true, isOverdue: false };
  }
  if (absMins < 60) {
    return {
      label: `In ${absMins} min ${String(absSecs).padStart(2, '0')} sec`,
      isDueNow: absMins <= 15,
      isOverdue: false,
    };
  }
  const hrs = Math.floor(absMins / 60);
  const remMins = absMins % 60;
  return {
    label: remMins > 0 ? `In ${hrs} hr ${remMins} min` : `In ${hrs} hr`,
    isDueNow: false,
    isOverdue: false,
  };
}

function extractDialableNumber(text: string | undefined): string | null {
  if (!text) return null;
  const match = text.match(/(\+?\d[\d\s().-]{6,}\d)/);
  if (!match) return null;
  return match[1].replace(/[^\d+]/g, '');
}

const FEELING_OPTIONS: Array<{
  id: string;
  label: string;
  noteBody: string;
  urgent: boolean;
}> = [
  {
    id: 'great',
    label: 'Feeling Great',
    noteBody: 'Daily Check-In: I am feeling great today.',
    urgent: false,
  },
  {
    id: 'okay',
    label: 'Doing Okay',
    noteBody: 'Daily Check-In: I am doing okay today.',
    urgent: false,
  },
  {
    id: 'tired',
    label: 'A Little Tired',
    noteBody: 'Daily Check-In: I am feeling a little tired today.',
    urgent: false,
  },
  {
    id: 'unwell',
    label: 'Not Feeling Well',
    noteBody: 'Daily Check-In Alert: I am not feeling well today. Please check in with me.',
    urgent: true,
  },
];

export function ElderlyDashboardView({ onNavigate }: ElderlyDashboardViewProps) {
  const {
    activeCircle,
    activeCircleDataLoading,
    activeCircleDataError,
    firebaseUser,
    profile,
    members,
    medications,
    medicationLogs,
    appointments,
    healthRecords,
    routines,
    routineLogs,
    messages,
    pushToast,
  } = useCare();

  const [now, setNow] = useState<Date>(() => new Date());
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('careconnect_senior_voice') === 'true';
  });
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);
  const [busyDoseKey, setBusyDoseKey] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [selectedFeelingId, setSelectedFeelingId] = useState<string | null>(null);
  const [savingFeeling, setSavingFeeling] = useState(false);

  // Modals for Quick Actions
  const [dosePickerOpen, setDosePickerOpen] = useState(false);

  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [apptTitle, setApptTitle] = useState('');
  const [apptDoctor, setApptDoctor] = useState('');
  const [apptDate, setApptDate] = useState(getOffsetDateKey(1));
  const [apptTime, setApptTime] = useState('10:00');
  const [apptType, setApptType] = useState<VisitType>('in_person');
  const [apptClinic, setApptClinic] = useState('');
  const [bookingBusy, setBookingBusy] = useState(false);

  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactText, setContactText] = useState('');
  const [contactUrgent, setContactUrgent] = useState(false);
  const [sendingContact, setSendingContact] = useState(false);

  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
  const [editEmergencyValue, setEditEmergencyValue] = useState('');
  const [editPhoneValue, setEditPhoneValue] = useState('');
  const [savingEmergency, setSavingEmergency] = useState(false);
  const [confirmUrgentAlertOpen, setConfirmUrgentAlertOpen] = useState(false);
  const [sendingUrgentAlert, setSendingUrgentAlert] = useState(false);

  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Live clock and countdown tick every second
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Cleanup speech synthesis on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const speakText = useCallback(
    (text: string, forceSpeak = false) => {
      if (!speechSupported || (!voiceEnabled && !forceSpeak)) return;
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.92;
        utterance.pitch = 1;
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
      } catch {
        setIsSpeaking(false);
      }
    },
    [speechSupported, voiceEnabled],
  );

  const stopSpeaking = useCallback(() => {
    if (!speechSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [speechSupported]);

  const toggleVoiceMode = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('careconnect_senior_voice', String(next));
    }
    if (!next) {
      stopSpeaking();
      pushToast('info', 'Spoken confirmations turned off.');
    } else {
      pushToast('success', 'Voice assistance turned on.');
      speakText('Voice assistance is now on. I will read confirmations aloud.', true);
    }
  };

  const todayKey = getTodayKey(now);
  const tomorrowKey = getOffsetDateKey(1);

  const greetingHeading = useMemo(() => {
    const hour = now.getHours();
    if (hour < 12) return 'Good Morning! How are you feeling today?';
    if (hour < 17) return 'Good Afternoon! How are you feeling today?';
    return 'Good Evening! How are you feeling today?';
  }, [now]);

  const formattedFullDate = useMemo(
    () =>
      now.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    [now],
  );

  const formattedCurrentTime = useMemo(
    () =>
      now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
    [now],
  );

  const activeMeds = useMemo(
    () => medications.filter((m) => m.status === 'active'),
    [medications],
  );

  const todayDoses = useMemo<DoseSlot[]>(() => {
    const slots = activeMeds.flatMap((med) =>
      med.scheduledTimes.map((time) => {
        const log = medicationLogs.find(
          (l) => l.medicationId === med.id && l.dateKey === todayKey && l.scheduledTime === time,
        );
        return {
          key: `${med.id}_${time}`,
          medication: med,
          time,
          log,
          scheduledDateTime: parseTimeToDate(todayKey, time),
        };
      }),
    );
    return slots.sort((a, b) => a.time.localeCompare(b.time));
  }, [activeMeds, medicationLogs, todayKey]);

  const pendingDosesToday = useMemo(
    () => todayDoses.filter((d) => !d.log || d.log.status === 'pending'),
    [todayDoses],
  );

  const nextUpcomingDose = useMemo<{ slot: DoseSlot; isTomorrow: boolean } | null>(() => {
    if (pendingDosesToday.length > 0) {
      return { slot: pendingDosesToday[0], isTomorrow: false };
    }
    if (activeMeds.length === 0) return null;
    const tomorrowSlots = activeMeds
      .flatMap((med) =>
        med.scheduledTimes.map((time) => ({
          key: `${med.id}_tomorrow_${time}`,
          medication: med,
          time,
          scheduledDateTime: parseTimeToDate(tomorrowKey, time),
        })),
      )
      .sort((a, b) => a.time.localeCompare(b.time));
    return tomorrowSlots[0] ? { slot: tomorrowSlots[0], isTomorrow: true } : null;
  }, [pendingDosesToday, activeMeds, tomorrowKey]);

  const doseSummary = useMemo(() => {
    const total = todayDoses.length;
    const taken = todayDoses.filter((d) => d.log?.status === 'taken').length;
    const skipped = todayDoses.filter((d) => d.log?.status === 'skipped').length;
    const remaining = Math.max(0, total - taken - skipped);
    const percent = total > 0 ? Math.round((taken / total) * 100) : 0;
    return { total, taken, skipped, remaining, percent };
  }, [todayDoses]);

  const todaysAppointments = useMemo(
    () =>
      appointments
        .filter((a) => a.appointmentDate === todayKey && a.status !== 'cancelled')
        .sort((a, b) => a.appointmentTime.localeCompare(b.appointmentTime)),
    [appointments, todayKey],
  );

  const nextFutureAppointment = useMemo(
    () =>
      appointments.find((a) => a.appointmentDate > todayKey && a.status === 'scheduled') ?? null,
    [appointments, todayKey],
  );

  const connectedCaretakersAndFamily = useMemo(() => {
    if (!firebaseUser) return [];
    return members.filter((m) => m.uid !== firebaseUser.uid);
  }, [members, firebaseUser]);

  const recentActivity = useMemo<ActivityEntry[]>(() => {
    const items: ActivityEntry[] = [];

    for (const log of medicationLogs) {
      if (log.status === 'pending') continue;
      const ms = log.updatedAt?.toMillis?.() ?? log.loggedAt?.toMillis?.() ?? 0;
      items.push({
        id: `medlog_${log.id}`,
        kind: 'medication',
        title: `${log.status === 'taken' ? 'Took' : 'Skipped'} ${log.medicationName} (${log.dosage})`,
        actor: log.loggedByName,
        timestampMs: ms,
        timeLabel: log.loggedAt ? formatTimestampRelative(log.loggedAt) : formatDateDisplay(log.dateKey),
      });
    }

    for (const appt of appointments.slice(0, 8)) {
      const ms = appt.updatedAt?.toMillis?.() ?? appt.createdAt?.toMillis?.() ?? 0;
      items.push({
        id: `appt_${appt.id}`,
        kind: 'appointment',
        title:
          appt.status === 'completed'
            ? `Completed visit: ${appt.title} with ${appt.doctorName}`
            : `Appointment: ${appt.title} (${formatDateDisplay(appt.appointmentDate)})`,
        actor: appt.clinicName || appt.doctorName,
        timestampMs: ms,
        timeLabel: appt.createdAt ? formatTimestampRelative(appt.createdAt) : formatDateDisplay(appt.appointmentDate),
      });
    }

    for (const rec of healthRecords.slice(0, 8)) {
      const ms = rec.updatedAt?.toMillis?.() ?? rec.createdAt?.toMillis?.() ?? 0;
      items.push({
        id: `rec_${rec.id}`,
        kind: 'record',
        title: `${rec.title}${rec.metricValue ? ` — ${rec.metricValue} ${rec.metricUnit ?? ''}`.trim() : ''}`,
        actor: rec.providerName || 'Health Record',
        timestampMs: ms,
        timeLabel: rec.createdAt ? formatTimestampRelative(rec.createdAt) : formatDateDisplay(rec.recordedDate),
      });
    }

    for (const rlog of routineLogs.filter((r) => r.completed).slice(0, 6)) {
      const matchedRoutine = routines.find((r) => r.id === rlog.routineId);
      const ms = rlog.updatedAt?.toMillis?.() ?? rlog.completedAt?.toMillis?.() ?? 0;
      items.push({
        id: `rlog_${rlog.id}`,
        kind: 'routine',
        title: `Completed routine: ${matchedRoutine?.title || 'Daily wellness step'}`,
        actor: rlog.completedByName,
        timestampMs: ms,
        timeLabel: rlog.completedAt ? formatTimestampRelative(rlog.completedAt) : formatDateDisplay(rlog.dateKey),
      });
    }

    for (const msg of messages.slice(0, 6)) {
      const ms = msg.createdAt?.toMillis?.() ?? 0;
      items.push({
        id: `msg_${msg.id}`,
        kind: 'message',
        title: msg.body.length > 90 ? `${msg.body.slice(0, 87)}...` : msg.body,
        actor: `${msg.senderName} (${msg.senderRole})`,
        timestampMs: ms,
        timeLabel: formatTimestampRelative(msg.createdAt),
      });
    }

    return items.sort((a, b) => b.timestampMs - a.timestampMs).slice(0, 6);
  }, [medicationLogs, appointments, healthRecords, routineLogs, routines, messages]);

  if (!activeCircle || !firebaseUser || !profile) return null;

  const firstName = profile.displayName.split(' ')[0] || profile.displayName;
  const emergencyDialNumber = extractDialableNumber(profile.emergencyContact);

  const handleReadDayAloud = () => {
    if (isSpeaking) {
      stopSpeaking();
      return;
    }
    const parts: string[] = [
      `Hello ${firstName}. Today is ${formattedFullDate}, and the time is ${formattedCurrentTime}.`,
    ];
    if (doseSummary.total === 0) {
      parts.push('You do not have any medicines scheduled for today.');
    } else {
      parts.push(
        `You have taken ${doseSummary.taken} out of ${doseSummary.total} medicines scheduled today.`,
      );
      if (nextUpcomingDose && !nextUpcomingDose.isTomorrow) {
        const countdown = formatCountdownText(nextUpcomingDose.slot.scheduledDateTime, now);
        parts.push(
          `Your next medicine is ${nextUpcomingDose.slot.medication.name}, ${nextUpcomingDose.slot.medication.dosage}, scheduled for ${formatTime12h(nextUpcomingDose.slot.time)}, ${countdown.label}.`,
        );
      } else if (doseSummary.remaining === 0) {
        parts.push('Great job, all of your medicines for today are complete.');
      }
    }
    if (todaysAppointments.length > 0) {
      const firstAppt = todaysAppointments[0];
      parts.push(
        `You have ${todaysAppointments.length} doctor appointment${todaysAppointments.length > 1 ? 's' : ''} today. Your next visit is ${firstAppt.title} with ${firstAppt.doctorName} at ${formatTime12h(firstAppt.appointmentTime)}.`,
      );
    } else {
      parts.push('You have no doctor appointments scheduled for today.');
    }
    speakText(parts.join(' '), true);
  };

  const handleLogDose = async (slot: DoseSlot, status: 'taken' | 'pending') => {
    setActionError(null);
    setBusyDoseKey(slot.key);
    try {
      await logMedicationDose({
        circleId: activeCircle.id,
        memberIds: activeCircle.memberIds,
        medication: slot.medication,
        existingLog: slot.log,
        dateKey: todayKey,
        scheduledTime: slot.time,
        status,
        uid: firebaseUser.uid,
        userName: profile.displayName,
      });
      const feedback =
        status === 'taken'
          ? `${slot.medication.name} marked as taken.`
          : `${slot.medication.name} reset to pending.`;
      pushToast('success', feedback);
      speakText(feedback);
      setDosePickerOpen(false);
    } catch (error) {
      const msg = parseReadableError(error);
      setActionError(msg);
      pushToast('error', msg);
    } finally {
      setBusyDoseKey(null);
    }
  };

  const handleQuickMarkMedicineClick = () => {
    if (pendingDosesToday.length === 0) {
      const msg =
        todayDoses.length === 0
          ? 'No medicines are scheduled yet. Opening your Medicines page.'
          : 'All of today’s scheduled medicines are already taken!';
      pushToast('info', msg);
      speakText(msg);
      if (todayDoses.length === 0) {
        onNavigate('medications');
      }
      return;
    }
    if (pendingDosesToday.length === 1) {
      void handleLogDose(pendingDosesToday[0], 'taken');
      return;
    }
    setDosePickerOpen(true);
  };

  const handleFeelingCheckIn = async (option: (typeof FEELING_OPTIONS)[number]) => {
    setActionError(null);
    setSavingFeeling(true);
    try {
      await sendCareMessage({
        circleId: activeCircle.id,
        memberIds: activeCircle.memberIds,
        senderUid: firebaseUser.uid,
        senderName: profile.displayName,
        senderRole: 'patient',
        category: option.urgent ? 'alert' : 'update',
        body: option.noteBody,
        urgent: option.urgent,
      });
      setSelectedFeelingId(option.id);
      const confirmation = option.urgent
        ? 'Your family and caretaker have been alerted that you are not feeling well.'
        : `Thank you! Shared "${option.label}" with your Care Circle.`;
      pushToast(option.urgent ? 'info' : 'success', confirmation);
      speakText(confirmation);
    } catch (error) {
      const msg = parseReadableError(error);
      setActionError(msg);
      pushToast('error', msg);
    } finally {
      setSavingFeeling(false);
    }
  };

  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apptTitle.trim() || !apptDoctor.trim()) {
      pushToast('error', 'Please enter the visit reason and doctor name.');
      return;
    }
    setBookingBusy(true);
    setActionError(null);
    try {
      await createAppointment({
        circleId: activeCircle.id,
        memberIds: activeCircle.memberIds,
        createdByUid: firebaseUser.uid,
        createdByName: profile.displayName,
        title: apptTitle.trim(),
        doctorName: apptDoctor.trim(),
        clinicName: apptClinic.trim(),
        appointmentDate: apptDate,
        appointmentTime: apptTime,
        visitType: apptType,
      });
      const msg = `Appointment with ${apptDoctor.trim()} scheduled for ${formatDateDisplay(apptDate)}.`;
      pushToast('success', msg);
      speakText(msg);
      setBookModalOpen(false);
      setApptTitle('');
      setApptClinic('');
    } catch (error) {
      const msg = parseReadableError(error);
      setActionError(msg);
      pushToast('error', msg);
    } finally {
      setBookingBusy(false);
    }
  };

  const handleCompleteAppointment = async (appt: (typeof todaysAppointments)[number]) => {
    setActionError(null);
    try {
      await updateAppointment(activeCircle.id, appt.id, {
        title: appt.title,
        doctorName: appt.doctorName,
        specialty: appt.specialty,
        clinicName: appt.clinicName,
        location: appt.location,
        appointmentDate: appt.appointmentDate,
        appointmentTime: appt.appointmentTime,
        visitType: appt.visitType,
        prepNotes: appt.prepNotes,
        outcomeNotes: appt.outcomeNotes || 'Visit completed.',
        status: 'completed',
      });
      pushToast('success', `${appt.title} marked as completed.`);
      speakText(`${appt.title} marked as completed.`);
    } catch (error) {
      const msg = parseReadableError(error);
      setActionError(msg);
      pushToast('error', msg);
    }
  };

  const handleSendContactMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactText.trim()) {
      pushToast('error', 'Please type or pick a message first.');
      return;
    }
    setSendingContact(true);
    setActionError(null);
    try {
      await sendCareMessage({
        circleId: activeCircle.id,
        memberIds: activeCircle.memberIds,
        senderUid: firebaseUser.uid,
        senderName: profile.displayName,
        senderRole: 'patient',
        category: contactUrgent ? 'alert' : 'question',
        body: contactText.trim(),
        urgent: contactUrgent,
      });
      const msg = contactUrgent
        ? 'Urgent message sent to your caretaker and family.'
        : 'Message sent to your Care Circle.';
      pushToast('success', msg);
      speakText(msg);
      setContactModalOpen(false);
      setContactText('');
      setContactUrgent(false);
    } catch (error) {
      const msg = parseReadableError(error);
      setActionError(msg);
      pushToast('error', msg);
    } finally {
      setSendingContact(false);
    }
  };

  const openEmergencyEditModal = () => {
    setEditEmergencyValue(profile.emergencyContact || '');
    setEditPhoneValue(profile.phone || '');
    setEmergencyModalOpen(true);
  };

  const handleSaveEmergencyContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEmergency(true);
    setActionError(null);
    try {
      await updateUserProfile(firebaseUser.uid, {
        emergencyContact: editEmergencyValue,
        phone: editPhoneValue,
      });
      pushToast('success', 'Emergency contact saved.');
      setEmergencyModalOpen(false);
    } catch (error) {
      const msg = parseReadableError(error);
      setActionError(msg);
      pushToast('error', msg);
    } finally {
      setSavingEmergency(false);
    }
  };

  const handleSendUrgentHelpAlert = async () => {
    setSendingUrgentAlert(true);
    setActionError(null);
    try {
      await sendCareMessage({
        circleId: activeCircle.id,
        memberIds: activeCircle.memberIds,
        senderUid: firebaseUser.uid,
        senderName: profile.displayName,
        senderRole: 'patient',
        category: 'alert',
        body: `URGENT HELP REQUEST: ${profile.displayName} requested immediate assistance from their dashboard.${
          profile.phone ? ` Callback phone: ${profile.phone}` : ''
        }`,
        urgent: true,
      });
      pushToast('success', 'Urgent alert sent to everyone in your Care Circle.');
      speakText('Urgent help alert sent to your family and caretaker.');
      setConfirmUrgentAlertOpen(false);
    } catch (error) {
      const msg = parseReadableError(error);
      setActionError(msg);
      pushToast('error', msg);
    } finally {
      setSendingUrgentAlert(false);
    }
  };

  const handleSeedStarter = async () => {
    setSeeding(true);
    setActionError(null);
    try {
      await seedStarterCareData({
        circle: activeCircle,
        uid: firebaseUser.uid,
        userName: profile.displayName,
        userRole: 'patient',
      });
      pushToast('success', 'Starter daily care schedule added.');
    } catch (error) {
      const msg = parseReadableError(error);
      setActionError(msg);
      pushToast('error', msg);
    } finally {
      setSeeding(false);
    }
  };

  if (activeCircleDataLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading your daily dashboard">
        <div className="h-36 animate-pulse rounded-2xl border border-[#D1D5DB] bg-white" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="h-52 animate-pulse rounded-2xl border border-[#D1D5DB] bg-white lg:col-span-7" />
          <div className="h-52 animate-pulse rounded-2xl border border-[#D1D5DB] bg-white lg:col-span-5" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-[#D1D5DB] bg-white" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="h-64 animate-pulse rounded-2xl border border-[#D1D5DB] bg-white" />
          <div className="h-64 animate-pulse rounded-2xl border border-[#D1D5DB] bg-white" />
        </div>
      </div>
    );
  }

  const nextCountdown = nextUpcomingDose
    ? formatCountdownText(nextUpcomingDose.slot.scheduledDateTime, now)
    : null;

  const isEmptyCareCircle =
    medications.length === 0 && appointments.length === 0 && healthRecords.length === 0;

  return (
    <div className="space-y-7">
      {/* Real-time Firestore / Action Error Banner */}
      {(activeCircleDataError || actionError) && (
        <div
          role="alert"
          className="flex flex-col justify-between gap-3 rounded-2xl border border-red-300 bg-red-50 p-5 text-[#991B1B] sm:flex-row sm:items-center"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0" />
            <div>
              <p className="text-base font-bold">Something needs attention</p>
              <p className="mt-0.5 text-sm">{actionError || activeCircleDataError}</p>
            </div>
          </div>
          {actionError && (
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="min-h-[44px] shrink-0 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-[#991B1B] hover:bg-red-100"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* 1 & 2. Personalized Greeting, Current Date & Time, and Voice Assistance */}
      <section className="rounded-2xl border border-[#D1D5DB] bg-white p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
          <div className="max-w-2xl">
            <p className="text-base font-semibold text-[#065F46]">
              Welcome back, {firstName}
            </p>
            <h1 className="font-display mt-1 text-2xl font-bold tracking-tight text-[#111827] sm:text-4xl text-balance">
              {greetingHeading}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-base font-medium text-[#374151]">
              <span className="inline-flex items-center gap-2">
                <Calendar className="h-5 w-5 text-[#065F46]" />
                <span>{formattedFullDate}</span>
              </span>
              <span aria-hidden="true" className="text-[#9CA3AF]">
                ·
              </span>
              <span className="inline-flex items-center gap-2 font-mono text-lg font-bold text-[#064E3B] tabular-nums">
                <Clock className="h-5 w-5 text-[#065F46]" />
                <span>{formattedCurrentTime}</span>
              </span>
            </div>
          </div>

          {/* Voice Assistance Bar */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleReadDayAloud}
              disabled={!speechSupported}
              className={`inline-flex min-h-[52px] items-center justify-center gap-2.5 rounded-xl px-5 py-3 text-base font-semibold transition-colors whitespace-nowrap ${
                isSpeaking
                  ? 'bg-[#B91C1C] text-white hover:bg-[#991B1B]'
                  : 'bg-[#065F46] text-white hover:bg-[#047857]'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {isSpeaking ? <Square className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              <span>{isSpeaking ? 'Stop Reading' : 'Read My Day Aloud'}</span>
            </button>

            <button
              type="button"
              onClick={toggleVoiceMode}
              disabled={!speechSupported}
              aria-pressed={voiceEnabled}
              className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-base font-semibold transition-colors whitespace-nowrap ${
                voiceEnabled
                  ? 'border-[#065F46] bg-[#ECFDF5] text-[#064E3B]'
                  : 'border-[#D1D5DB] bg-white text-[#1F2937] hover:bg-[#F3F4F6]'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {voiceEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
              <span>{voiceEnabled ? 'Voice On' : 'Voice Off'}</span>
            </button>
          </div>
        </div>

        {/* Simple 1-Tap Daily Feeling Check-in */}
        <div className="mt-6 border-t border-[#E5E7EB] pt-5">
          <p className="text-sm font-semibold text-[#374151]">
            Tap how you feel right now to let your Care Circle know:
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FEELING_OPTIONS.map((option) => {
              const selected = selectedFeelingId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={savingFeeling}
                  onClick={() => handleFeelingCheckIn(option)}
                  className={`flex min-h-[52px] items-center justify-center rounded-xl border-2 px-4 py-3 text-base font-semibold transition-colors ${
                    selected
                      ? option.urgent
                        ? 'border-[#B91C1C] bg-red-50 text-[#991B1B]'
                        : 'border-[#065F46] bg-[#ECFDF5] text-[#064E3B]'
                      : 'border-[#D1D5DB] bg-[#F9FAFB] text-[#111827] hover:border-[#065F46] hover:bg-[#ECFDF5]/60'
                  } disabled:opacity-60`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Starter Kit Prompt for Brand-New Empty Circle */}
      {isEmptyCareCircle && (
        <section className="flex flex-col justify-between gap-4 rounded-2xl border border-[#065F46]/30 bg-[#ECFDF5] p-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-xl font-bold text-[#064E3B]">
              Let&apos;s set up your daily schedule
            </h2>
            <p className="mt-1 text-base text-[#065F46]">
              Add your first medicine and appointment, or load a sample schedule to practice using CareConnect AI.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSeedStarter}
            disabled={seeding}
            className="inline-flex min-h-[52px] shrink-0 items-center justify-center rounded-xl bg-[#065F46] px-6 py-3 text-base font-semibold text-white hover:bg-[#047857] disabled:opacity-60 whitespace-nowrap"
          >
            {seeding ? 'Setting Up...' : 'Load Sample Care Schedule'}
          </button>
        </section>
      )}

      {/* 4 & 6. Next Upcoming Medication with Live Countdown + Medication Completion Progress */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
        {/* Next Upcoming Medication Spotlight */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#D1D5DB] bg-white p-6 sm:p-7 lg:col-span-7">
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold uppercase tracking-wide text-[#065F46]">
                Next Upcoming Medicine
              </span>
              {nextCountdown && (
                <span
                  className={`inline-flex items-center gap-1.5 font-mono text-base font-bold tabular-nums ${
                    nextCountdown.isOverdue
                      ? 'text-[#B45309]'
                      : nextCountdown.isDueNow
                        ? 'text-[#065F46]'
                        : 'text-[#0F766E]'
                  }`}
                >
                  <Clock className="h-5 w-5" />
                  <span>{nextCountdown.label}</span>
                </span>
              )}
            </div>

            {activeMeds.length === 0 ? (
              <div className="mt-5">
                <p className="font-display text-2xl font-bold text-[#111827]">
                  No medicines added yet
                </p>
                <p className="mt-2 text-base text-[#374151]">
                  Add your daily prescriptions so CareConnect AI can remind you on time.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('medications')}
                  className="mt-5 inline-flex min-h-[52px] items-center gap-2 rounded-xl bg-[#065F46] px-6 py-3 text-base font-semibold text-white hover:bg-[#047857]"
                >
                  <Pill className="h-5 w-5" />
                  <span>Add My Medicines</span>
                </button>
              </div>
            ) : nextUpcomingDose ? (
              <div className="mt-4">
                {nextUpcomingDose.isTomorrow && (
                  <p className="mb-2 inline-flex items-center gap-2 text-base font-bold text-[#15803D]">
                    <CheckCircle2 className="h-5 w-5" />
                    <span>All medicines for today are taken! Next up tomorrow:</span>
                  </p>
                )}

                <h2 className="font-display text-2xl font-bold text-[#111827] sm:text-3xl">
                  {nextUpcomingDose.slot.medication.name}{' '}
                  <span className="font-mono text-xl font-semibold text-[#065F46] tabular-nums sm:text-2xl">
                    {nextUpcomingDose.slot.medication.dosage}
                  </span>
                </h2>

                <p className="mt-2 font-mono text-lg font-semibold text-[#374151] tabular-nums">
                  Scheduled for{' '}
                  {nextUpcomingDose.isTomorrow ? 'Tomorrow at ' : 'Today at '}
                  {formatTime12h(nextUpcomingDose.slot.time)}
                </p>

                {nextUpcomingDose.slot.medication.instructions && (
                  <p className="mt-3 rounded-xl bg-[#F3F4F6] px-4 py-3 text-base leading-relaxed text-[#1F2937]">
                    {nextUpcomingDose.slot.medication.instructions}
                  </p>
                )}
              </div>
            ) : null}
          </div>

          {nextUpcomingDose && !nextUpcomingDose.isTomorrow && (
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[#E5E7EB] pt-5">
              <button
                type="button"
                disabled={busyDoseKey === nextUpcomingDose.slot.key}
                onClick={() => handleLogDose(nextUpcomingDose.slot, 'taken')}
                className="inline-flex min-h-[56px] flex-1 items-center justify-center gap-3 rounded-xl bg-[#065F46] px-6 py-3.5 text-lg font-bold text-white transition-colors hover:bg-[#047857] disabled:opacity-60 sm:flex-initial"
              >
                <Check className="h-6 w-6" />
                <span>
                  {busyDoseKey === nextUpcomingDose.slot.key
                    ? 'Saving...'
                    : 'Mark Medicine as Taken'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('medications')}
                className="inline-flex min-h-[56px] items-center justify-center rounded-xl border-2 border-[#D1D5DB] bg-white px-5 py-3 text-base font-semibold text-[#111827] hover:bg-[#F3F4F6]"
              >
                See Full Schedule
              </button>
            </div>
          )}
        </div>

        {/* 6. Medication Completion Progress (Clear, High-Contrast Bar — No Complicated Charts) */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#D1D5DB] bg-white p-6 sm:p-7 lg:col-span-5">
          <div>
            <span className="text-sm font-bold uppercase tracking-wide text-[#065F46]">
              Today&apos;s Medicine Progress
            </span>
            <div className="mt-3 flex items-baseline justify-between gap-4">
              <p className="font-display text-3xl font-bold text-[#111827] tabular-nums">
                {doseSummary.taken} of {doseSummary.total} taken
              </p>
              <span className="font-mono text-2xl font-bold text-[#065F46] tabular-nums">
                {doseSummary.percent}%
              </span>
            </div>

            {/* Large High-Contrast Progress Bar */}
            <div
              role="progressbar"
              aria-valuenow={doseSummary.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Today's medication completion progress"
              className="mt-4 h-6 w-full overflow-hidden rounded-full bg-[#E5E7EB]"
            >
              <div
                className="h-full rounded-full bg-[#065F46] transition-all duration-300"
                style={{ width: `${doseSummary.percent}%` }}
              />
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3 border-t border-[#E5E7EB] pt-5 text-center">
              <div>
                <p className="font-mono text-2xl font-bold text-[#15803D] tabular-nums">
                  {doseSummary.taken}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-[#374151]">Taken</p>
              </div>
              <div>
                <p className="font-mono text-2xl font-bold text-[#064E3B] tabular-nums">
                  {doseSummary.remaining}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-[#374151]">Remaining</p>
              </div>
              <div>
                <p className="font-mono text-2xl font-bold text-[#B45309] tabular-nums">
                  {doseSummary.skipped}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-[#374151]">Skipped</p>
              </div>
            </div>
          </div>

          <p className="mt-4 text-sm text-[#4B5563]">
            {doseSummary.total === 0
              ? 'Your daily progress appears once active medicines are scheduled.'
              : doseSummary.remaining === 0
                ? 'Well done! All of today’s remaining doses are complete.'
                : `${doseSummary.remaining} medicine${doseSummary.remaining > 1 ? 's' : ''} left to take today.`}
          </p>
        </div>
      </section>

      {/* 7. Large Touch-Friendly Quick Actions */}
      <section aria-labelledby="quick-actions-heading">
        <h2 id="quick-actions-heading" className="font-display text-xl font-bold text-[#111827]">
          Quick Actions
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <button
            type="button"
            onClick={handleQuickMarkMedicineClick}
            className="flex min-h-[88px] flex-col items-start justify-center gap-2 rounded-2xl bg-[#065F46] p-5 text-left text-white transition-colors hover:bg-[#047857]"
          >
            <CheckCircle2 className="h-7 w-7" />
            <span className="text-lg font-bold leading-snug">Mark Medicine as Taken</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('medications')}
            className="flex min-h-[88px] flex-col items-start justify-center gap-2 rounded-2xl border-2 border-[#D1D5DB] bg-white p-5 text-left text-[#111827] transition-colors hover:border-[#065F46] hover:bg-[#ECFDF5]"
          >
            <Pill className="h-7 w-7 text-[#065F46]" />
            <span className="text-lg font-bold leading-snug">View My Medicines</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setApptDoctor(activeCircle.primaryPhysician || '');
              setBookModalOpen(true);
            }}
            className="flex min-h-[88px] flex-col items-start justify-center gap-2 rounded-2xl border-2 border-[#D1D5DB] bg-white p-5 text-left text-[#111827] transition-colors hover:border-[#065F46] hover:bg-[#ECFDF5]"
          >
            <CalendarPlus className="h-7 w-7 text-[#065F46]" />
            <span className="text-lg font-bold leading-snug">Book Doctor Appointment</span>
          </button>

          <button
            type="button"
            onClick={() => setContactModalOpen(true)}
            className="flex min-h-[88px] flex-col items-start justify-center gap-2 rounded-2xl border-2 border-[#D1D5DB] bg-white p-5 text-left text-[#111827] transition-colors hover:border-[#065F46] hover:bg-[#ECFDF5]"
          >
            <MessageSquare className="h-7 w-7 text-[#065F46]" />
            <span className="text-lg font-bold leading-snug">Contact Caretaker</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('records')}
            className="flex min-h-[88px] flex-col items-start justify-center gap-2 rounded-2xl border-2 border-[#D1D5DB] bg-white p-5 text-left text-[#111827] transition-colors hover:border-[#065F46] hover:bg-[#ECFDF5]"
          >
            <FileHeart className="h-7 w-7 text-[#065F46]" />
            <span className="text-lg font-bold leading-snug">View Health Records</span>
          </button>
        </div>
      </section>

      {/* 3 & 5. Today's Medication Summary + Today's Doctor Appointments */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* 3. Today's Medication Summary */}
        <div className="rounded-2xl border border-[#D1D5DB] bg-white lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] px-6 py-5">
            <div>
              <h2 className="font-display text-xl font-bold text-[#111827]">
                Today&apos;s Medication Summary
              </h2>
              <p className="mt-0.5 text-base text-[#4B5563]">
                {doseSummary.total === 0
                  ? 'No doses scheduled today'
                  : `${doseSummary.taken} of ${doseSummary.total} doses taken`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('medications')}
              className="min-h-[44px] rounded-xl border border-[#D1D5DB] bg-white px-4 py-2 text-base font-semibold text-[#065F46] hover:bg-[#ECFDF5]"
            >
              All Medicines
            </button>
          </div>

          {todayDoses.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-lg font-semibold text-[#111827]">No medicines scheduled for today</p>
              <p className="mt-1 text-base text-[#4B5563]">
                Tap &ldquo;View My Medicines&rdquo; to add your prescriptions and times.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#E5E7EB]">
              {todayDoses.map((slot) => {
                const status = slot.log?.status ?? 'pending';
                const isTaken = status === 'taken';
                const isSkipped = status === 'skipped';
                const isBusy = busyDoseKey === slot.key;

                return (
                  <div
                    key={slot.key}
                    className="flex flex-col justify-between gap-4 px-6 py-5 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-mono text-lg font-bold text-[#065F46] tabular-nums">
                          {formatTime12h(slot.time)}
                        </span>
                        <span className="text-lg font-bold text-[#111827]">
                          {slot.medication.name}
                        </span>
                        <span className="text-base font-medium text-[#374151] tabular-nums">
                          {slot.medication.dosage}
                        </span>
                      </div>
                      {slot.medication.instructions && (
                        <p className="mt-1 text-base text-[#4B5563]">{slot.medication.instructions}</p>
                      )}
                      <p className="mt-1 text-sm font-semibold">
                        {isTaken ? (
                          <span className="text-[#15803D]">
                            Taken{slot.log?.loggedByName ? ` · Recorded by ${slot.log.loggedByName}` : ''}
                          </span>
                        ) : isSkipped ? (
                          <span className="text-[#B45309]">Skipped today</span>
                        ) : (
                          <span className="text-[#0F766E]">Ready to take</span>
                        )}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {isTaken ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleLogDose(slot, 'pending')}
                          className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-[#15803D]/30 bg-[#ECFDF5] px-5 py-2.5 text-base font-bold text-[#15803D] hover:bg-[#D1FAE5] disabled:opacity-60"
                        >
                          <CheckCircle2 className="h-5 w-5" />
                          <span>Taken (Undo)</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleLogDose(slot, 'taken')}
                          className="inline-flex min-h-[50px] items-center gap-2 rounded-xl bg-[#065F46] px-5 py-3 text-base font-bold text-white hover:bg-[#047857] disabled:opacity-60"
                        >
                          <Check className="h-5 w-5" />
                          <span>{isBusy ? 'Saving...' : 'Mark Taken'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 5. Today's Doctor Appointments */}
        <div className="rounded-2xl border border-[#D1D5DB] bg-white lg:col-span-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] px-6 py-5">
            <div>
              <h2 className="font-display text-xl font-bold text-[#111827]">
                Today&apos;s Doctor Appointments
              </h2>
              <p className="mt-0.5 text-base text-[#4B5563]">
                {todaysAppointments.length === 0
                  ? 'Clear calendar today'
                  : `${todaysAppointments.length} visit${todaysAppointments.length > 1 ? 's' : ''} today`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('appointments')}
              className="min-h-[44px] rounded-xl border border-[#D1D5DB] bg-white px-4 py-2 text-base font-semibold text-[#065F46] hover:bg-[#ECFDF5]"
            >
              All Visits
            </button>
          </div>

          {todaysAppointments.length === 0 ? (
            <div className="px-6 py-8">
              <div className="flex items-start gap-3">
                <Stethoscope className="mt-1 h-6 w-6 shrink-0 text-[#065F46]" />
                <div>
                  <p className="text-lg font-semibold text-[#111827]">
                    No doctor appointments today
                  </p>
                  {nextFutureAppointment ? (
                    <p className="mt-1.5 text-base text-[#374151]">
                      Next visit:{' '}
                      <span className="font-semibold text-[#111827]">
                        {nextFutureAppointment.title}
                      </span>{' '}
                      with {nextFutureAppointment.doctorName} on{' '}
                      <span className="font-mono font-semibold text-[#065F46] tabular-nums">
                        {formatDateDisplay(nextFutureAppointment.appointmentDate)} at{' '}
                        {formatTime12h(nextFutureAppointment.appointmentTime)}
                      </span>
                      .
                    </p>
                  ) : (
                    <p className="mt-1.5 text-base text-[#4B5563]">
                      Use &ldquo;Book Doctor Appointment&rdquo; whenever you want to add an upcoming visit.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setApptDoctor(activeCircle.primaryPhysician || '');
                      setBookModalOpen(true);
                    }}
                    className="mt-5 inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-[#065F46] px-5 py-2.5 text-base font-semibold text-white hover:bg-[#047857]"
                  >
                    <CalendarPlus className="h-5 w-5" />
                    <span>Book Appointment</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#E5E7EB]">
              {todaysAppointments.map((appt) => (
                <div key={appt.id} className="space-y-3 px-6 py-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-lg font-bold text-[#065F46] tabular-nums">
                      {formatTime12h(appt.appointmentTime)}
                    </span>
                    <span className="text-sm font-bold text-[#111827]">
                      {appt.status === 'completed'
                        ? 'Completed'
                        : appt.visitType === 'telehealth'
                          ? 'Video Visit'
                          : appt.visitType === 'home_visit'
                            ? 'Home Visit'
                            : 'In-Person Visit'}
                    </span>
                  </div>
                  <h3 className="font-display text-lg font-bold text-[#111827]">{appt.title}</h3>
                  <p className="text-base text-[#374151]">
                    {appt.doctorName}
                    {appt.clinicName ? ` · ${appt.clinicName}` : ''}
                  </p>
                  {appt.location && <p className="text-sm text-[#4B5563]">{appt.location}</p>}
                  {appt.status === 'scheduled' && (
                    <button
                      type="button"
                      onClick={() => handleCompleteAppointment(appt)}
                      className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border border-[#065F46] bg-[#ECFDF5] px-4 py-2 text-base font-semibold text-[#065F46] hover:bg-[#D1FAE5]"
                    >
                      <CheckCircle2 className="h-5 w-5" />
                      <span>Mark Visit Complete</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 8, 9 & 10. Recent Healthcare Activity + Family/Caretaker Connection + Emergency Contact */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* 8. Recent Healthcare Activity */}
        <div className="rounded-2xl border border-[#D1D5DB] bg-white lg:col-span-5">
          <div className="border-b border-[#E5E7EB] px-6 py-5">
            <h2 className="font-display text-xl font-bold text-[#111827]">
              Recent Healthcare Activity
            </h2>
            <p className="mt-0.5 text-base text-[#4B5563]">
              Live updates from your medicines, visits, and records
            </p>
          </div>

          {recentActivity.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-lg font-semibold text-[#111827]">No activity recorded yet</p>
              <p className="mt-1 text-base text-[#4B5563]">
                When you mark a medicine taken or log a vital sign, it appears here right away.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#E5E7EB]">
              {recentActivity.map((item) => {
                const Icon =
                  item.kind === 'medication'
                    ? Pill
                    : item.kind === 'appointment'
                      ? Calendar
                      : item.kind === 'record'
                        ? Activity
                        : item.kind === 'message'
                          ? MessageSquare
                          : CheckCircle2;
                return (
                  <div key={item.id} className="flex items-start gap-3.5 px-6 py-4">
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#065F46]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold leading-snug text-[#111827]">
                        {item.title}
                      </p>
                      <p className="mt-1 text-sm text-[#4B5563]">
                        {item.actor} · {item.timeLabel}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 9. Family & Caretaker Connection Status */}
        <div className="rounded-2xl border border-[#D1D5DB] bg-white lg:col-span-4">
          <div className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] px-6 py-5">
            <div>
              <h2 className="font-display text-xl font-bold text-[#111827]">
                Family &amp; Caretakers
              </h2>
              <p className="mt-0.5 text-base font-medium text-[#065F46]">
                {connectedCaretakersAndFamily.length === 0
                  ? 'No one connected yet'
                  : `${connectedCaretakersAndFamily.length} connected to your Care Circle`}
              </p>
            </div>
            <Users className="h-6 w-6 shrink-0 text-[#065F46]" />
          </div>

          <div className="p-6">
            {connectedCaretakersAndFamily.length === 0 ? (
              <div>
                <p className="text-base leading-relaxed text-[#374151]">
                  You can safely invite trusted family members or a caretaker with a private code and passcode.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('circle')}
                  className="mt-5 inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-[#065F46] px-5 py-3 text-base font-semibold text-white hover:bg-[#047857]"
                >
                  <HeartHandshake className="h-5 w-5" />
                  <span>Invite Family or Caretaker</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="divide-y divide-[#E5E7EB]">
                  {connectedCaretakersAndFamily.map((member) => (
                    <div key={member.uid} className="flex items-center justify-between gap-3 py-3 first:pt-0">
                      <div className="min-w-0">
                        <p className="truncate text-base font-bold text-[#111827]">
                          {member.displayName}
                        </p>
                        <p className="text-sm text-[#4B5563]">
                          <span className="capitalize font-medium text-[#065F46]">
                            {member.memberRole}
                          </span>
                          {member.relation ? ` · ${member.relation}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setContactModalOpen(true)}
                        className="min-h-[44px] shrink-0 rounded-xl border border-[#D1D5DB] bg-white px-4 py-2 text-sm font-semibold text-[#111827] hover:bg-[#ECFDF5]"
                      >
                        Message
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => onNavigate('circle')}
                  className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border-2 border-[#D1D5DB] bg-white px-4 py-2.5 text-base font-semibold text-[#065F46] hover:bg-[#ECFDF5]"
                >
                  Manage Access &amp; Invitations
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 10. Emergency Contact Section */}
        <div className="flex flex-col justify-between rounded-2xl border-2 border-[#B91C1C]/40 bg-white p-6 lg:col-span-3">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl font-bold text-[#991B1B]">Emergency Help</h2>
              <ShieldAlert className="h-6 w-6 text-[#B91C1C]" />
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <p className="text-sm font-semibold text-[#4B5563]">Emergency Contact</p>
                {profile.emergencyContact ? (
                  <p className="mt-1 text-base font-bold text-[#111827] break-words">
                    {profile.emergencyContact}
                  </p>
                ) : (
                  <p className="mt-1 text-base text-[#B45309]">Not set yet — tap below to add</p>
                )}
              </div>

              {emergencyDialNumber && (
                <a
                  href={`tel:${emergencyDialNumber}`}
                  className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl border-2 border-[#065F46] bg-[#ECFDF5] px-4 py-2.5 text-base font-bold text-[#064E3B] hover:bg-[#D1FAE5]"
                >
                  <Phone className="h-5 w-5" />
                  <span>Call Emergency Contact</span>
                </a>
              )}

              {activeCircle.primaryPhysician && (
                <div className="border-t border-[#E5E7EB] pt-3">
                  <p className="text-sm font-semibold text-[#4B5563]">Primary Doctor</p>
                  <p className="mt-0.5 text-base font-semibold text-[#111827]">
                    {activeCircle.primaryPhysician}
                  </p>
                </div>
              )}

              <p className="text-sm leading-relaxed text-[#4B5563]">
                For any life-threatening emergency, call <strong className="text-[#991B1B]">911</strong> immediately.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-2.5 border-t border-[#E5E7EB] pt-4">
            <button
              type="button"
              onClick={() => setConfirmUrgentAlertOpen(true)}
              className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-3 text-base font-bold text-white hover:bg-[#991B1B]"
            >
              <AlertTriangle className="h-5 w-5" />
              <span>Alert Care Circle Now</span>
            </button>
            <button
              type="button"
              onClick={openEmergencyEditModal}
              className="inline-flex min-h-[46px] w-full items-center justify-center rounded-xl border border-[#D1D5DB] bg-white px-4 py-2 text-sm font-semibold text-[#111827] hover:bg-[#F3F4F6]"
            >
              Edit Emergency Contact
            </button>
          </div>
        </div>
      </section>

      {/* Modal 1: Medicine Picker when multiple pending doses exist */}
      <Modal
        open={dosePickerOpen}
        onClose={() => setDosePickerOpen(false)}
        title="Which medicine did you take?"
        subtitle="Tap a medicine below to record it right away."
      >
        <div className="space-y-3">
          {pendingDosesToday.map((slot) => (
            <button
              key={slot.key}
              type="button"
              disabled={busyDoseKey === slot.key}
              onClick={() => handleLogDose(slot, 'taken')}
              className="flex min-h-[64px] w-full items-center justify-between gap-4 rounded-xl border-2 border-[#D1D5DB] bg-white px-5 py-4 text-left transition-colors hover:border-[#065F46] hover:bg-[#ECFDF5]"
            >
              <div>
                <p className="text-lg font-bold text-[#111827]">
                  {slot.medication.name} ({slot.medication.dosage})
                </p>
                <p className="font-mono text-sm font-semibold text-[#065F46] tabular-nums">
                  Scheduled for {formatTime12h(slot.time)}
                </p>
              </div>
              <span className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl bg-[#065F46] px-4 py-2 text-base font-bold text-white">
                <Check className="h-5 w-5" />
                <span>Taken</span>
              </span>
            </button>
          ))}
        </div>
      </Modal>

      {/* Modal 2: Simple Senior-Friendly Book Doctor Appointment */}
      <Modal
        open={bookModalOpen}
        onClose={() => setBookModalOpen(false)}
        title="Book Doctor Appointment"
        subtitle="Your family and caretaker will see this appointment automatically."
      >
        <form onSubmit={handleBookAppointment} className="space-y-4">
          <div>
            <label htmlFor="sr-appt-title" className="block text-base font-semibold text-[#111827]">
              Reason for Visit *
            </label>
            <input
              id="sr-appt-title"
              type="text"
              required
              maxLength={140}
              value={apptTitle}
              onChange={(e) => setApptTitle(e.target.value)}
              placeholder="e.g. Blood Pressure Check-up"
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[#D1D5DB] px-4 py-2.5 text-base focus:border-[#065F46] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="sr-appt-doc" className="block text-base font-semibold text-[#111827]">
                Doctor Name *
              </label>
              <input
                id="sr-appt-doc"
                type="text"
                required
                maxLength={120}
                value={apptDoctor}
                onChange={(e) => setApptDoctor(e.target.value)}
                placeholder="Dr. Elena Rostova"
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[#D1D5DB] px-4 py-2.5 text-base focus:border-[#065F46] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="sr-appt-clinic" className="block text-base font-semibold text-[#111827]">
                Clinic or Hospital
              </label>
              <input
                id="sr-appt-clinic"
                type="text"
                maxLength={140}
                value={apptClinic}
                onChange={(e) => setApptClinic(e.target.value)}
                placeholder="Oakridge Family Health"
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[#D1D5DB] px-4 py-2.5 text-base focus:border-[#065F46] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="sr-appt-date" className="block text-base font-semibold text-[#111827]">
                Date *
              </label>
              <input
                id="sr-appt-date"
                type="date"
                required
                value={apptDate}
                onChange={(e) => setApptDate(e.target.value)}
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 font-mono text-base focus:border-[#065F46] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="sr-appt-time" className="block text-base font-semibold text-[#111827]">
                Time *
              </label>
              <input
                id="sr-appt-time"
                type="time"
                required
                value={apptTime}
                onChange={(e) => setApptTime(e.target.value)}
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 font-mono text-base focus:border-[#065F46] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="sr-appt-type" className="block text-base font-semibold text-[#111827]">
                Visit Type
              </label>
              <select
                id="sr-appt-type"
                value={apptType}
                onChange={(e) => setApptType(e.target.value as VisitType)}
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[#D1D5DB] bg-white px-3.5 py-2.5 text-base focus:border-[#065F46] focus:outline-none"
              >
                <option value="in_person">In-Person</option>
                <option value="telehealth">Video / Phone</option>
                <option value="home_visit">Home Visit</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3 border-t border-[#E5E7EB] pt-4">
            <button
              type="button"
              onClick={() => setBookModalOpen(false)}
              className="min-h-[48px] rounded-xl border border-[#D1D5DB] bg-white px-5 py-2.5 text-base font-semibold text-[#1F2937] hover:bg-[#F3F4F6]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={bookingBusy}
              className="min-h-[48px] rounded-xl bg-[#065F46] px-6 py-2.5 text-base font-bold text-white hover:bg-[#047857] disabled:opacity-60"
            >
              {bookingBusy ? 'Saving...' : 'Save Appointment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal 3: Contact Caretaker / Family */}
      <Modal
        open={contactModalOpen}
        onClose={() => setContactModalOpen(false)}
        title="Contact Caretaker or Family"
        subtitle={
          connectedCaretakersAndFamily.length > 0
            ? `Sending to: ${connectedCaretakersAndFamily.map((m) => m.displayName).join(', ')}`
            : 'Send a note to your Care Circle feed.'
        }
      >
        <form onSubmit={handleSendContactMessage} className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-[#374151]">Quick message options:</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                'Please call me when you are free.',
                'I have a question about my medicine.',
                'Could you help me get to my doctor visit?',
                'I am feeling fine and took my medicines.',
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setContactText(preset)}
                  className="min-h-[44px] rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] px-3.5 py-2 text-left text-sm font-medium text-[#111827] hover:border-[#065F46] hover:bg-[#ECFDF5]"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="sr-contact-msg" className="block text-base font-semibold text-[#111827]">
              Your Message *
            </label>
            <textarea
              id="sr-contact-msg"
              rows={3}
              required
              maxLength={1500}
              value={contactText}
              onChange={(e) => setContactText(e.target.value)}
              placeholder="Write what you need help with..."
              className="mt-1.5 w-full rounded-xl border border-[#D1D5DB] px-4 py-3 text-base focus:border-[#065F46] focus:outline-none"
            />
          </div>

          <label className="flex min-h-[44px] items-center gap-3 text-base font-medium text-[#111827]">
            <input
              type="checkbox"
              checked={contactUrgent}
              onChange={(e) => setContactUrgent(e.target.checked)}
              className="h-5 w-5 rounded border-[#D1D5DB] text-[#B91C1C]"
            />
            <span>Mark as urgent (alerts everyone right away)</span>
          </label>

          <div className="flex flex-wrap justify-end gap-3 border-t border-[#E5E7EB] pt-4">
            <button
              type="button"
              onClick={() => setContactModalOpen(false)}
              className="min-h-[48px] rounded-xl border border-[#D1D5DB] bg-white px-5 py-2.5 text-base font-semibold text-[#1F2937] hover:bg-[#F3F4F6]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sendingContact}
              className="min-h-[48px] rounded-xl bg-[#065F46] px-6 py-2.5 text-base font-bold text-white hover:bg-[#047857] disabled:opacity-60"
            >
              {sendingContact ? 'Sending...' : 'Send Message'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal 4: Edit Emergency Contact */}
      <Modal
        open={emergencyModalOpen}
        onClose={() => setEmergencyModalOpen(false)}
        title="Emergency Contact Details"
        subtitle="Keep a trusted phone number and name visible on your dashboard."
      >
        <form onSubmit={handleSaveEmergencyContact} className="space-y-4">
          <div>
            <label htmlFor="sr-emerg-contact" className="block text-base font-semibold text-[#111827]">
              Emergency Contact Name &amp; Phone
            </label>
            <input
              id="sr-emerg-contact"
              type="text"
              maxLength={160}
              value={editEmergencyValue}
              onChange={(e) => setEditEmergencyValue(e.target.value)}
              placeholder="e.g. Sarah Miller (Daughter) · 555-019-2834"
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[#D1D5DB] px-4 py-2.5 text-base focus:border-[#065F46] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="sr-own-phone" className="block text-base font-semibold text-[#111827]">
              Your Phone Number
            </label>
            <input
              id="sr-own-phone"
              type="tel"
              maxLength={40}
              value={editPhoneValue}
              onChange={(e) => setEditPhoneValue(e.target.value)}
              placeholder="(555) 123-4567"
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[#D1D5DB] px-4 py-2.5 text-base focus:border-[#065F46] focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-3 border-t border-[#E5E7EB] pt-4">
            <button
              type="button"
              onClick={() => setEmergencyModalOpen(false)}
              className="min-h-[48px] rounded-xl border border-[#D1D5DB] bg-white px-5 py-2.5 text-base font-semibold text-[#1F2937] hover:bg-[#F3F4F6]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingEmergency}
              className="min-h-[48px] rounded-xl bg-[#065F46] px-6 py-2.5 text-base font-bold text-white hover:bg-[#047857] disabled:opacity-60"
            >
              {savingEmergency ? 'Saving...' : 'Save Contact'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal 5: Confirm Urgent Help Alert */}
      <Modal
        open={confirmUrgentAlertOpen}
        onClose={() => setConfirmUrgentAlertOpen(false)}
        title="Send Urgent Help Alert?"
        subtitle="This will send an urgent notification to everyone in your Care Circle."
      >
        <div className="space-y-4">
          <p className="text-base leading-relaxed text-[#374151]">
            If this is a medical emergency, please dial <strong>911</strong> on your phone right away.
            To notify your connected family members and caretakers that you need immediate help, confirm below.
          </p>
          <div className="flex flex-wrap justify-end gap-3 border-t border-[#E5E7EB] pt-4">
            <button
              type="button"
              onClick={() => setConfirmUrgentAlertOpen(false)}
              className="min-h-[48px] rounded-xl border border-[#D1D5DB] bg-white px-5 py-2.5 text-base font-semibold text-[#1F2937] hover:bg-[#F3F4F6]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={sendingUrgentAlert}
              onClick={handleSendUrgentHelpAlert}
              className="min-h-[48px] rounded-xl bg-[#B91C1C] px-6 py-2.5 text-base font-bold text-white hover:bg-[#991B1B] disabled:opacity-60"
            >
              {sendingUrgentAlert ? 'Sending Alert...' : 'Yes, Send Urgent Alert'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
