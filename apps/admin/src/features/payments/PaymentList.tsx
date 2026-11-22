import type { PaymentDto } from '@grit/validation';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/components/ui/cn';
import { Table, Td, Th } from '@/components/ui/Table';
import { useFormat } from '@/lib/format';
import { PaymentActions } from './PaymentActions';

/** Payments: table on tablet/desktop, stacked cards on phones (no sideways scrolling). */
export function PaymentList({ items, showMember }: { items: PaymentDto[]; showMember?: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      <ul className="divide-y divide-border-subtle md:hidden">
        {items.map((p) => (
          <PaymentCard key={p.id} p={p} showMember={showMember} />
        ))}
      </ul>
      <div className="hidden md:block">
        <Table>
          <thead>
            <tr>
              <Th>{t('admin.fields.date')}</Th>
              {showMember && <Th>{t('admin.fields.member')}</Th>}
              <Th>{t('admin.fields.plan')}</Th>
              <Th>{t('admin.fields.method')}</Th>
              <Th className="text-end">{t('admin.fields.amount')}</Th>
              <Th>{t('admin.fields.recorded_by')}</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <PaymentRow key={p.id} p={p} showMember={showMember} />
            ))}
          </tbody>
        </Table>
      </div>
    </>
  );
}

function PaymentBadges({ p }: { p: PaymentDto }) {
  const { t } = useTranslation();
  const f = useFormat();
  return (
    <>
      {p.status === 'voided' && <Badge tone="danger">{t('admin.payments.status_voided')}</Badge>}
      {p.amount < 0 && <Badge tone="neutral">{t('admin.payments.refund_entry')}</Badge>}
      {p.refundedAmount > 0 && (
        <Badge tone="warning">
          {t('admin.payments.partially_refunded', { amount: f.money(p.refundedAmount) })}
        </Badge>
      )}
    </>
  );
}

function PaymentRow({ p, showMember }: { p: PaymentDto; showMember?: boolean }) {
  const { t } = useTranslation();
  const f = useFormat();
  return (
    <tr className={cn(p.status === 'voided' && 'opacity-50')}>
      <Td className="tabular whitespace-nowrap">{f.dateTime(p.paidAt)}</Td>
      {showMember && (
        <Td>
          <Link to={`/members/${p.memberId}`} className="font-semibold hover:text-accent-400">
            {p.memberName}
          </Link>
          <p className="tabular text-xs text-text-secondary">{p.memberNumber}</p>
        </Td>
      )}
      <Td className="text-text-secondary">
        {p.planName ?? '-'}
        {p.note && <p className="text-xs">{p.note}</p>}
      </Td>
      <Td>{t(`admin.payments.methods.${p.method}`)}</Td>
      <Td className={cn('tabular text-end font-semibold', p.amount < 0 && 'text-status-danger')}>
        {f.money(p.amount, p.currency)}
        <div className="mt-0.5 flex justify-end gap-1">
          <PaymentBadges p={p} />
        </div>
        {p.voidReason && <p className="text-xs font-normal text-text-secondary">{p.voidReason}</p>}
      </Td>
      <Td className="text-text-secondary">{p.recordedByName}</Td>
      <Td>
        <PaymentActions payment={p} />
      </Td>
    </tr>
  );
}

function PaymentCard({ p, showMember }: { p: PaymentDto; showMember?: boolean }) {
  const { t } = useTranslation();
  const f = useFormat();
  return (
    <li className={cn('px-4 py-3.5', p.status === 'voided' && 'opacity-60')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {showMember ? (
            <Link to={`/members/${p.memberId}`} className="block truncate font-semibold">
              {p.memberName}
            </Link>
          ) : (
            <p className="truncate font-semibold">{p.planName ?? '-'}</p>
          )}
          <p className="tabular mt-0.5 truncate text-xs text-text-secondary">
            {f.dateTime(p.paidAt)} · {t(`admin.payments.methods.${p.method}`)}
          </p>
          {showMember && p.planName && (
            <p className="truncate text-xs text-text-secondary">{p.planName}</p>
          )}
        </div>
        <p
          className={cn(
            'tabular shrink-0 text-base font-bold',
            p.amount < 0 && 'text-status-danger',
          )}
        >
          {f.money(p.amount, p.currency)}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          <PaymentBadges p={p} />
        </div>
        <PaymentActions payment={p} />
      </div>
      {(p.note || p.voidReason) && (
        <p className="mt-1 text-xs text-text-secondary">{p.voidReason ?? p.note}</p>
      )}
    </li>
  );
}
