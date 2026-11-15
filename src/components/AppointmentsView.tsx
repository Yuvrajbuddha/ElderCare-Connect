import React, { useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Edit3,
  Lock,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { useCare } from '../context/CareContext';
import {
  formatDateDisplay,
  formatTime12h,
  getOffsetDateKey,
  parseReadableError,
} from '../lib/utils';
import { fetchAppointmentPrep } from '../services/aiService';
import {
  createAppointment,
  deleteAppointment,
  updateAppointment,
} from '../services/careService';
import type {
  Appointment,
  AppointmentPrepResponse,
  AppointmentStatus,
  VisitType,
} from '../types/healthcare';
import { EmptyState } from './ui/EmptyState';
import { Modal } from './ui/Modal';
import { StatusText } from './ui/StatusText';

export function AppointmentsView() {
  const {
    activeCircle,
    activeCircleDataLoading,
    firebaseUser,
    profile,
    can,
    appointments,
    medications,
    healthRecords,
    pushToast,
  } = useCare();

  const [statusFilter, setStatusFilter] = useState<'all' | AppointmentStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [title, setTitle] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [location, setLocation] = useState('');
  const [appointmentDate, setAppointmentDate] = useState(getOffsetDateKey(3));
  const [appointmentTime, setAppointmentTime] = useState('10:00');
  const [visitType, setVisitType] = useState<VisitType>('in_person');
  const [prepNotes, setPrepNotes] = useState('');
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [status, setStatus] = useState<AppointmentStatus>('scheduled');

  // AI Prep State
  const [prepLoadingId, setPrepLoadingId] = useState<string | null>(null);
  const [prepTarget, setPrepTarget] = useState<Appointment | null>(null);
  const [prepResult, setPrepResult] = useState<AppointmentPrepResponse | null>(null);

  const filteredAppointments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return appointments.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.doctorName.toLowerCase().includes(q) ||
        (a.specialty ?? '').toLowerCase().includes(q) ||
        (a.clinicName ?? '').toLowerCase().includes(q)
      );
    });
  }, [appointments, statusFilter, searchQuery]);

  if (!activeCircle || !firebaseUser || !profile) return null;

  const isOwner = activeCircle.ownerId === firebaseUser.uid;
  const canManageAppts = can('manageAppointments');
  const canViewAppts = canManageAppts || can('viewHealthInfo');

  if (!canViewAppts) {
    return (
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#F3F4F6] text-[#4B5563]">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="font-display mt-4 text-lg font-semibold text-[#1F2937]">
          Appointments Access Restricted
        </h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-[#6B7280]">
          The Care Circle owner ({activeCircle.patientName}) has not granted appointment or healthcare
          information permissions to your member profile.
        </p>
      </div>
    );
  }

  const openCreateModal = () => {
    setEditingAppt(null);
    setTitle('');
    setDoctorName(activeCircle.primaryPhysician || '');
    setSpecialty('');
    setClinicName('');
    setLocation('');
    setAppointmentDate(getOffsetDateKey(3));
    setAppointmentTime('10:00');
    setVisitType('in_person');
    setPrepNotes('');
    setOutcomeNotes('');
    setStatus('scheduled');
    setModalOpen(true);
  };

  const openEditModal = (appt: Appointment) => {
    setEditingAppt(appt);
    setTitle(appt.title);
    setDoctorName(appt.doctorName);
    setSpecialty(appt.specialty || '');
    setClinicName(appt.clinicName || '');
    setLocation(appt.location || '');
    setAppointmentDate(appt.appointmentDate);
    setAppointmentTime(appt.appointmentTime);
    setVisitType(appt.visitType);
    setPrepNotes(appt.prepNotes || '');
    setOutcomeNotes(appt.outcomeNotes || '');
    setStatus(appt.status);
    setModalOpen(true);
  };

  const handleSaveAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !doctorName.trim()) {
      pushToast('error', 'Appointment title and doctor name are required.');
      return;
    }
    setSubmitting(true);
    try {
      if (editingAppt) {
        await updateAppointment(activeCircle.id, editingAppt.id, {
          title: title.trim(),
          doctorName: doctorName.trim(),
          specialty,
          clinicName,
          location,
          appointmentDate,
          appointmentTime,
          visitType,
          prepNotes,
          outcomeNotes,
          status,
        });
        pushToast('success', 'Appointment updated.');
      } else {
        await createAppointment({
          circleId: activeCircle.id,
          memberIds: activeCircle.memberIds,
          createdByUid: firebaseUser.uid,
          createdByName: profile.displayName,
          title: title.trim(),
          doctorName: doctorName.trim(),
          specialty,
          clinicName,
          location,
          appointmentDate,
          appointmentTime,
          visitType,
          prepNotes,
        });
        pushToast('success', 'Appointment scheduled and Care Circle notified.');
      }
      setModalOpen(false);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkCompleted = async (appt: Appointment) => {
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
    } catch (error) {
      pushToast('error', parseReadableError(error));
    }
  };

  const handleDelete = async (appt: Appointment) => {
    try {
      await deleteAppointment(activeCircle.id, appt.id);
      pushToast('info', 'Appointment removed.');
    } catch (error) {
      pushToast('error', parseReadableError(error));
    }
  };

  const handleGeneratePrep = async (appt: Appointment) => {
    setPrepLoadingId(appt.id);
    try {
      const result = await fetchAppointmentPrep({
        circleId: activeCircle.id,
        patientName: activeCircle.patientName,
        allergies: activeCircle.allergies,
        appointment: appt,
        activeMedications: medications.filter((m) => m.status === 'active'),
        recentRecords: healthRecords.slice(0, 6),
      });
      setPrepTarget(appt);
      setPrepResult(result);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setPrepLoadingId(null);
    }
  };

  const handleSaveQuestionsToNotes = async () => {
    if (!prepTarget || !prepResult) return;
    const merged = [
      prepTarget.prepNotes ? `${prepTarget.prepNotes}\n\n` : '',
      'Questions for Doctor:\n',
      ...prepResult.questionsForDoctor.map((q) => `- ${q}`),
    ]
      .join('\n')
      .slice(0, 600);
    try {
      await updateAppointment(activeCircle.id, prepTarget.id, {
        title: prepTarget.title,
        doctorName: prepTarget.doctorName,
        specialty: prepTarget.specialty,
        clinicName: prepTarget.clinicName,
        location: prepTarget.location,
        appointmentDate: prepTarget.appointmentDate,
        appointmentTime: prepTarget.appointmentTime,
        visitType: prepTarget.visitType,
        prepNotes: merged,
        outcomeNotes: prepTarget.outcomeNotes,
        status: prepTarget.status,
      });
      pushToast('success', 'AI questions saved to appointment preparation notes.');
    } catch (error) {
      pushToast('error', parseReadableError(error));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#1F2937]">Doctor Appointments</h1>
          <p className="mt-0.5 text-sm text-[#6B7280]">
            Coordinate upcoming clinical visits, telehealth links, and visit preparation for {activeCircle.patientName}.
          </p>
        </div>
        {canManageAppts && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#065F46] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#047857] whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Schedule Appointment</span>
          </button>
        )}
      </div>

      {/* Gemini AI Visit Prep Output */}
      {prepTarget && prepResult && (
        <section className="rounded-xl border border-[#0D9488]/30 bg-white p-6">
          <div className="flex items-start justify-between gap-4 border-b border-[#E5E7EB] pb-4">
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-5 w-5 text-[#0D9488]" />
              <div>
                <h2 className="font-display text-base font-semibold text-[#1F2937]">
                  Visit Prep Brief: {prepTarget.title}
                </h2>
                <p className="text-xs text-[#6B7280]">
                  {prepTarget.doctorName} · {formatDateDisplay(prepTarget.appointmentDate)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {prepTarget.status === 'scheduled' && canManageAppts && (
                <button
                  type="button"
                  onClick={handleSaveQuestionsToNotes}
                  className="rounded-lg border border-[#065F46] bg-[#ECFDF5] px-3 py-1.5 text-xs font-semibold text-[#065F46] hover:bg-[#D1FAE5]"
                >
                  Save Questions to Visit Notes
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setPrepTarget(null);
                  setPrepResult(null);
                }}
                aria-label="Close AI prep"
                className="rounded-lg p-1.5 text-[#6B7280] hover:bg-[#F3F4F6]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <p className="text-sm leading-relaxed text-[#1F2937]">{prepResult.visitSummary}</p>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="border-t border-[#E5E7EB] pt-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[#065F46]">
                  Preparation Checklist
                </h3>
                <ul className="mt-2 space-y-1.5 text-sm text-[#374151]">
                  {prepResult.checklist.map((item, idx) => (
                    <li key={idx}>• {item}</li>
                  ))}
                </ul>
              </div>
              <div className="border-t border-[#E5E7EB] pt-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[#0D9488]">
                  Recommended Questions for {prepTarget.doctorName}
                </h3>
                <ul className="mt-2 space-y-1.5 text-sm text-[#374151]">
                  {prepResult.questionsForDoctor.map((q, idx) => (
                    <li key={idx}>• {q}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="text-xs text-[#6B7280]">{prepResult.disclaimer}</p>
          </div>
        </section>
      )}

      {/* Filter Toolbar & Appointments List */}
      <section className="rounded-xl border border-[#E5E7EB] bg-white">
        <div className="flex flex-col justify-between gap-3 border-b border-[#E5E7EB] px-6 py-4 md:flex-row md:items-center">
          <div className="inline-flex rounded-lg bg-[#F3F4F6] p-1">
            {(['all', 'scheduled', 'completed', 'cancelled'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  statusFilter === tab
                    ? 'bg-white text-[#064E3B] shadow-sm'
                    : 'text-[#6B7280] hover:text-[#1F2937]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-64">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-[#9CA3AF]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search doctor or clinic..."
              className="w-full rounded-lg border border-[#D1D5DB] bg-white py-2 pr-3 pl-9 text-xs text-[#1F2937] focus:border-[#065F46] focus:outline-none"
            />
          </div>
        </div>

        {activeCircleDataLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded bg-[#F3F4F6]" />
            ))}
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Calendar}
              title="No appointments found"
              description="Keep every specialist visit, follow-up, and telehealth session visible to the whole Care Circle."
              actionLabel={canManageAppts ? 'Schedule Appointment' : undefined}
              onAction={canManageAppts ? openCreateModal : undefined}
            />
          </div>
        ) : (
          <div className="divide-y divide-[#E5E7EB]">
            {filteredAppointments.map((appt) => {
              const canEdit = canManageAppts && (appt.status === 'scheduled' || isOwner);
              return (
                <div
                  key={appt.id}
                  className="flex flex-col justify-between gap-4 px-6 py-5 lg:flex-row lg:items-start"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-xs font-semibold text-[#065F46] tabular-nums">
                        {formatDateDisplay(appt.appointmentDate)} · {formatTime12h(appt.appointmentTime)}
                      </span>
                      <StatusText
                        variant={
                          appt.status === 'scheduled'
                            ? 'warning'
                            : appt.status === 'completed'
                              ? 'success'
                              : 'neutral'
                        }
                        label={appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}
                      />
                      <span className="inline-flex items-center gap-1 text-xs text-[#6B7280]">
                        {appt.visitType === 'telehealth' ? (
                          <Video className="h-3.5 w-3.5" />
                        ) : (
                          <MapPin className="h-3.5 w-3.5" />
                        )}
                        <span>
                          {appt.visitType === 'in_person'
                            ? 'In-person'
                            : appt.visitType === 'telehealth'
                              ? 'Telehealth'
                              : 'Home visit'}
                        </span>
                      </span>
                    </div>

                    <h3 className="font-display text-base font-semibold text-[#1F2937]">{appt.title}</h3>
                    <p className="text-sm text-[#4B5563]">
                      {appt.doctorName}
                      {appt.specialty ? ` · ${appt.specialty}` : ''}
                      {appt.clinicName ? ` · ${appt.clinicName}` : ''}
                    </p>
                    {appt.location && <p className="text-xs text-[#6B7280]">{appt.location}</p>}
                    {appt.prepNotes && (
                      <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-[#4B5563]">
                        <span className="font-semibold text-[#1F2937]">Prep notes:</span> {appt.prepNotes}
                      </p>
                    )}
                    {appt.outcomeNotes && (
                      <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-[#065F46]">
                        <span className="font-semibold">Outcome:</span> {appt.outcomeNotes}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={prepLoadingId === appt.id}
                      onClick={() => handleGeneratePrep(appt)}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#0D9488] bg-white px-3 py-1.5 text-xs font-semibold text-[#0F766E] hover:bg-[#F0FDFA] disabled:opacity-60"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>{prepLoadingId === appt.id ? 'Preparing...' : 'AI Visit Prep'}</span>
                    </button>

                    {canManageAppts && appt.status === 'scheduled' && (
                      <button
                        type="button"
                        onClick={() => handleMarkCompleted(appt)}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[#065F46] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#047857]"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Complete</span>
                      </button>
                    )}

                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => openEditModal(appt)}
                        aria-label={`Edit ${appt.title}`}
                        className="rounded-lg p-2 text-[#4B5563] hover:bg-[#F3F4F6]"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                    )}
                    {canManageAppts && (
                      <button
                        type="button"
                        onClick={() => handleDelete(appt)}
                        aria-label={`Delete ${appt.title}`}
                        className="rounded-lg p-2 text-[#6B7280] hover:bg-red-50 hover:text-[#B91C1C]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Schedule / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingAppt ? 'Edit Appointment' : 'Schedule Appointment'}
        subtitle="New appointments notify all Care Circle members."
      >
        <form onSubmit={handleSaveAppointment} className="space-y-4">
          <div>
            <label htmlFor="appt-title" className="block text-sm font-medium text-[#1F2937]">
              Visit Reason / Title *
            </label>
            <input
              id="appt-title"
              type="text"
              required
              maxLength={140}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Cardiology Follow-up"
              className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="appt-doc" className="block text-sm font-medium text-[#1F2937]">
                Doctor / Clinician *
              </label>
              <input
                id="appt-doc"
                type="text"
                required
                maxLength={120}
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                placeholder="Dr. Marcus Vance"
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="appt-spec" className="block text-sm font-medium text-[#1F2937]">
                Specialty
              </label>
              <input
                id="appt-spec"
                type="text"
                maxLength={100}
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                placeholder="Cardiology"
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="appt-date" className="block text-sm font-medium text-[#1F2937]">
                Date *
              </label>
              <input
                id="appt-date"
                type="date"
                required
                value={appointmentDate}
                onChange={(e) => setAppointmentDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 font-mono text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="appt-time" className="block text-sm font-medium text-[#1F2937]">
                Time *
              </label>
              <input
                id="appt-time"
                type="time"
                required
                value={appointmentTime}
                onChange={(e) => setAppointmentTime(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 font-mono text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="appt-type" className="block text-sm font-medium text-[#1F2937]">
                Visit Type
              </label>
              <select
                id="appt-type"
                value={visitType}
                onChange={(e) => setVisitType(e.target.value as VisitType)}
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              >
                <option value="in_person">In-Person</option>
                <option value="telehealth">Telehealth</option>
                <option value="home_visit">Home Visit</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="appt-clinic" className="block text-sm font-medium text-[#1F2937]">
                Clinic / Hospital
              </label>
              <input
                id="appt-clinic"
                type="text"
                maxLength={140}
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                placeholder="Mercy Senior Heart Center"
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="appt-loc" className="block text-sm font-medium text-[#1F2937]">
                Address or Video Link
              </label>
              <input
                id="appt-loc"
                type="text"
                maxLength={240}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Suite 410, 820 Elmwood Ave"
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="appt-prep" className="block text-sm font-medium text-[#1F2937]">
              Preparation Notes
            </label>
            <textarea
              id="appt-prep"
              rows={2}
              maxLength={600}
              value={prepNotes}
              onChange={(e) => setPrepNotes(e.target.value)}
              placeholder="Bring morning blood pressure readings and current pill bottles."
              className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
            />
          </div>

          {editingAppt && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="appt-status" className="block text-sm font-medium text-[#1F2937]">
                  Status
                </label>
                <select
                  id="appt-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as AppointmentStatus)}
                  className="mt-1 w-full rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label htmlFor="appt-outcome" className="block text-sm font-medium text-[#1F2937]">
                  Visit Outcome Notes
                </label>
                <input
                  id="appt-outcome"
                  type="text"
                  maxLength={800}
                  value={outcomeNotes}
                  onChange={(e) => setOutcomeNotes(e.target.value)}
                  placeholder="Summary after appointment"
                  className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-[#E5E7EB] pt-4">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm font-medium text-[#374151] hover:bg-[#F3F4F6]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-[#065F46] px-5 py-2 text-sm font-semibold text-white hover:bg-[#047857] disabled:opacity-60"
            >
              {submitting ? 'Saving...' : editingAppt ? 'Save Changes' : 'Schedule Appointment'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
