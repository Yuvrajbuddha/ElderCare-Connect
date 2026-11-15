import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useCare } from '../../context/CareContext';

export function ToastStack() {
  const { toasts, dismissToast } = useCare();
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-2"
    >
      {toasts.map((toast) => {
        const Icon =
          toast.type === 'success'
            ? CheckCircle2
            : toast.type === 'error'
              ? AlertCircle
              : Info;
        const colorClasses =
          toast.type === 'success'
            ? 'border-emerald-200 bg-white text-[#1F2937]'
            : toast.type === 'error'
              ? 'border-red-200 bg-white text-[#1F2937]'
              : 'border-[#E5E7EB] bg-white text-[#1F2937]';
        const iconColor =
          toast.type === 'success'
            ? 'text-emerald-700'
            : toast.type === 'error'
              ? 'text-red-700'
              : 'text-[#0D9488]';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-lg ${colorClasses}`}
          >
            <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconColor}`} />
            <p className="flex-1 text-sm leading-snug">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
              className="rounded p-1 text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#1F2937]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
