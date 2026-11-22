import type { AccessTokenDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import * as Brightness from 'expo-brightness';
import { router } from 'expo-router';
import { RefreshCw, ScanLine, WifiOff, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { QrCode } from '@/components/QrCode';
import { Button, Screen, Skeleton, StatusBadge } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { ensureOfflinePass, showOfflinePass, type OfflinePass } from '@/lib/offline-pass';
import { currentMembership, useMe, useMyMemberships } from '@/lib/queries';
import { color, displayFont, fonts, radius, type } from '@/theme';

/** Full brightness while the code is on screen; restored when leaving (native only). */
function useMaxBrightness() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let previous: number | null = null;
    void (async () => {
      try {
        previous = await Brightness.getBrightnessAsync();
        await Brightness.setBrightnessAsync(1);
      } catch {
        /* brightness is a convenience, never a blocker */
      }
    })();
    return () => {
      void (async () => {
        try {
          if (Platform.OS === 'android') await Brightness.restoreSystemBrightnessAsync();
          else if (previous !== null) await Brightness.setBrightnessAsync(previous);
        } catch {
          /* ignore */
        }
      })();
    };
  }, []);
}

/**
 * Access QR (docs/SECURITY.md §5): issued by the server for 60 s, single use, refreshed automatically.
 * Without internet the spare offline pass is shown (§5a): issued earlier by the server, single use,
 * valid a few hours. The app never makes up a code itself.
 */
export default function CardScreen() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const { width } = useWindowDimensions();
  const me = useMe();
  const current = currentMembership(useMyMemberships().data);
  const [now, setNow] = useState(Date.now());
  useMaxBrightness();

  const token = useQuery({
    queryKey: ['access-token'],
    queryFn: () => api.post<AccessTokenDto>('/me/access-token'),
    refetchInterval: (q) => (q.state.data ? q.state.data.refreshInSec * 1000 : false),
    refetchIntervalInBackground: false,
    gcTime: 0,
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const data = token.data;
  // Clamp: client and server clocks can differ by a fraction of a second.
  const secondsLeft = data
    ? Math.min(60, Math.max(0, Math.ceil((Date.parse(data.expiresAt) - now) / 1000)))
    : 0;
  const expired = Boolean(data) && secondsLeft === 0;
  const qrSize = Math.max(160, Math.min(width - 96, 300));
  const err = token.error instanceof ApiError ? token.error : null;
  const offline = err?.message === 'errors.network';
  const userId = me.data?.id;
  const [spare, setSpare] = useState<OfflinePass | null>(null);
  // Online: keep the spare code fresh. Offline: load it to show instead of the live code.
  useEffect(() => {
    if (!userId) return;
    if (data) void ensureOfflinePass(userId);
    if (offline) void showOfflinePass(userId).then(setSpare);
  }, [userId, Boolean(data), offline]);
  const showSpare = offline && spare !== null;

  return (
    <Screen edges={['top', 'bottom']} scroll={false}>
      <View style={styles.top}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          hitSlop={10}
        >
          <X size={26} color={color.text.primary} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <Text style={[type.display, styles.title, { fontFamily: displayFont(i18n.language) }]}>
          {t('app.qr.title')}
        </Text>
        {/* The person's own app profile (name, photo), the same in every gym. */}
        <View style={styles.who}>
          <Avatar
            url={me.data?.avatarUrl}
            firstName={me.data?.firstName}
            lastName={me.data?.lastName}
            size={44}
          />
          <Text style={[type.h3, { flexShrink: 1 }]} numberOfLines={1}>
            {[me.data?.firstName, me.data?.lastName].filter(Boolean).join(' ')}
          </Text>
        </View>
        {current && (
          <View style={styles.meta}>
            <Text style={type.bodySm} numberOfLines={1}>
              {current.planName}
            </Text>
            <StatusBadge status={current.displayStatus} />
          </View>
        )}

        <View style={[styles.tile, { width: qrSize + 32, minHeight: qrSize + 32 }]}>
          {token.isPending ? (
            <Skeleton height={qrSize} style={{ width: qrSize, backgroundColor: '#E8E8E8' }} />
          ) : data && !expired ? (
            <View accessible accessibilityLabel={t('app.qr.a11y')}>
              <QrCode value={data.token} size={qrSize} />
            </View>
          ) : showSpare ? (
            <View accessible accessibilityLabel={t('app.qr.a11y')}>
              <QrCode value={spare.token} size={qrSize} />
            </View>
          ) : (
            <View style={[styles.state, { width: qrSize, height: qrSize }]}>
              {offline ? <WifiOff size={36} color="#444" /> : <RefreshCw size={36} color="#444" />}
              <Text style={styles.stateText}>
                {offline
                  ? t('app.qr.offline')
                  : err
                    ? t(err.message, { defaultValue: t('errors.internal') })
                    : t('app.qr.expired')}
              </Text>
            </View>
          )}
        </View>

        {data && !expired && (
          <View style={styles.timer}>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.round((secondsLeft / 60) * 100)}%` }]} />
            </View>
            <Text style={type.bodySm}>{t('app.qr.refreshes', { seconds: secondsLeft })}</Text>
          </View>
        )}

        {showSpare && (
          <View style={styles.spare}>
            <WifiOff size={18} color={color.status.warning} />
            <Text style={[type.bodySm, { flex: 1 }]}>
              {t('app.qr.offline_pass', {
                time: f.time(spare.expiresAt),
                number: me.data?.member?.memberNumber ?? '',
              })}
            </Text>
          </View>
        )}

        {(err || expired) && (
          <View style={{ width: '100%', gap: 10 }}>
            <Button
              label={t('common.retry')}
              variant="secondary"
              icon={RefreshCw}
              onPress={() => void token.refetch()}
            />
            {err && !offline && (
              <Text style={[type.bodySm, { textAlign: 'center' }]}>
                {t('app.qr.ask_reception')}
              </Text>
            )}
          </View>
        )}

        {current?.endDate && !err && (
          <Text style={[type.bodySm, { textAlign: 'center' }]}>
            {t('app.membership.valid_until')}{' '}
            {f.date(current.endDate, { day: 'numeric', month: 'long', year: 'numeric' })}
          </Text>
        )}

        {/* The other way in: scan the gym's code on the screen by the door. */}
        <View style={{ width: '100%' }}>
          <Button
            label={t('app.scan.cta')}
            variant="secondary"
            icon={ScanLine}
            onPress={() => router.replace('/scan')}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  who: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  top: { alignItems: 'flex-end', paddingTop: 8 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingBottom: 24 },
  title: { fontSize: 22, lineHeight: 28, textAlign: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: '100%' },
  tile: {
    backgroundColor: color.qr.background,
    borderRadius: radius.lg,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  state: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 },
  stateText: { color: '#222', fontFamily: fonts.semibold, fontSize: 15, textAlign: 'center' },
  timer: { width: '100%', maxWidth: 332, gap: 8, alignItems: 'center' },
  track: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: color.bg.surface2,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: color.accent[500] },
  spare: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    maxWidth: 332,
    borderWidth: 1,
    borderColor: color.status.warning,
    borderRadius: radius.sm,
    padding: 12,
  },
});
