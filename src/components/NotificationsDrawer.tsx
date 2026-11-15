import { AlertTriangle, Bell, Check, CheckCheck, Info, X } from 'lucide-react';
import { useCare } from '../context/CareContext';
import { formatTimestampRelative, parseReadableError } from '../lib/utils';
import { markAllNotificationsRead, markNotificationRead } from '../services/careService';

interface NotificationsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationsDrawer({ open, onClose }: NotificationsDrawerProps) {
  const { activeCircle, firebaseUser, notifications, unreadNotificationCount, pushToast } = useCare();

  if (!open) return null;

  const handleMarkAll = async () => {
    if (!activeCircle || !firebaseUser) return;
    try {
      await markAllNotificationsRead(activeCircle.id, notifications, firebaseUser.uid);
      pushToast('success', 'All notifications marked as read.');
    } catch (error) {
      pushToast('error', parseReadableError(error));
    }
  };

  const handleMarkOne = async (id: string) => {
    if (!activeCircle || !firebaseUser) return;
    const target = notifications.find((n) => n.id === id);
    if (!target) return;
    try {
      await markNotificationRead(activeCircle.id, target, firebaseUser.uid);
    } catch (error) {
      pushToast('error', parseReadableError(error));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35" onClick={onClose}>
      <aside
        aria-label="Care notifications"
        className="flex h-full w-full max-w-md flex-col border-l border-[#E5E7EB] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
          <div>
            <h2 className="font-display text-base font-semibold text-[#1F2937]">Care Notifications</h2>
            <p className="text-xs text-[#6B7280] tabular-nums">
              {unreadNotificationCount} unread · {notifications.length} total
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unreadNotificationCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E7EB] px-2.5 py-1.5 text-xs font-medium text-[#065F46] hover:bg-[#ECFDF5]"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Mark all read</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#6B7280] hover:bg-[#F3F4F6]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[#E5E7EB]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <Bell className="mb-3 h-8 w-8 text-[#9CA3AF]" />
              <p className="font-display text-sm font-semibold text-[#1F2937]">No alerts yet</p>
              <p className="mt-1 text-xs text-[#6B7280]">
                Skipped doses, refill warnings, urgent care messages, and appointment updates will appear here.
              </p>
            </div>
          ) : (
            notifications.map((notif) => {
              const isRead = firebaseUser ? notif.readByUids.includes(firebaseUser.uid) : true;
              const Icon =
                notif.severity === 'urgent' || notif.severity === 'warning' ? AlertTriangle : Info;
              const iconClass =
                notif.severity === 'urgent'
                  ? 'text-[#B91C1C]'
                  : notif.severity === 'warning'
                    ? 'text-[#B45309]'
                    : 'text-[#0D9488]';

              return (
                <div
                  key={notif.id}
                  className={`flex items-start gap-3 px-5 py-4 transition-colors ${
                    isRead ? 'bg-white' : 'bg-[#ECFDF5]/45'
                  }`}
                >
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconClass}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-[#1F2937]">{notif.title}</p>
                      {!isRead && (
                        <button
                          type="button"
                          onClick={() => handleMarkOne(notif.id)}
                          title="Mark as read"
                          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-[#065F46] hover:bg-[#D1FAE5]"
                        >
                          <Check className="h-3 w-3" />
                          <span>Read</span>
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[#4B5563]">{notif.detail}</p>
                    <p className="mt-1.5 text-[11px] text-[#6B7280]">
                      {notif.eventType} · {formatTimestampRelative(notif.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}
