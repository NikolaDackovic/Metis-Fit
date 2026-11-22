import { Ban, CheckCircle2, Circle, Clock, MinusCircle, PauseCircle, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from './cn';

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'accent';

const tones: Record<Tone, string> = {
  success: 'text-status-success border-status-success/40 bg-status-success/10',
  warning: 'text-status-warning border-status-warning/40 bg-status-warning/10',
  danger: 'text-status-danger border-status-danger/40 bg-status-danger/10',
  neutral: 'text-text-secondary border-border-strong bg-bg-surface2',
  info: 'text-status-info border-status-info/40 bg-transparent',
  accent: 'text-accent-400 border-accent-500/50 bg-accent-tint',
};

export function Badge({
  tone = 'neutral',
  icon,
  children,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-xs border px-1.5 py-0.5 text-[11px] font-semibold tracking-wide whitespace-nowrap uppercase',
        tones[tone],
      )}
    >
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

export type StatusKey =
  'active' | 'expiring_soon' | 'expired' | 'paused' | 'pending' | 'cancelled' | 'none';

const statusMap: Record<StatusKey, { tone: Tone; Icon: typeof Circle }> = {
  active: { tone: 'success', Icon: CheckCircle2 },
  expiring_soon: { tone: 'warning', Icon: Clock },
  expired: { tone: 'danger', Icon: XCircle },
  paused: { tone: 'neutral', Icon: PauseCircle },
  pending: { tone: 'info', Icon: Circle },
  cancelled: { tone: 'neutral', Icon: Ban },
  none: { tone: 'neutral', Icon: MinusCircle },
};

/** Membership status: color + icon + text (never color alone). */
export function StatusBadge({ status }: { status: StatusKey }) {
  const { t } = useTranslation();
  const { tone, Icon } = statusMap[status];
  return (
    <Badge tone={tone} icon={<Icon className="size-3" aria-hidden />}>
      {t(status === 'none' ? 'admin.members.no_membership' : `membership.status.${status}`)}
    </Badge>
  );
}
