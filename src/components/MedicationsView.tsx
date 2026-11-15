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
  X,
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
    can,
    medications,
    medicationLogs,
    pushToast,
  } = useCare();

  const [statusFilter, setStatusFilter] = useState<'all' | MedicationStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState(getTodayKey());

  const [modalOpen, setModalOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<Medication | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  // Gemini AI Guide state
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

  const canViewMeds = can('viewMedications');
  const canAddMeds = can('addMedications');
  const canEditMeds = can('editMedications');

  if (!canViewMeds) {
    return (
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#F3F4F6] text-[#4B5563]">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="font-display mt-4 text-lg font-semibold text-[#1F2937]">
          Medication Schedule Access Restricted
        </h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-[#6B7280]">
          The Care Circle owner ({activeCircle.patientName}) has not granted &quot;View medication
          schedules&quot; permission to your member profile.
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
      pushToast('error', 'Medication name and dosage are required.');
      return;
    }
    setSubmitting(true);
    const scheduledTimes = parseTimes(timesInput);
    try {
      if (editingMed) {
        await updateMedication(activeCircle.id, editingMed.id, {
          name: name.trim(),
          dosage: dosage.trim(),
          frequency: frequency.trim() || 'Once daily',
          scheduledTimes,
          instructions,
          prescribedBy,
          remainingQuantity: Number(remainingQuantity) || 0,
          refillThreshold: Number(refillThreshold) || 7,
          status,
        });
        pushToast('success', `${name.trim()} updated.`);
      } else {
        await createMedication({
          circleId: activeCircle.id,
          memberIds: activeCircle.memberIds,
          createdByUid: firebaseUser.uid,
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
        pushToast('success', `${name.trim()} added to daily schedule.`);
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
      pushToast('info', `${med.name} removed from Care Circle.`);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    }
  };

  const handleDoseAction = async (
    slot: (typeof dailyScheduleSlots)[number],
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
        uid: firebaseUser.uid,
        userName: profile.displayName,
      });
      pushToast('success', `${slot.med.name} (${formatTime12h(slot.time)}) updated to ${nextStatus}.`);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    }
  };

  const handleGenerateGuide = async () => {
    const activeMeds = medications.filter((m) => m.status === 'active');
    if (activeMeds.length === 0) {
      pushToast('info', 'Add at least one active medication first.');
      return;
    }
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
          <h1 className="font-display text-2xl font-bold text-[#1F2937]">Medication Schedules</h1>
          <p className="mt-0.5 text-sm text-[#6B7280]">
            Manage active prescriptions, daily dose adherence, and refill alerts for {activeCircle.patientName}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleGenerateGuide}
            disabled={aiGuideLoading}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[#0D9488] bg-white px-4 py-2 text-xs font-semibold text-[#0F766E] transition-colors hover:bg-[#F0FDFA] disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            <Sparkles className="h-4 w-4" />
            <span>{aiGuideLoading ? 'Building Guide...' : 'AI Daily Care Guide'}</span>
          </button>
          {canAddMeds && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#065F46] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#047857] whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>Add Medication</span>
            </button>
          )}
        </div>
      </div>

      {/* Gemini AI Medication Guide Panel */}
      {(aiGuide || aiGuideError) && (
        <section className="rounded-xl border border-[#0D9488]/30 bg-white p-6">
          <div className="flex items-start justify-between gap-4 border-b border-[#E5E7EB] pb-4">
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-5 w-5 text-[#0D9488]" />
              <div>
                <h2 className="font-display text-base font-semibold text-[#1F2937]">
                  Plain-Language Daily Medication Guide
                </h2>
                <p className="text-xs text-[#6B7280]">Prepared for {activeCircle.patientName} &amp; care circle</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setAiGuide(null);
                setAiGuideError(null);
              }}
              aria-label="Close AI guide"
              className="rounded-lg p-1.5 text-[#6B7280] hover:bg-[#F3F4F6]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {aiGuideError ? (
            <p className="mt-4 text-sm text-[#B91C1C]">{aiGuideError}</p>
          ) : aiGuide ? (
            <div className="mt-4 space-y-5">
              <p className="text-sm leading-relaxed text-[#1F2937]">{aiGuide.dailyOverview}</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {aiGuide.timeBlocks.map((block, i) => (
                  <div key={i} className="border-t border-[#E5E7EB] pt-3">
                    <h3 className="font-display text-sm font-semibold text-[#065F46]">{block.period}</h3>
                    <ul className="mt-2 space-y-1 text-sm text-[#374151]">
                      {block.items.map((item, j) => (
                        <li key={j}>• {item}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-[#6B7280]">{block.mealTip}</p>
                  </div>
                ))}
              </div>
              {aiGuide.pharmacistQuestions.length > 0 && (
                <div className="border-t border-[#E5E7EB] pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[#0D9488]">
                    Questions to Confirm with Pharmacist or Doctor
                  </h3>
                  <ul className="mt-2 space-y-1 text-sm text-[#374151]">
                    {aiGuide.pharmacistQuestions.map((q, i) => (
                      <li key={i}>• {q}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-[#6B7280]">{aiGuide.disclaimer}</p>
            </div>
          ) : null}
        </section>
      )}

      {/* Daily Dose Tracking Strip */}
      <section className="rounded-xl border border-[#E5E7EB] bg-white">
        <div className="flex flex-col justify-between gap-3 border-b border-[#E5E7EB] px-6 py-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-base font-semibold text-[#1F2937]">
              Daily Dose Adherence Log
            </h2>
            <p className="text-xs text-[#6B7280]">Log doses for {formatDateDisplay(selectedDate)}</p>
          </div>
          <input
            type="date"
            aria-label="Select dose log date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-[#D1D5DB] px-3 py-1.5 font-mono text-xs text-[#1F2937] focus:border-[#065F46] focus:outline-none"
          />
        </div>

        {dailyScheduleSlots.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-[#6B7280]">
            No active medications scheduled. Add an active medication below to start logging daily doses.
          </div>
        ) : (
          <div className="divide-y divide-[#E5E7EB]">
            {dailyScheduleSlots.map((slot) => {
              const doseStatus = slot.log?.status ?? 'pending';
              return (
                <div
                  key={slot.key}
                  className="flex flex-col justify-between gap-3 px-6 py-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-xs font-semibold text-[#065F46] tabular-nums">
                        {formatTime12h(slot.time)}
                      </span>
                      <span className="text-sm font-semibold text-[#1F2937]">{slot.med.name}</span>
                      <span className="text-xs text-[#6B7280] tabular-nums">{slot.med.dosage}</span>
                      {slot.log && (
                        <span className="text-xs text-[#6B7280]">
                          · Logged by {slot.log.loggedByName}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {doseStatus === 'taken' && <StatusText variant="success" label="Taken" />}
                    {doseStatus === 'skipped' && <StatusText variant="warning" label="Skipped" />}
                    {doseStatus === 'pending' && <StatusText variant="neutral" label="Pending" />}

                    {(canAddMeds || canEditMeds) && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleDoseAction(slot, 'taken')}
                          className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                            doseStatus === 'taken'
                              ? 'bg-[#ECFDF5] text-[#065F46]'
                              : 'bg-[#065F46] text-white hover:bg-[#047857]'
                          }`}
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Taken</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleDoseAction(slot, doseStatus === 'skipped' ? 'pending' : 'skipped')
                          }
                          className="inline-flex min-h-[34px] items-center rounded-lg border border-[#D1D5DB] bg-white px-2.5 py-1 text-xs font-medium text-[#4B5563] hover:bg-[#F3F4F6]"
                        >
                          {doseStatus === 'skipped' ? 'Reset' : 'Skip'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Prescriptions Ledger */}
      <section className="rounded-xl border border-[#E5E7EB] bg-white">
        <div className="flex flex-col justify-between gap-3 border-b border-[#E5E7EB] px-6 py-4 md:flex-row md:items-center">
          <div className="inline-flex rounded-lg bg-[#F3F4F6] p-1">
            {(['all', 'active', 'paused', 'completed'] as const).map((tab) => (
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
              placeholder="Search medications..."
              className="w-full rounded-lg border border-[#D1D5DB] bg-white py-2 pr-3 pl-9 text-xs text-[#1F2937] focus:border-[#065F46] focus:outline-none"
            />
          </div>
        </div>

        {activeCircleDataLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded bg-[#F3F4F6]" />
            ))}
          </div>
        ) : filteredMeds.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Pill}
              title="No medications match this view"
              description="Add prescriptions with scheduled times and instructions so your Care Circle stays aligned."
              actionLabel={canAddMeds ? 'Add Medication' : undefined}
              onAction={canAddMeds ? openCreateModal : undefined}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-xs font-semibold text-[#6B7280]">
                  <th className="px-6 py-3">Medication</th>
                  <th className="px-4 py-3">Dosage &amp; Schedule</th>
                  <th className="px-4 py-3">Prescriber</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {filteredMeds.map((med) => {
                  const lowStock =
                    med.remainingQuantity !== undefined &&
                    med.refillThreshold !== undefined &&
                    med.remainingQuantity <= med.refillThreshold;

                  return (
                    <tr key={med.id} className="hover:bg-[#F9FAFB]">
                      <td className="px-6 py-3.5">
                        <div className="font-semibold text-[#1F2937]">{med.name}</div>
                        {med.instructions && (
                          <div className="mt-0.5 max-w-xs truncate text-xs text-[#6B7280]">
                            {med.instructions}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-mono text-xs font-medium text-[#1F2937] tabular-nums">
                          {med.dosage} · {med.frequency}
                        </div>
                        <div className="mt-0.5 font-mono text-xs text-[#6B7280] tabular-nums">
                          {med.scheduledTimes.map(formatTime12h).join(', ')}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-[#4B5563]">
                        {med.prescribedBy || '—'}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs tabular-nums">
                        <span className={lowStock ? 'font-semibold text-[#B45309]' : 'text-[#1F2937]'}>
                          {med.remainingQuantity ?? 0} left
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
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
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        {canEditMeds ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(med)}
                              aria-label={`Edit ${med.name}`}
                              className="rounded-lg p-2 text-[#4B5563] hover:bg-[#F3F4F6] hover:text-[#1F2937]"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteMedication(med)}
                              aria-label={`Delete ${med.name}`}
                              className="rounded-lg p-2 text-[#6B7280] hover:bg-red-50 hover:text-[#B91C1C]"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-[#9CA3AF]">View only</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Add / Edit Medication Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingMed ? `Edit ${editingMed.name}` : 'Add Medication'}
        subtitle="Changes sync immediately to all Care Circle members."
      >
        <form onSubmit={handleSaveMedication} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="med-name" className="block text-sm font-medium text-[#1F2937]">
                Medication Name *
              </label>
              <input
                id="med-name"
                type="text"
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Lisinopril"
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="med-dosage" className="block text-sm font-medium text-[#1F2937]">
                Dosage *
              </label>
              <input
                id="med-dosage"
                type="text"
                required
                maxLength={80}
                value={dosage}
                onChange={(e) => setDosage(e.target.value)}
                placeholder="e.g. 10 mg"
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="med-freq" className="block text-sm font-medium text-[#1F2937]">
                Frequency
              </label>
              <input
                id="med-freq"
                type="text"
                maxLength={80}
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                placeholder="Once daily"
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="med-times" className="block text-sm font-medium text-[#1F2937]">
                Scheduled Times (24h, comma-separated)
              </label>
              <input
                id="med-times"
                type="text"
                required
                value={timesInput}
                onChange={(e) => setTimesInput(e.target.value)}
                placeholder="08:00, 20:00"
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 font-mono text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="med-inst" className="block text-sm font-medium text-[#1F2937]">
              Administration Instructions
            </label>
            <textarea
              id="med-inst"
              rows={2}
              maxLength={400}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Take with breakfast and a full glass of water."
              className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="med-doc" className="block text-sm font-medium text-[#1F2937]">
                Prescribing Doctor
              </label>
              <input
                id="med-doc"
                type="text"
                maxLength={120}
                value={prescribedBy}
                onChange={(e) => setPrescribedBy(e.target.value)}
                placeholder="Dr. Elena Rostova"
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="med-qty" className="block text-sm font-medium text-[#1F2937]">
                Doses Remaining
              </label>
              <input
                id="med-qty"
                type="number"
                min={0}
                max={5000}
                value={remainingQuantity}
                onChange={(e) => setRemainingQuantity(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 font-mono text-sm tabular-nums focus:border-[#065F46] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="med-thresh" className="block text-sm font-medium text-[#1F2937]">
                Refill Alert At
              </label>
              <input
                id="med-thresh"
                type="number"
                min={0}
                max={500}
                value={refillThreshold}
                onChange={(e) => setRefillThreshold(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 font-mono text-sm tabular-nums focus:border-[#065F46] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="med-status" className="block text-sm font-medium text-[#1F2937]">
              Status
            </label>
            <select
              id="med-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as MedicationStatus)}
              className="mt-1 w-full rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </select>
          </div>

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
              {submitting ? 'Saving...' : editingMed ? 'Save Changes' : 'Add Medication'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
