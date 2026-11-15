import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryAction?: React.ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-[#E5E7EB] bg-white px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#065F46]">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="font-display text-base font-semibold text-[#1F2937]">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-[#6B7280]">{description}</p>
      {(actionLabel && onAction) || secondaryAction ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-[#065F46] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#047857] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#065F46] whitespace-nowrap shrink-0"
            >
              {actionLabel}
            </button>
          )}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
