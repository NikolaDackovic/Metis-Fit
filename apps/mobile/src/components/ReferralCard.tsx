import type { MyReferralDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift, Share2, UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, ErrorNote } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { clubShortName, useClub } from '@/lib/queries';
import { color, fonts, radius, type } from '@/theme';

export function useMyReferral() {
  return useQuery({
    queryKey: ['me', 'referral'],
    queryFn: () => api.get<MyReferralDto>('/me/referral'),
  });
}

/**
 * F13-3 "Bring a friend": my code to share, what both of us get, the friends I brought, and
 * (for a new member who has not paid yet) the field for a friend's code. Hidden when the gym
 * has not turned it on.
 */
export function ReferralCard() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const club = useClub();
  const q = useMyReferral();
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const claim = useMutation({
    mutationFn: () => api.post('/me/referral/claim', { code }),
    onSuccess: () => {
      setCode('');
      void qc.invalidateQueries({ queryKey: ['me', 'referral'] });
    },
  });
  const d = q.data;
  if (!d?.enabled || !d.code) return null;

  const share = async () => {
    const message = t('app.referral.share_text', {
      club: clubShortName(club.data),
      code: d.code,
      points: d.pointsFriend,
    });
    try {
      if (Platform.OS === 'web') {
        const nav = globalThis.navigator as Navigator | undefined;
        if (nav?.share) await nav.share({ text: message });
        else {
          await nav?.clipboard?.writeText(message);
          setCopied(true);
        }
      } else {
        await Share.share({ message });
      }
    } catch {
      // The person closed the share sheet: nothing to do.
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      <View style={styles.head}>
        <UserPlus size={20} color={color.accent[400]} />
        <Text style={[type.h3, { flex: 1 }]}>{t('app.referral.title')}</Text>
      </View>
      <Text style={type.bodySm}>
        {d.pointsReferrer > 0 || d.pointsFriend > 0
          ? t('app.referral.text', { you: d.pointsReferrer, friend: d.pointsFriend })
          : t('app.referral.text_plain')}
      </Text>

      <View style={styles.codeBox}>
        <Text style={type.label}>{t('app.referral.your_code')}</Text>
        <Text style={styles.code} selectable accessibilityLabel={d.code.split('').join(' ')}>
          {d.code}
        </Text>
      </View>
      <Button label={t('app.referral.share')} icon={Share2} onPress={() => void share()} />
      {copied && <Text style={styles.ok}>{t('app.referral.copied')}</Text>}

      {d.invited.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={type.label}>
            {t('app.referral.invited', { points: f.number(d.earned) })}
          </Text>
          {d.invited.map((i, n) => (
            <View key={`${i.name}-${n}`} style={styles.row}>
              <Gift
                size={16}
                color={i.status === 'rewarded' ? color.status.success : color.text.muted}
              />
              <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                {i.name}
              </Text>
              <Text style={type.bodySm}>
                {i.status === 'rewarded'
                  ? `+${f.number(i.points)}`
                  : t('app.referral.waiting_payment')}
              </Text>
            </View>
          ))}
        </View>
      )}

      {d.referredBy ? (
        <Text style={type.bodySm}>{t('app.referral.referred_by', { name: d.referredBy })}</Text>
      ) : d.canClaim ? (
        <View style={{ gap: 8 }}>
          <Text style={type.label}>{t('app.referral.have_code')}</Text>
          <View style={styles.claimRow}>
            <TextInput
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              placeholder="ABC234"
              placeholderTextColor={color.text.muted}
              style={styles.input}
              accessibilityLabel={t('app.referral.have_code')}
            />
            <Button
              label={t('app.referral.claim')}
              variant="secondary"
              onPress={() => claim.mutate()}
              loading={claim.isPending}
              disabled={code.trim().length < 6}
            />
          </View>
          {claim.error ? (
            <ErrorNote
              message={claim.error instanceof ApiError ? claim.error.message : 'errors.internal'}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  codeBox: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.accent[500],
    backgroundColor: color.accent.tint,
  },
  code: {
    fontFamily: fonts.extrabold,
    fontSize: 30,
    letterSpacing: 6,
    color: color.text.primary,
  },
  ok: { color: color.status.success, fontFamily: fonts.semibold, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  claimRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: radius.sm,
    backgroundColor: color.bg.surface2,
    paddingHorizontal: 12,
    color: color.text.primary,
    fontFamily: fonts.semibold,
    fontSize: 18,
    letterSpacing: 3,
  },
});
