import { useMemo } from 'react';
import {
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
  Lock,
  Pill,
} from 'lucide-react';
import { useCare } from '../context/CareContext';
import {
  formatDateDisplay,
  formatTime12h,
  formatTimestampRelative,
  getOffsetDateKey,
  getTodayKey,
} from '../lib/utils';
import { formatMemberRoleLabel } from '../services/careService';
import type { AppSection } from '../types/healthcare';

interface HealthOverviewSectionProps {
  onNavigate?: (section: AppSection) => void;
}

interface WeeklyDaySummary {
  dateKey: string;
  dayShort: string;
  dateShort: string;
  taken: number;
  expected: number;
  pct: number;
  isToday: boolean;
}

export function HealthOverviewSection({ onNavigate }: HealthOverviewSectionProps) {
  const {
    activeCircle,
    activeCircleDataLoading,
    isCircleOwner,
    can,
    medications,
    medicationLogs,
    appointments,
    activityLogs,
  } = useCare();

  const todayKey = getTodayKey();

  const canViewMeds = isCircleOwner || can('viewMedications');
  const canViewAdherence = isCircleOwner || can('viewAdherenceReports');
  const canViewAppts =
    isCircleOwner || can('manageAppointments') || can('viewHealthInfo');

  const activeMeds = useMemo(
    () => (canViewMeds ? medications.filter((m) => m.status === 'active') : []),
    [canViewMeds, medications],
  );

  const todayDoseCounts = useMemo(() => {
    if (!canViewMeds) {
      return { total: 0, taken: 0, awaiting: 0, pct: 0 };
    }
    let total = 0;
    let taken = 0;
    let awaiting = 0;

    for (const med of activeMeds) {
      for (const time of med.scheduledTimes) {
        total += 1;
        const log = medicationLogs.find(
          (l) =>
            l.medicationId === med.id &&
            l.dateKey === todayKey &&
            l.scheduledTime === time,
        );
        if (log?.status === 'taken') {
          taken += 1;
        } else if (!log || log.status === 'pending') {
          awaiting += 1;
        }
      }
    }

    const pct = total > 0 ? Math.round((taken / total) * 100) : 0;
    return { total, taken, awaiting, pct };
  }, [canViewMeds, activeMeds, medicationLogs, todayKey]);

  const weeklyAdherence = useMemo(() => {
    if (!canViewMeds || !canViewAdherence) {
      return { days: [] as WeeklyDaySummary[], totalTaken: 0, totalExpected: 0, overallPct: 0 };
    }

    const expectedPerDay = activeMeds.reduce(
      (sum, med) => sum + med.scheduledTimes.length,
      0,
    );
    const days: WeeklyDaySummary[] = [];
    let totalTaken = 0;
    let totalExpected = 0;

    for (let offset = -6; offset <= 0; offset += 1) {
      const dateKey = getOffsetDateKey(offset);
      const dayLogs = medicationLogs.filter((l) => l.dateKey === dateKey);
      const taken = dayLogs.filter((l) => l.status === 'taken').length;
      const resolvedOther = dayLogs.filter(
        (l) => l.status === 'missed' || l.status === 'skipped',
      ).length;
      const expected = Math.max(expectedPerDay, taken + resolvedOther);
      const pct = expected > 0 ? Math.min(100, Math.round((taken / expected) * 100)) : 0;

      const [y, m, d] = dateKey.split('-').map(Number);
      const dateObj = new Date(y, (m || 1) - 1, d || 1);

      days.push({
        dateKey,
        dayShort: dateObj.toLocaleDateString('en-US', { weekday: 'short' }),
        dateShort: dateObj.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        taken,
        expected,
        pct,
        isToday: dateKey === todayKey,
      });

      totalTaken += taken;
      totalExpected += expected;
    }

    const overallPct =
      totalExpected > 0
        ? Math.min(100, Math.round((totalTaken / totalExpected) * 100))
        : 0;

    return { days, totalTaken, totalExpected, overallPct };
  }, [canViewMeds, canViewAdherence, activeMeds, medicationLogs, todayKey]);

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

  const recentActivities = useMemo(() => activityLogs.slice(0, 5), [activityLogs]);

  if (!activeCircle) return null;

  if (activeCircleDataLoading) {
    return (
      <section className="space-y-4" aria-busy="true">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-2xl border border-[#E5E7EB] bg-white"
            />
          ))}
        </div>
        <div className="h-44 animate-pulse rounded-2xl border border-[#E5E7EB] bg-white" />
      </section>
    );
  }

  return (
    <section aria-labelledby="health-overview-heading" className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2
            id="health-overview-heading"
            className="font-display text-xl font-bold text-[#1F2937] sm:text-2xl"
          >
            Health Overview
          </h2>
          <p className="mt-0.5 text-sm text-[#4B5563]">
            Simple daily summary for {activeCircle.patientName}.
          </p>
        </div>
      </div>

      {/* 1–3. Small Metric Cards with Simple Progress Indicators */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* 1. Total Active Medicines */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-[#4B5563]">
              Total Active Medicines
            </span>
            <Pill className="h-5 w-5 shrink-0 text-[#065F46]" />
          </div>

          {!canViewMeds ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-[#6B7280]">
              <Lock className="h-4 w-4 shrink-0" />
              <span>Access not shared</span>
            </div>
          ) : (
            <>
              <p className="font-mono mt-2 text-3xl font-bold text-[#1F2937] tabular-nums">
                {activeMeds.length}
              </p>
              <p className="mt-1 text-sm text-[#4B5563]">
                {activeMeds.length === 1
                  ? '1 active prescription'
                  : `${activeMeds.length} active prescriptions`}
              </p>
            </>
          )}
        </div>

        {/* 2. Medicines Taken Today */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-[#4B5563]">
              Medicines Taken Today
            </span>
            <CheckCircle2 className="h-5 w-5 shrink-0 text-[#065F46]" />
          </div>

          {!canViewMeds ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-[#6B7280]">
              <Lock className="h-4 w-4 shrink-0" />
              <span>Access not shared</span>
            </div>
          ) : (
            <>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <p className="font-mono text-3xl font-bold text-[#1F2937] tabular-nums">
                  {todayDoseCounts.taken}
                  <span className="text-lg font-medium text-[#6B7280]">
                    /{todayDoseCounts.total}
                  </span>
                </p>
                <span className="font-mono text-sm font-bold text-[#065F46] tabular-nums">
                  {todayDoseCounts.pct}%
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={todayDoseCounts.pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Medicines taken today"
                className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[#E5E7EB]"
              >
                <div
                  className="h-full rounded-full bg-[#065F46] transition-all"
                  style={{ width: `${todayDoseCounts.pct}%` }}
                />
              </div>
            </>
          )}
        </div>

        {/* 3. Medicines Awaiting Confirmation */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-[#4B5563]">
              Awaiting Confirmation
            </span>
            <Clock className="h-5 w-5 shrink-0 text-[#065F46]" />
          </div>

          {!canViewMeds ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-[#6B7280]">
              <Lock className="h-4 w-4 shrink-0" />
              <span>Access not shared</span>
            </div>
          ) : (
            <>
              <p className="font-mono mt-2 text-3xl font-bold text-[#1F2937] tabular-nums">
                {todayDoseCounts.awaiting}
              </p>
              <p className="mt-1 text-sm text-[#4B5563]">
                {todayDoseCounts.total === 0
                  ? 'No doses scheduled today'
                  : todayDoseCounts.awaiting === 0
                    ? 'All doses confirmed today'
                    : todayDoseCounts.awaiting === 1
                      ? '1 dose waiting to be confirmed'
                      : `${todayDoseCounts.awaiting} doses waiting to be confirmed`}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Weekly Medication Adherence Summary (Simple Progress Bars Only) */}
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-display text-lg font-bold text-[#1F2937]">
              Weekly Medication Adherence
            </h3>
            <p className="text-sm text-[#4B5563]">
              Medicines confirmed over the last 7 days.
            </p>
          </div>
          {canViewMeds && canViewAdherence && weeklyAdherence.totalExpected > 0 && (
            <div className="text-left sm:text-right">
              <p className="font-mono text-2xl font-bold text-[#065F46] tabular-nums">
                {weeklyAdherence.overallPct}%
              </p>
              <p className="text-xs font-medium text-[#4B5563]">
                {weeklyAdherence.totalTaken} of {weeklyAdherence.totalExpected} doses taken
              </p>
            </div>
          )}
        </div>

        {!canViewMeds || !canViewAdherence ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4 text-sm text-[#6B7280]">
            <Lock className="h-4 w-4 shrink-0" />
            <span>
              Weekly adherence summary requires permission from {activeCircle.patientName}.
            </span>
          </div>
        ) : activeMeds.length === 0 ? (
          <p className="mt-4 text-sm text-[#6B7280]">
            No active medicines scheduled yet.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <div
              role="progressbar"
              aria-valuenow={weeklyAdherence.overallPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Weekly medication adherence"
              className="h-3 w-full overflow-hidden rounded-full bg-[#E5E7EB]"
            >
              <div
                className="h-full rounded-full bg-[#065F46] transition-all"
                style={{ width: `${weeklyAdherence.overallPct}%` }}
              />
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-7">
              {weeklyAdherence.days.map((day) => (
                <div
                  key={day.dateKey}
                  className={`rounded-xl border p-3 ${
                    day.isToday
                      ? 'border-[#065F46]/40 bg-[#ECFDF5]/60'
                      : 'border-[#E5E7EB] bg-[#F9FAFB]'
                  }`}
                >
                  <div className="flex items-center justify-between sm:block">
                    <p className="text-xs font-bold text-[#1F2937]">
                      {day.isToday ? 'Today' : day.dayShort}
                    </p>
                    <p className="text-xs text-[#6B7280]">{day.dateShort}</p>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
                    <div
                      className="h-full rounded-full bg-[#065F46]"
                      style={{ width: `${day.pct}%` }}
                    />
                  </div>
                  <p className="font-mono mt-1.5 text-xs font-semibold text-[#374151] tabular-nums">
                    {day.taken}/{day.expected}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 4 & 5. Upcoming Doctor Appointments + Recent Healthcare Activities */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 4. Upcoming Doctor Appointments */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-6">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <Calendar className="h-5 w-5 text-[#065F46]" />
                <h3 className="font-display text-lg font-bold text-[#1F2937]">
                  Upcoming Doctor Appointments
                </h3>
              </div>
              {canViewAppts && (
                <span className="font-mono text-base font-bold text-[#065F46] tabular-nums">
                  {upcomingAppointments.length}
                </span>
              )}
            </div>

            {!canViewAppts ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-[#6B7280]">
                <Lock className="h-4 w-4 shrink-0" />
                <span>Appointments not shared with your account.</span>
              </div>
            ) : upcomingAppointments.length === 0 ? (
              <p className="mt-4 text-sm text-[#6B7280]">
                No upcoming doctor appointments scheduled.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-[#E5E7EB]">
                {upcomingAppointments.slice(0, 4).map((appt) => (
                  <li key={appt.id} className="py-3">
                    <p className="text-base font-semibold text-[#1F2937]">
                      {appt.doctorName}
                    </p>
                    <p className="mt-0.5 text-sm text-[#4B5563]">
                      {appt.appointmentDate === todayKey
                        ? 'Today'
                        : formatDateDisplay(appt.appointmentDate)}{' '}
                      · {formatTime12h(appt.appointmentTime)}
                      {appt.clinicName ? ` · ${appt.clinicName}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canViewAppts && onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('appointments')}
              className="mt-4 min-h-[44px] w-full rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] px-4 text-sm font-bold text-[#065F46] hover:bg-[#ECFDF5]"
            >
              View Appointments
            </button>
          )}
        </div>

        {/* 5. Recent Healthcare Activities */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6">
          <div className="flex items-center gap-2.5">
            <Activity className="h-5 w-5 text-[#065F46]" />
            <h3 className="font-display text-lg font-bold text-[#1F2937]">
              Recent Healthcare Activities
            </h3>
          </div>

          {recentActivities.length === 0 ? (
            <p className="mt-4 text-sm text-[#6B7280]">
              No healthcare activity recorded yet.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[#E5E7EB]">
              {recentActivities.map((act) => (
                <li key={act.id} className="py-3">
                  <p className="text-base font-semibold text-[#1F2937]">
                    {act.action}
                  </p>
                  {act.detail && (
                    <p className="mt-0.5 text-sm text-[#4B5563]">{act.detail}</p>
                  )}
                  <p className="mt-1 text-xs text-[#6B7280]">
                    By <span className="font-semibold text-[#065F46]">{act.actorName}</span>{' '}
                    ({formatMemberRoleLabel(act.actorRole)}) ·{' '}
                    {formatTimestampRelative(act.timestamp)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
