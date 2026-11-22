import type { PaymentMethod } from '@grit/validation';
import { PAYMENT_METHODS } from '@grit/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { FiscalNotice } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { parseMoneyInput, useFormat } from '@/lib/format';

/**
 * A membership the member asked for in the app (state 'pending') becomes active here,
 * usually together with the payment taken at the desk. Without a payment it starts as debt.
 */
export function ActivateMembershipModal({
  membership,
  onClose,
}: {
  membership: { id: string; planName: string; priceAmount: number; currency: string };
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const [withPayment, setWithPayment] = useState(true);
  const [amount, setAmount] = useState(String(membership.priceAmount / 100));
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [error, setError] = useState<string | null>(null);
  const minor = parseMoneyInput(amount);

  const save = useMutation({
    mutationFn: () =>
      api.post(`/admin/memberships/${membership.id}/activate`, {
        payment: withPayment ? { amount: minor, method } : null,
      }),
    onSuccess: () => {
      toast.success(t('admin.memberships.activated'));
      for (const key of ['member', 'members', 'alerts', 'payments', 'dashboard'])
        void qc.invalidateQueries({ queryKey: [key] });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'errors.internal'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={t('admin.memberships.activate_title')}
      description={`${membership.planName} · ${f.money(membership.priceAmount, membership.currency)}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={withPayment && (!minor || minor <= 0)}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            {t('admin.memberships.activate')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">{t('admin.memberships.activate_hint')}</p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-accent-500)]"
            checked={withPayment}
            onChange={(e) => setWithPayment(e.target.checked)}
          />
          {t('admin.memberships.activate_with_payment')}
        </label>
        {withPayment && (
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
        )}
        {withPayment && <FiscalNotice />}
        {error && (
          <p role="alert" className="text-sm text-status-danger">
            {t(error)}
          </p>
        )}
      </div>
    </Modal>
  );
}
