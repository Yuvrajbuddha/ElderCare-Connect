import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  Check,
  Lock,
  MessageSquare,
  Phone,
  Pill,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useCare } from '../context/CareContext';
import {
  formatDateDisplay,
  formatTime12h,
  getOffsetDateKey,
  getTodayKey,
  parseReadableError,
} from '../lib/utils';
import { fetchCareSummary } from '../services/aiService';
import {
  logMedicationDose,
  sendCareMessage,
} from '../services/careService';
import type {
  AppSection,
  Appointment,
  CareSummaryResponse,
  Medication,
  MedicationLog,
} from '../types/healthcare';
import { Modal } from './ui/Modal';
import { StatusText } from './ui/StatusText';

interface FamilyDashboardViewProps {
  onNavigate: (section: AppSection) => void;
}

interface AdherencePoint {
  dayLabel: string;
  fullDate: string;
  taken: number;
  skipped: number;
  adherencePct: number;
}

function parseTimeToMinutes(hhmm: string): number | null {
  if (!hhmm || !hhmm.includes(':')) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m;
}

function extractPhoneHref(text?: string): string | null {
  if (!text) return null;
  const match = text.match(/(\+?\d[\d\s().-]{6,}\d)/);
  if (!match) return null;
  const digits = match[1].replace(/[^\d+]/g, '');
  return digits.length >= 7 ? `tel:${digits}` : null;
}

export function FamilyDashboardView({ onNavigate }: FamilyDashboardViewProps) {
  const {
    activeCircle,
    activeCircleDataLoading,
    activeCircleDataError,
    firebaseUser,
    profile,
    members,
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

  const [chartWindow, setChartWindow] = useState<'weekly' | 'monthly'>('weekly');
  const [busyDoseKey, setBusyDoseKey] = useState<string | null>(null);

  // Dialogs
  const [doseModal, setDoseModal] = useState<{
    med: Medication;
    time: string;
    log?: MedicationLog;
  } | null>(null);
  const [apptModal, setApptModal] = useState<Appointment | null>(null);

  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [msgUrgent, setMsgUrgent] = useState(false);
  const [sendingMsg, setSendingMsg] = useState(false);

  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<CareSummaryResponse | null>(null);

  const todayKey = getTodayKey();

  const canViewHealthInfo = isCircleOwner || can('viewHealthInfo');
  const canViewMedications = isCircleOwner || can('viewMedications');
  const canLogMedication =
    canViewMedications && (isCircleOwner || can('addMedications') || can('editMedications'));
  const canManageAppointments = isCircleOwner || can('manageAppointments');
  const canViewAppointments = canManageAppointments || canViewHealthInfo;
  const canViewAdherenceReports = isCircleOwner || can('viewAdherenceReports');

  const activeMeds = useMemo(
    () => (canViewMedications ? medications.filter((m) => m.status === 'active') : []),
    [medications, canViewMedications],
  );

  const todayDoses = useMemo(() => {
    if (!canViewMedications) return [];
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
    return activeMeds
      .flatMap((med) =>
        med.scheduledTimes.map((time) => {
          const log = medicationLogs.find(
            (l) => l.medicationId === med.id && l.dateKey === todayKey && l.scheduledTime === time,
          );
          const schedMins = parseTimeToMinutes(time);
          const isOverdue = !log && schedMins !== null && nowMins - schedMins > 30;
          return { key: `${med.id}_${time}`, med, time, log, isOverdue };
        }),
      )
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [canViewMedications, activeMeds, medicationLogs, todayKey]);

  const todayStats = useMemo(() => {
    const total = todayDoses.length;
    const taken = todayDoses.filter((d) => d.log?.status === 'taken').length;
    const overdue = todayDoses.filter((d) => d.isOverdue).length;
    const skipped = todayDoses.filter((d) => d.log?.status === 'skipped').length;
    const pct = total > 0 ? Math.round((taken / total) * 100) : 0;
    return { total, taken, overdue, skipped, pct };
  }, [todayDoses]);

  const chartSeries: AdherencePoint[] = useMemo(() => {
    if (!canViewMedications || !canViewAdherenceReports) return [];
    const days = chartWindow === 'weekly' ? 7 : 30;
    const expectedPerDay = activeMeds.reduce((sum, m) => sum + m.scheduledTimes.length, 0);
    const list: AdherencePoint[] = [];

    for (let i = days - 1; i >= 0; i -= 1) {
      const dk = getOffsetDateKey(-i);
      const dayLogs = medicationLogs.filter((l) => l.dateKey === dk);
      const taken = dayLogs.filter((l) => l.status === 'taken').length;
      const skipped = dayLogs.filter((l) => l.status === 'skipped').length;
      const expected = Math.max(expectedPerDay, taken + skipped);
      const pct = expected > 0 ? Math.min(100, Math.round((taken / expected) * 100)) : 0;
      const [y, m, d] = dk.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      list.push({
        dayLabel:
          days === 7
            ? dt.toLocaleDateString('en-US', { weekday: 'short' })
            : `${dt.getMonth() + 1}/${dt.getDate()}`,
        fullDate: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        taken,
        skipped,
        adherencePct: pct,
      });
    }
    return list;
  }, [canViewMedications, canViewAdherenceReports, chartWindow, activeMeds, medicationLogs]);

  const upcomingAppointments = useMemo(() => {
    if (!canViewAppointments) return [];
    return appointments
      .filter((a) => a.status === 'scheduled' && a.appointmentDate >= todayKey)
      .sort((a, b) =>
        `${a.appointmentDate} ${a.appointmentTime}`.localeCompare(
          `${b.appointmentDate} ${b.appointmentTime}`,
        ),
      );
  }, [canViewAppointments, appointments, todayKey]);

  const caretakers = useMemo(
    () => members.filter((m) => m.memberRole === 'caretaker'),
    [members],
  );

  if (!activeCircle || !firebaseUser || !profile) return null;

  const emergencyContact = activeCircle.emergencyContact || '';
  const emergencyHref = extractPhoneHref(emergencyContact);
  const attentionCount = todayStats.overdue + todayStats.skipped;

  const handleLogDose = async (
    med: Medication,
    time: string,
    existingLog: MedicationLog | undefined,
    status: 'taken' | 'skipped',
  ) => {
    const key = `${med.id}_${time}`;
    setBusyDoseKey(key);
    try {
      await logMedicationDose({
        circleId: activeCircle.id,
        memberIds: activeCircle.memberIds,
        medication: med,
        existingLog,
        dateKey: todayKey,
        scheduledTime: time,
        status,
        assistanceMode: status === 'taken' ? 'assisted' : undefined,
        uid: firebaseUser.uid,
        userName: profile.displayName,
        actorRole: currentMember?.memberRole ?? 'family',
      });
      pushToast('success', `${med.name} marked as ${status}.`);
      setDoseModal(null);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setBusyDoseKey(null);
    }
  };

  const nextAppointment = upcomingAppointments[0] ?? null;

  const handleGenerateAiSummary = async () => {
    setAiModalOpen(true);
    setAiLoading(true);
    try {
      const result = await fetchCareSummary({
        circleId: activeCircle.id,
        patientName: activeCircle.patientName,
        adherenceStats: {
          taken: todayStats.taken,
          skipped: todayStats.skipped,
          total: todayStats.total,
        },
        medications: activeMeds,
        upcomingAppointments: upcomingAppointments.slice(0, 4),
        recentRecords: canViewHealthInfo ? healthRecords.slice(0, 5) : [],
        recentMessages: messages.slice(0, 5),
      });
      setAiSummary(result);
    } catch (error) {
      pushToast('error', parseReadableError(error));
      setAiModalOpen(false);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgText.trim()) return;
    setSendingMsg(true);
    try {
      await sendCareMessage({
        circleId: activeCircle.id,
        memberIds: activeCircle.memberIds,
        senderUid: firebaseUser.uid,
        senderName: profile.displayName,
        senderRole: currentMember?.memberRole ?? 'family',
        category: msgUrgent ? 'alert' : 'update',
        body: msgText.trim(),
        urgent: msgUrgent,
      });
      pushToast('success', 'Message sent to care team.');
      setMsgText('');
      setMsgUrgent(false);
      setMessageModalOpen(false);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setSendingMsg(false);
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

      {/* 1. Patient Overview Header */}
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold text-[#065F46]">
              Family Care View · {formatDateDisplay(todayKey)}
            </p>
            <h1 className="font-display mt-1 text-2xl font-bold text-[#1F2937] sm:text-3xl">
              {activeCircle.patientName}
            </h1>
            <p className="mt-1 text-sm text-[#4B5563]">
              Age {activeCircle.patientAge}
              {activeCircle.primaryPhysician ? ` · Doctor: ${activeCircle.primaryPhysician}` : ''}
              {emergencyContact ? ` · Emergency: ${emergencyContact}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {emergencyHref && (
              <a
                href={emergencyHref}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-[#B91C1C] hover:bg-red-100"
              >
                <Phone className="h-4 w-4" />
                <span>Emergency Call</span>
              </a>
            )}
            <button
              type="button"
              onClick={() => setMessageModalOpen(true)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#065F46] px-5 text-sm font-semibold text-white hover:bg-[#047857]"
            >
              <MessageSquare className="h-4 w-4" />
              <span>Message Care Team</span>
            </button>
          </div>
        </div>
      </section>

      {/* Attention Alert (Only shown when needed) */}
      {(attentionCount > 0 || unreadNotificationCount > 0) && (
        <section className="flex flex-col justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-6 py-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#B45309]" />
            <div>
              <p className="text-base font-bold text-[#92400E]">
                {attentionCount > 0
                  ? `${attentionCount} medicine dose${attentionCount === 1 ? '' : 's'} need attention today`
                  : `${unreadNotificationCount} new health update${unreadNotificationCount === 1 ? '' : 's'}`}
              </p>
              <p className="text-sm text-[#92400E]/90">
                Check Health Updates to see missed doses, alerts, or notes from the caretaker.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('records')}
            className="min-h-[44px] shrink-0 rounded-xl bg-[#92400E] px-4 text-sm font-semibold text-white hover:bg-[#78350F]"
          >
            View Health Updates
          </button>
        </section>
      )}

      {/* 2. Two Simple Summary Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
          <div className="flex items-center justify-between text-sm font-medium text-[#6B7280]">
            <span>Today&apos;s Medicines</span>
            <Pill className="h-5 w-5 text-[#065F46]" />
          </div>
          {canViewMedications ? (
            <>
              <p className="font-mono mt-2 text-3xl font-bold text-[#1F2937] tabular-nums">
                {todayStats.taken}/{todayStats.total}
              </p>
              <p className="mt-1 text-sm text-[#4B5563]">{todayStats.pct}% taken today</p>
            </>
          ) : (
            <p className="mt-3 text-sm text-[#6B7280]">Access not shared</p>
          )}
        </div>

        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
          <div className="flex items-center justify-between text-sm font-medium text-[#6B7280]">
            <span>Care Team</span>
            <Users className="h-5 w-5 text-[#065F46]" />
          </div>
          <p className="font-mono mt-2 text-3xl font-bold text-[#1F2937] tabular-nums">
            {members.length}
          </p>
          <p className="mt-1 truncate text-sm text-[#4B5563]">
            {caretakers.length > 0
              ? `Caretaker: ${caretakers.map((c) => c.displayName.split(' ')[0]).join(', ')}`
              : 'Family members connected'}
          </p>
        </div>
      </section>

      {/* 3. Medication Adherence Chart */}
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6">
        <div className="flex flex-col justify-between gap-3 border-b border-[#E5E7EB] pb-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <BarChart3 className="h-5 w-5 text-[#065F46]" />
            <div>
              <h2 className="font-display text-lg font-bold text-[#1F2937]">
                Medicine Adherence Report
              </h2>
              <p className="text-sm text-[#6B7280]">
                Daily doses taken vs. skipped over the last {chartWindow === 'weekly' ? '7 days' : '30 days'}.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl bg-[#F3F4F6] p-1">
              <button
                type="button"
                onClick={() => setChartWindow('weekly')}
                className={`min-h-[38px] rounded-lg px-3.5 text-xs font-semibold ${
                  chartWindow === 'weekly' ? 'bg-white text-[#065F46] shadow-sm' : 'text-[#4B5563]'
                }`}
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setChartWindow('monthly')}
                className={`min-h-[38px] rounded-lg px-3.5 text-xs font-semibold ${
                  chartWindow === 'monthly' ? 'bg-white text-[#065F46] shadow-sm' : 'text-[#4B5563]'
                }`}
              >
                30 Days
              </button>
            </div>

            {canViewAdherenceReports && (
              <button
                type="button"
                onClick={handleGenerateAiSummary}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#065F46] bg-[#ECFDF5] px-4 text-xs font-bold text-[#065F46] hover:bg-[#D1FAE5]"
              >
                <Sparkles className="h-4 w-4" />
                <span>AI Summary</span>
              </button>
            )}
          </div>
        </div>

        {!canViewMedications || !canViewAdherenceReports ? (
          <div className="py-10 text-center">
            <Lock className="mx-auto h-6 w-6 text-[#6B7280]" />
            <p className="mt-2 text-sm text-[#6B7280]">
              Adherence charts require permission from {activeCircle.patientName}.
            </p>
          </div>
        ) : activeMeds.length === 0 ? (
          <div className="py-10 text-center text-sm text-[#6B7280]">
            No active medicines scheduled yet.
          </div>
        ) : (
          <div className="mt-5 h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartSeries} margin={{ top: 8, right: 10, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis
                  dataKey="dayLabel"
                  tick={{ fill: '#6B7280', fontSize: 12 }}
                  axisLine={{ stroke: '#E5E7EB' }}
                  tickLine={false}
                  interval={chartWindow === 'monthly' ? 4 : 0}
                />
                <YAxis
                  yAxisId="doses"
                  allowDecimals={false}
                  tick={{ fill: '#6B7280', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="pct"
                  orientation="right"
                  domain={[0, 100]}
                  unit="%"
                  tick={{ fill: '#065F46', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip />
                <Bar yAxisId="doses" dataKey="taken" stackId="a" fill="#065F46" name="Taken" maxBarSize={28} />
                <Bar yAxisId="doses" dataKey="skipped" stackId="a" fill="#B91C1C" name="Skipped" maxBarSize={28} />
                <Line
                  yAxisId="pct"
                  type="monotone"
                  dataKey="adherencePct"
                  stroke="#0D9488"
                  strokeWidth={2.5}
                  dot={chartWindow === 'weekly'}
                  name="Adherence %"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* 4. Today's Schedule & Upcoming Visits (2 Clean Columns) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Today's Medicines */}
        <section className="rounded-2xl border border-[#E5E7EB] bg-white">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] px-6 py-4">
            <h2 className="font-display text-lg font-bold text-[#1F2937]">Today&apos;s Medicines</h2>
            {canViewMedications && (
              <button
                type="button"
                onClick={() => onNavigate('medications')}
                className="text-sm font-semibold text-[#065F46] hover:underline"
              >
                Open Medicines
              </button>
            )}
          </div>

          {!canViewMedications ? (
            <div className="px-6 py-10 text-center text-sm text-[#6B7280]">
              Medicine schedule not shared with your account.
            </div>
          ) : todayDoses.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-[#6B7280]">
              No medicines scheduled today.
            </div>
          ) : (
            <div className="divide-y divide-[#E5E7EB]">
              {todayDoses.map((slot) => {
                const status = slot.log?.status ?? 'pending';
                return (
                  <div
                    key={slot.key}
                    className="flex items-center justify-between gap-3 px-6 py-4"
                  >
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-[#1F2937]">
                        {slot.med.name}{' '}
                        <span className="font-normal text-[#6B7280]">({slot.med.dosage})</span>
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[#6B7280]">
                        <span>{formatTime12h(slot.time)}</span>
                        <StatusText
                          variant={
                            status === 'taken'
                              ? 'success'
                              : status === 'skipped' || slot.isOverdue
                                ? 'danger'
                                : 'neutral'
                          }
                          label={
                            status === 'taken'
                              ? 'Taken'
                              : status === 'skipped'
                                ? 'Skipped'
                                : slot.isOverdue
                                  ? 'Overdue'
                                  : 'Pending'
                          }
                        />
                      </div>
                    </div>

                    {canLogMedication && status !== 'taken' ? (
                      <button
                        type="button"
                        disabled={busyDoseKey === slot.key}
                        onClick={() => handleLogDose(slot.med, slot.time, slot.log, 'taken')}
                        className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl bg-[#065F46] px-4 text-sm font-semibold text-white hover:bg-[#047857] disabled:opacity-60"
                      >
                        <Check className="h-4 w-4" />
                        <span>Mark as Taken</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDoseModal({ med: slot.med, time: slot.time, log: slot.log })}
                        className="min-h-[44px] shrink-0 rounded-xl border border-[#D1D5DB] bg-white px-4 text-sm font-semibold text-[#374151] hover:bg-[#F3F4F6]"
                      >
                        View Details
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Next Appointment */}
        <section className="flex flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-6">
          <div>
            <div className="flex items-center gap-2.5">
              <Calendar className="h-5 w-5 text-[#065F46]" />
              <h2 className="font-display text-lg font-bold text-[#1F2937]">Next Appointment</h2>
            </div>

            {!canViewAppointments ? (
              <p className="mt-4 text-sm text-[#6B7280]">
                Appointments are not shared with your account.
              </p>
            ) : !nextAppointment ? (
              <p className="mt-4 text-sm text-[#6B7280]">No upcoming appointments.</p>
            ) : (
              <div className="mt-5 space-y-1">
                <p className="text-lg font-bold text-[#1F2937]">{nextAppointment.doctorName}</p>
                <p className="text-sm text-[#4B5563]">
                  {formatDateDisplay(nextAppointment.appointmentDate)} ·{' '}
                  {formatTime12h(nextAppointment.appointmentTime)}
                </p>
              </div>
            )}
          </div>

          {canViewAppointments && nextAppointment && (
            <button
              type="button"
              onClick={() => setApptModal(nextAppointment)}
              className="mt-5 min-h-[46px] w-full rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] px-4 text-sm font-bold text-[#065F46] hover:bg-[#ECFDF5]"
            >
              View Details
            </button>
          )}
        </section>
      </div>

      {/* Dose Details Modal */}
      <Modal
        open={Boolean(doseModal)}
        onClose={() => setDoseModal(null)}
        title={doseModal ? doseModal.med.name : 'Medicine Details'}
      >
        {doseModal && (
          <div className="space-y-4 text-sm text-[#374151]">
            <p>
              <span className="font-semibold">Dosage:</span> {doseModal.med.dosage}
            </p>
            <p>
              <span className="font-semibold">Scheduled Time:</span> {formatTime12h(doseModal.time)}
            </p>
            {doseModal.med.instructions && (
              <p>
                <span className="font-semibold">Instructions:</span> {doseModal.med.instructions}
              </p>
            )}
            {doseModal.log && (
              <p>
                <span className="font-semibold">Logged:</span> {doseModal.log.status} by{' '}
                {doseModal.log.loggedByName}
              </p>
            )}
            {canLogMedication && (
              <div className="flex justify-end gap-3 border-t border-[#E5E7EB] pt-4">
                <button
                  type="button"
                  disabled={busyDoseKey === `${doseModal.med.id}_${doseModal.time}`}
                  onClick={() => handleLogDose(doseModal.med, doseModal.time, doseModal.log, 'skipped')}
                  className="min-h-[44px] rounded-xl border border-[#D1D5DB] px-4 text-sm font-semibold text-[#374151]"
                >
                  Mark Skipped
                </button>
                <button
                  type="button"
                  disabled={busyDoseKey === `${doseModal.med.id}_${doseModal.time}`}
                  onClick={() => handleLogDose(doseModal.med, doseModal.time, doseModal.log, 'taken')}
                  className="min-h-[44px] rounded-xl bg-[#065F46] px-5 text-sm font-semibold text-white hover:bg-[#047857]"
                >
                  Mark as Taken
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Appointment Details Modal */}
      <Modal
        open={Boolean(apptModal)}
        onClose={() => setApptModal(null)}
        title={apptModal?.title || 'Appointment Details'}
      >
        {apptModal && (
          <div className="space-y-3 text-sm text-[#374151]">
            <p>
              <span className="font-semibold text-[#1F2937]">Doctor Name:</span>{' '}
              {apptModal.doctorName}
            </p>
            <p>
              <span className="font-semibold text-[#1F2937]">Hospital Name:</span>{' '}
              {apptModal.clinicName || 'Not specified'}
            </p>
            <p>
              <span className="font-semibold text-[#1F2937]">Date:</span>{' '}
              {formatDateDisplay(apptModal.appointmentDate)}
            </p>
            <p>
              <span className="font-semibold text-[#1F2937]">Time:</span>{' '}
              {formatTime12h(apptModal.appointmentTime)}
            </p>
            <p>
              <span className="font-semibold text-[#1F2937]">Reason for Visit:</span>{' '}
              {apptModal.title}
            </p>
            <div className="flex justify-end gap-3 border-t border-[#E5E7EB] pt-4">
              <button
                type="button"
                onClick={() => setApptModal(null)}
                className="min-h-[44px] rounded-xl border border-[#D1D5DB] px-4 text-sm font-semibold text-[#374151]"
              >
                Close
              </button>
              {canManageAppointments && (
                <button
                  type="button"
                  onClick={() => {
                    setApptModal(null);
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

      {/* Message Care Team Modal */}
      <Modal
        open={messageModalOpen}
        onClose={() => setMessageModalOpen(false)}
        title="Message Care Team"
        subtitle={`Send a note to ${activeCircle.patientName} and connected caretakers.`}
      >
        <form onSubmit={handleSendMessage} className="space-y-4">
          <textarea
            rows={4}
            required
            value={msgText}
            onChange={(e) => setMsgText(e.target.value)}
            placeholder="Write your note or question here..."
            className="w-full rounded-xl border border-[#D1D5DB] p-3.5 text-sm focus:border-[#065F46] focus:outline-none"
          />
          <label className="flex items-center gap-2.5 text-sm text-[#1F2937]">
            <input
              type="checkbox"
              checked={msgUrgent}
              onChange={(e) => setMsgUrgent(e.target.checked)}
              className="h-4 w-4 rounded border-[#D1D5DB] text-[#B91C1C]"
            />
            <span>Mark as urgent alert</span>
          </label>
          <div className="flex justify-end gap-3 border-t border-[#E5E7EB] pt-4">
            <button
              type="button"
              onClick={() => setMessageModalOpen(false)}
              className="min-h-[44px] rounded-xl border border-[#D1D5DB] px-4 text-sm font-medium text-[#374151]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sendingMsg || !msgText.trim()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#065F46] px-5 text-sm font-semibold text-white hover:bg-[#047857] disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              <span>{sendingMsg ? 'Sending...' : 'Send Message'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* AI Care Summary Modal */}
      <Modal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        title="AI Care Summary"
        subtitle={`Prepared for ${activeCircle.patientName}`}
      >
        {aiLoading ? (
          <div className="py-10 text-center text-sm text-[#6B7280]">
            Preparing a plain-language summary...
          </div>
        ) : aiSummary ? (
          <div className="space-y-4 text-sm text-[#374151]">
            <p className="text-base font-semibold text-[#1F2937]">{aiSummary.headline}</p>
            <div>
              <p className="font-semibold text-[#065F46]">What is going well</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {aiSummary.highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-[#B45309]">Things to watch</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {aiSummary.attentionItems.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-[#1F2937]">Suggested next steps</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {aiSummary.nextActions.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
            <p className="border-t border-[#E5E7EB] pt-3 text-xs text-[#6B7280]">
              {aiSummary.disclaimer}
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
