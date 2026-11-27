import { AlertTriangle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/lib/api';
import { Button } from './Button';
import { cn } from './cn';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-sm bg-bg-surface2', className)} />;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2 p-4" aria-busy>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <Icon className="size-8 text-text-muted" aria-hidden />
      <p className="font-semibold">{title}</p>
      {description && <p className="max-w-sm text-sm text-text-secondary">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  const key = error instanceof ApiError ? error.message : 'errors.internal';
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center"
    >
      <AlertTriangle className="size-8 text-status-danger" aria-hidden />
      <p className="font-semibold">{t(key, { defaultValue: t('errors.internal') })}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-md border border-border-subtle bg-bg-surface', className)}>
      {children}
    </section>
  );
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border-subtle px-5 py-3">
      <h2 className="min-w-0 text-xs font-semibold tracking-wider break-words text-text-secondary uppercase">
        {title}
      </h2>
      {action}
    </header>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      {/* The title keeps a readable width; actions move below it on narrow screens. */}
      <div className="min-w-0 flex-[1_1_16rem]">
        <h1 className="font-display text-2xl tracking-tight uppercase">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Explains that payment records are not fiscal receipts (docs/BUSINESS_RULES.md §3.1). */
export function FiscalNotice() {
  const { t } = useTranslation();
  return (
    <p className="rounded-sm border border-border-subtle bg-bg-surface2 px-3 py-2 text-xs text-text-secondary">
      {t('admin.payments.fiscal_notice')}
    </p>
  );
}
