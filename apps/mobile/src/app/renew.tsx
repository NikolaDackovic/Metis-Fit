import type { PublicPlanDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Check, Clock, Ticket, UserPlus, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Screen,
  SectionTitle,
  Skeleton,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useMe, useMyMemberships } from '@/lib/queries';
import { color, fonts, radius, type } from '@/theme';

/**
 * Renewing (or buying the first) membership from the app: the member picks a plan, the
 * request waits at the front desk, payment happens there, and reception activates it.
 * No online payment: that needs a payment provider and its contract.
 */
export default function RenewScreen() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const me = useMe();
  const memberships = useMyMemberships();
  const [picked, setPicked] = useState<string | null>(null);

  const plans = useQuery({
    queryKey: ['public', 'plans', i18n.language],
    queryFn: () => api.get<PublicPlanDto[]>('/public/plans', { locale: i18n.language }),
  });
  const pending = memberships.data?.find((m) => m.state === 'pending');
  const refresh = () => qc.invalidateQueries({ queryKey: ['me', 'memberships'] });

  const request = useMutation({
    mutationFn: (planId: string) => api.post('/me/membership-requests', { planId }),
    onSuccess: refresh,
  });
  const withdraw = useMutation({
    mutationFn: (id: string) => api.del(`/me/membership-requests/${id}`),
    onSuccess: refresh,
  });
  const err = request.error ?? withdraw.error;

  const duration = (p: PublicPlanDto) =>
    [
      p.durationDays ? t('app.renew.days', { count: p.durationDays }) : null,
      p.visitLimit ? t('app.renew.visits', { count: p.visitLimit }) : null,
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.top}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          hitSlop={8}
        >
          <X size={24} color={color.text.primary} />
        </Pressable>
      </View>
      <Text style={type.h1}>{t('app.renew.title')}</Text>
      <Text style={type.bodySm}>{t('app.renew.text')}</Text>

      {!me.data?.member ? (
        <Card>
          <EmptyState
            icon={UserPlus}
            title={t('app.join.title')}
            text={t('app.join.text')}
            action={<Button label={t('app.join.cta')} onPress={() => router.replace('/join')} />}
          />
        </Card>
      ) : memberships.isPending ? (
        <Skeleton height={160} />
      ) : pending ? (
        <Card style={{ gap: 10 }}>
          <View style={styles.row}>
            <Clock size={20} color={color.status.info} />
            <Text style={[type.h3, { flex: 1 }]}>{t('app.renew.pending_title')}</Text>
          </View>
          <Text style={type.body}>
            {pending.planName} · {f.money(pending.priceAmount, pending.currency)}
          </Text>
          <Text style={type.bodySm}>
            {t('app.renew.starts', {
              date: f.date(pending.startDate, { day: 'numeric', month: 'long', year: 'numeric' }),
            })}
          </Text>
          <Text style={styles.hint}>{t('app.renew.pay_at_desk')}</Text>
          <Button
            label={t('app.renew.withdraw')}
            variant="ghost"
            onPress={() => withdraw.mutate(pending.id)}
            loading={withdraw.isPending}
          />
        </Card>
      ) : (
        <>
          <SectionTitle>{t('app.renew.pick')}</SectionTitle>
          {plans.isPending ? (
            <Skeleton height={160} />
          ) : !plans.data?.length ? (
            <Card>
              <EmptyState icon={Ticket} title={t('app.renew.no_plans')} />
            </Card>
          ) : (
            plans.data.map((p) => {
              const on = picked === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setPicked(p.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={[styles.plan, on && styles.planOn]}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={type.h3} numberOfLines={2}>
                      {p.name}
                    </Text>
                    {duration(p) ? <Text style={type.bodySm}>{duration(p)}</Text> : null}
                    {p.description ? (
                      <Text style={type.bodySm} numberOfLines={3}>
                        {p.description}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={styles.price}>{f.money(p.priceAmount, p.currency)}</Text>
                    {on && <Check size={20} color={color.accent[400]} />}
                  </View>
                </Pressable>
              );
            })
          )}
          <Button
            label={t('app.renew.submit')}
            disabled={!picked}
            loading={request.isPending}
            onPress={() => picked && request.mutate(picked)}
          />
          <Text style={styles.hint}>{t('app.renew.pay_at_desk')}</Text>
        </>
      )}
      {err && <ErrorNote message={err instanceof ApiError ? err.message : 'errors.internal'} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'flex-end', paddingTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hint: { color: color.text.secondary, fontFamily: fonts.regular, fontSize: 13 },
  plan: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.surface,
  },
  planOn: { borderColor: color.accent[500], backgroundColor: color.accent.tint },
  price: {
    color: color.text.primary,
    fontFamily: fonts.bold,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
});
