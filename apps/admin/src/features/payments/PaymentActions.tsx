import { PLATFORM_NAME } from '@grit/design-tokens';
import type { PaymentDto, PaymentMethod } from '@grit/validation';
import { PAYMENT_METHODS } from '@grit/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Printer, RotateCcw, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ReasonDialog } from '@/components/ui/ReasonDialog';
import { FiscalNotice } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { parseMoneyInput, useFormat } from '@/lib/format';
import { usePublicClub } from '@/lib/club';
import { useCan } from '@/lib/me';
import { printReceipt } from '@/lib/receipt';

function useInvalidatePayments() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['payments'] });
    void qc.invalidateQueries({ queryKey: ['member'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

/** Void / refund buttons for one payment row - shown only to roles that have the permission. */
export function PaymentActions({ payment }: { payment: PaymentDto }) {
  const { t } = useTranslation();
  const f = useFormat();
  const can = useCan();
  const club = usePublicClub();
  const invalidate = useInvalidatePayments();
  const [mode, setMode] = useState<'void' | 'refund' | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refundable = payment.amount - payment.refundedAmount;
  const isRefundEntry = payment.amount < 0;
  const canVoid =
    can('payments.void') && payment.status === 'recorded' && payment.refundedAmount === 0;
  const canRefund =
    can('payments.refund') && payment.status === 'recorded' && !isRefundEntry && refundable > 0;

  const mutation = useMutation({
    mutationFn: (reason: string) =>
      mode === 'void'
        ? api.post(`/admin/payments/${payment.id}/void`, { reason })
        : api.post(`/admin/payments/${payment.id}/refund`, {
            reason,
            amount: parseMoneyInput(refundAmount),
          }),
    onSuccess: () => {
      toast.success(t(mode === 'void' ? 'admin.payments.voided' : 'admin.payments.refunded'));
      invalidate();
      setMode(null);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'errors.internal'),
  });

  const canPrint = payment.status === 'recorded' && payment.amount > 0;
  if (!canVoid && !canRefund && !canPrint) return null;
  const close = () => {
    setMode(null);
    setError(null);
  };
  const print = () =>
    printReceipt({
      club: String(club.data?.info.name ?? PLATFORM_NAME),
      title: t('admin.receipt.title'),
      number: payment.id.slice(0, 8).toUpperCase(),
      date: f.dateTime(payment.paidAt),
      customer: `${payment.memberName} (${payment.memberNumber})`,
      lines: [
        {
          name: payment.planName ?? t('admin.receipt.payment'),
          qty: 1,
          amount: f.money(payment.amount, payment.currency),
        },
      ],
      total: f.money(payment.amount, payment.currency),
      method: t(`admin.payments.methods.${payment.method}`),
      cashier: payment.recordedByName,
      labels: {
        customer: t('admin.receipt.customer'),
        total: t('admin.receipt.total'),
        method: t('admin.receipt.method'),
        cashier: t('admin.receipt.cashier'),
        notFiscal: t('admin.receipt.not_fiscal'),
      },
    });

  return (
    <div className="flex justify-end gap-1">
      {canPrint && (
        <IconButton label={t('admin.receipt.print')} onClick={print}>
          <Printer className="size-3.5" />
        </IconButton>
      )}
      {canRefund && (
        <IconButton
          label={t('admin.payments.refund')}
          onClick={() => {
            setRefundAmount(String(refundable / 100));
            setMode('refund');
          }}
        >
          <RotateCcw className="size-3.5" />
        </IconButton>
      )}
      {canVoid && (
        <IconButton label={t('admin.payments.void')} onClick={() => setMode('void')}>
          <Undo2 className="size-3.5" />
        </IconButton>
      )}
      <ReasonDialog
        open={mode !== null}
        title={t(mode === 'void' ? 'admin.payments.void_title' : 'admin.payments.refund_title')}
        consequence={t(
          mode === 'void' ? 'admin.payments.void_consequence' : 'admin.payments.refund_consequence',
          {
            amount: f.money(payment.amount),
          },
        )}
        confirmLabel={t(mode === 'void' ? 'admin.payments.void' : 'admin.payments.refund')}
        onCancel={close}
        onConfirm={(reason) => mutation.mutate(reason)}
        loading={mutation.isPending}
        error={error}
      >
        {mode === 'refund' && (
          <Field
            label={t('admin.fields.amount_rsd')}
            required
            hint={t('admin.payments.refundable', { amount: f.money(refundable) })}
          >
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
              />
            )}
          </Field>
        )}
      </ReasonDialog>
    </div>
  );
}

/** Standalone payment (e.g. paying off a debt) for a member, optionally tied to one membership. */
export function RecordPaymentModal({
  memberId,
  memberships,
  onClose,
}: {
  memberId: string;
  memberships: Array<{ id: string; label: string; balance: number }>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidatePayments();
  const withDebt = memberships.find((m) => m.balance > 0);
  const [membershipId, setMembershipId] = useState(withDebt?.id ?? '');
  const [amount, setAmount] = useState(withDebt ? String(withDebt.balance / 100) : '');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const minor = parseMoneyInput(amount);

  const save = useMutation({
    mutationFn: () =>
      api.post('/admin/payments', {
        memberId,
        membershipId: membershipId || null,
        amount: minor,
        method,
        note,
      }),
    onSuccess: () => {
      toast.success(t('admin.payments.recorded'));
      invalidate();
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'errors.internal'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={t('admin.payments.record')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!minor || minor <= 0}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('admin.fields.membership')}>
          {(p) => (
            <Select {...p} value={membershipId} onChange={(e) => setMembershipId(e.target.value)}>
              <option value="">{t('admin.payments.no_membership_link')}</option>
              {memberships.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('admin.fields.amount_rsd')}
            required
            error={amount && minor === null ? 'validation.invalid_amount' : undefined}
          >
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
          </Field>
          <Field label={t('admin.fields.method')} required>
            {(p) => (
              <Select
                {...p}
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t(`admin.payments.methods.${m}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label={t('admin.fields.note')}>
          {(p) => (
            <Textarea
              {...p}
              className="min-h-14"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Field>
        <FiscalNotice />
        {error && (
          <p role="alert" className="text-sm text-status-danger">
            {t(error)}
          </p>
        )}
      </div>
    </Modal>
  );
}
