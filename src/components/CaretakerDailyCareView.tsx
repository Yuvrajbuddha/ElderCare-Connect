import React, { useMemo, useState } from 'react';
import {
  Activity,
  Check,
  ClipboardCheck,
  ClipboardList,
  Mail,
  MessageSquare,
  Plus,
  Send,
  Trash2,
  Users,
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
  createCareTask,
  deleteCareTask,
  sendCareMessage,
  updateCareTaskStatus,
} from '../services/careService';
import type {
  CareTask,
  CareTaskCategory,
  CareTaskPriority,
  CareTaskStatus,
  MessageCategory,
} from '../types/healthcare';
import { RoutinesView } from './RoutinesView';
import { Modal } from './ui/Modal';
import { StatusText } from './ui/StatusText';

type DailyCareTab = 'tasks' | 'routines' | 'notes';

const TASK_CATEGORIES: Array<{ value: CareTaskCategory; label: string }> = [
  { value: 'vitals', label: 'Vitals Check' },
  { value: 'medication_prep', label: 'Medicine Prep' },
  { value: 'nutrition', label: 'Meals & Water' },
  { value: 'mobility', label: 'Walk & Exercise' },
  { value: 'hygiene', label: 'Personal Care' },
  { value: 'observation', label: 'Health Check' },
  { value: 'errand', label: 'Pharmacy / Errand' },
  { value: 'other', label: 'Other' },
];

export function CaretakerDailyCareView() {
  const {
    activeCircle,
    firebaseUser,
    profile,
    currentMember,
    members,
    tasks,
    messages,
    activityLogs,
    pushToast,
  } = useCare();

  const todayKey = getTodayKey();
  const [tab, setTab] = useState<DailyCareTab>('tasks');

  // Task state
  const [taskFilter, setTaskFilter] = useState<'pending' | 'completed' | 'all'>('pending');
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<CareTask | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskCategory, setTaskCategory] = useState<CareTaskCategory>('vitals');
  const [taskDueDate, setTaskDueDate] = useState(todayKey);
  const [taskDueTime, setTaskDueTime] = useState('10:00');
  const [taskPriority, setTaskPriority] = useState<CareTaskPriority>('normal');
  const [taskNotes, setTaskNotes] = useState('');
  const [savingTask, setSavingTask] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  // Notes & family contact state
  const [noteCategory, setNoteCategory] = useState<MessageCategory>('routine_note');
  const [noteBody, setNoteBody] = useState('');
  const [noteUrgent, setNoteUrgent] = useState(false);
  const [sendingNote, setSendingNote] = useState(false);

  const visibleTasks = useMemo(() => {
    const filtered = tasks.filter((t) => {
      if (taskFilter === 'pending') return t.status !== 'completed';
      if (taskFilter === 'completed') return t.status === 'completed';
      return true;
    });
    const weight: Record<CareTaskPriority, number> = { urgent: 0, high: 1, normal: 2 };
    return [...filtered].sort((a, b) => {
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;
      const pDiff = weight[a.priority] - weight[b.priority];
      if (pDiff !== 0) return pDiff;
      return `${a.dueDate} ${a.dueTime}`.localeCompare(`${b.dueDate} ${b.dueTime}`);
    });
  }, [tasks, taskFilter]);

  const familyContacts = useMemo(
    () => members.filter((m) => m.memberRole === 'family'),
    [members],
  );

  if (!activeCircle || !firebaseUser || !profile) return null;

  const actorRole = currentMember?.memberRole ?? 'caretaker';

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    setSavingTask(true);
    try {
      await createCareTask({
        circleId: activeCircle.id,
        memberIds: activeCircle.memberIds,
        title: taskTitle.trim(),
        category: taskCategory,
        dueDate: taskDueDate,
        dueTime: taskDueTime,
        priority: taskPriority,
        notes: taskNotes.trim(),
        assignedToUid: firebaseUser.uid,
        assignedToName: profile.displayName,
        createdByUid: firebaseUser.uid,
        createdByName: profile.displayName,
        actorRole,
      });
      pushToast('success', 'Task added.');
      setTaskTitle('');
      setTaskNotes('');
      setTaskPriority('normal');
      setTaskModalOpen(false);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setSavingTask(false);
    }
  };

  const handleTaskStatus = async (task: CareTask, nextStatus: CareTaskStatus) => {
    setBusyTaskId(task.id);
    try {
      await updateCareTaskStatus({
        circleId: activeCircle.id,
        memberIds: activeCircle.memberIds,
        task,
        nextStatus,
        actorUid: firebaseUser.uid,
        actorName: profile.displayName,
        actorRole,
      });
      pushToast('success', nextStatus === 'completed' ? 'Task completed.' : 'Task updated.');
      setDetailTask(null);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleDeleteTask = async (task: CareTask) => {
    setBusyTaskId(task.id);
    try {
      await deleteCareTask({
        circleId: activeCircle.id,
        memberIds: activeCircle.memberIds,
        taskId: task.id,
        taskTitle: task.title,
        actorUid: firebaseUser.uid,
        actorName: profile.displayName,
        actorRole,
      });
      pushToast('info', 'Task removed.');
      setDetailTask(null);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleSendNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteBody.trim()) return;
    setSendingNote(true);
    try {
      await sendCareMessage({
        circleId: activeCircle.id,
        memberIds: activeCircle.memberIds,
        senderUid: firebaseUser.uid,
        senderName: profile.displayName,
        senderRole: actorRole,
        category: noteCategory,
        body: noteBody.trim(),
        urgent: noteUrgent,
      });
      pushToast('success', 'Care note sent.');
      setNoteBody('');
      setNoteUrgent(false);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setSendingNote(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#1F2937]">
            Daily Care for {activeCircle.patientName}
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Track daily tasks, routines, care notes, and activity logs.
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-[#E5E7EB] bg-white p-1">
          {[
            { id: 'tasks' as const, label: 'Daily Tasks' },
            { id: 'routines' as const, label: 'Routines' },
            { id: 'notes' as const, label: 'Notes & History' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`min-h-[40px] rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                tab === item.id
                  ? 'bg-[#065F46] text-white'
                  : 'text-[#4B5563] hover:bg-[#F3F4F6] hover:text-[#1F2937]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: DAILY TASKS */}
      {tab === 'tasks' && (
        <section className="rounded-2xl border border-[#E5E7EB] bg-white">
          <div className="flex flex-col justify-between gap-3 border-b border-[#E5E7EB] px-6 py-4 sm:flex-row sm:items-center">
            <div className="inline-flex rounded-lg bg-[#F3F4F6] p-1">
              {(['pending', 'completed', 'all'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setTaskFilter(f)}
                  className={`min-h-[36px] rounded-md px-3 text-xs font-semibold capitalize ${
                    taskFilter === f ? 'bg-white text-[#065F46] shadow-sm' : 'text-[#6B7280]'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setTaskModalOpen(true)}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#065F46] px-4 text-sm font-semibold text-white hover:bg-[#047857]"
            >
              <Plus className="h-4 w-4" />
              <span>Add Task</span>
            </button>
          </div>

          {visibleTasks.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <ClipboardCheck className="mx-auto h-8 w-8 text-[#065F46]" />
              <p className="mt-2 text-base font-semibold text-[#1F2937]">No {taskFilter} tasks</p>
              <p className="mt-1 text-sm text-[#6B7280]">Add a task to organize today&apos;s care.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#E5E7EB]">
              {visibleTasks.map((task) => {
                const isDone = task.status === 'completed';
                const isBusy = busyTaskId === task.id;
                return (
                  <div
                    key={task.id}
                    className="flex flex-col justify-between gap-3 px-6 py-4 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className={`text-base font-semibold ${
                            isDone ? 'line-through text-[#6B7280]' : 'text-[#1F2937]'
                          }`}
                        >
                          {task.title}
                        </p>
                        <StatusText
                          variant={
                            isDone ? 'success' : task.priority === 'urgent' ? 'danger' : 'neutral'
                          }
                          label={isDone ? 'Done' : task.priority === 'urgent' ? 'Urgent' : 'Pending'}
                        />
                      </div>
                      <p className="mt-1 text-sm text-[#6B7280]">
                        {formatDateDisplay(task.dueDate)} · {formatTime12h(task.dueTime)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!isDone ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleTaskStatus(task, 'completed')}
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#065F46] px-4 text-sm font-semibold text-white hover:bg-[#047857] disabled:opacity-60"
                        >
                          <Check className="h-4 w-4" />
                          <span>Complete</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDetailTask(task)}
                          className="min-h-[44px] rounded-xl border border-[#D1D5DB] bg-white px-4 text-sm font-medium text-[#374151] hover:bg-[#F3F4F6]"
                        >
                          View Details
                        </button>
                      )}
                      {!isDone && (
                        <button
                          type="button"
                          onClick={() => setDetailTask(task)}
                          className="min-h-[44px] rounded-xl border border-[#D1D5DB] bg-white px-4 text-sm font-medium text-[#374151] hover:bg-[#F3F4F6]"
                        >
                          View Details
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* TAB 2: DAILY ROUTINES */}
      {tab === 'routines' && <RoutinesView />}

      {/* TAB 3: NOTES & ACTIVITY AUDIT LOG */}
      {tab === 'notes' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Care Notes */}
            <section className="rounded-2xl border border-[#E5E7EB] bg-white lg:col-span-7">
              <div className="flex items-center gap-2 border-b border-[#E5E7EB] px-6 py-4">
                <MessageSquare className="h-5 w-5 text-[#065F46]" />
                <h2 className="font-display text-base font-semibold text-[#1F2937]">
                  Daily Care Notes
                </h2>
              </div>

              <form onSubmit={handleSendNote} className="space-y-3 border-b border-[#E5E7EB] p-6">
                <div className="flex items-center justify-between gap-2">
                  <select
                    aria-label="Note category"
                    value={noteCategory}
                    onChange={(e) => setNoteCategory(e.target.value as MessageCategory)}
                    className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-xs font-semibold text-[#1F2937]"
                  >
                    <option value="routine_note">Daily Care Note</option>
                    <option value="update">Shift Handoff</option>
                    <option value="question">Question for Family</option>
                    <option value="alert">Care Alert</option>
                  </select>
                  <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#374151]">
                    <input
                      type="checkbox"
                      checked={noteUrgent}
                      onChange={(e) => setNoteUrgent(e.target.checked)}
                      className="h-4 w-4 rounded border-[#D1D5DB] text-[#065F46]"
                    />
                    <span>Urgent</span>
                  </label>
                </div>
                <textarea
                  id="caretaker-note-input"
                  rows={3}
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="Write a quick note about meals, mood, or care updates..."
                  className="w-full rounded-xl border border-[#D1D5DB] p-3 text-sm focus:border-[#065F46] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sendingNote || !noteBody.trim()}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#065F46] px-5 text-sm font-semibold text-white hover:bg-[#047857] disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  <span>{sendingNote ? 'Sending...' : 'Post Care Note'}</span>
                </button>
              </form>

              <div className="max-h-[280px] overflow-y-auto divide-y divide-[#E5E7EB]">
                {messages.length === 0 ? (
                  <div className="px-6 py-8 text-center text-sm text-[#6B7280]">No notes yet.</div>
                ) : (
                  messages.slice(0, 10).map((m) => (
                    <div key={m.id} className="px-6 py-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[#1F2937]">{m.senderName}</p>
                        <span className="text-xs text-[#6B7280]">{formatTimestampRelative(m.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-sm text-[#374151]">{m.body}</p>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Family Contacts */}
            <section className="rounded-2xl border border-[#E5E7EB] bg-white lg:col-span-5">
              <div className="flex items-center gap-2 border-b border-[#E5E7EB] px-6 py-4">
                <Users className="h-5 w-5 text-[#065F46]" />
                <h2 className="font-display text-base font-semibold text-[#1F2937]">
                  Family Contacts
                </h2>
              </div>
              {familyContacts.length === 0 ? (
                <div className="px-6 py-8 text-sm text-[#6B7280]">
                  No family members have joined yet.
                </div>
              ) : (
                <div className="divide-y divide-[#E5E7EB]">
                  {familyContacts.map((fam) => (
                    <div key={fam.uid} className="flex items-center justify-between gap-3 px-6 py-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#1F2937]">{fam.displayName}</p>
                        <p className="truncate text-xs text-[#6B7280]">{fam.relation || 'Family'}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {fam.email && (
                          <a
                            href={`mailto:${fam.email}`}
                            aria-label={`Email ${fam.displayName}`}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#D1D5DB] text-[#374151] hover:bg-[#F3F4F6]"
                          >
                            <Mail className="h-4 w-4" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setNoteCategory('question');
                            setNoteBody(`@${fam.displayName}: `);
                            document.getElementById('caretaker-note-input')?.focus();
                          }}
                          className="min-h-[40px] rounded-xl bg-[#ECFDF5] px-3 text-xs font-semibold text-[#065F46] hover:bg-[#D1FAE5]"
                        >
                          Message
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Care Activity Audit Trail (Preserved full attribution) */}
          <section className="rounded-2xl border border-[#E5E7EB] bg-white">
            <div className="flex items-center gap-2 border-b border-[#E5E7EB] px-6 py-4">
              <Activity className="h-5 w-5 text-[#065F46]" />
              <div>
                <h2 className="font-display text-base font-semibold text-[#1F2937]">
                  Care Activity Log
                </h2>
                <p className="text-xs text-[#6B7280]">
                  Every action is recorded so {activeCircle.patientName} and family can see who completed it.
                </p>
              </div>
            </div>
            {activityLogs.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-[#6B7280]">No activity recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-xs font-semibold text-[#6B7280]">
                    <tr>
                      <th className="px-6 py-3">When</th>
                      <th className="px-4 py-3">Who</th>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-6 py-3">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E7EB]">
                    {activityLogs.slice(0, 20).map((log) => (
                      <tr key={log.id} className="hover:bg-[#F9FAFB]">
                        <td className="px-6 py-3 text-xs text-[#6B7280] whitespace-nowrap">
                          {formatTimestampRelative(log.timestamp)}
                        </td>
                        <td className="px-4 py-3 font-medium text-[#1F2937] whitespace-nowrap">
                          {log.actorName}
                        </td>
                        <td className="px-4 py-3 text-[#065F46] font-medium">{log.action}</td>
                        <td className="px-6 py-3 text-xs text-[#4B5563]">{log.detail || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Add Task Modal */}
      <Modal
        open={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        title="Add Daily Task"
      >
        <form onSubmit={handleCreateTask} className="space-y-4">
          <div>
            <label htmlFor="dc-task-title" className="block text-sm font-semibold text-[#1F2937]">
              Task Name *
            </label>
            <input
              id="dc-task-title"
              type="text"
              required
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="e.g. Check blood pressure before lunch"
              className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 text-sm focus:border-[#065F46] focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="dc-task-cat" className="block text-sm font-semibold text-[#1F2937]">
                Category
              </label>
              <select
                id="dc-task-cat"
                value={taskCategory}
                onChange={(e) => setTaskCategory(e.target.value as CareTaskCategory)}
                className="mt-1 w-full rounded-xl border border-[#D1D5DB] bg-white px-3.5 py-2.5 text-sm focus:border-[#065F46] focus:outline-none"
              >
                {TASK_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="dc-task-pri" className="block text-sm font-semibold text-[#1F2937]">
                Priority
              </label>
              <select
                id="dc-task-pri"
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as CareTaskPriority)}
                className="mt-1 w-full rounded-xl border border-[#D1D5DB] bg-white px-3.5 py-2.5 text-sm focus:border-[#065F46] focus:outline-none"
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="dc-task-date" className="block text-sm font-semibold text-[#1F2937]">
                Date
              </label>
              <input
                id="dc-task-date"
                type="date"
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 font-mono text-sm"
              />
            </div>
            <div>
              <label htmlFor="dc-task-time" className="block text-sm font-semibold text-[#1F2937]">
                Time
              </label>
              <input
                id="dc-task-time"
                type="time"
                value={taskDueTime}
                onChange={(e) => setTaskDueTime(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 font-mono text-sm"
              />
            </div>
          </div>
          <div>
            <label htmlFor="dc-task-notes" className="block text-sm font-semibold text-[#1F2937]">
              Notes
            </label>
            <textarea
              id="dc-task-notes"
              rows={2}
              value={taskNotes}
              onChange={(e) => setTaskNotes(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-3.5 py-2.5 text-sm"
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

      {/* Task Details Modal */}
      <Modal
        open={Boolean(detailTask)}
        onClose={() => setDetailTask(null)}
        title={detailTask?.title || 'Task Details'}
      >
        {detailTask && (
          <div className="space-y-4">
            <div className="space-y-1 text-sm text-[#374151]">
              <p>
                <span className="font-semibold">Scheduled:</span> {formatDateDisplay(detailTask.dueDate)} at{' '}
                {formatTime12h(detailTask.dueTime)}
              </p>
              <p>
                <span className="font-semibold">Status:</span>{' '}
                <span className="capitalize">{detailTask.status.replace('_', ' ')}</span>
              </p>
              {detailTask.notes && (
                <p>
                  <span className="font-semibold">Notes:</span> {detailTask.notes}
                </p>
              )}
            </div>
            <div className="flex flex-wrap justify-between gap-3 border-t border-[#E5E7EB] pt-4">
              <button
                type="button"
                disabled={busyTaskId === detailTask.id}
                onClick={() => handleDeleteTask(detailTask)}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-red-200 px-4 text-sm font-semibold text-[#B91C1C] hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete Task</span>
              </button>
              <div className="flex gap-2">
                {detailTask.status === 'completed' ? (
                  <button
                    type="button"
                    disabled={busyTaskId === detailTask.id}
                    onClick={() => handleTaskStatus(detailTask, 'pending')}
                    className="min-h-[44px] rounded-xl border border-[#D1D5DB] px-4 text-sm font-semibold text-[#374151]"
                  >
                    Reopen Task
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyTaskId === detailTask.id}
                    onClick={() => handleTaskStatus(detailTask, 'completed')}
                    className="min-h-[44px] rounded-xl bg-[#065F46] px-5 text-sm font-semibold text-white hover:bg-[#047857]"
                  >
                    Mark Completed
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
