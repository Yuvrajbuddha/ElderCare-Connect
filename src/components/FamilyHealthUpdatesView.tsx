import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  FileHeart,
  Lock,
  MessageSquare,
  Search,
  Send,
} from 'lucide-react';
import { useCare } from '../context/CareContext';
import {
  formatDateDisplay,
  formatTime12h,
  formatTimestampRelative,
  parseReadableError,
} from '../lib/utils';
import {
  markAllNotificationsRead,
  markNotificationRead,
  sendCareMessage,
} from '../services/careService';
import type { CareNotification, MessageCategory } from '../types/healthcare';
import { HealthRecordsView } from './HealthRecordsView';
import { StatusText } from './ui/StatusText';

type UpdatesTab = 'updates' | 'records' | 'history';
type NotifCategory =
  | 'all'
  | 'med_missed'
  | 'med_taken'
  | 'appt_approaching'
  | 'appt_completed'
  | 'health_update'
  | 'caretaker_activity';

export function FamilyHealthUpdatesView() {
  const {
    activeCircle,
    firebaseUser,
    profile,
    currentMember,
    can,
    medications,
    medicationLogs,
    appointments,
    healthRecords,
    messages,
    notifications,
    unreadNotificationCount,
    members,
    pushToast,
  } = useCare();

  const [tab, setTab] = useState<UpdatesTab>('updates');
  const [notifFilter, setNotifFilter] = useState<NotifCategory>('all');
  const [markingAll, setMarkingAll] = useState(false);

  // Notes composer
  const [noteBody, setNoteBody] = useState('');
  const [noteCategory, setNoteCategory] = useState<MessageCategory>('update');
  const [noteUrgent, setNoteUrgent] = useState(false);
  const [sendingNote, setSendingNote] = useState(false);

  // History filter
  const [historyFilter, setHistoryFilter] = useState<'all' | 'taken' | 'missed' | 'skipped'>('all');
  const [historySearch, setHistorySearch] = useState('');

  const canViewHealth = can('viewHealthInfo');
  const canViewMeds = can('viewMedications');
  const canViewAppts = can('manageAppointments') || canViewHealth;

  const caretakerMembers = useMemo(
    () => members.filter((m) => m.memberRole === 'caretaker'),
    [members],
  );

  const notificationItems = useMemo(() => {
    const uid = firebaseUser?.uid ?? '';
    const mapCategory = (n: CareNotification): { cat: NotifCategory; label: string } => {
      const t = `${n.title} ${n.detail}`.toLowerCase();
      if (n.eventType === 'medication') {
        if (t.includes('skip') || t.includes('miss') || t.includes('overdue') || t.includes('refill')) {
          return { cat: 'med_missed', label: 'Medicine Missed' };
        }
        return { cat: 'med_taken', label: 'Medicine Taken' };
      }
      if (n.eventType === 'appointment') {
        if (t.includes('complet')) return { cat: 'appt_completed', label: 'Visit Done' };
        return { cat: 'appt_approaching', label: 'Upcoming Visit' };
      }
      if (n.eventType === 'message') {
        const fromCaretaker = caretakerMembers.some((c) => c.uid === n.createdByUid);
        return fromCaretaker
          ? { cat: 'caretaker_activity', label: 'Caretaker Update' }
          : { cat: 'health_update', label: 'Care Update' };
      }
      return { cat: 'health_update', label: 'Health Update' };
    };

    return notifications
      .filter((n) => {
        if (n.eventType === 'medication' && !canViewMeds) return false;
        if (n.eventType === 'record' && !canViewHealth) return false;
        if (n.eventType === 'appointment' && !canViewAppts) return false;
        return true;
      })
      .map((n) => {
        const mapped = mapCategory(n);
        return {
          ...n,
          category: mapped.cat,
          categoryLabel: mapped.label,
          isRead: n.readByUids.includes(uid),
        };
      });
  }, [notifications, firebaseUser?.uid, caretakerMembers, canViewMeds, canViewHealth, canViewAppts]);

  const visibleNotifs = useMemo(() => {
    if (notifFilter === 'all') return notificationItems;
    return notificationItems.filter((n) => n.category === notifFilter);
  }, [notificationItems, notifFilter]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return [...medicationLogs]
      .filter((log) => {
        if (historyFilter !== 'all' && log.status !== historyFilter) return false;
        if (!q) return true;
        return (
          log.medicationName.toLowerCase().includes(q) ||
          log.loggedByName.toLowerCase().includes(q) ||
          (log.notes ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const dateCmp = b.dateKey.localeCompare(a.dateKey);
        return dateCmp !== 0 ? dateCmp : b.scheduledTime.localeCompare(a.scheduledTime);
      });
  }, [medicationLogs, historyFilter, historySearch]);

  if (!activeCircle || !firebaseUser || !profile) return null;

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead(activeCircle.id, notifications, firebaseUser.uid);
      pushToast('success', 'All alerts marked as read.');
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setMarkingAll(false);
    }
  };

  const handleMarkOneRead = async (n: CareNotification) => {
    try {
      await markNotificationRead(activeCircle.id, n, firebaseUser.uid);
    } catch (error) {
      pushToast('error', parseReadableError(error));
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
        senderRole: currentMember?.memberRole ?? 'family',
        category: noteCategory,
        body: noteBody.trim(),
        urgent: noteUrgent,
      });
      setNoteBody('');
      setNoteUrgent(false);
      pushToast('success', 'Note shared with care team.');
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
            Health Updates for {activeCircle.patientName}
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Alerts, family notes, health records, and medicine history in one place.
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-[#E5E7EB] bg-white p-1">
          {[
            { id: 'updates' as const, label: 'Alerts & Notes' },
            { id: 'records' as const, label: 'Health Records' },
            { id: 'history' as const, label: 'Medicine History' },
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

      {/* TAB 1: ALERTS & NOTES */}
      {tab === 'updates' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Alerts */}
          <section className="rounded-2xl border border-[#E5E7EB] bg-white lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] px-6 py-4">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-[#065F46]" />
                <h2 className="font-display text-base font-semibold text-[#1F2937]">
                  Care Alerts ({unreadNotificationCount} unread)
                </h2>
              </div>
              {unreadNotificationCount > 0 && (
                <button
                  type="button"
                  disabled={markingAll}
                  onClick={handleMarkAllRead}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[#D1D5DB] px-3 text-xs font-semibold text-[#065F46] hover:bg-[#ECFDF5]"
                >
                  <CheckCheck className="h-4 w-4" />
                  <span>Mark all read</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5 border-b border-[#E5E7EB] bg-[#F9FAFB] px-6 py-3">
              {[
                { key: 'all' as const, label: 'All' },
                { key: 'med_missed' as const, label: 'Missed Dose' },
                { key: 'med_taken' as const, label: 'Taken' },
                { key: 'appt_approaching' as const, label: 'Upcoming Visit' },
                { key: 'appt_completed' as const, label: 'Visit Done' },
                { key: 'health_update' as const, label: 'Health Update' },
                { key: 'caretaker_activity' as const, label: 'Caretaker' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setNotifFilter(item.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    notifFilter === item.key
                      ? 'bg-[#065F46] text-white'
                      : 'border border-[#E5E7EB] bg-white text-[#4B5563] hover:bg-[#F3F4F6]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="max-h-[480px] overflow-y-auto divide-y divide-[#E5E7EB]">
              {visibleNotifs.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-[#6B7280]">
                  No alerts in this category yet.
                </div>
              ) : (
                visibleNotifs.slice(0, 20).map((n) => (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 px-6 py-4 ${
                      n.isRead ? 'bg-white' : 'bg-[#ECFDF5]/45'
                    }`}
                  >
                    {n.severity === 'urgent' ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B91C1C]" />
                    ) : n.severity === 'warning' ? (
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]" />
                    ) : (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0D9488]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-[#1F2937]">{n.title}</p>
                        {!n.isRead && (
                          <button
                            type="button"
                            onClick={() => handleMarkOneRead(n)}
                            className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-[#065F46] hover:bg-[#D1FAE5]"
                          >
                            Mark Read
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-[#4B5563]">{n.detail}</p>
                      <p className="mt-1 text-xs text-[#6B7280]">
                        {n.categoryLabel} · {formatTimestampRelative(n.createdAt)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Right: Family & Caretaker Notes */}
          <section className="rounded-2xl border border-[#E5E7EB] bg-white lg:col-span-5">
            <div className="flex items-center gap-2 border-b border-[#E5E7EB] px-6 py-4">
              <MessageSquare className="h-5 w-5 text-[#065F46]" />
              <h2 className="font-display text-base font-semibold text-[#1F2937]">
                Family &amp; Caretaker Notes
              </h2>
            </div>

            <form onSubmit={handleSendNote} className="space-y-3 border-b border-[#E5E7EB] p-6">
              <div className="flex items-center justify-between gap-2">
                <select
                  aria-label="Note type"
                  value={noteCategory}
                  onChange={(e) => setNoteCategory(e.target.value as MessageCategory)}
                  className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-xs font-semibold text-[#1F2937]"
                >
                  <option value="update">Family Update</option>
                  <option value="question">Question for Caretaker</option>
                  <option value="routine_note">Care Note</option>
                  <option value="alert">Urgent Alert</option>
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
                rows={3}
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder={`Write a message for ${activeCircle.patientName} or the caretaker...`}
                className="w-full rounded-xl border border-[#D1D5DB] p-3 text-sm focus:border-[#065F46] focus:outline-none"
              />
              <button
                type="submit"
                disabled={sendingNote || !noteBody.trim()}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#065F46] px-4 text-sm font-semibold text-white hover:bg-[#047857] disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                <span>{sendingNote ? 'Sending...' : 'Send Note'}</span>
              </button>
            </form>

            <div className="max-h-[300px] overflow-y-auto divide-y divide-[#E5E7EB]">
              {messages.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-[#6B7280]">No notes posted yet.</div>
              ) : (
                messages.slice(0, 12).map((msg) => (
                  <div key={msg.id} className={`px-6 py-3.5 ${msg.urgent ? 'bg-red-50/50' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[#1F2937]">
                        {msg.senderName}{' '}
                        <span className="text-xs font-normal capitalize text-[#6B7280]">
                          ({msg.senderRole})
                        </span>
                      </p>
                      <span className="text-xs text-[#6B7280]">
                        {formatTimestampRelative(msg.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[#374151]">{msg.body}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: HEALTH RECORDS */}
      {tab === 'records' && <HealthRecordsView />}

      {/* TAB 3: MEDICINE HISTORY */}
      {tab === 'history' && (
        <section className="rounded-2xl border border-[#E5E7EB] bg-white">
          <div className="flex flex-col justify-between gap-3 border-b border-[#E5E7EB] px-6 py-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <FileHeart className="h-5 w-5 text-[#065F46]" />
              <h2 className="font-display text-base font-semibold text-[#1F2937]">
                Medicine Dose History
              </h2>
            </div>

            {canViewMeds && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-lg bg-[#F3F4F6] p-1">
                  {(['all', 'taken', 'missed', 'skipped'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setHistoryFilter(f)}
                      className={`rounded-md px-3 py-1 text-xs font-semibold capitalize ${
                        historyFilter === f ? 'bg-white text-[#065F46] shadow-sm' : 'text-[#6B7280]'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-[#9CA3AF]" />
                  <input
                    type="search"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Search medicine or person..."
                    className="rounded-lg border border-[#D1D5DB] py-1.5 pr-3 pl-9 text-sm focus:border-[#065F46] focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {!canViewMeds ? (
            <div className="px-6 py-12 text-center">
              <Lock className="mx-auto h-7 w-7 text-[#6B7280]" />
              <p className="mt-2 text-base font-semibold text-[#1F2937]">Medicine History Restricted</p>
              <p className="mt-1 text-sm text-[#6B7280]">
                {activeCircle.patientName} has not shared medicine schedule access with you yet.
              </p>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-[#6B7280]">
              No dose logs match your search yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-xs font-semibold text-[#6B7280]">
                  <tr>
                    <th className="px-6 py-3">Date &amp; Time</th>
                    <th className="px-4 py-3">Medicine</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-6 py-3">Recorded By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {filteredHistory.slice(0, 30).map((log) => (
                    <tr key={log.id} className="hover:bg-[#F9FAFB]">
                      <td className="px-6 py-3.5 font-mono text-xs text-[#4B5563] whitespace-nowrap">
                        {formatDateDisplay(log.dateKey)} · {formatTime12h(log.scheduledTime)}
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-[#1F2937]">
                          {log.medicationName} <span className="font-normal text-[#6B7280]">({log.dosage})</span>
                        </p>
                        {log.notes && <p className="text-xs text-[#6B7280]">{log.notes}</p>}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusText
                          variant={
                            log.status === 'taken'
                              ? 'success'
                              : log.status === 'missed' || log.status === 'skipped'
                                ? 'danger'
                                : 'neutral'
                          }
                          label={
                            log.status === 'taken'
                              ? 'Taken'
                              : log.status === 'missed'
                                ? 'Missed'
                                : log.status === 'skipped'
                                  ? 'Skipped'
                                  : 'Pending'
                          }
                        />
                      </td>
                      <td className="px-6 py-3.5 text-[#374151]">{log.loggedByName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
