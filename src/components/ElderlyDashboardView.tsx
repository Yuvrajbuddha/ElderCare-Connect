import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  MessageSquare,
  Phone,
  Pill,
  Send,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCare } from '../context/CareContext';
import {
  formatDateDisplay,
  formatTime12h,
  formatTimestampRelative,
  getTodayKey,
  parseReadableError,
} from '../lib/utils';
import {
  formatMemberRoleLabel,
  logMedicationDose,
  seedStarterCareData,
  sendCareMessage,
} from '../services/careService';
import type { AppSection, Appointment, Medication, MedicationLog } from '../types/healthcare';
import { CareAssistantPanel } from './CareAssistantPanel';
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

function parseTimeToDate(dateKey: string, time24: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = time24.split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, Number.isNaN(hh) ? 8 : hh, Number.isNaN(mm) ? 0 : mm, 0, 0);
}

function formatCountdownLabel(targetDate: Date, now: Date): string {
  const diffMs = targetDate.getTime() - now.getTime();
  const absMins = Math.floor(Math.abs(diffMs) / 60000);
  if (diffMs <= 0) {
    if (absMins < 5) return 'Due now';
    if (absMins < 60) return `Due ${absMins} minutes ago`;
    const hrs = Math.floor(absMins / 60);
    return `Due ${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  }
  if (absMins < 60) return `Due in ${Math.max(1, absMins)} minutes`;
  const hrs = Math.floor(absMins / 60);
  const remMins = absMins % 60;
  return remMins > 0 ? `Due in ${hrs} hr ${remMins} min` : `Due in ${hrs} hr`;
}

function extractDialableNumber(text: string | undefined): string | null {
  if (!text) return null;
  const match = text.match(/(\+?\d[\d\s().-]{6,}\d)/);
  return match ? match[1].replace(/[^\d+]/g, '') : null;
}

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
    activityLogs,
    pushToast,
  } = useCare();

  const [now, setNow] = useState<Date>(() => new Date());
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [busyDoseKey, setBusyDoseKey] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Simple dialogs for secondary details
  const [doseDetailSlot, setDoseDetailSlot] = useState<DoseSlot | null>(null);
  const [apptDetail, setApptDetail] = useState<Appointment | null>(null);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [helpText, setHelpText] = useState('');
  const [helpUrgent, setHelpUrgent] = useState(false);
  const [sendingHelp, setSendingHelp] = useState(false);
  const [activityModalOpen, setActivityModalOpen] = useState(false);

  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (speechSupported) window.speechSynthesis.cancel();
    };
  }, [speechSupported]);

  const speakSummary = useCallback(
    (text: string) => {
      if (!speechSupported) return;
      if (isSpeaking) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
      } catch {
        setIsSpeaking(false);
      }
    },
    [speechSupported, isSpeaking],
  );

  const todayKey = getTodayKey();

  const activeMeds = useMemo(
    () => medications.filter((m) => m.status === 'active'),
    [medications],
  );

  const todaySlots: DoseSlot[] = useMemo(() => {
    return activeMeds
      .flatMap((med) =>
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
      )
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [activeMeds, medicationLogs, todayKey]);

  const takenCount = useMemo(
    () => todaySlots.filter((s) => s.log?.status === 'taken').length,
    [todaySlots],
  );

  const nextDueSlot = useMemo(() => {
    return todaySlots.find((s) => !s.log || s.log.status === 'pending') ?? null;
  }, [todaySlots]);

  const upcomingAppointments = useMemo(() => {
    return appointments
      .filter((a) => a.status === 'scheduled' && a.appointmentDate >= todayKey)
      .sort((a, b) =>
        `${a.appointmentDate} ${a.appointmentTime}`.localeCompare(
          `${b.appointmentDate} ${b.appointmentTime}`,
        ),
      );
  }, [appointments, todayKey]);

  const nextAppointment = upcomingAppointments[0] ?? null;

  const todayAppointments = useMemo(
    () => upcomingAppointments.filter((a) => a.appointmentDate === todayKey),
    [upcomingAppointments, todayKey],
  );

  const connectedFamilyCount = useMemo(
    () => members.filter((m) => m.memberRole !== 'patient').length,
    [members],
  );

  if (!activeCircle || !firebaseUser || !profile) return null;

  const hour = now.getHours();
  const timeGreeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const firstName = profile.displayName.split(' ')[0] || activeCircle.patientName.split(' ')[0];
  const fullDateLabel = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const fullTimeLabel = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const emergencyText = activeCircle.emergencyContact || profile.emergencyContact || '';
  const emergencyPhone = extractDialableNumber(emergencyText);

  const handleMarkDose = async (slot: DoseSlot, status: 'taken' | 'skipped' | 'pending') => {
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
        assistanceMode: status === 'taken' ? 'self' : undefined,
        uid: firebaseUser.uid,
        userName: profile.displayName,
        actorRole: 'patient',
      });
      setDoseDetailSlot(null);
      if (status === 'taken') {
        pushToast('success', `${slot.medication.name} marked as taken.`);
      } else if (status === 'skipped') {
        pushToast('info', `${slot.medication.name} marked as skipped.`);
      } else {
        pushToast('info', `${slot.medication.name} reset to pending.`);
      }
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setBusyDoseKey(null);
    }
  };

  const handleSeedStarterData = async () => {
    setSeeding(true);
    try {
      await seedStarterCareData({
        circle: activeCircle,
        uid: firebaseUser.uid,
        userName: profile.displayName,
        userRole: 'patient',
      });
      pushToast('success', 'Sample medicines and appointment added.');
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setSeeding(false);
    }
  };

  const handleSendHelp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!helpText.trim()) return;
    setSendingHelp(true);
    try {
      await sendCareMessage({
        circleId: activeCircle.id,
        memberIds: activeCircle.memberIds,
        senderUid: firebaseUser.uid,
        senderName: profile.displayName,
        senderRole: 'patient',
        category: helpUrgent ? 'alert' : 'update',
        body: helpText.trim(),
        urgent: helpUrgent,
      });
      pushToast('success', helpUrgent ? 'Urgent message sent to your family.' : 'Message sent to your family.');
      setHelpText('');
      setHelpUrgent(false);
      setHelpModalOpen(false);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setSendingHelp(false);
    }
  };

  const handleReadAloud = () => {
    const medPart = nextDueSlot
      ? `Your next medicine is ${nextDueSlot.medication.name}, ${nextDueSlot.medication.dosage}, at ${formatTime12h(nextDueSlot.time)}.`
      : todaySlots.length > 0
        ? 'You have taken all of your medicines for today.'
        : 'You have no medicines scheduled today.';
    const apptPart =
      todayAppointments.length > 0
        ? `You have a doctor visit today with ${todayAppointments[0].doctorName} at ${formatTime12h(todayAppointments[0].appointmentTime)}.`
        : 'You have no doctor visits today.';
    speakSummary(`${timeGreeting}, ${firstName}. Today is ${fullDateLabel}. ${medPart} ${apptPart}`);
  };

  if (activeCircleDataLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-32 animate-pulse rounded-2xl border border-[#E5E7EB] bg-white" />
        <div className="h-48 animate-pulse rounded-2xl border border-[#E5E7EB] bg-white" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="h-44 animate-pulse rounded-2xl border border-[#E5E7EB] bg-white" />
          <div className="h-44 animate-pulse rounded-2xl border border-[#E5E7EB] bg-white" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {activeCircleDataError && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-5 text-base text-[#991B1B]">
          {activeCircleDataError}
        </div>
      )}

      {/* 1. Simple Warm Greeting */}
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 sm:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-base font-medium text-[#065F46]">
              {fullDateLabel} · {fullTimeLabel}
            </p>
            <h1 className="font-display mt-1 text-3xl font-bold text-[#1F2937] sm:text-4xl">
              {timeGreeting}, {firstName}!
            </h1>
            <p className="mt-1 text-lg text-[#4B5563]">How are you feeling today?</p>
          </div>

          {speechSupported && (
            <button
              type="button"
              onClick={handleReadAloud}
              className="inline-flex min-h-[52px] shrink-0 items-center justify-center gap-2.5 rounded-xl border border-[#065F46] bg-[#ECFDF5] px-5 text-base font-bold text-[#065F46] hover:bg-[#D1FAE5]"
            >
              {isSpeaking ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              <span>{isSpeaking ? 'Stop Reading' : 'Read Aloud'}</span>
            </button>
          )}
        </div>
      </section>

      {/* 2. Next Medicine Due — One Clear Primary Action */}
      <section className="rounded-2xl border-2 border-[#065F46]/30 bg-white p-6 sm:p-7">
        {todaySlots.length === 0 ? (
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-display text-2xl font-bold text-[#1F2937]">
                No medicines added yet
              </h2>
              <p className="mt-1 text-base text-[#4B5563]">
                Add your medicines or load a sample schedule to start tracking.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onNavigate('medications')}
                className="min-h-[52px] rounded-xl bg-[#065F46] px-6 text-base font-bold text-white hover:bg-[#047857]"
              >
                Add Medicine
              </button>
              <button
                type="button"
                disabled={seeding}
                onClick={handleSeedStarterData}
                className="min-h-[52px] rounded-xl border border-[#D1D5DB] bg-white px-5 text-base font-semibold text-[#1F2937] hover:bg-[#F3F4F6] disabled:opacity-60"
              >
                {seeding ? 'Loading...' : 'Load Sample Schedule'}
              </button>
            </div>
          </div>
        ) : nextDueSlot ? (
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-base font-bold text-[#065F46]">
                <Clock className="h-5 w-5" />
                <span>
                  Next Medicine · {formatTime12h(nextDueSlot.time)} (
                  {formatCountdownLabel(nextDueSlot.scheduledDateTime, now)})
                </span>
              </div>
              <h2 className="font-display text-2xl font-bold text-[#1F2937] sm:text-3xl">
                {nextDueSlot.medication.name}{' '}
                <span className="font-normal text-[#4B5563]">— {nextDueSlot.medication.dosage}</span>
              </h2>
              {nextDueSlot.medication.instructions && (
                <p className="text-lg text-[#4B5563]">{nextDueSlot.medication.instructions}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                disabled={busyDoseKey === nextDueSlot.key}
                onClick={() => handleMarkDose(nextDueSlot, 'taken')}
                className="inline-flex min-h-[56px] items-center justify-center gap-2.5 rounded-xl bg-[#065F46] px-7 text-lg font-bold text-white hover:bg-[#047857] disabled:opacity-60"
              >
                <Check className="h-6 w-6" />
                <span>{busyDoseKey === nextDueSlot.key ? 'Saving...' : 'Mark as Taken'}</span>
              </button>
              <button
                type="button"
                onClick={() => setDoseDetailSlot(nextDueSlot)}
                className="min-h-[56px] rounded-xl border border-[#D1D5DB] bg-white px-5 text-base font-semibold text-[#1F2937] hover:bg-[#F3F4F6]"
              >
                View Details
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#ECFDF5] text-[#065F46]">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold text-[#1F2937]">
                  All medicines taken today!
                </h2>
                <p className="mt-0.5 text-lg text-[#4B5563]">
                  You completed {takenCount} of {todaySlots.length} doses today.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('medications')}
              className="min-h-[50px] shrink-0 rounded-xl border border-[#065F46] bg-[#ECFDF5] px-5 text-base font-bold text-[#065F46] hover:bg-[#D1FAE5]"
            >
              View My Medicines
            </button>
          </div>
        )}
      </section>

      {/* 3. Today's Summary (2 Clean Cards) */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Today's Medicines Summary */}
        <section className="flex flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-6">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <Pill className="h-6 w-6 text-[#065F46]" />
                <h2 className="font-display text-xl font-bold text-[#1F2937]">
                  Today&apos;s Medicines
                </h2>
              </div>
              <span className="font-mono text-lg font-bold text-[#065F46] tabular-nums">
                {takenCount}/{todaySlots.length}
              </span>
            </div>

            {todaySlots.length === 0 ? (
              <p className="mt-4 text-base text-[#6B7280]">No medicines scheduled today.</p>
            ) : (
              <ul className="mt-4 divide-y divide-[#E5E7EB]">
                {todaySlots.slice(0, 4).map((slot) => {
                  const isTaken = slot.log?.status === 'taken';
                  const isSkipped = slot.log?.status === 'skipped';
                  const isMissed = slot.log?.status === 'missed';
                  return (
                    <li
                      key={slot.key}
                      className="flex items-center justify-between gap-3 py-3 text-base"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[#1F2937]">{slot.medication.name}</p>
                        <p className="text-sm text-[#6B7280]">
                          {formatTime12h(slot.time)} · {slot.medication.dosage}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDoseDetailSlot(slot)}
                        className={`min-h-[40px] shrink-0 rounded-xl px-3.5 text-sm font-bold ${
                          isTaken
                            ? 'bg-[#ECFDF5] text-[#065F46]'
                            : isMissed
                              ? 'bg-red-50 text-[#B91C1C]'
                              : isSkipped
                                ? 'bg-amber-50 text-[#B45309]'
                                : 'border border-[#D1D5DB] bg-white text-[#1F2937] hover:bg-[#F3F4F6]'
                        }`}
                      >
                        {isTaken ? 'Taken' : isMissed ? 'Missed' : isSkipped ? 'Skipped' : 'View'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={() => onNavigate('medications')}
            className="mt-5 min-h-[48px] w-full rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] text-base font-bold text-[#065F46] hover:bg-[#ECFDF5]"
          >
            Open My Medicines
          </button>
        </section>

        {/* Next Appointment Summary */}
        <section className="flex flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-6">
          <div>
            <div className="flex items-center gap-2.5">
              <Calendar className="h-6 w-6 text-[#065F46]" />
              <h2 className="font-display text-xl font-bold text-[#1F2937]">
                Next Appointment
              </h2>
            </div>

            {!nextAppointment ? (
              <p className="mt-4 text-base text-[#6B7280]">No upcoming appointments.</p>
            ) : (
              <div className="mt-5 space-y-1.5">
                <p className="text-xl font-bold text-[#1F2937]">
                  {nextAppointment.doctorName}
                </p>
                <p className="text-base text-[#4B5563]">
                  {nextAppointment.appointmentDate === todayKey
                    ? 'Today'
                    : formatDateDisplay(nextAppointment.appointmentDate)}{' '}
                  · {formatTime12h(nextAppointment.appointmentTime)}
                </p>
              </div>
            )}
          </div>

          {nextAppointment && (
            <button
              type="button"
              onClick={() => setApptDetail(nextAppointment)}
              className="mt-5 min-h-[48px] w-full rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] text-base font-bold text-[#065F46] hover:bg-[#ECFDF5]"
            >
              View Details
            </button>
          )}
        </section>
      </div>

      {/* 3b. Simple Care Routine Assistant */}
      <CareAssistantPanel />

      {/* 4. Need Help? & Family Activity */}
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <h2 className="font-display text-xl font-bold text-[#1F2937]">
              Need Help or Have a Question?
            </h2>
            <p className="mt-1 text-base text-[#4B5563]">
              Emergency Contact:{' '}
              <span className="font-semibold text-[#1F2937]">
                {emergencyText || 'Not added yet (add in Settings)'}
              </span>
            </p>
            <p className="mt-0.5 text-sm text-[#6B7280]">
              {connectedFamilyCount === 0
                ? 'No family members connected yet.'
                : `${connectedFamilyCount} family or care team member${connectedFamilyCount === 1 ? '' : 's'} connected.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {emergencyPhone && (
              <a
                href={`tel:${emergencyPhone}`}
                className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-xl bg-[#B91C1C] px-5 text-base font-bold text-white hover:bg-[#991B1B]"
              >
                <Phone className="h-5 w-5" />
                <span>Call Emergency Contact</span>
              </a>
            )}
            <button
              type="button"
              onClick={() => setHelpModalOpen(true)}
              className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-xl bg-[#065F46] px-5 text-base font-bold text-white hover:bg-[#047857]"
            >
              <MessageSquare className="h-5 w-5" />
              <span>Message Family</span>
            </button>
            <button
              type="button"
              onClick={() => setActivityModalOpen(true)}
              className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-xl border border-[#D1D5DB] bg-white px-5 text-base font-semibold text-[#1F2937] hover:bg-[#F3F4F6]"
            >
              <Activity className="h-5 w-5 text-[#065F46]" />
              <span>Recent Updates</span>
            </button>
          </div>
        </div>
      </section>

      {/* Dose Details Dialog */}
      <Modal
        open={Boolean(doseDetailSlot)}
        onClose={() => setDoseDetailSlot(null)}
        title={doseDetailSlot ? doseDetailSlot.medication.name : 'Medicine Details'}
      >
        {doseDetailSlot && (
          <div className="space-y-4 text-base">
            <div className="space-y-2 text-[#374151]">
              <p>
                <span className="font-semibold">Dosage:</span> {doseDetailSlot.medication.dosage}
              </p>
              <p>
                <span className="font-semibold">Time:</span> {formatTime12h(doseDetailSlot.time)}
              </p>
              {doseDetailSlot.medication.instructions && (
                <p>
                  <span className="font-semibold">Instructions:</span>{' '}
                  {doseDetailSlot.medication.instructions}
                </p>
              )}
              {doseDetailSlot.log && (
                <p>
                  <span className="font-semibold">Status:</span>{' '}
                  <span className="capitalize">{doseDetailSlot.log.status}</span> (recorded by{' '}
                  {doseDetailSlot.log.loggedByName})
                </p>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-[#E5E7EB] pt-4">
              {doseDetailSlot.log?.status !== 'skipped' && (
                <button
                  type="button"
                  disabled={busyDoseKey === doseDetailSlot.key}
                  onClick={() => handleMarkDose(doseDetailSlot, 'skipped')}
                  className="min-h-[48px] rounded-xl border border-[#D1D5DB] px-5 text-base font-semibold text-[#374151] hover:bg-[#F3F4F6]"
                >
                  Skip This Dose
                </button>
              )}
              {doseDetailSlot.log?.status === 'taken' ? (
                <button
                  type="button"
                  disabled={busyDoseKey === doseDetailSlot.key}
                  onClick={() => handleMarkDose(doseDetailSlot, 'pending')}
                  className="min-h-[48px] rounded-xl border border-[#D1D5DB] px-5 text-base font-semibold text-[#374151]"
                >
                  Undo Taken
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busyDoseKey === doseDetailSlot.key}
                  onClick={() => handleMarkDose(doseDetailSlot, 'taken')}
                  className="min-h-[48px] rounded-xl bg-[#065F46] px-6 text-base font-bold text-white hover:bg-[#047857]"
                >
                  Mark as Taken
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Appointment Details Dialog */}
      <Modal
        open={Boolean(apptDetail)}
        onClose={() => setApptDetail(null)}
        title={apptDetail?.title || 'Appointment Details'}
      >
        {apptDetail && (
          <div className="space-y-3 text-base text-[#374151]">
            <p>
              <span className="font-semibold text-[#1F2937]">Doctor Name:</span>{' '}
              {apptDetail.doctorName}
            </p>
            <p>
              <span className="font-semibold text-[#1F2937]">Hospital Name:</span>{' '}
              {apptDetail.clinicName || 'Not specified'}
            </p>
            <p>
              <span className="font-semibold text-[#1F2937]">Date:</span>{' '}
              {formatDateDisplay(apptDetail.appointmentDate)}
            </p>
            <p>
              <span className="font-semibold text-[#1F2937]">Time:</span>{' '}
              {formatTime12h(apptDetail.appointmentTime)}
            </p>
            <p>
              <span className="font-semibold text-[#1F2937]">Reason for Visit:</span>{' '}
              {apptDetail.title}
            </p>
            <div className="flex justify-end gap-3 border-t border-[#E5E7EB] pt-4">
              <button
                type="button"
                onClick={() => {
                  setApptDetail(null);
                  onNavigate('appointments');
                }}
                className="min-h-[48px] rounded-xl bg-[#065F46] px-5 text-base font-bold text-white hover:bg-[#047857]"
              >
                Open Appointments
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Message Family Dialog */}
      <Modal
        open={helpModalOpen}
        onClose={() => setHelpModalOpen(false)}
        title="Message Family & Care Team"
        subtitle="Send a note or ask for help."
      >
        <form onSubmit={handleSendHelp} className="space-y-4">
          <textarea
            rows={4}
            required
            value={helpText}
            onChange={(e) => setHelpText(e.target.value)}
            placeholder="Write your message here (for example: Please call me when you are free)..."
            className="w-full rounded-xl border border-[#D1D5DB] p-3.5 text-base focus:border-[#065F46] focus:outline-none"
          />
          <label className="flex items-center gap-3 text-base font-medium text-[#1F2937]">
            <input
              type="checkbox"
              checked={helpUrgent}
              onChange={(e) => setHelpUrgent(e.target.checked)}
              className="h-5 w-5 rounded border-[#D1D5DB] text-[#B91C1C]"
            />
            <span>This is urgent — alert my family right away</span>
          </label>
          <div className="flex justify-end gap-3 border-t border-[#E5E7EB] pt-4">
            <button
              type="button"
              onClick={() => setHelpModalOpen(false)}
              className="min-h-[48px] rounded-xl border border-[#D1D5DB] px-5 text-base font-medium text-[#374151]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sendingHelp || !helpText.trim()}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-[#065F46] px-6 text-base font-bold text-white hover:bg-[#047857] disabled:opacity-60"
            >
              <Send className="h-5 w-5" />
              <span>{sendingHelp ? 'Sending...' : 'Send Message'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Recent Activity Dialog (preserves actor transparency) */}
      <Modal
        open={activityModalOpen}
        onClose={() => setActivityModalOpen(false)}
        title="Recent Care Updates"
        subtitle="See who checked in or logged care actions."
      >
        {activityLogs.length === 0 ? (
          <p className="py-6 text-center text-base text-[#6B7280]">No updates recorded yet.</p>
        ) : (
          <ul className="divide-y divide-[#E5E7EB]">
            {activityLogs.slice(0, 10).map((act) => (
              <li key={act.id} className="py-3.5">
                <p className="text-base font-semibold text-[#1F2937]">{act.action}</p>
                {act.detail && <p className="mt-0.5 text-sm text-[#4B5563]">{act.detail}</p>}
                <p className="mt-1 text-sm text-[#6B7280]">
                  By <span className="font-semibold text-[#065F46]">{act.actorName}</span> (
                  {formatMemberRoleLabel(act.actorRole)}) · {formatTimestampRelative(act.timestamp)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
