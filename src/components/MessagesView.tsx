import React, { useMemo, useState } from 'react';
import { AlertTriangle, MessageSquare, Send, Trash2 } from 'lucide-react';
import { useCare } from '../context/CareContext';
import { formatTimestampRelative, parseReadableError } from '../lib/utils';
import { deleteCareMessage, sendCareMessage } from '../services/careService';
import type { CareMessage, MessageCategory } from '../types/healthcare';
import { EmptyState } from './ui/EmptyState';
import { StatusText } from './ui/StatusText';

const CATEGORY_LABELS: Record<MessageCategory, string> = {
  update: 'Shift Update',
  alert: 'Care Alert',
  question: 'Question',
  routine_note: 'Routine Note',
};

export function MessagesView() {
  const {
    activeCircle,
    activeCircleDataLoading,
    firebaseUser,
    profile,
    currentMember,
    messages,
    pushToast,
  } = useCare();

  const [categoryFilter, setCategoryFilter] = useState<'all' | MessageCategory>('all');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<MessageCategory>('update');
  const [urgent, setUrgent] = useState(false);
  const [sending, setSending] = useState(false);

  const filteredMessages = useMemo(() => {
    return messages.filter((m) => categoryFilter === 'all' || m.category === categoryFilter);
  }, [messages, categoryFilter]);

  if (!activeCircle || !firebaseUser || !profile) return null;

  const isOwner = activeCircle.ownerId === firebaseUser.uid;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) {
      pushToast('error', 'Please write a message before sending.');
      return;
    }
    setSending(true);
    try {
      await sendCareMessage({
        circleId: activeCircle.id,
        memberIds: activeCircle.memberIds,
        senderUid: firebaseUser.uid,
        senderName: profile.displayName,
        senderRole: currentMember?.memberRole ?? 'family',
        category,
        body: body.trim(),
        urgent,
      });
      setBody('');
      setUrgent(false);
      pushToast('success', urgent ? 'Urgent care note posted and circle notified.' : 'Care note posted.');
    } catch (error) {
      pushToast('error', parseReadableError(error));
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (msg: CareMessage) => {
    try {
      await deleteCareMessage(activeCircle.id, msg.id);
      pushToast('info', 'Message removed.');
    } catch (error) {
      pushToast('error', parseReadableError(error));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#1F2937]">Care Team Communication</h1>
        <p className="mt-0.5 text-sm text-[#6B7280]">
          Real-time shift handoffs, family check-ins, and urgent alerts for {activeCircle.patientName}&apos;s Care
          Circle.
        </p>
      </div>

      {/* Composer */}
      <section className="rounded-xl border border-[#E5E7EB] bg-white p-6">
        <form onSubmit={handleSend} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="msg-cat" className="text-xs font-medium text-[#4B5563]">
                Note Type:
              </label>
              <select
                id="msg-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value as MessageCategory)}
                className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-1.5 text-xs font-medium text-[#1F2937] focus:border-[#065F46] focus:outline-none"
              >
                <option value="update">Shift Update</option>
                <option value="routine_note">Routine Note</option>
                <option value="question">Question</option>
                <option value="alert">Care Alert</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-xs font-medium text-[#1F2937]">
              <input
                type="checkbox"
                checked={urgent}
                onChange={(e) => setUrgent(e.target.checked)}
                className="h-4 w-4 rounded border-[#D1D5DB] text-[#065F46]"
              />
              <span>Mark urgent (sends notification to all circle members)</span>
            </label>
          </div>

          <textarea
            rows={3}
            required
            maxLength={1500}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share a shift handoff, appetite/sleep note, pharmacy pickup update, or question..."
            className="w-full rounded-lg border border-[#D1D5DB] px-3.5 py-2.5 text-sm text-[#1F2937] focus:border-[#065F46] focus:outline-none"
          />

          <div className="flex items-center justify-between">
            <span className="text-xs text-[#6B7280] tabular-nums">{body.length} / 1500 characters</span>
            <button
              type="submit"
              disabled={sending}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#065F46] px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#047857] disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{sending ? 'Posting...' : 'Post to Care Circle'}</span>
            </button>
          </div>
        </form>
      </section>

      {/* Feed */}
      <section className="rounded-xl border border-[#E5E7EB] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] px-6 py-4">
          <div className="inline-flex flex-wrap rounded-lg bg-[#F3F4F6] p-1">
            {(['all', 'update', 'routine_note', 'question', 'alert'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setCategoryFilter(tab)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  categoryFilter === tab
                    ? 'bg-white text-[#064E3B] shadow-sm'
                    : 'text-[#6B7280] hover:text-[#1F2937]'
                }`}
              >
                {tab === 'all' ? 'All Notes' : CATEGORY_LABELS[tab]}
              </button>
            ))}
          </div>
          <span className="text-xs text-[#6B7280] tabular-nums">{filteredMessages.length} messages</span>
        </div>

        {activeCircleDataLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded bg-[#F3F4F6]" />
            ))}
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={MessageSquare}
              title="No care messages yet"
              description="Keep family members and caretakers informed with clear, timestamped updates above."
            />
          </div>
        ) : (
          <div className="divide-y divide-[#E5E7EB]">
            {filteredMessages.map((msg) => {
              const canDelete = msg.senderUid === firebaseUser.uid || isOwner;
              return (
                <div
                  key={msg.id}
                  className={`px-6 py-4 ${msg.urgent ? 'bg-red-50/35' : 'bg-white'}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                      <span className="font-display text-sm font-semibold text-[#1F2937]">
                        {msg.senderName}
                      </span>
                      <span className="capitalize text-[#6B7280]">{msg.senderRole}</span>
                      <span aria-hidden="true" className="text-[#9CA3AF]">
                        ·
                      </span>
                      <span className="text-[#065F46] font-medium">{CATEGORY_LABELS[msg.category]}</span>
                      <span aria-hidden="true" className="text-[#9CA3AF]">
                        ·
                      </span>
                      <span className="text-[#6B7280]">{formatTimestampRelative(msg.createdAt)}</span>
                      {msg.urgent && (
                        <span className="inline-flex items-center gap-1 font-semibold text-[#B91C1C]">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <span>Urgent</span>
                        </span>
                      )}
                    </div>

                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(msg)}
                        aria-label="Delete message"
                        className="rounded-lg p-1.5 text-[#9CA3AF] hover:bg-red-50 hover:text-[#B91C1C]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[#374151]">
                    {msg.body}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
