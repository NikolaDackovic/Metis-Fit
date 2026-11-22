import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode, ThHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from './Button';
import { cn } from './cn';

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        'sticky top-0 border-b border-border-strong bg-bg-surface px-4 py-2.5 text-start text-[11px] font-semibold tracking-wider whitespace-nowrap text-text-secondary uppercase',
        className,
      )}
      {...rest}
    />
  );
}

export function Td({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <td className={cn('border-b border-border-subtle px-4 py-3 align-middle', className)}>
      {children}
    </td>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm text-text-secondary">
      <span className="tabular">{t('common.range_of_total', { from, to, total })}</span>
      <div className="flex items-center gap-1">
        <IconButton
          label={t('common.previous')}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="size-4 rtl:rotate-180" />
        </IconButton>
        <span className="tabular px-2">
          {page} / {pages}
        </span>
        <IconButton
          label={t('common.next')}
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight className="size-4 rtl:rotate-180" />
        </IconButton>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="tablist"
      className="no-scrollbar flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border-subtle"
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          type="button"
          aria-selected={tab.value === value}
          onClick={() => onChange(tab.value)}
          className={cn(
            '-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors',
            tab.value === value
              ? 'border-accent-500 text-text-primary'
              : 'border-transparent text-text-secondary hover:text-text-primary',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
