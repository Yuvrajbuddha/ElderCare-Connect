import React, { useMemo, useState } from 'react';
import { Calendar, Edit3, Lock, Plus, XCircle } from 'lucide-react';
import { useCare } from '../context/CareContext';
import {
  formatDateDisplay,
  formatTime12h,
  getOffsetDateKey,
  getTodayKey,
  parseReadableError,
} from '../lib/utils';
import { createAppointment, updateAppointment } from '../services/careService';
import type { Appointment } from '../types/healthcare';
import { EmptyState } from './ui/EmptyState';
import { Modal } from './ui/Modal';
import { StatusText } from './ui/StatusText';

type AppointmentTab = 'upcoming' | 'previous';

export function AppointmentsView() {
  const {
    activeCircle,
    activeCircleDataLoading,
    firebaseUser,
    profile,
    currentMember,
    isCircleOwner,
    can,
    appointments,
    pushToast,
  } = useCare();

  const [activeTab, setActiveTab] = useState<AppointmentTab>('upcoming');

  // Add / Edit modal state
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // View Details modal state
  const [detailAppt, setDetailAppt] = useState<Appointment | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Simple 5-field form state
  const [doctorName, setDoctorName] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [appointmentDate, setAppointmentDate] = useState(getOffsetDateKey(2));
  const [appointmentTime, setAppointmentTime] = useState('10:30');
  const [title, setTitle] = useState('');

  const todayKey = getTodayKey();

  const upcomingAppointments = useMemo(() => {
    return appointments
      .filter((a) => a.status === 'scheduled' && a.appointmentDate >= todayKey)
      .sort((a, b) =>
        `${a.appointmentDate} ${a.appointmentTime}`.localeCompare(
          `${b.appointmentDate} ${b.appointmentTime}`,
        ),
      );
  }, [appointments, todayKey]);

  const previousAppointments = useMemo(() => {
    return appointments
      .filter((a) => a.status !== 'scheduled' || a.appointmentDate < todayKey)
      .sort((a, b) =>
        `${b.appointmentDate} ${b.appointmentTime}`.localeCompare(
          `${a.appointmentDate} ${a.appointmentTime}`,
        ),
      );
  }, [appointments, todayKey]);

  if (!activeCircle || !firebaseUser || !profile) return null;

  const isElderly = profile.accountType === 'elderly';
  const canManageAppts = isCircleOwner || can('manageAppointments');
  const canViewAppts = canManageAppts || can('viewHealthInfo');
  const actorRole =
    currentMember?.memberRole ?? (profile.accountType === 'elderly' ? 'patient' : profile.accountType);

  if (!canViewAppts) {
    return (
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-10 text-center">
        <Lock className="mx-auto h-8 w-8 text-[#6B7280]" />
        <h1 className="font-display mt-3 text-xl font-bold text-[#1F2937]">
          Appointments Not Shared
        </h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-[#6B7280]">
          {activeCircle.patientName} has not granted permission to view appointments yet.
        </p>
      </div>
    );
  }

  const displayedAppointments =
    activeTab === 'upcoming' ? upcomingAppointments : previousAppointments;

  const canModifyAppt = (appt: Appointment) =>
    canManageAppts && (appt.status === 'scheduled' || isCircleOwner);

  const openCreateModal = () => {
    setEditingAppt(null);
    setDoctorName('');
    setClinicName('');
    setAppointmentDate(getOffsetDateKey(2));
    setAppointmentTime('10:30');
    setTitle('');
    setFormModalOpen(true);
  };

  const openEditModal = (appt: Appointment) => {
    setDetailAppt(null);
    setConfirmingCancel(false);
    setEditingAppt(appt);
    setDoctorName(appt.doctorName);
    setClinicName(appt.clinicName || '');
    setAppointmentDate(appt.appointmentDate);
    setAppointmentTime(appt.appointmentTime);
    setTitle(appt.title);
    setFormModalOpen(true);
  };

  const openDetailModal = (appt: Appointment) => {
    setConfirmingCancel(false);
    setDetailAppt(appt);
  };

  const handleSaveAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctorName.trim() || !clinicName.trim() || !appointmentDate || !appointmentTime || !title.trim()) {
      pushToast('error', 'Please fill in all appointment fields.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingAppt) {
        await updateAppointment(
          activeCircle.id,
          editingAppt.id,
          {
            title: title.trim(),
            doctorName: doctorName.trim(),
            specialty: editingAppt.specialty ?? '',
            clinicName: clinicName.trim(),
            location: editingAppt.location ?? '',
            appointmentDate,
            appointmentTime,
            visitType: editingAppt.visitType ?? 'in_person',
            prepNotes: editingAppt.prepNotes ?? '',
            outcomeNotes: editingAppt.outcomeNotes ?? '',
            status: editingAppt.status,
          },
          {
            memberIds: activeCircle.memberIds,
            actorUid: firebaseUser.uid,
            actorName: profile.displayName,
            actorRole,
          },
        );
        pushToast('success', 'Appointment updated.');
      } else {
        await createAppointment({
          circleId: activeCircle.id,
          memberIds: activeCircle.memberIds,
          createdByUid: firebaseUser.uid,
          createdByName: profile.displayName,
          actorRole,
          title: title.trim(),
          doctorName: doctorName.trim(),
          clinicName: clinicName.trim(),
          appointmentDate,
          appointmentTime,
          visitType: 'in_person',
        });
        setActiveTab(appointmentDate >= todayKey ? 'upcoming' : 'previous');
        pushToast('success', 'Appointment added.');
      }
      setFormModalOpen(false);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelAppointment = async (appt: Appointment) => {
    setCancelling(true);
    try {
      await updateAppointment(
        activeCircle.id,
        appt.id,
        {
          title: appt.title,
          doctorName: appt.doctorName,
          specialty: appt.specialty ?? '',
          clinicName: appt.clinicName ?? '',
          location: appt.location ?? '',
          appointmentDate: appt.appointmentDate,
          appointmentTime: appt.appointmentTime,
          visitType: appt.visitType ?? 'in_person',
          prepNotes: appt.prepNotes ?? '',
          outcomeNotes: appt.outcomeNotes ?? '',
          status: 'cancelled',
        },
        {
          memberIds: activeCircle.memberIds,
          actorUid: firebaseUser.uid,
          actorName: profile.displayName,
          actorRole,
        },
      );
      setDetailAppt(null);
      setConfirmingCancel(false);
      pushToast('info', 'Appointment cancelled.');
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setCancelling(false);
    }
  };

  const getStatusLabel = (appt: Appointment) => {
    if (appt.status === 'cancelled') return 'Cancelled';
    if (appt.status === 'completed') return 'Completed';
    if (appt.appointmentDate < todayKey) return 'Past';
    return 'Upcoming';
  };

  const getStatusVariant = (appt: Appointment) => {
    if (appt.status === 'cancelled') return 'neutral' as const;
    if (appt.status === 'completed') return 'success' as const;
    if (appt.appointmentDate < todayKey) return 'neutral' as const;
    return 'warning' as const;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className={`font-display font-bold text-[#1F2937] ${isElderly ? 'text-3xl' : 'text-2xl'}`}>
            Appointments
          </h1>
          <p className={`mt-1 text-[#6B7280] ${isElderly ? 'text-base' : 'text-sm'}`}>
            Doctor appointments for {activeCircle.patientName}.
          </p>
        </div>

        {canManageAppts && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-xl bg-[#065F46] px-5 text-sm font-bold text-white hover:bg-[#047857]"
          >
            <Plus className="h-4 w-4" />
            <span>Add Appointment</span>
          </button>
        )}
      </div>

      {/* Upcoming / Previous List */}
      <section className="rounded-2xl border border-[#E5E7EB] bg-white">
        <div className="border-b border-[#E5E7EB] px-6 py-4">
          <div className="inline-flex rounded-xl bg-[#F3F4F6] p-1">
            <button
              type="button"
              onClick={() => setActiveTab('upcoming')}
              className={`min-h-[40px] rounded-lg px-4 text-sm font-semibold ${
                activeTab === 'upcoming'
                  ? 'bg-white text-[#065F46] shadow-sm'
                  : 'text-[#6B7280] hover:text-[#1F2937]'
              }`}
            >
              Upcoming ({upcomingAppointments.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('previous')}
              className={`min-h-[40px] rounded-lg px-4 text-sm font-semibold ${
                activeTab === 'previous'
                  ? 'bg-white text-[#065F46] shadow-sm'
                  : 'text-[#6B7280] hover:text-[#1F2937]'
              }`}
            >
              Previous ({previousAppointments.length})
            </button>
          </div>
        </div>

        {activeCircleDataLoading ? (
          <div className="space-y-3 p-6">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-[#F3F4F6]" />
            ))}
          </div>
        ) : displayedAppointments.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Calendar}
              title={
                activeTab === 'upcoming' ? 'No upcoming appointments' : 'No previous appointments'
              }
              description={
                activeTab === 'upcoming'
                  ? 'Add a doctor appointment to keep track of the date, time, and hospital.'
                  : 'Completed, cancelled, or past appointments will appear here.'
              }
              actionLabel={activeTab === 'upcoming' && canManageAppts ? 'Add Appointment' : undefined}
              onAction={activeTab === 'upcoming' && canManageAppts ? openCreateModal : undefined}
            />
          </div>
        ) : (
          <div className="divide-y divide-[#E5E7EB]">
            {displayedAppointments.map((appt) => (
              <div
                key={appt.id}
                className="flex flex-col justify-between gap-3 px-6 py-5 sm:flex-row sm:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono text-sm font-bold text-[#065F46]">
                      {formatDateDisplay(appt.appointmentDate)} · {formatTime12h(appt.appointmentTime)}
                    </span>
                    <StatusText variant={getStatusVariant(appt)} label={getStatusLabel(appt)} />
                  </div>
                  <h2 className={`mt-1 font-bold text-[#1F2937] ${isElderly ? 'text-xl' : 'text-base'}`}>
                    {appt.title}
                  </h2>
                  <p className="mt-0.5 text-sm text-[#4B5563]">
                    {appt.doctorName}
                    {appt.clinicName ? ` · ${appt.clinicName}` : ''}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => openDetailModal(appt)}
                  className="min-h-[46px] shrink-0 rounded-xl border border-[#D1D5DB] bg-white px-5 text-sm font-semibold text-[#1F2937] hover:bg-[#F3F4F6]"
                >
                  View Details
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* View Details Modal */}
      <Modal
        open={Boolean(detailAppt)}
        onClose={() => {
          setDetailAppt(null);
          setConfirmingCancel(false);
        }}
        title={detailAppt?.title || 'Appointment Details'}
      >
        {detailAppt && (
          <div className="space-y-4 text-base text-[#374151]">
            <div className="space-y-2.5">
              <p>
                <span className="font-semibold text-[#1F2937]">Doctor Name:</span>{' '}
                {detailAppt.doctorName}
              </p>
              <p>
                <span className="font-semibold text-[#1F2937]">Hospital Name:</span>{' '}
                {detailAppt.clinicName || 'Not specified'}
              </p>
              <p>
                <span className="font-semibold text-[#1F2937]">Date:</span>{' '}
                {formatDateDisplay(detailAppt.appointmentDate)}
              </p>
              <p>
                <span className="font-semibold text-[#1F2937]">Time:</span>{' '}
                {formatTime12h(detailAppt.appointmentTime)}
              </p>
              <p>
                <span className="font-semibold text-[#1F2937]">Reason for Visit:</span>{' '}
                {detailAppt.title}
              </p>
              <p>
                <span className="font-semibold text-[#1F2937]">Status:</span>{' '}
                {getStatusLabel(detailAppt)}
              </p>
            </div>

            {confirmingCancel && canManageAppts && detailAppt.status === 'scheduled' ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-[#991B1B]">
                  Are you sure you want to cancel this appointment?
                </p>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    disabled={cancelling}
                    onClick={() => setConfirmingCancel(false)}
                    className="min-h-[42px] rounded-xl border border-[#D1D5DB] bg-white px-4 text-sm font-semibold text-[#374151]"
                  >
                    Keep Appointment
                  </button>
                  <button
                    type="button"
                    disabled={cancelling}
                    onClick={() => handleCancelAppointment(detailAppt)}
                    className="min-h-[42px] rounded-xl bg-[#B91C1C] px-4 text-sm font-bold text-white hover:bg-[#991B1B] disabled:opacity-60"
                  >
                    {cancelling ? 'Cancelling...' : 'Yes, Cancel Appointment'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#E5E7EB] pt-4">
                {canModifyAppt(detailAppt) && (
                  <button
                    type="button"
                    onClick={() => openEditModal(detailAppt)}
                    className="inline-flex min-h-[46px] items-center gap-1.5 rounded-xl border border-[#D1D5DB] bg-white px-4 text-sm font-semibold text-[#1F2937] hover:bg-[#F3F4F6]"
                  >
                    <Edit3 className="h-4 w-4" />
                    <span>Edit</span>
                  </button>
                )}

                {canManageAppts && detailAppt.status === 'scheduled' && (
                  <button
                    type="button"
                    onClick={() => setConfirmingCancel(true)}
                    className="inline-flex min-h-[46px] items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-[#B91C1C] hover:bg-red-100"
                  >
                    <XCircle className="h-4 w-4" />
                    <span>Cancel Appointment</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setDetailAppt(null)}
                  className="min-h-[46px] rounded-xl bg-[#065F46] px-5 text-sm font-bold text-white hover:bg-[#047857]"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Simple Add / Edit Appointment Form Modal */}
      <Modal
        open={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        title={editingAppt ? 'Edit Appointment' : 'Add Appointment'}
      >
        <form onSubmit={handleSaveAppointment} className="space-y-4">
          <div>
            <label htmlFor="appt-doc" className="block text-sm font-semibold text-[#1F2937]">
              Doctor Name *
            </label>
            <input
              id="appt-doc"
              type="text"
              required
              value={doctorName}
              onChange={(e) => setDoctorName(e.target.value)}
              placeholder="e.g. Dr. Marcus Vance"
              className="mt-1 min-h-[46px] w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 text-base focus:border-[#065F46] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="appt-hospital" className="block text-sm font-semibold text-[#1F2937]">
              Hospital Name *
            </label>
            <input
              id="appt-hospital"
              type="text"
              required
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              placeholder="e.g. City General Hospital"
              className="mt-1 min-h-[46px] w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 text-base focus:border-[#065F46] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="appt-date" className="block text-sm font-semibold text-[#1F2937]">
                Date *
              </label>
              <input
                id="appt-date"
                type="date"
                required
                value={appointmentDate}
                onChange={(e) => setAppointmentDate(e.target.value)}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 font-mono text-base focus:border-[#065F46] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="appt-time" className="block text-sm font-semibold text-[#1F2937]">
                Time *
              </label>
              <input
                id="appt-time"
                type="time"
                required
                value={appointmentTime}
                onChange={(e) => setAppointmentTime(e.target.value)}
                className="mt-1 min-h-[46px] w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 font-mono text-base focus:border-[#065F46] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="appt-reason" className="block text-sm font-semibold text-[#1F2937]">
              Reason for Visit *
            </label>
            <input
              id="appt-reason"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Routine heart checkup"
              className="mt-1 min-h-[46px] w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 text-base focus:border-[#065F46] focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-[#E5E7EB] pt-4">
            <button
              type="button"
              onClick={() => setFormModalOpen(false)}
              className="min-h-[46px] rounded-xl border border-[#D1D5DB] px-4 text-sm font-semibold text-[#374151]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[46px] rounded-xl bg-[#065F46] px-5 text-sm font-bold text-white hover:bg-[#047857] disabled:opacity-60"
            >
              {submitting ? 'Saving...' : editingAppt ? 'Save Changes' : 'Add Appointment'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
