import type { MembershipDto, PaymentMethod, PlanDto, PromoCheckDto } from '@grit/validation';
import { PAYMENT_METHODS } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { FiscalNotice } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { parseMoneyInput, useFormat } from '@/lib/format';
import { planLimits, planName } from '../plans/plan-utils';

/** Front-desk flow T1: plan → start → (payment) in one API call / one DB transaction. */
export function AssignMembershipModal({
  memberId,
  onClose,
}: {
  memberId: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const plans = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get<PlanDto[]>('/admin/plans'),
  });
  const available = useMemo(() => plans.data?.filter((p) => p.isAvailable) ?? [], [plans.data]);

  const [planId, setPlanId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [withPayment, setWithPayment] = useState(true);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const plan = available.find((p) => p.id === planId);
  const amountMinor = parseMoneyInput(amount);

  const [code, setCode] = useState('');
  const [quote, setQuote] = useState<PromoCheckDto | null>(null);
  const check = useMutation({
    mutationFn: () =>
      api.post<PromoCheckDto>('/admin/promos/check', { code: code.trim(), memberId, planId }),
    onSuccess: (q) => {
      setQuote(q);
      setAmount(String(q.finalAmount / 100));
    },
  });

  const assign = useMutation({
    mutationFn: () =>
      api.post<MembershipDto>(`/admin/members/${memberId}/memberships`, {
        planId,
        ...(startDate && { startDate }),
        ...(quote && { promoCode: quote.code }),
        payment: withPayment ? { amount: amountMinor, method, note } : null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['member', memberId] });
      void qc.invalidateQueries({ queryKey: ['members'] });
      void qc.invalidateQueries({ queryKey: ['payments'] });
      toast.success(t('admin.memberships.assigned'));
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'errors.internal'),
  });

  const canSubmit = plan && (!withPayment || (amountMinor !== null && amountMinor > 0));

  return (
    <Modal
      open
      onClose={onClose}
      title={t('admin.memberships.assign')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!canSubmit} loading={assign.isPending} onClick={() => assign.mutate()}>
            {t('admin.memberships.assign_confirm')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('admin.fields.plan')} required>
          {(p) => (
            <Select
              {...p}
              value={planId}
              onChange={(e) => {
                setPlanId(e.target.value);
                setQuote(null);
                check.reset();
                const next = available.find((x) => x.id === e.target.value);
                if (next) setAmount(String(next.priceAmount / 100));
              }}
            >
              <option value="">{t('admin.memberships.choose_plan')}</option>
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {planName(p, i18n.language)} - {f.money(p.priceAmount, p.currency)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {plan && <p className="text-sm text-text-secondary">{planLimits(plan, t)}</p>}
        {plan && (
          <Field
            label={t('admin.promos.code_field')}
            hint={
              quote
                ? t('admin.promos.quote', {
                    discount: f.money(quote.discountAmount, quote.currency),
                    final: f.money(quote.finalAmount, quote.currency),
                  })
                : t('admin.promos.code_hint')
            }
            error={check.error instanceof ApiError ? check.error.message : undefined}
          >
            {(p) => (
              <div className="flex gap-2">
                <Input
                  {...p}
                  value={code}
                  maxLength={30}
                  className="uppercase"
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setQuote(null);
                    check.reset();
                  }}
                />
                <Button
                  variant="secondary"
                  disabled={code.trim().length < 3}
                  loading={check.isPending}
                  onClick={() => check.mutate()}
                >
                  {t('admin.promos.check')}
                </Button>
              </div>
            )}
          </Field>
        )}
        <Field label={t('admin.memberships.start_date')} hint={t('admin.memberships.start_hint')}>
          {(p) => (
            <Input
              {...p}
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          )}
        </Field>

        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={withPayment}
            onChange={(e) => setWithPayment(e.target.checked)}
            className="size-4 accent-[var(--color-accent-500)]"
          />
          {t('admin.memberships.record_payment')}
        </label>

        {withPayment && (
          <div className="grid gap-4 sm:grid-cols-2 rounded-sm border border-border-subtle p-4">
            <Field
              label={t('admin.fields.amount_rsd')}
              required
              error={amount && amountMinor === null ? 'validation.invalid_amount' : undefined}
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
            {plan && amountMinor !== null && amountMinor < plan.priceAmount && (
              <p className="sm:col-span-2 text-sm text-status-warning">
                {t('admin.memberships.debt_warning', {
                  amount: f.money(plan.priceAmount - amountMinor),
                })}
              </p>
            )}
            <Field label={t('admin.fields.note')} className="sm:col-span-2">
              {(p) => (
                <Textarea
                  {...p}
                  className="min-h-14"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              )}
            </Field>
            <div className="sm:col-span-2">
              <FiscalNotice />
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-status-danger">
            {t(error)}
          </p>
        )}
      </div>
    </Modal>
  );
}
