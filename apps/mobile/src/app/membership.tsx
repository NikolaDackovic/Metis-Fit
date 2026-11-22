import { router } from 'expo-router';
import { BackHeader } from '@/components/BackHeader';
import { Link2, Receipt, Ticket, UserPlus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Card,
  EmptyState,
  Screen,
  SectionTitle,
  Skeleton,
  StatusBadge,
} from '@/components/ui';
import { LoyaltyCard, Promotions, ServicePrices } from '@/components/LoyaltyCard';
import { PauseCard, useMyPauses } from '@/components/PauseCard';
import { ReferralCard, useMyReferral } from '@/components/ReferralCard';
import { useFormat } from '@/lib/format';
import { useMe, useMyMemberships, useMyPayments } from '@/lib/queries';
import { color, fonts, type } from '@/theme';

export default function MembershipScreen() {
  const { t } = useTranslation();
  const f = useFormat();
  const me = useMe();
  const memberships = useMyMemberships();
  const payments = useMyPayments();
  const pauses = useMyPauses();
  const referral = useMyReferral();
  const linked = Boolean(me.data?.member);

  return (
    <Screen
      refreshing={memberships.isFetching || payments.isFetching}
      onRefresh={() => {
        void memberships.refetch();
        void payments.refetch();
        void pauses.refetch();
        void referral.refetch();
      }}
    >
      <BackHeader title={t('app.tabs.membership')} />

      {!linked ? (
        <Card>
          <EmptyState
            icon={Link2}
            title={t('app.link.cta_title')}
            text={t('app.link.cta_text')}
            action={
              <View style={{ gap: 10, alignSelf: 'stretch' }}>
                <Button
                  label={t('app.join.cta')}
                  icon={UserPlus}
                  onPress={() => router.push('/join')}
                />
                <Button
                  label={t('app.link.cta_button')}
                  variant="secondary"
                  onPress={() => router.push('/link')}
                />
              </View>
            }
          />
        </Card>
      ) : (
        <>
          <Button label={t('app.renew.cta')} icon={Ticket} onPress={() => router.push('/renew')} />
          <PauseCard />
          <Promotions />
          <LoyaltyCard />
          <ReferralCard />
          <ServicePrices />
          <SectionTitle>{t('app.membership.history')}</SectionTitle>
          {memberships.isPending ? (
            <Skeleton height={140} />
          ) : !memberships.data?.length ? (
            <Card>
              <EmptyState
                icon={Ticket}
                title={t('app.membership.none_title')}
                text={t('app.membership.none_text')}
                action={<Button label={t('app.renew.cta')} onPress={() => router.push('/renew')} />}
              />
            </Card>
          ) : (
            memberships.data.map((m) => (
              <Card key={m.id} style={[styles.item, m.state === 'cancelled' && { opacity: 0.6 }]}>
                <View style={styles.itemTop}>
                  <Text style={[type.h3, { flex: 1 }]} numberOfLines={2}>
                    {m.planName}
                  </Text>
                  <StatusBadge status={m.displayStatus} />
                </View>
                <Text style={type.bodySm}>
                  {f.date(m.startDate, { day: 'numeric', month: 'short', year: 'numeric' })} -{' '}
                  {f.date(m.endDate, { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
                {m.visitLimit !== null && (
                  <Text style={type.bodySm}>
                    {t(
                      m.planKind === 'personal_training'
                        ? 'app.membership.sessions_left'
                        : 'app.membership.visits_left',
                      {
                        count: m.visitsRemaining ?? 0,
                      },
                    )}
                  </Text>
                )}
                {m.state !== 'cancelled' && m.balanceAmount > 0 && (
                  <Text style={styles.debt}>
                    {t('app.membership.debt', { amount: f.money(m.balanceAmount, m.currency) })}
                  </Text>
                )}
              </Card>
            ))
          )}

          <SectionTitle>{t('app.membership.payments')}</SectionTitle>
          <Card style={{ paddingVertical: 4 }}>
            {payments.isPending ? (
              <Skeleton height={48} style={{ marginVertical: 12 }} />
            ) : !payments.data?.length ? (
              <EmptyState icon={Receipt} title={t('app.membership.no_payments')} />
            ) : (
              payments.data.map((p, i) => (
                <View
                  key={p.id}
                  style={[
                    styles.payment,
                    i > 0 && styles.divider,
                    p.status === 'voided' && { opacity: 0.5 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={type.body} numberOfLines={1}>
                      {p.planName ?? t('app.membership.payment')}
                    </Text>
                    <Text style={type.bodySm}>
                      {f.dateTime(p.paidAt)} · {t(`admin.payments.methods.${p.method}`)}
                      {p.status === 'voided' ? ` · ${t('admin.payments.status_voided')}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.amount, p.amount < 0 && { color: color.status.danger }]}>
                    {f.money(p.amount, p.currency)}
                  </Text>
                </View>
              ))
            )}
          </Card>
          <Text style={styles.note}>{t('admin.payments.fiscal_notice')}</Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { gap: 6 },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  debt: { color: color.status.warning, fontFamily: fonts.semibold, fontSize: 13 },
  payment: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
  amount: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: color.text.primary,
    fontVariant: ['tabular-nums'],
  },
  note: { color: color.text.muted, fontFamily: fonts.regular, fontSize: 12 },
});
