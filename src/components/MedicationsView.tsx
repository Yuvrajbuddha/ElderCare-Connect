import React, { useMemo, useState } from 'react';
import {
  Check,
  Edit3,
  Lock,
  Pill,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCare } from '../context/CareContext';
import {
  formatDateDisplay,
  formatTime12h,
  getTodayKey,
  parseReadableError,
} from '../lib/utils';
import { fetchMedicationGuide } from '../services/aiService';
import {
  createMedication,
  deleteMedication,
  logMedicationDose,
  updateMedication,
} from '../services/careService';
import type {
  Medication,
  MedicationGuideResponse,
  MedicationLog,
  MedicationStatus,
} from '../types/healthcare';
import { EmptyState } from './ui/EmptyState';
import { Modal } from './ui/Modal';
import { StatusText } from './ui/StatusText';

export function MedicationsView() {
  const {
    activeCircle,
    activeCircleDataLoading,
    firebaseUser,
    profile,
    currentMember,
    can,
    medications,
    medicationLogs,
    pushToast,
  } = useCare();

  const [statusFilter, setStatusFilter] = useState<'all' | MedicationStatus>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const selectedDate = getTodayKey();

  // Add / Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<Medication | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // View Details modals
  const [detailMed, setDetailMed] = useState<Medication | null>(null);
  const [detailSlot, setDetailSlot] = useState<{
    med: Medication;
    time: string;
    log?: MedicationLog;
  } | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('Once daily');
  const [timesInput, setTimesInput] = useState('08:00');
  const [instructions, setInstructions] = useState('');
  const [prescribedBy, setPrescribedBy] = useState('');
  const [remainingQuantity, setRemainingQuantity] = useState('30');
  const [refillThreshold, setRefillThreshold] = useState('7');
  const [status, setStatus] = useState<MedicationStatus>('active');

  // AI Guide modal
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [aiGuideLoading, setAiGuideLoading] = useState(false);
  const [aiGuide, setAiGuide] = useState<MedicationGuideResponse | null>(null);
  const [aiGuideError, setAiGuideError] = useState<string | null>(null);

  const filteredMeds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return medications.filter((m) => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.dosage.toLowerCase().includes(q) ||
        (m.prescribedBy ?? '').toLowerCase().includes(q)
      );
    });
  }, [medications, statusFilter, searchQuery]);

  const dailyScheduleSlots = useMemo(() => {
    return medications
      .filter((m) => m.status === 'active')
      .flatMap((med) =>
        med.scheduledTimes.map((time) => {
          const log = medicationLogs.find(
            (l) => l.medicationId === med.id && l.dateKey === selectedDate && l.scheduledTime === time,
          );
          return { key: `${med.id}_${time}`, med, time, log };
        }),
      )
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [medications, medicationLogs, selectedDate]);

  if (!activeCircle || !firebaseUser || !profile) return null;

  const isElderly = profile.accountType === 'elderly';
  const canViewMeds = can('viewMedications');
  const canAddMeds = can('addMedications');
  const canEditMeds = can('editMedications');
  const isCaretaker = profile.accountType === 'caretaker' || currentMember?.memberRole === 'caretaker';
  const resolvedActorRole =
    currentMember?.memberRole ?? (profile.accountType === 'elderly' ? 'patient' : profile.accountType);

  if (!canViewMeds) {
    return (
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-10 text-center">
        <Lock className="mx-auto h-8 w-8 text-[#6B7280]" />
        <h1 className="font-display mt-3 text-xl font-bold text-[#1F2937]">
          Medicine Schedule Not Shared
        </h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-[#6B7280]">
          {activeCircle.patientName} has not granted permission to view medicines yet.
        </p>
      </div>
    );
  }

  const openCreateModal = () => {
    setEditingMed(null);
    setName('');
    setDosage('');
    setFrequency('Once daily');
    setTimesInput('08:00');
    setInstructions('');
    setPrescribedBy(activeCircle.primaryPhysician || '');
    setRemainingQuantity('30');
    setRefillThreshold('7');
    setStatus('active');
    setModalOpen(true);
  };

  const openEditModal = (med: Medication) => {
    setDetailMed(null);
    setEditingMed(med);
    setName(med.name);
    setDosage(med.dosage);
    setFrequency(med.frequency);
    setTimesInput(med.scheduledTimes.join(', '));
    setInstructions(med.instructions || '');
    setPrescribedBy(med.prescribedBy || '');
    setRemainingQuantity(String(med.remainingQuantity ?? 30));
    setRefillThreshold(String(med.refillThreshold ?? 7));
    setStatus(med.status);
    setModalOpen(true);
  };

  const parseTimes = (raw: string): string[] => {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length >= 4 && s.length <= 10);
    return parts.length > 0 ? parts.slice(0, 6) : ['08:00'];
  };

  const handleSaveMedication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !dosage.trim()) {
      pushToast('error', 'Medicine name and dosage are required.');
      return;
    }
    setSubmitting(true);
    const scheduledTimes = parseTimes(timesInput);
    try {
      if (editingMed) {
        await updateMedication(
          activeCircle.id,
          editingMed.id,
          {
            name: name.trim(),
            dosage: isCaretaker ? editingMed.dosage : dosage.trim(),
            frequency: frequency.trim() || 'Once daily',
            scheduledTimes,
            instructions,
            prescribedBy,
            remainingQuantity: Number(remainingQuantity) || 0,
            refillThreshold: Number(refillThreshold) || 7,
            status,
          },
          {
            memberIds: activeCircle.memberIds,
            uid: firebaseUser.uid,
            name: profile.displayName,
            role: resolvedActorRole,
          },
        );
        pushToast('success', `${name.trim()} updated.`);
      } else {
        await createMedication({
          circleId: activeCircle.id,
          memberIds: activeCircle.memberIds,
          createdByUid: firebaseUser.uid,
          actorName: profile.displayName,
          actorRole: resolvedActorRole,
          name: name.trim(),
          dosage: dosage.trim(),
          frequency: frequency.trim() || 'Once daily',
          scheduledTimes,
          instructions,
          prescribedBy,
          remainingQuantity: Number(remainingQuantity) || 30,
          refillThreshold: Number(refillThreshold) || 7,
          status,
        });
        pushToast('success', `${name.trim()} added.`);
      }
      setModalOpen(false);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMedication = async (med: Medication) => {
    try {
      await deleteMedication(activeCircle.id, med.id);
      setDetailMed(null);
      pushToast('info', `${med.name} removed.`);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    }
  };

  const handleDoseAction = async (
    slot: { med: Medication; time: string; log?: MedicationLog },
    nextStatus: 'taken' | 'skipped' | 'pending',
  ) => {
    try {
      await logMedicationDose({
        circleId: activeCircle.id,
        memberIds: activeCircle.memberIds,
        medication: slot.med,
        existingLog: slot.log,
        dateKey: selectedDate,
        scheduledTime: slot.time,
        status: nextStatus,
        assistanceMode:
          nextStatus === 'taken'
            ? isCaretaker
              ? 'administered'
              : resolvedActorRole === 'patient'
                ? 'self'
                : 'assisted'
            : undefined,
        uid: firebaseUser.uid,
        userName: profile.displayName,
        actorRole: resolvedActorRole,
      });
      setDetailSlot(null);
      pushToast(
        'success',
        nextStatus === 'taken'
          ? `${slot.med.name} marked as taken.`
          : `${slot.med.name} updated.`,
      );
    } catch (error) {
      pushToast('error', parseReadableError(error));
    }
  };

  const handleGenerateGuide = async () => {
    const activeMeds = medications.filter((m) => m.status === 'active');
    if (activeMeds.length === 0) {
      pushToast('info', 'Add at least one medicine first.');
      return;
    }
    setGuideModalOpen(true);
    setAiGuideLoading(true);
    setAiGuideError(null);
    try {
      const guide = await fetchMedicationGuide({
        circleId: activeCircle.id,
        patientName: activeCircle.patientName,
        patientAge: activeCircle.patientAge,
        allergies: activeCircle.allergies,
        medications: activeMeds,
      });
      setAiGuide(guide);
    } catch (error) {
      const msg = parseReadableError(error);
      setAiGuideError(msg);
      pushToast('error', msg);
    } finally {
      setAiGuideLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className={`font-display font-bold text-[#1F2937] ${isElderly ? 'text-3xl' : 'text-2xl'}`}>
            {isElderly ? 'My Medicines' : `Medicines for ${activeCircle.patientName}`}
          </h1>
          <p className={`mt-1 text-[#6B7280] ${isElderly ? 'text-base' : 'text-sm'}`}>
            Check today&apos;s doses and manage prescriptions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleGenerateGuide}
            className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border border-[#065F46] bg-[#ECFDF5] px-4 text-sm font-bold text-[#065F46] hover:bg-[#D1FAE5]"
          >
            <Sparkles className="h-4 w-4" />
            <span>Care Guide</span>
          </button>
          {canAddMeds && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-[#065F46] px-5 text-sm font-bold text-white hover:bg-[#047857]"
            >
              <Plus className="h-4 w-4" />
              <span>Add Medicine</span>
            </button>
          )}
        </div>
      </div>

      {/* 1. Today's Dose Checklist — One Primary Action */}
      <section className="rounded-2xl border border-[#E5E7EB] bg-white">
        <div className="border-b border-[#E5E7EB] px-6 py-4">
          <h2 className={`font-display font-bold text-[#1F2937] ${isElderly ? 'text-xl' : 'text-lg'}`}>
            Today&apos;s Schedule · {formatDateDisplay(selectedDate)}
          </h2>
        </div>

        {dailyScheduleSlots.length === 0 ? (
          <div className="px-6 py-10 text-center text-base text-[#6B7280]">
            No medicines scheduled for today.
          </div>
        ) : (
          <div className="divide-y divide-[#E5E7EB]">
            {dailyScheduleSlots.map((slot) => {
              const doseStatus = slot.log?.status ?? 'pending';
              return (
                <div
                  key={slot.key}
                  className="flex flex-col justify-between gap-3 px-6 py-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-base font-bold text-[#065F46]">
                        {formatTime12h(slot.time)}
                      </span>
                      <span className={`font-bold text-[#1F2937] ${isElderly ? 'text-lg' : 'text-base'}`}>
                        {slot.med.name}
                      </span>
                      <span className="text-sm text-[#4B5563]">{slot.med.dosage}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <StatusText
                        variant={
                          doseStatus === 'taken'
                            ? 'success'
                            : doseStatus === 'missed'
                              ? 'danger'
                              : doseStatus === 'skipped'
                                ? 'warning'
                                : 'neutral'
                        }
                        label={
                          doseStatus === 'taken'
                            ? 'Taken'
                            : doseStatus === 'missed'
                              ? 'Missed'
                              : doseStatus === 'skipped'
                                ? 'Skipped'
                                : 'Due'
                        }
                      />
                      {slot.log && (
                        <span className="text-xs text-[#6B7280]">
                          by {slot.log.loggedByName}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {(canAddMeds || canEditMeds) && doseStatus !== 'taken' ? (
                      <button
                        type="button"
                        onClick={() => handleDoseAction(slot, 'taken')}
                        className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-[#065F46] px-5 text-sm font-bold text-white hover:bg-[#047857]"
                      >
                        <Check className="h-4 w-4" />
                        <span>Mark as Taken</span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setDetailSlot(slot)}
                      className="min-h-[46px] rounded-xl border border-[#D1D5DB] bg-white px-4 text-sm font-semibold text-[#374151] hover:bg-[#F3F4F6]"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. Medicines List — Clean Rows with Single View Details Action */}
      <section className="rounded-2xl border border-[#E5E7EB] bg-white">
        <div className="flex flex-col justify-between gap-3 border-b border-[#E5E7EB] px-6 py-4 md:flex-row md:items-center">
          <div className="inline-flex rounded-xl bg-[#F3F4F6] p-1">
            {(['active', 'all', 'paused', 'completed'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`min-h-[38px] rounded-lg px-3.5 text-sm font-semibold capitalize ${
                  statusFilter === tab ? 'bg-white text-[#065F46] shadow-sm' : 'text-[#6B7280]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-64">
            <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-[#9CA3AF]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search medicines..."
              className="min-h-[42px] w-full rounded-xl border border-[#D1D5DB] bg-white py-2 pr-3 pl-9 text-sm text-[#1F2937] focus:border-[#065F46] focus:outline-none"
            />
          </div>
        </div>

        {activeCircleDataLoading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-[#F3F4F6]" />
            ))}
          </div>
        ) : filteredMeds.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Pill}
              title="No medicines found"
              description="Add a prescription to track daily times and refills."
              actionLabel={canAddMeds ? 'Add Medicine' : undefined}
              onAction={canAddMeds ? openCreateModal : undefined}
            />
          </div>
        ) : (
          <div className="divide-y divide-[#E5E7EB]">
            {filteredMeds.map((med) => {
              const lowStock =
                med.remainingQuantity !== undefined &&
                med.refillThreshold !== undefined &&
                med.remainingQuantity <= med.refillThreshold;

              return (
                <div
                  key={med.id}
                  className="flex flex-col justify-between gap-3 px-6 py-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <p className={`font-bold text-[#1F2937] ${isElderly ? 'text-lg' : 'text-base'}`}>
                        {med.name}
                      </p>
                      <span className="text-sm font-medium text-[#4B5563]">{med.dosage}</span>
                      <StatusText
                        variant={
                          med.status === 'active'
                            ? 'success'
                            : med.status === 'paused'
                              ? 'warning'
                              : 'neutral'
                        }
                        label={med.status.charAt(0).toUpperCase() + med.status.slice(1)}
                      />
                    </div>
                    <p className="mt-1 text-sm text-[#6B7280]">
                      {med.frequency} · {med.scheduledTimes.map(formatTime12h).join(', ')}
                      {typeof med.remainingQuantity === 'number' && (
                        <span className={lowStock ? ' font-semibold text-[#B45309]' : ''}>
                          {' '}
                          · {med.remainingQuantity} left{lowStock ? ' (Refill soon)' : ''}
                        </span>
                      )}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setDetailMed(med)}
                    className="min-h-[44px] shrink-0 rounded-xl border border-[#D1D5DB] bg-white px-4 text-sm font-semibold text-[#374151] hover:bg-[#F3F4F6]"
                  >
                    View Details
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Dose Slot Details Dialog */}
      <Modal
        open={Boolean(detailSlot)}
        onClose={() => setDetailSlot(null)}
        title={detailSlot ? detailSlot.med.name : 'Dose Details'}
      >
        {detailSlot && (
          <div className="space-y-4 text-base text-[#374151]">
            <p>
              <span className="font-semibold">Time:</span> {formatTime12h(detailSlot.time)}
            </p>
            <p>
              <span className="font-semibold">Dosage:</span> {detailSlot.med.dosage}
            </p>
            {detailSlot.med.instructions && (
              <p>
                <span className="font-semibold">Instructions:</span> {detailSlot.med.instructions}
              </p>
            )}
            {(canAddMeds || canEditMeds) && (
              <div className="flex flex-wrap justify-end gap-3 border-t border-[#E5E7EB] pt-4">
                {detailSlot.log?.status !== 'skipped' && (
                  <button
                    type="button"
                    onClick={() => handleDoseAction(detailSlot, 'skipped')}
                    className="min-h-[44px] rounded-xl border border-[#D1D5DB] px-4 text-sm font-semibold text-[#374151]"
                  >
                    Skip Dose
                  </button>
                )}
                {detailSlot.log?.status === 'taken' ? (
                  <button
                    type="button"
                    onClick={() => handleDoseAction(detailSlot, 'pending')}
                    className="min-h-[44px] rounded-xl border border-[#D1D5DB] px-4 text-sm font-semibold text-[#374151]"
                  >
                    Undo Taken
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleDoseAction(detailSlot, 'taken')}
                    className="min-h-[44px] rounded-xl bg-[#065F46] px-5 text-sm font-bold text-white hover:bg-[#047857]"
                  >
                    Mark as Taken
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Medicine Details Dialog */}
      <Modal
        open={Boolean(detailMed)}
        onClose={() => setDetailMed(null)}
        title={detailMed?.name || 'Medicine Details'}
      >
        {detailMed && (
          <div className="space-y-4 text-base text-[#374151]">
            <p>
              <span className="font-semibold">Dosage:</span> {detailMed.dosage}
            </p>
            <p>
              <span className="font-semibold">Schedule:</span> {detailMed.frequency} (
              {detailMed.scheduledTimes.map(formatTime12h).join(', ')})
            </p>
            {detailMed.instructions && (
              <p>
                <span className="font-semibold">Instructions:</span> {detailMed.instructions}
              </p>
            )}
            {detailMed.prescribedBy && (
              <p>
                <span className="font-semibold">Doctor:</span> {detailMed.prescribedBy}
              </p>
            )}
            <p>
              <span className="font-semibold">Pills Remaining:</span>{' '}
              {detailMed.remainingQuantity ?? 0}
            </p>

            {canEditMeds && (
              <div className="flex flex-wrap justify-between gap-3 border-t border-[#E5E7EB] pt-4">
                <button
                  type="button"
                  onClick={() => handleDeleteMedication(detailMed)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-red-200 px-4 text-sm font-semibold text-[#B91C1C] hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete</span>
                </button>
                <button
                  type="button"
                  onClick={() => openEditModal(detailMed)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#065F46] px-5 text-sm font-bold text-white hover:bg-[#047857]"
                >
                  <Edit3 className="h-4 w-4" />
                  <span>Edit Medicine</span>
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* AI Care Guide Modal */}
      <Modal
        open={guideModalOpen}
        onClose={() => setGuideModalOpen(false)}
        title="Daily Medicine Guide"
        subtitle={`Simple summary for ${activeCircle.patientName}`}
      >
        {aiGuideLoading ? (
          <div className="py-10 text-center text-sm text-[#6B7280]">Preparing care guide...</div>
        ) : aiGuideError ? (
          <p className="text-sm text-[#B91C1C]">{aiGuideError}</p>
        ) : aiGuide ? (
          <div className="space-y-4 text-sm text-[#374151]">
            <p className="text-base leading-relaxed text-[#1F2937]">{aiGuide.dailyOverview}</p>
            <div className="space-y-3">
              {aiGuide.timeBlocks.map((block, i) => (
                <div key={i} className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
                  <h3 className="font-display text-base font-bold text-[#065F46]">{block.period}</h3>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5">
                    {block.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-[#6B7280]">{block.mealTip}</p>
                </div>
              ))}
            </div>
            <p className="border-t border-[#E5E7EB] pt-3 text-xs text-[#6B7280]">
              {aiGuide.disclaimer}
            </p>
          </div>
        ) : null}
      </Modal>

      {/* Add / Edit Medicine Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingMed ? `Edit ${editingMed.name}` : 'Add Medicine'}
      >
        <form onSubmit={handleSaveMedication} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="med-name" className="block text-sm font-semibold text-[#1F2937]">
                Medicine Name *
              </label>
              <input
                id="med-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Lisinopril"
                className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="med-dosage" className="block text-sm font-semibold text-[#1F2937]">
                Dosage * {editingMed && isCaretaker && <span className="text-xs text-[#6B7280]">(Locked)</span>}
              </label>
              <input
                id="med-dosage"
                type="text"
                required
                disabled={Boolean(editingMed && isCaretaker)}
                value={dosage}
                onChange={(e) => setDosage(e.target.value)}
                placeholder="e.g. 10 mg"
                className={`mt-1 w-full rounded-xl border px-3.5 py-2.5 text-sm ${
                  editingMed && isCaretaker
                    ? 'cursor-not-allowed border-[#E5E7EB] bg-[#F3F4F6] text-[#6B7280]'
                    : 'border-[#D1D5DB]'
                }`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="med-freq" className="block text-sm font-semibold text-[#1F2937]">
                How Often
              </label>
              <input
                id="med-freq"
                type="text"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                placeholder="Once daily"
                className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="med-times" className="block text-sm font-semibold text-[#1F2937]">
                Times (24h, e.g. 08:00, 20:00)
              </label>
              <input
                id="med-times"
                type="text"
                required
                value={timesInput}
                onChange={(e) => setTimesInput(e.target.value)}
                placeholder="08:00, 20:00"
                className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 font-mono text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="med-inst" className="block text-sm font-semibold text-[#1F2937]">
              Instructions
            </label>
            <textarea
              id="med-inst"
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Take with breakfast and water."
              className="mt-1 w-full rounded-xl border border-[#D1D5DB] p-3 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="med-doc" className="block text-sm font-semibold text-[#1F2937]">
                Doctor
              </label>
              <input
                id="med-doc"
                type="text"
                value={prescribedBy}
                onChange={(e) => setPrescribedBy(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="med-qty" className="block text-sm font-semibold text-[#1F2937]">
                Pills Left
              </label>
              <input
                id="med-qty"
                type="number"
                min={0}
                value={remainingQuantity}
                onChange={(e) => setRemainingQuantity(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 font-mono text-sm"
              />
            </div>
            <div>
              <label htmlFor="med-status" className="block text-sm font-semibold text-[#1F2937]">
                Status
              </label>
              <select
                id="med-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as MedicationStatus)}
                className="mt-1 w-full rounded-xl border border-[#D1D5DB] bg-white px-3 py-2.5 text-sm"
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-[#E5E7EB] pt-4">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="min-h-[44px] rounded-xl border border-[#D1D5DB] px-4 text-sm font-medium text-[#374151]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] rounded-xl bg-[#065F46] px-5 text-sm font-bold text-white hover:bg-[#047857] disabled:opacity-60"
            >
              {submitting ? 'Saving...' : editingMed ? 'Save Changes' : 'Add Medicine'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
