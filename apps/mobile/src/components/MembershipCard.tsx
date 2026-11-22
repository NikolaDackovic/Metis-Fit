import type { MembershipDto } from '@grit/validation';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { ClubLogo } from './ClubLogo';
import { clubToday, periodProgress, useFormat } from '@/lib/format';
import { color, displayFont, fonts, radius, type } from '@/theme';
import { StatusBadge } from './ui';

/**
 * Digital membership card - the hero of the Home screen.
 * Shows only real data from the API; nothing is estimated.
 */
export function MembershipCard({
  membership,
  memberName,
  memberNumber,
}: {
  membership: MembershipDto;
  memberName: string;
  memberNumber: string;
}) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const progress = periodProgress(membership.startDate, membership.endDate, clubToday());
  const debt =
    membership.state !== 'cancelled' && membership.balanceAmount > 0 ? membership.balanceAmount : 0;
  const isPT = membership.planKind === 'personal_training';

  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={`${membership.planName}, ${t(`membership.status.${membership.displayStatus}`)}`}
    >
      {/* Signature diagonal accent (docs/DESIGN_SYSTEM.md §0) */}
      <View style={styles.accent} />
      <View style={styles.header}>
        <ClubLogo style={styles.logo} height={18} />
        <StatusBadge status={membership.displayStatus} />
      </View>

      <Text
        style={[type.display, styles.plan, { fontFamily: displayFont(i18n.language) }]}
        numberOfLines={2}
      >
        {membership.planName}
      </Text>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={type.label}>{t('app.membership.valid_until')}</Text>
          <Text style={styles.big}>
            {membership.endDate
              ? f.date(membership.endDate, { day: 'numeric', month: 'long', year: 'numeric' })
              : '-'}
          </Text>
        </View>
        {membership.daysLeft !== null && membership.daysLeft >= 0 && (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={type.label}>{t('app.membership.days_left_label')}</Text>
            <Text style={styles.big}>{membership.daysLeft + 1}</Text>
          </View>
        )}
      </View>

      {progress !== null && (
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
        >
          <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      )}

      {membership.visitLimit !== null && (
        <Text style={type.bodySm}>
          {t(isPT ? 'app.membership.sessions_left' : 'app.membership.visits_left', {
            count: membership.visitsRemaining ?? 0,
          })}{' '}
          · {membership.visitsUsed}/{membership.visitLimit}
        </Text>
      )}

      {debt > 0 && (
        <View style={styles.debt}>
          <Text style={styles.debtText}>
            {t('app.membership.debt', { amount: f.money(debt, membership.currency) })}
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.name} numberOfLines={1}>
          {memberName}
        </Text>
        <Text style={styles.number}>{memberNumber}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.bg.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border.subtle,
    padding: 20,
    gap: 14,
    overflow: 'hidden',
  },
  accent: {
    position: 'absolute',
    top: -40,
    right: -60,
    width: 180,
    height: 120,
    backgroundColor: color.accent[500],
    opacity: 0.14,
    transform: [{ rotate: '-24deg' }],
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { width: 72, height: 19 },
  plan: { marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  big: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: color.text.primary,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  track: { height: 6, borderRadius: 3, backgroundColor: color.bg.surface2, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: color.accent[500], borderRadius: 3 },
  debt: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: `${color.status.warning}66`,
    backgroundColor: `${color.status.warning}14`,
    padding: 10,
  },
  debtText: { color: color.status.warning, fontFamily: fonts.semibold, fontSize: 13 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: color.border.subtle,
    paddingTop: 12,
    gap: 12,
  },
  name: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: color.text.primary },
  number: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: color.text.secondary,
    fontVariant: ['tabular-nums'],
  },
});
