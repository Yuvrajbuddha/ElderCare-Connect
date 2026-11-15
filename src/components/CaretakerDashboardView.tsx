import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  ClipboardCheck,
  Lock,
  Pill,
  Plus,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';
import { useCare } from '../context/CareContext';
import { formatDateDisplay, formatTime12h, getTodayKey, parseReadableError } from '../lib/utils';
import {
  createCareTask,
  logMedicationDose,
  reportUnusualObservation,
} from '../services/careService';
import type {
  AppSection,
  Appointment,
  DoseStatus,
  Medication,
  MedicationAssistanceMode,
  MedicationLog,
} from '../types/healthcare';
import { Modal } from './ui/Modal';
import { StatusText } from './ui/StatusText';

interface CaretakerDashboardViewProps {
  onNavigate: (section: AppSection) => void;
  onAcceptInvite?: () => void;
}

export function CaretakerDashboardView({ onNavigate }: CaretakerDashboardViewProps) {
  const {
    activeCircle,
    activeCircleDataLoading,
    activeCircleDataError,
    circles,
    selectActiveCircle,
    firebaseUser,
    profile,
    currentMember,
    can,
    medications,
    medicationLogs,
    appointments,
    routines,
    routineLogs,
    tasks,
    pushToast,
  } = useCare();

  const todayKey = getTodayKey();

  // Busy & modal state
  const [busyMedKey, setBusyMedKey] = useState<string | null>(null);
  const [doseModalSlot, setDoseModalSlot] = useState<{
    med: Medication;
    time: string;
    log?: MedicationLog;
  } | null>(null);
  const [doseStatusInput, setDoseStatusInput] = useState<DoseStatus>('taken');
  const [doseAssistMode, setDoseAssistMode] = useState<MedicationAssistanceMode>('administered');
  const [doseNotesInput, setDoseNotesInput] = useState('');
  const [savingDoseModal, setSavingDoseModal] = useState(false);

  const [apptDetail, setApptDetail] = useState<Appointment | null>(null);

  const [obsModalOpen, setObsModalOpen] = useState(false);
  const [obsTitle, setObsTitle] = useState('');
  const [obsUrgency, setObsUrgency] = useState<'warning' | 'urgent'>('warning');
  const [obsReading, setObsReading] = useState('');
  const [obsSummary, setObsSummary] = useState('');
  const [savingObs, setSavingObs] = useState(false);

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueTime, setTaskDueTime] = useState('10:00');
  const [savingTask, setSavingTask] = useState(false);

  const canViewHealth = can('viewHealthInfo');
  const canViewMeds = can('viewMedications');
  const canLogDoses = can('addMedications') || can('editMedications');
  const canManageAppts = can('manageAppointments');
  const canViewAppts = canManageAppts || canViewHealth;

  const activeMeds = useMemo(() => medications.filter((m) => m.status === 'active'), [medications]);

  const todayMedSlots = useMemo(() => {
    return activeMeds
      .flatMap((med) =>
        med.scheduledTimes.map((time) => {
          const log = medicationLogs.find(
            (l) => l.medicationId === med.id && l.dateKey === todayKey && l.scheduledTime === time,
          );
          return { key: `${med.id}_${time}`, med, time, log };
        }),
      )
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [activeMeds, medicationLogs, todayKey]);

  const medProgress = useMemo(() => {
    const total = todayMedSlots.length;
    const taken = todayMedSlots.filter((s) => s.log?.status === 'taken').length;
    return { total, taken };
  }, [todayMedSlots]);

  const pendingTaskCount = useMemo(
    () => tasks.filter((t) => t.status !== 'completed').length,
    [tasks],
  );

  const routineSummary = useMemo(() => {
    const active = routines.filter((r) => r.active);
    const completed = active.filter((r) =>
      routineLogs.some((l) => l.routineId === r.id && l.dateKey === todayKey && l.completed),
    ).length;
    return { completed, total: active.length };
  }, [routines, routineLogs, todayKey]);

  const upcomingAppointments = useMemo(() => {
    if (!canViewAppts) return [];
    return appointments
      .filter((a) => a.status === 'scheduled' && a.appointmentDate >= todayKey)
      .sort((a, b) =>
        `${a.appointmentDate} ${a.appointmentTime}`.localeCompare(
          `${b.appointmentDate} ${b.appointmentTime}`,
        ),
      );
  }, [canViewAppts, appointments, todayKey]);

  const nextAppointment = upcomingAppointments[0] ?? null;

  if (!activeCircle || !firebaseUser || !profile) return null;

  const actorRole = currentMember?.memberRole ?? 'caretaker';

  const handleQuickMarkTaken = async (slot: (typeof todayMedSlots)[number]) => {
    setBusyMedKey(slot.key);
    try {
      await logMedicationDose({
        circleId: activeCircle.id,
        memberIds: activeCircle.memberIds,
        medication: slot.med,
        existingLog: slot.log,
        dateKey: todayKey,
        scheduledTime: slot.time,
        status: 'taken',
        assistanceMode: 'administered',
        uid: firebaseUser.uid,
        userName: profile.displayName,
        actorRole,
      });
      pushToast('success', `${slot.med.name} marked as taken.`);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setBusyMedKey(null);
    }
  };

  const openDoseModal = (slot: (typeof todayMedSlots)[number]) => {
    setDoseModalSlot({ med: slot.med, time: slot.time, log: slot.log });
    setDoseStatusInput(slot.log?.status ?? 'taken');
    setDoseAssistMode(slot.log?.assistanceMode ?? 'administered');
    setDoseNotesInput(slot.log?.notes ?? '');
  };

  const handleSaveDoseModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doseModalSlot) return;
    setSavingDoseModal(true);
    try {
      await logMedicationDose({
        circleId: activeCircle.id,
        memberIds: activeCircle.memberIds,
        medication: doseModalSlot.med,
        existingLog: doseModalSlot.log,
        dateKey: todayKey,
        scheduledTime: doseModalSlot.time,
        status: doseStatusInput,
        assistanceMode: doseStatusInput === 'taken' ? doseAssistMode : undefined,
        notes: doseNotesInput.trim(),
        uid: firebaseUser.uid,
        userName: profile.displayName,
        actorRole,
      });
      pushToast('success', `${doseModalSlot.med.name} updated.`);
      setDoseModalSlot(null);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setSavingDoseModal(false);
    }
  };


  const handleReportObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!obsTitle.trim() || !obsSummary.trim()) return;
    setSavingObs(true);
    try {
      await reportUnusualObservation({
        circleId: activeCircle.id,
        memberIds: activeCircle.memberIds,
        canCreateHealthRecord: canViewHealth,
        observerUid: firebaseUser.uid,
        observerName: profile.displayName,
        observerRole: actorRole,
        observationTitle: obsTitle.trim(),
        observedDate: todayKey,
        urgency: obsUrgency,
        vitalReading: obsReading.trim(),
        vitalUnit: '',
        summary: obsSummary.trim(),
      });
      pushToast('success', 'Observation sent to family members.');
      setObsTitle('');
      setObsReading('');
      setObsSummary('');
      setObsModalOpen(false);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setSavingObs(false);
    }
  };

  const handleAddQuickTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    setSavingTask(true);
    try {
      await createCareTask({
        circleId: activeCircle.id,
        memberIds: activeCircle.memberIds,
        title: taskTitle.trim(),
        category: 'other',
        dueDate: todayKey,
        dueTime: taskDueTime,
        priority: 'normal',
        notes: '',
        assignedToUid: firebaseUser.uid,
        assignedToName: profile.displayName,
        createdByUid: firebaseUser.uid,
        createdByName: profile.displayName,
        actorRole,
      });
      pushToast('success', 'Daily task added.');
      setTaskTitle('');
      setTaskModalOpen(false);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setSavingTask(false);
    }
  };

  if (activeCircleDataLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-28 animate-pulse rounded-2xl border border-[#E5E7EB] bg-white" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-[#E5E7EB] bg-white" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-2xl border border-[#E5E7EB] bg-white" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {activeCircleDataError && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-[#991B1B]">
          {activeCircleDataError}
        </div>
      )}

      {/* 1. Patient Header & Switcher */}
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold text-[#065F46]">
              Caretaker View · {formatDateDisplay(todayKey)}
            </p>
            <h1 className="font-display mt-1 text-2xl font-bold text-[#1F2937] sm:text-3xl">
              Caring for {activeCircle.patientName}
            </h1>
            <p className="mt-1 text-sm text-[#4B5563]">
              Age {activeCircle.patientAge}
              {activeCircle.emergencyContact ? ` · Emergency: ${activeCircle.emergencyContact}` : ''}
              {canViewHealth && activeCircle.allergies ? ` · Allergies: ${activeCircle.allergies}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setTaskModalOpen(true)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#065F46] px-4 text-sm font-semibold text-white hover:bg-[#047857]"
            >
              <Plus className="h-4 w-4" />
              <span>Add Task</span>
            </button>
            <button
              type="button"
              onClick={() => setObsModalOpen(true)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-[#92400E] hover:bg-amber-100"
            >
              <ShieldAlert className="h-4 w-4" />
              <span>Report Concern</span>
            </button>
          </div>
        </div>

        {circles.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-[#E5E7EB] pt-4">
            {circles.map((circle) => {
              const selected = circle.id === activeCircle.id;
              return (
                <button
                  key={circle.id}
                  type="button"
                  onClick={() => selectActiveCircle(circle.id)}
                  className={`inline-flex min-h-[42px] items-center gap-2 rounded-xl border px-4 text-sm font-semibold ${
                    selected
                      ? 'border-[#065F46] bg-[#ECFDF5] text-[#065F46]'
                      : 'border-[#D1D5DB] bg-white text-[#374151] hover:bg-[#F3F4F6]'
                  }`}
                >
                  <UserCheck className="h-4 w-4" />
                  <span>{circle.patientName}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. Two Key Summary Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
          <div className="flex items-center justify-between text-sm font-medium text-[#6B7280]">
            <span>Today&apos;s Medicines</span>
            <Pill className="h-5 w-5 text-[#065F46]" />
          </div>
          {canViewMeds ? (
            <>
              <p className="font-mono mt-2 text-3xl font-bold text-[#1F2937] tabular-nums">
                {medProgress.taken}/{medProgress.total}
              </p>
              <p className="mt-1 text-sm text-[#4B5563]">Given today</p>
            </>
          ) : (
            <p className="mt-3 text-sm text-[#6B7280]">Not shared</p>
          )}
        </div>

        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
          <div className="flex items-center justify-between text-sm font-medium text-[#6B7280]">
            <span>Daily Care</span>
            <ClipboardCheck className="h-5 w-5 text-[#065F46]" />
          </div>
          <p className="font-mono mt-2 text-3xl font-bold text-[#1F2937] tabular-nums">
            {pendingTaskCount}
          </p>
          <p className="mt-1 text-sm text-[#4B5563]">
            Pending tasks · {routineSummary.completed}/{routineSummary.total} routines done
          </p>
        </div>
      </section>

      {/* 3. Today's Medicines & Upcoming Visits */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-2xl border border-[#E5E7EB] bg-white lg:col-span-7">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] px-6 py-4">
            <div>
              <h2 className="font-display text-lg font-bold text-[#1F2937]">Today&apos;s Medicines</h2>
              <p className="text-xs text-[#6B7280]">Prescribed dosages are locked (read-only).</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('medications')}
              className="text-sm font-semibold text-[#065F46] hover:underline"
            >
              Open Medicines
            </button>
          </div>

          {!canViewMeds ? (
            <div className="px-6 py-10 text-center text-sm text-[#6B7280]">
              Medicine schedule has not been shared.
            </div>
          ) : todayMedSlots.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-[#6B7280]">
              No medicines scheduled for today.
            </div>
          ) : (
            <div className="divide-y divide-[#E5E7EB]">
              {todayMedSlots.map((slot) => {
                const status = slot.log?.status ?? 'pending';
                const isBusy = busyMedKey === slot.key;
                return (
                  <div
                    key={slot.key}
                    className="flex flex-col justify-between gap-3 px-6 py-4 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold text-[#065F46]">
                          {formatTime12h(slot.time)}
                        </span>
                        <span className="text-base font-semibold text-[#1F2937]">{slot.med.name}</span>
                        <span
                          title="Dosage is locked"
                          className="inline-flex items-center gap-1 text-sm text-[#4B5563]"
                        >
                          <Lock className="h-3.5 w-3.5 text-[#9CA3AF]" />
                          {slot.med.dosage}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <StatusText
                          variant={
                            status === 'taken' ? 'success' : status === 'skipped' ? 'warning' : 'neutral'
                          }
                          label={
                            status === 'taken'
                              ? slot.log?.assistanceMode === 'assisted'
                                ? 'Assisted'
                                : 'Taken'
                              : status === 'skipped'
                                ? 'Skipped'
                                : 'Pending'
                          }
                        />
                        {slot.med.instructions && (
                          <span className="text-xs text-[#6B7280]">{slot.med.instructions}</span>
                        )}
                      </div>
                    </div>

                    {canLogDoses && (
                      <div className="flex items-center gap-2 shrink-0">
                        {status !== 'taken' ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleQuickMarkTaken(slot)}
                            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#065F46] px-4 text-sm font-semibold text-white hover:bg-[#047857] disabled:opacity-60"
                          >
                            <Check className="h-4 w-4" />
                            <span>Mark as Taken</span>
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => openDoseModal(slot)}
                          className="min-h-[44px] rounded-xl border border-[#D1D5DB] bg-white px-4 text-sm font-semibold text-[#374151] hover:bg-[#F3F4F6]"
                        >
                          View Details
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Next Appointment + Daily Care shortcut */}
        <div className="space-y-6 lg:col-span-5">
          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6">
            <div className="flex items-center gap-2.5">
              <Calendar className="h-5 w-5 text-[#065F46]" />
              <h2 className="font-display text-lg font-bold text-[#1F2937]">Next Appointment</h2>
            </div>

            {!canViewAppts ? (
              <p className="mt-4 text-sm text-[#6B7280]">
                Appointments are not shared with your account.
              </p>
            ) : !nextAppointment ? (
              <p className="mt-4 text-sm text-[#6B7280]">No upcoming appointments.</p>
            ) : (
              <>
                <div className="mt-4 space-y-1">
                  <p className="text-lg font-bold text-[#1F2937]">{nextAppointment.doctorName}</p>
                  <p className="text-sm text-[#4B5563]">
                    {formatDateDisplay(nextAppointment.appointmentDate)} ·{' '}
                    {formatTime12h(nextAppointment.appointmentTime)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setApptDetail(nextAppointment)}
                  className="mt-5 min-h-[46px] w-full rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] px-4 text-sm font-bold text-[#065F46] hover:bg-[#ECFDF5]"
                >
                  View Details
                </button>
              </>
            )}
          </section>

          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6">
            <h2 className="font-display text-lg font-bold text-[#1F2937]">Daily Tasks &amp; Notes</h2>
            <p className="mt-1 text-sm text-[#6B7280]">
              You have {pendingTaskCount} pending task{pendingTaskCount === 1 ? '' : 's'} and{' '}
              {routineSummary.total - routineSummary.completed} routine
              {routineSummary.total - routineSummary.completed === 1 ? '' : 's'} left today.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('routines')}
              className="mt-4 min-h-[48px] w-full rounded-xl bg-[#ECFDF5] text-sm font-bold text-[#065F46] hover:bg-[#D1FAE5]"
            >
              Open Daily Care
            </button>
          </section>
        </div>
      </div>

      {/* Dose Status & Note Modal */}
      <Modal
        open={Boolean(doseModalSlot)}
        onClose={() => setDoseModalSlot(null)}
        title={doseModalSlot ? doseModalSlot.med.name : 'Medicine Details'}
        subtitle={
          doseModalSlot
            ? `${doseModalSlot.med.dosage} · ${formatTime12h(doseModalSlot.time)}`
            : undefined
        }
      >
        {doseModalSlot && (
          <form onSubmit={handleSaveDoseModal} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ct-status" className="block text-sm font-semibold text-[#1F2937]">
                  Status
                </label>
                <select
                  id="ct-status"
                  value={doseStatusInput}
                  onChange={(e) => setDoseStatusInput(e.target.value as DoseStatus)}
                  className="mt-1 w-full rounded-xl border border-[#D1D5DB] bg-white px-3 py-2.5 text-sm"
                >
                  <option value="taken">Taken</option>
                  <option value="skipped">Skipped</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              {doseStatusInput === 'taken' && (
                <div>
                  <label htmlFor="ct-mode" className="block text-sm font-semibold text-[#1F2937]">
                    How It Was Given
                  </label>
                  <select
                    id="ct-mode"
                    value={doseAssistMode}
                    onChange={(e) =>
                      setDoseAssistMode(e.target.value as MedicationAssistanceMode)
                    }
                    className="mt-1 w-full rounded-xl border border-[#D1D5DB] bg-white px-3 py-2.5 text-sm"
                  >
                    <option value="administered">Administered by caretaker</option>
                    <option value="assisted">Assisted patient</option>
                  </select>
                </div>
              )}
            </div>
            <div>
              <label htmlFor="ct-notes" className="block text-sm font-semibold text-[#1F2937]">
                Care Note
              </label>
              <textarea
                id="ct-notes"
                rows={2}
                value={doseNotesInput}
                onChange={(e) => setDoseNotesInput(e.target.value)}
                placeholder="Optional note (e.g. taken with lunch)..."
                className="mt-1 w-full rounded-xl border border-[#D1D5DB] p-3 text-sm"
              />
            </div>
            <div className="flex justify-end gap-3 border-t border-[#E5E7EB] pt-4">
              <button
                type="button"
                onClick={() => setDoseModalSlot(null)}
                className="min-h-[44px] rounded-xl border border-[#D1D5DB] px-4 text-sm font-medium text-[#374151]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingDoseModal}
                className="min-h-[44px] rounded-xl bg-[#065F46] px-5 text-sm font-semibold text-white hover:bg-[#047857] disabled:opacity-60"
              >
                {savingDoseModal ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Appointment Details Modal */}
      <Modal
        open={Boolean(apptDetail)}
        onClose={() => setApptDetail(null)}
        title={apptDetail?.title || 'Appointment Details'}
      >
        {apptDetail && (
          <div className="space-y-3 text-sm text-[#374151]">
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
                onClick={() => setApptDetail(null)}
                className="min-h-[44px] rounded-xl border border-[#D1D5DB] px-4 text-sm font-semibold text-[#374151]"
              >
                Close
              </button>
              {canManageAppts && (
                <button
                  type="button"
                  onClick={() => {
                    setApptDetail(null);
                    onNavigate('appointments');
                  }}
                  className="min-h-[44px] rounded-xl bg-[#065F46] px-5 text-sm font-semibold text-white hover:bg-[#047857]"
                >
                  Open Appointments
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Report Unusual Observation Modal */}
      <Modal
        open={obsModalOpen}
        onClose={() => setObsModalOpen(false)}
        title="Report Unusual Observation"
        subtitle="Alerts family members immediately."
      >
        <form onSubmit={handleReportObservation} className="space-y-4">
          <div>
            <label htmlFor="obs-title" className="block text-sm font-semibold text-[#1F2937]">
              What did you notice? *
            </label>
            <input
              id="obs-title"
              type="text"
              required
              value={obsTitle}
              onChange={(e) => setObsTitle(e.target.value)}
              placeholder="e.g. Felt dizzy after standing up"
              className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="obs-urg" className="block text-sm font-semibold text-[#1F2937]">
                Urgency
              </label>
              <select
                id="obs-urg"
                value={obsUrgency}
                onChange={(e) => setObsUrgency(e.target.value as 'warning' | 'urgent')}
                className="mt-1 w-full rounded-xl border border-[#D1D5DB] bg-white px-3.5 py-2.5 text-sm"
              >
                <option value="warning">Needs Attention</option>
                <option value="urgent">Urgent Alert</option>
              </select>
            </div>
            <div>
              <label htmlFor="obs-val" className="block text-sm font-semibold text-[#1F2937]">
                Reading (Optional)
              </label>
              <input
                id="obs-val"
                type="text"
                value={obsReading}
                onChange={(e) => setObsReading(e.target.value)}
                placeholder="e.g. BP 145/90"
                className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label htmlFor="obs-sum" className="block text-sm font-semibold text-[#1F2937]">
              Details *
            </label>
            <textarea
              id="obs-sum"
              rows={3}
              required
              value={obsSummary}
              onChange={(e) => setObsSummary(e.target.value)}
              placeholder="Describe what happened and any steps taken..."
              className="mt-1 w-full rounded-xl border border-[#D1D5DB] p-3 text-sm"
            />
          </div>
          <div className="flex justify-end gap-3 border-t border-[#E5E7EB] pt-4">
            <button
              type="button"
              onClick={() => setObsModalOpen(false)}
              className="min-h-[44px] rounded-xl border border-[#D1D5DB] px-4 text-sm font-medium text-[#374151]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingObs}
              className="min-h-[44px] rounded-xl bg-[#B45309] px-5 text-sm font-semibold text-white hover:bg-[#92400E] disabled:opacity-60"
            >
              {savingObs ? 'Sending...' : 'Send Report'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Quick Add Task Modal */}
      <Modal
        open={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        title="Add Daily Task"
      >
        <form onSubmit={handleAddQuickTask} className="space-y-4">
          <div>
            <label htmlFor="ct-task-name" className="block text-sm font-semibold text-[#1F2937]">
              Task Name *
            </label>
            <input
              id="ct-task-name"
              type="text"
              required
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="e.g. Check afternoon blood pressure"
              className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="ct-task-time" className="block text-sm font-semibold text-[#1F2937]">
              Time
            </label>
            <input
              id="ct-task-time"
              type="time"
              value={taskDueTime}
              onChange={(e) => setTaskDueTime(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 font-mono text-sm"
            />
          </div>
          <div className="flex justify-end gap-3 border-t border-[#E5E7EB] pt-4">
            <button
              type="button"
              onClick={() => setTaskModalOpen(false)}
              className="min-h-[44px] rounded-xl border border-[#D1D5DB] px-4 text-sm font-medium text-[#374151]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingTask}
              className="min-h-[44px] rounded-xl bg-[#065F46] px-5 text-sm font-semibold text-white hover:bg-[#047857] disabled:opacity-60"
            >
              {savingTask ? 'Adding...' : 'Add Task'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
