import type { LoyaltyDto, PublicPromoDto, ServiceDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { Award, ChevronDown, ChevronUp, Gift, Tag } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, SectionTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { color, fonts, radius, type } from '@/theme';

const TIER_COLOR = { bronze: '#C08457', silver: '#C9CED6', gold: '#F5C542' } as const;

/** Points, tier progress, rewards (redeemed at the front desk) and recent history. */
export function LoyaltyCard() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ['me', 'loyalty', i18n.language],
    queryFn: () => api.get<LoyaltyDto>('/me/loyalty', { locale: i18n.language }),
  });
  const d = q.data;
  if (!d?.enabled) return null;
  const next =
    d.nextTier === 'silver'
      ? d.thresholds.silver
      : d.nextTier === 'gold'
        ? d.thresholds.gold
        : null;
  const progress = next ? Math.min(1, d.earnedYear / next) : 1;

  return (
    <>
      <SectionTitle>{t('app.loyalty.title')}</SectionTitle>
      <Card style={{ gap: 12 }}>
        <View style={styles.row}>
          <View style={[styles.badge, { borderColor: TIER_COLOR[d.tier] }]}>
            <Award size={22} color={TIER_COLOR[d.tier]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.h3, { color: TIER_COLOR[d.tier] }]}>
              {t(`app.loyalty.tier.${d.tier}`)}
            </Text>
            <Text style={type.bodySm}>
              {d.nextTier
                ? t('app.loyalty.to_next', {
                    points: d.pointsToNextTier,
                    tier: t(`app.loyalty.tier.${d.nextTier}`),
                  })
                : t('app.loyalty.top_tier')}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.points}>{d.balance}</Text>
            <Text style={type.bodySm}>{t('app.loyalty.points')}</Text>
          </View>
        </View>
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: next ?? d.earnedYear, now: d.earnedYear }}
        >
          <View
            style={[
              styles.fill,
              { width: `${progress * 100}%`, backgroundColor: TIER_COLOR[d.nextTier ?? d.tier] },
            ]}
          />
        </View>
        <Text style={type.bodySm}>
          {t('app.loyalty.how', {
            visit: d.rules.pointsPerVisit,
            rsd: f.money(d.rules.minorPerPoint),
          })}
        </Text>

        {d.rewards.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={type.label}>{t('app.loyalty.rewards')}</Text>
            {d.rewards.map((r) => {
              const can = d.balance >= r.costPoints;
              return (
                <View key={r.id} style={[styles.reward, !can && { opacity: 0.55 }]}>
                  <Gift size={18} color={can ? color.accent[400] : color.text.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={type.body}>{r.name}</Text>
                    {r.description && <Text style={type.bodySm}>{r.description}</Text>}
                  </View>
                  <Text style={styles.cost}>{r.costPoints}</Text>
                </View>
              );
            })}
            <Text style={type.bodySm}>{t('app.loyalty.redeem_hint')}</Text>
          </View>
        )}

        {d.history.length > 0 && (
          <Pressable
            onPress={() => setOpen(!open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            style={styles.toggle}
          >
            <Text style={styles.toggleText}>{t('app.loyalty.history')}</Text>
            {open ? (
              <ChevronUp size={16} color={color.text.secondary} />
            ) : (
              <ChevronDown size={16} color={color.text.secondary} />
            )}
          </Pressable>
        )}
        {open &&
          d.history.map((h) => (
            <View key={h.id} style={styles.entry}>
              <View style={{ flex: 1 }}>
                <Text style={type.body}>{h.rewardName ?? t(`app.loyalty.reason.${h.reason}`)}</Text>
                <Text style={type.bodySm}>{f.dateTime(h.createdAt)}</Text>
              </View>
              <Text
                style={[
                  styles.delta,
                  { color: h.points > 0 ? color.status.success : color.text.secondary },
                ]}
              >
                {h.points > 0 ? `+${h.points}` : h.points}
              </Text>
            </View>
          ))}
      </Card>
    </>
  );
}

/** Public promo codes: the member mentions the code at the front desk. */
export function Promotions() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const q = useQuery({
    queryKey: ['promotions', i18n.language],
    queryFn: () => api.get<PublicPromoDto[]>('/public/promotions', { locale: i18n.language }),
  });
  if (!q.data?.length) return null;
  return (
    <>
      <SectionTitle>{t('app.promos.title')}</SectionTitle>
      {q.data.map((p) => (
        <Card key={p.code} style={styles.promo}>
          <View style={styles.row}>
            <Tag size={20} color={color.accent[400]} />
            <View style={{ flex: 1 }}>
              <Text style={type.h3}>{p.title}</Text>
              {p.description && <Text style={type.bodySm}>{p.description}</Text>}
            </View>
            <Text style={styles.off}>
              {p.kind === 'percent' ? `-${p.value}%` : `-${f.money(p.value)}`}
            </Text>
          </View>
          <View style={styles.codeRow}>
            <Text style={styles.code} selectable>
              {p.code}
            </Text>
            <Text style={type.bodySm}>
              {p.validUntil
                ? t('app.promos.until', { date: f.date(p.validUntil) })
                : t('app.promos.at_desk')}
            </Text>
          </View>
        </Card>
      ))}
    </>
  );
}

/** Price list of single services (massage, InBody, day pass…), bought at the front desk. */
export function ServicePrices() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const q = useQuery({
    queryKey: ['services', i18n.language],
    queryFn: () => api.get<ServiceDto[]>('/public/services', { locale: i18n.language }),
  });
  if (!q.data?.length) return null;
  return (
    <>
      <SectionTitle>{t('app.services.title')}</SectionTitle>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {q.data.map((s, i) => (
          <View key={s.id} style={[styles.entry, i > 0 && styles.divider]}>
            <View style={{ flex: 1 }}>
              <Text style={type.body}>{s.name}</Text>
              {s.description || s.durationMin ? (
                <Text style={type.bodySm}>
                  {[s.durationMin ? `${s.durationMin} min` : null, s.description]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              ) : null}
            </View>
            <Text style={styles.cost}>{f.money(s.priceAmount, s.currency)}</Text>
          </View>
        ))}
      </Card>
      <Text style={type.bodySm}>{t('app.services.at_desk')}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  points: {
    fontFamily: fonts.bold,
    fontSize: 28,
    color: color.text.primary,
    fontVariant: ['tabular-nums'],
  },
  track: { height: 8, borderRadius: 4, backgroundColor: color.bg.surface2, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  reward: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  cost: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: color.text.primary,
    fontVariant: ['tabular-nums'],
  },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 },
  toggleText: { fontFamily: fonts.semibold, fontSize: 13, color: color.text.secondary },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  delta: { fontFamily: fonts.bold, fontSize: 15, fontVariant: ['tabular-nums'] },
  promo: { gap: 10, borderColor: color.accent[500] },
  off: { fontFamily: fonts.bold, fontSize: 18, color: color.accent[400] },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  code: {
    fontFamily: fonts.bold,
    fontSize: 15,
    letterSpacing: 1,
    color: color.text.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.accent[500],
  },
});
