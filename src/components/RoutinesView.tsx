import React, { useMemo, useState } from 'react';
import { Check, ClipboardList, Edit3, Plus, Trash2 } from 'lucide-react';
import { useCare } from '../context/CareContext';
import { formatDateDisplay, formatTime12h, getTodayKey, parseReadableError } from '../lib/utils';
import {
  createCareRoutine,
  deleteCareRoutine,
  toggleRoutineCompletion,
  updateCareRoutine,
} from '../services/careService';
import type { CareRoutine, RoutineCategory } from '../types/healthcare';
import { EmptyState } from './ui/EmptyState';
import { Modal } from './ui/Modal';
import { StatusText } from './ui/StatusText';

const CATEGORY_LABELS: Record<RoutineCategory, string> = {
  hydration: 'Hydration',
  mobility: 'Mobility',
  nutrition: 'Nutrition',
  sleep: 'Sleep',
  hygiene: 'Hygiene',
  therapy: 'Therapy',
};

export function RoutinesView() {
  const {
    activeCircle,
    activeCircleDataLoading,
    firebaseUser,
    profile,
    currentMember,
    routines,
    routineLogs,
    pushToast,
  } = useCare();

  const [categoryFilter, setCategoryFilter] = useState<'all' | RoutineCategory>('all');
  const [selectedDate, setSelectedDate] = useState(getTodayKey());

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<CareRoutine | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<RoutineCategory>('hydration');
  const [targetTime, setTargetTime] = useState('09:00');
  const [instructions, setInstructions] = useState('');
  const [active, setActive] = useState(true);

  const filteredRoutines = useMemo(() => {
    return routines.filter((r) => categoryFilter === 'all' || r.category === categoryFilter);
  }, [routines, categoryFilter]);

  if (!activeCircle || !firebaseUser || !profile) return null;

  const resolvedActorRole =
    currentMember?.memberRole ?? (profile.accountType === 'elderly' ? 'patient' : profile.accountType);

  const openCreateModal = () => {
    setEditingRoutine(null);
    setTitle('');
    setCategory('hydration');
    setTargetTime('09:00');
    setInstructions('');
    setActive(true);
    setModalOpen(true);
  };

  const openEditModal = (routine: CareRoutine) => {
    setEditingRoutine(routine);
    setTitle(routine.title);
    setCategory(routine.category);
    setTargetTime(routine.targetTime);
    setInstructions(routine.instructions || '');
    setActive(routine.active);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      pushToast('error', 'Routine title is required.');
      return;
    }
    setSubmitting(true);
    try {
      if (editingRoutine) {
        await updateCareRoutine(activeCircle.id, editingRoutine.id, {
          title: title.trim(),
          category,
          targetTime,
          instructions,
          active,
        });
        pushToast('success', 'Routine updated.');
      } else {
        await createCareRoutine({
          circleId: activeCircle.id,
          memberIds: activeCircle.memberIds,
          createdByUid: firebaseUser.uid,
          createdByName: profile.displayName,
          actorRole: resolvedActorRole,
          title: title.trim(),
          category,
          targetTime,
          instructions,
        });
        pushToast('success', 'Daily care routine added.');
      }
      setModalOpen(false);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (routine: CareRoutine) => {
    const existingLog = routineLogs.find(
      (l) => l.routineId === routine.id && l.dateKey === selectedDate,
    );
    const nextCompleted = !(existingLog?.completed ?? false);
    try {
      await toggleRoutineCompletion({
        circleId: activeCircle.id,
        memberIds: activeCircle.memberIds,
        routine,
        existingLog,
        dateKey: selectedDate,
        completed: nextCompleted,
        uid: firebaseUser.uid,
        userName: profile.displayName,
        actorRole: resolvedActorRole,
      });
    } catch (error) {
      pushToast('error', parseReadableError(error));
    }
  };

  const handleDelete = async (routine: CareRoutine) => {
    try {
      await deleteCareRoutine(activeCircle.id, routine.id);
      pushToast('info', 'Routine deleted.');
    } catch (error) {
      pushToast('error', parseReadableError(error));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#1F2937]">Daily Care Routines</h1>
          <p className="mt-0.5 text-sm text-[#6B7280]">
            Track hydration, gentle mobility, nutrition, and therapy habits for {activeCircle.patientName}.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#065F46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#047857] whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Add Routine</span>
        </button>
      </div>

      <section className="rounded-xl border border-[#E5E7EB] bg-white">
        <div className="flex flex-col justify-between gap-3 border-b border-[#E5E7EB] px-6 py-4 md:flex-row md:items-center">
          <div className="inline-flex flex-wrap rounded-lg bg-[#F3F4F6] p-1">
            {(['all', 'hydration', 'mobility', 'nutrition', 'sleep', 'hygiene', 'therapy'] as const).map(
              (cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    categoryFilter === cat
                      ? 'bg-white text-[#064E3B] shadow-sm'
                      : 'text-[#6B7280] hover:text-[#1F2937]'
                  }`}
                >
                  {cat === 'all' ? 'All' : CATEGORY_LABELS[cat]}
                </button>
              ),
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[#6B7280]">Checklist Date:</span>
            <input
              type="date"
              aria-label="Checklist date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-lg border border-[#D1D5DB] px-3 py-1.5 font-mono text-xs text-[#1F2937] focus:border-[#065F46] focus:outline-none"
            />
          </div>
        </div>

        {activeCircleDataLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded bg-[#F3F4F6]" />
            ))}
          </div>
        ) : filteredRoutines.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={ClipboardList}
              title="No care routines in this category"
              description="Add recurring daily wellness tasks so family members and caretakers can confirm completion."
              actionLabel="Add Routine"
              onAction={openCreateModal}
            />
          </div>
        ) : (
          <div className="divide-y divide-[#E5E7EB]">
            {filteredRoutines.map((routine) => {
              const log = routineLogs.find(
                (l) => l.routineId === routine.id && l.dateKey === selectedDate,
              );
              const completed = log?.completed ?? false;

              return (
                <div
                  key={routine.id}
                  className="flex flex-col justify-between gap-3 px-6 py-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-xs font-semibold text-[#065F46] tabular-nums">
                        {formatTime12h(routine.targetTime)}
                      </span>
                      <span className="text-sm font-semibold text-[#1F2937]">{routine.title}</span>
                      <span className="text-xs text-[#6B7280]">
                        · {CATEGORY_LABELS[routine.category]}
                      </span>
                      {!routine.active && <StatusText variant="neutral" label="Paused" />}
                    </div>
                    {routine.instructions && (
                      <p className="mt-1 text-xs text-[#6B7280]">{routine.instructions}</p>
                    )}
                    {completed && log && (
                      <p className="mt-1 text-xs text-[#15803D]">
                        Completed on {formatDateDisplay(selectedDate)} by {log.completedByName}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {routine.active && (
                      <button
                        type="button"
                        onClick={() => handleToggle(routine)}
                        className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                          completed
                            ? 'border-[#065F46]/30 bg-[#ECFDF5] text-[#065F46]'
                            : 'border-[#D1D5DB] bg-white text-[#1F2937] hover:bg-[#F3F4F6]'
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>{completed ? 'Completed' : 'Mark Done'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEditModal(routine)}
                      aria-label={`Edit ${routine.title}`}
                      className="rounded-lg p-2 text-[#4B5563] hover:bg-[#F3F4F6]"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(routine)}
                      aria-label={`Delete ${routine.title}`}
                      className="rounded-lg p-2 text-[#6B7280] hover:bg-red-50 hover:text-[#B91C1C]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRoutine ? 'Edit Care Routine' : 'Add Daily Care Routine'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label htmlFor="rout-title" className="block text-sm font-medium text-[#1F2937]">
              Routine Title *
            </label>
            <input
              id="rout-title"
              type="text"
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Afternoon Hydration Check (12 oz)"
              className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="rout-cat" className="block text-sm font-medium text-[#1F2937]">
                Category
              </label>
              <select
                id="rout-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value as RoutineCategory)}
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              >
                <option value="hydration">Hydration</option>
                <option value="mobility">Mobility</option>
                <option value="nutrition">Nutrition</option>
                <option value="sleep">Sleep</option>
                <option value="hygiene">Hygiene</option>
                <option value="therapy">Therapy</option>
              </select>
            </div>
            <div>
              <label htmlFor="rout-time" className="block text-sm font-medium text-[#1F2937]">
                Target Time *
              </label>
              <input
                id="rout-time"
                type="time"
                required
                value={targetTime}
                onChange={(e) => setTargetTime(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 font-mono text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="rout-inst" className="block text-sm font-medium text-[#1F2937]">
              Caregiver / Patient Instructions
            </label>
            <textarea
              id="rout-inst"
              rows={2}
              maxLength={400}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Helpful reminders for completing this routine safely..."
              className="mt-1 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
            />
          </div>

          {editingRoutine && (
            <label className="flex items-center gap-2.5 text-sm text-[#1F2937]">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 rounded border-[#D1D5DB] text-[#065F46]"
              />
              <span>Routine active on daily schedule</span>
            </label>
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
              {submitting ? 'Saving...' : editingRoutine ? 'Save Routine' : 'Add Routine'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
