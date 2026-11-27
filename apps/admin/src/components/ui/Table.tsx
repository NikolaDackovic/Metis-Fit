import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLayoutEffect, useRef, type ReactNode, type ThHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from './Button';
import { cn } from './cn';

/**
 * Data table. On phones (< 640 px) every row becomes a card: each cell shows its column name
 * (copied from the header into data-label), so nothing is cut off or needs sideways scrolling.
 */
export function Table({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLTableElement>(null);
  useLayoutEffect(() => {
    const table = ref.current;
    if (!table) return;
    const label = () => {
      const heads = [...table.querySelectorAll('thead th')].map(
        (th) => th.textContent?.trim() ?? '',
      );
      for (const row of table.querySelectorAll('tbody tr')) {
        [...row.children].forEach((cell, i) => {
          const text = heads[i] ?? '';
          if (cell.getAttribute('data-label') !== text) cell.setAttribute('data-label', text);
        });
      }
    };
    label();
    const obs = new MutationObserver(label);
    obs.observe(table, { childList: true, subtree: true });
    return () => obs.disconnect();
  });
  return (
    <div className="overflow-x-auto">
      <table ref={ref} className="rtable w-full border-collapse text-sm">
        {children}
      </table>
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
      // Phones: tabs wrap onto a second line instead of hiding off-screen.
      className="no-scrollbar flex flex-wrap gap-x-1 border-b border-border-subtle sm:flex-nowrap sm:overflow-x-auto sm:overflow-y-hidden"
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
