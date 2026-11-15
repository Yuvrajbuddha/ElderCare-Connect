import { AlertTriangle, CheckCircle2, Clock, MinusCircle } from 'lucide-react';

interface StatusTextProps {
  variant: 'success' | 'warning' | 'danger' | 'neutral';
  label: string;
}

export function StatusText({ variant, label }: StatusTextProps) {
  const config = {
    success: {
      icon: CheckCircle2,
      className: 'text-[#15803D]',
    },
    warning: {
      icon: Clock,
      className: 'text-[#B45309]',
    },
    danger: {
      icon: AlertTriangle,
      className: 'text-[#B91C1C]',
    },
    neutral: {
      icon: MinusCircle,
      className: 'text-[#6B7280]',
    },
  }[variant];

  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${config.className}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
