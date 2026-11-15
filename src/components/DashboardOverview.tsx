import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardList,
  MessageSquare,
  Pill,
  Sparkles,
  X,
} from 'lucide-react';
import { useCare } from '../context/CareContext';
import {
  formatDateDisplay,
  formatTime12h,
  formatTimestampRelative,
  getTodayKey,
  parseReadableError,
} from '../lib/utils';
import { fetchCareSummary } from '../services/aiService';
import {
  logMedicationDose,
  seedStarterCareData,
  toggleRoutineCompletion,
} from '../services/careService';
import type { AppSection, CareSummaryResponse } from '../types/healthcare';
import { StatusText } from './ui/StatusText';

interface DashboardOverviewProps {
  onNavigate: (section: AppSection) => void;
}

export function DashboardOverview({ onNavigate }: DashboardOverviewProps) {
  const {
    activeCircle,
    activeCircleDataLoading,
    firebaseUser,
    profile,
    currentMember,
    isCircleOwner,
    can,
    medications,
    medicationLogs,
    appointments,
    healthRecords,
    routines,
    routineLogs,
    messages,
    unreadNotificationCount,
    pushToast,
  } = useCare();

  const [seeding, setSeeding] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<CareSummaryResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [busyDoseKey, setBusyDoseKey] = useState<string | null>(null);
  const [busyRoutineId, setBusyRoutineId] = useState<string | null>(null);

  const todayKey = getTodayKey();

  const todayDoses = useMemo(() => {
    const activeMeds = medications.filter((m) => m.status === 'active');
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
        };
      }),
    );
    return slots.sort((a, b) => a.time.localeCompare(b.time));
  }, [medications, medicationLogs, todayKey]);

  const doseStats = useMemo(() => {
    const total = todayDoses.length;
    const taken = todayDoses.filter((d) => d.log?.status === 'taken').length;
    const skipped = todayDoses.filter((d) => d.log?.status === 'skipped').length;
    return { total, taken, skipped };
  }, [todayDoses]);

  const activeRoutines = useMemo(() => routines.filter((r) => r.active), [routines]);

  const completedRoutinesToday = useMemo(
    () =>
      activeRoutines.filter((r) =>
        routineLogs.some((l) => l.routineId === r.id && l.dateKey === todayKey && l.completed),
      ).length,
    [activeRoutines, routineLogs, todayKey],
  );

  const upcomingAppointments = useMemo(
    () =>
      appointments
        .filter((a) => a.status === 'scheduled' && a.appointmentDate >= todayKey)
        .slice(0, 4),
    [appointments, todayKey],
  );

  const isCircleEmpty =
    medications.length === 0 &&
    appointments.length === 0 &&
    healthRecords.length === 0 &&
    routines.length === 0;

  if (!activeCircle || !firebaseUser || !profile) return null;

  const handleSeedStarter = async () => {
    setSeeding(true);
    try {
      await seedStarterCareData({
        circle: activeCircle,
        uid: firebaseUser.uid,
        userName: profile.displayName,
        userRole: currentMember?.memberRole ?? 'family',
      });
      pushToast('success', 'Sample clinical care schedule added to your Care Circle.');
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setSeeding(false);
    }
  };

  const handleLogDose = async (
    slot: (typeof todayDoses)[number],
    status: 'taken' | 'skipped',
  ) => {
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
      pushToast(
        status === 'taken' ? 'success' : 'info',
        `${slot.medication.name} (${formatTime12h(slot.time)}) marked as ${status}.`,
      );
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setBusyDoseKey(null);
    }
  };

  const handleToggleRoutine = async (routine: (typeof activeRoutines)[number]) => {
    const existingLog = routineLogs.find(
      (l) => l.routineId === routine.id && l.dateKey === todayKey,
    );
    const nextCompleted = !(existingLog?.completed ?? false);
    setBusyRoutineId(routine.id);
    try {
      await toggleRoutineCompletion({
        circleId: activeCircle.id,
        memberIds: activeCircle.memberIds,
        routine,
        existingLog,
        dateKey: todayKey,
        completed: nextCompleted,
        uid: firebaseUser.uid,
        userName: profile.displayName,
      });
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setBusyRoutineId(null);
    }
  };

  const handleGenerateBrief = async () => {
    if (!can('viewAdherenceReports')) {
      pushToast('error', 'Your current Care Circle permissions do not include adherence reports.');
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await fetchCareSummary({
        circleId: activeCircle.id,
        patientName: activeCircle.patientName,
        adherenceStats: doseStats,
        medications,
        upcomingAppointments,
        recentRecords: healthRecords.slice(0, 6),
        recentMessages: messages.slice(0, 6),
      });
      setAiSummary(result);
    } catch (error) {
      const msg = parseReadableError(error);
      setAiError(msg);
      pushToast('error', msg);
    } finally {
      setAiLoading(false);
    }
  };

  if (activeCircleDataLoading) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-xl border border-[#E5E7EB] bg-white" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-[#E5E7EB] bg-white" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl border border-[#E5E7EB] bg-white" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Patient Clinical Header Strip */}
      <section className="flex flex-col justify-between gap-4 rounded-xl border border-[#E5E7EB] bg-white p-6 md:flex-row md:items-center">
        <div>
          <p className="text-xs font-medium text-[#0D9488]">
            {activeCircle.name} · {isCircleOwner ? 'Profile Owner' : 'Authorized Circle Member'}
          </p>
          <h1 className="font-display mt-1 text-2xl font-bold text-[#1F2937]">
            {activeCircle.patientName}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#6B7280]">
            <span className="tabular-nums">Age {activeCircle.patientAge}</span>
            {(isCircleOwner || can('viewHealthInfo')) ? (
              <>
                {activeCircle.bloodType && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Blood Type {activeCircle.bloodType}</span>
                  </>
                )}
                {activeCircle.primaryPhysician && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Primary: {activeCircle.primaryPhysician}</span>
                  </>
                )}
                {activeCircle.allergies && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-[#B45309]">Allergies: {activeCircle.allergies}</span>
                  </>
                )}
              </>
            ) : (
              <>
                <span aria-hidden="true">·</span>
                <span>Clinical details restricted by owner</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isCircleEmpty && isCircleOwner && (
            <button
              type="button"
              onClick={handleSeedStarter}
              disabled={seeding}
              className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-[#065F46] bg-[#ECFDF5] px-4 py-2 text-xs font-semibold text-[#065F46] transition-colors hover:bg-[#D1FAE5] disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              {seeding ? 'Populating Schedule...' : 'Populate Sample Care Schedule'}
            </button>
          )}
          {can('viewAdherenceReports') && (
            <button
              type="button"
              onClick={handleGenerateBrief}
              disabled={aiLoading}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#065F46] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#047857] disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <Sparkles className="h-4 w-4" />
              <span>{aiLoading ? 'Generating Brief...' : 'AI Shift & Family Brief'}</span>
            </button>
          )}
        </div>
      </section>

      {/* 4-Column Metric Strip */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => onNavigate('medications')}
          className="rounded-xl border border-[#E5E7EB] bg-white p-5 text-left transition-colors hover:border-[#065F46]/40"
        >
          <div className="flex items-center justify-between text-xs text-[#6B7280]">
            <span>Today&apos;s Medication Doses</span>
            <Pill className="h-4 w-4 text-[#065F46]" />
          </div>
          <div className="font-display mt-2 text-2xl font-bold text-[#1F2937] tabular-nums">
            {doseStats.taken} / {doseStats.total}
          </div>
          <p className="mt-1 text-xs text-[#6B7280] tabular-nums">
            {doseStats.skipped > 0 ? `${doseStats.skipped} skipped today` : 'On daily schedule'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('routines')}
          className="rounded-xl border border-[#E5E7EB] bg-white p-5 text-left transition-colors hover:border-[#065F46]/40"
        >
          <div className="flex items-center justify-between text-xs text-[#6B7280]">
            <span>Daily Care Routines</span>
            <ClipboardList className="h-4 w-4 text-[#065F46]" />
          </div>
          <div className="font-display mt-2 text-2xl font-bold text-[#1F2937] tabular-nums">
            {completedRoutinesToday} / {activeRoutines.length}
          </div>
          <p className="mt-1 text-xs text-[#6B7280]">Completed today</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('appointments')}
          className="rounded-xl border border-[#E5E7EB] bg-white p-5 text-left transition-colors hover:border-[#065F46]/40"
        >
          <div className="flex items-center justify-between text-xs text-[#6B7280]">
            <span>Upcoming Visits</span>
            <Calendar className="h-4 w-4 text-[#065F46]" />
          </div>
          <div className="font-display mt-2 text-2xl font-bold text-[#1F2937] tabular-nums">
            {upcomingAppointments.length}
          </div>
          <p className="mt-1 truncate text-xs text-[#6B7280]">
            {upcomingAppointments[0]
              ? `Next: ${formatDateDisplay(upcomingAppointments[0].appointmentDate)}`
              : 'No visits scheduled'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('messages')}
          className="rounded-xl border border-[#E5E7EB] bg-white p-5 text-left transition-colors hover:border-[#065F46]/40"
        >
          <div className="flex items-center justify-between text-xs text-[#6B7280]">
            <span>Unread Care Alerts</span>
            <MessageSquare className="h-4 w-4 text-[#0D9488]" />
          </div>
          <div className="font-display mt-2 text-2xl font-bold text-[#1F2937] tabular-nums">
            {unreadNotificationCount}
          </div>
          <p className="mt-1 text-xs text-[#6B7280] tabular-nums">
            {messages.length} total care notes
          </p>
        </button>
      </section>

      {/* AI Care Summary Output Panel */}
      {(aiSummary || aiError) && (
        <section className="rounded-xl border border-[#0D9488]/30 bg-white p-6">
          <div className="flex items-start justify-between gap-4 border-b border-[#E5E7EB] pb-4">
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-5 w-5 text-[#0D9488]" />
              <div>
                <h2 className="font-display text-base font-semibold text-[#1F2937]">
                  AI Shift &amp; Family Summary Brief
                </h2>
                <p className="text-xs text-[#6B7280]">Synthesized from current Care Circle records</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setAiSummary(null);
                setAiError(null);
              }}
              aria-label="Close AI summary"
              className="rounded-lg p-1.5 text-[#6B7280] hover:bg-[#F3F4F6]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {aiError ? (
            <p className="mt-4 text-sm text-[#B91C1C]">{aiError}</p>
          ) : aiSummary ? (
            <div className="mt-4 space-y-5">
              <p className="text-sm font-medium leading-relaxed text-[#1F2937]">{aiSummary.headline}</p>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[#065F46]">Highlights</h3>
                  <ul className="mt-2 space-y-1.5 text-sm text-[#374151]">
                    {aiSummary.highlights.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#15803D]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[#B45309]">
                    Needs Attention
                  </h3>
                  <ul className="mt-2 space-y-1.5 text-sm text-[#374151]">
                    {aiSummary.attentionItems.length === 0 ? (
                      <li className="text-[#6B7280]">No urgent attention items flagged.</li>
                    ) : (
                      aiSummary.attentionItems.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]" />
                          <span>{item}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[#0D9488]">Next Actions</h3>
                  <ul className="mt-2 space-y-1.5 text-sm text-[#374151]">
                    {aiSummary.nextActions.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[#0D9488]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="border-t border-[#E5E7EB] pt-3 text-xs text-[#6B7280]">{aiSummary.disclaimer}</p>
            </div>
          ) : null}
        </section>
      )}

      {/* Main Split: Today's Medication Doses & Daily Routines */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Today's Medications Checklist */}
        <div className="rounded-xl border border-[#E5E7EB] bg-white lg:col-span-7">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] px-6 py-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[#1F2937]">
                Today&apos;s Medication Schedule
              </h2>
              <p className="text-xs text-[#6B7280] tabular-nums">{formatDateDisplay(todayKey)}</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('medications')}
              className="text-xs font-semibold text-[#065F46] hover:underline whitespace-nowrap"
            >
              Manage all
            </button>
          </div>

          {!can('viewMedications') ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm font-medium text-[#1F2937]">Medication view restricted</p>
              <p className="mt-1 text-xs text-[#6B7280]">
                The profile owner has not granted permission to view medication schedules for your role.
              </p>
            </div>
          ) : todayDoses.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm font-medium text-[#1F2937]">No active medications scheduled for today</p>
              <p className="mt-1 text-xs text-[#6B7280]">
                Add prescriptions in the Medications tab to track daily adherence.
              </p>
              {can('addMedications') && (
                <button
                  type="button"
                  onClick={() => onNavigate('medications')}
                  className="mt-4 inline-flex min-h-[38px] items-center rounded-lg bg-[#065F46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#047857]"
                >
                  Add Medication
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[#E5E7EB]">
              {todayDoses.map((slot) => {
                const status = slot.log?.status ?? 'pending';
                const isBusy = busyDoseKey === slot.key;
                const canLogDose = can('addMedications') || can('editMedications');
                return (
                  <div
                    key={slot.key}
                    className="flex flex-col justify-between gap-3 px-6 py-3.5 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="font-mono text-xs font-semibold text-[#065F46] tabular-nums">
                          {formatTime12h(slot.time)}
                        </span>
                        <span className="text-sm font-semibold text-[#1F2937]">{slot.medication.name}</span>
                        <span className="text-xs text-[#6B7280] tabular-nums">{slot.medication.dosage}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-[#6B7280]">
                        {slot.medication.instructions && <span>{slot.medication.instructions}</span>}
                        {slot.log && (
                          <>
                            {slot.medication.instructions && <span aria-hidden="true">·</span>}
                            <span>
                              Logged {status} by {slot.log.loggedByName}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {status === 'taken' ? (
                        <StatusText variant="success" label="Taken" />
                      ) : status === 'skipped' ? (
                        <StatusText variant="warning" label="Skipped" />
                      ) : null}

                      {canLogDose && (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleLogDose(slot, 'taken')}
                            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                              status === 'taken'
                                ? 'bg-[#ECFDF5] text-[#065F46]'
                                : 'bg-[#065F46] text-white hover:bg-[#047857]'
                            } disabled:opacity-60`}
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>{status === 'taken' ? 'Logged' : 'Take'}</span>
                          </button>

                          {status !== 'skipped' && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleLogDose(slot, 'skipped')}
                              className="inline-flex min-h-[36px] items-center rounded-lg border border-[#D1D5DB] bg-white px-2.5 py-1.5 text-xs font-medium text-[#4B5563] hover:bg-[#F3F4F6] disabled:opacity-60"
                            >
                              Skip
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Today's Care Routines */}
        <div className="rounded-xl border border-[#E5E7EB] bg-white lg:col-span-5">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] px-6 py-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[#1F2937]">Daily Care Routines</h2>
              <p className="text-xs text-[#6B7280]">Hydration, mobility &amp; wellness</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('routines')}
              className="text-xs font-semibold text-[#065F46] hover:underline whitespace-nowrap"
            >
              View routines
            </button>
          </div>

          {activeRoutines.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm font-medium text-[#1F2937]">No daily routines configured</p>
              <p className="mt-1 text-xs text-[#6B7280]">Create recurring hydration, walking, or therapy reminders.</p>
              <button
                type="button"
                onClick={() => onNavigate('routines')}
                className="mt-4 inline-flex min-h-[38px] items-center rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-xs font-semibold text-[#1F2937] hover:bg-[#F3F4F6]"
              >
                Add Routine
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#E5E7EB]">
              {activeRoutines.map((routine) => {
                const log = routineLogs.find(
                  (l) => l.routineId === routine.id && l.dateKey === todayKey,
                );
                const done = log?.completed ?? false;
                return (
                  <div key={routine.id} className="flex items-center justify-between gap-3 px-6 py-3.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-[#6B7280] tabular-nums">
                          {formatTime12h(routine.targetTime)}
                        </span>
                        <span
                          className={`truncate text-sm font-medium ${
                            done ? 'text-[#6B7280] line-through' : 'text-[#1F2937]'
                          }`}
                        >
                          {routine.title}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs capitalize text-[#6B7280]">
                        {routine.category}
                        {done && log ? ` · Completed by ${log.completedByName}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busyRoutineId === routine.id}
                      onClick={() => handleToggleRoutine(routine)}
                      className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        done
                          ? 'border-[#065F46]/30 bg-[#ECFDF5] text-[#065F46]'
                          : 'border-[#D1D5DB] bg-white text-[#374151] hover:bg-[#F3F4F6]'
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>{done ? 'Done' : 'Complete'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Bottom Split: Upcoming Appointments & Recent Care Notes */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-[#E5E7EB] bg-white lg:col-span-6">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] px-6 py-4">
            <h2 className="font-display text-base font-semibold text-[#1F2937]">Upcoming Appointments</h2>
            <button
              type="button"
              onClick={() => onNavigate('appointments')}
              className="text-xs font-semibold text-[#065F46] hover:underline"
            >
              All visits
            </button>
          </div>
          {upcomingAppointments.length === 0 ? (
            <div className="px-6 py-8 text-center text-xs text-[#6B7280]">
              No upcoming appointments scheduled.
            </div>
          ) : (
            <div className="divide-y divide-[#E5E7EB]">
              {upcomingAppointments.map((appt) => (
                <div key={appt.id} className="px-6 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[#1F2937]">{appt.title}</p>
                    <span className="font-mono text-xs font-medium text-[#065F46] tabular-nums">
                      {formatDateDisplay(appt.appointmentDate)} · {formatTime12h(appt.appointmentTime)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#6B7280]">
                    {appt.doctorName}
                    {appt.specialty ? ` (${appt.specialty})` : ''}
                    {appt.clinicName ? ` · ${appt.clinicName}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[#E5E7EB] bg-white lg:col-span-6">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] px-6 py-4">
            <h2 className="font-display text-base font-semibold text-[#1F2937]">Recent Care Team Notes</h2>
            <button
              type="button"
              onClick={() => onNavigate('messages')}
              className="text-xs font-semibold text-[#065F46] hover:underline"
            >
              Open messages
            </button>
          </div>
          {messages.length === 0 ? (
            <div className="px-6 py-8 text-center text-xs text-[#6B7280]">
              No care team messages yet. Share a shift update or question with your circle.
            </div>
          ) : (
            <div className="divide-y divide-[#E5E7EB]">
              {messages.slice(0, 4).map((msg) => (
                <div key={msg.id} className="px-6 py-3.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[#1F2937]">
                      {msg.senderName}{' '}
                      <span className="font-normal capitalize text-[#6B7280]">({msg.senderRole})</span>
                    </span>
                    <span className="text-[#6B7280]">{formatTimestampRelative(msg.createdAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-[#4B5563]">{msg.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
