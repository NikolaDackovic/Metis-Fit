import type { CafeMenuDto, CafeOrderDto, PlacedOrderDto } from '@grit/validation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { ClubLogo } from '@/components/ClubLogo';
import { CafeMenu, OrderStatus } from '@/components/cafe/CafeMenu';
import { LanguagePicker } from '@/components/LanguagePicker';
import { ErrorNote, Field, Screen, SectionTitle, Skeleton } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useMe } from '@/lib/queries';
import { secureStorage } from '@/lib/storage';
import { displayFont, type } from '@/theme';

const KEY = 'grit.cafe.guest_orders';
const NAME_KEY = 'grit.cafe.guest_name';
type Saved = Array<{ id: string; token: string }>;

/**
 * Table QR ordering for guests, no account needed (also opens for signed-in members).
 * The device remembers its orders (id + secret token) to show their status.
 */
export default function TableOrderScreen() {
  const { t, i18n } = useTranslation();
  const { code } = useLocalSearchParams<{ code: string }>();
  const [saved, setSaved] = useState<Saved>([]);
  const [guestName, setGuestName] = useState('');
  const signedIn = useAuth((s) => s.status) === 'signedIn';
  const me = useMe();
  // A signed-in member orders under their own account, so the bar sees who it is.
  const asMember = signedIn && Boolean(me.data?.member);
  useEffect(() => {
    void secureStorage.getItem(NAME_KEY).then((v) => v && setGuestName(v));
  }, []);
  useEffect(() => {
    void secureStorage.getItem(KEY).then((v) => {
      try {
        setSaved(v ? (JSON.parse(v) as Saved) : []);
      } catch {
        setSaved([]);
      }
    });
  }, []);
  const menu = useQuery({
    queryKey: ['cafe-menu', i18n.language, code],
    queryFn: () =>
      api.get<CafeMenuDto>('/public/cafe/menu', { locale: i18n.language, table: code }),
    retry: false,
  });
  const orders = useQuery({
    queryKey: ['cafe-guest-orders', saved.map((s) => s.id).join()],
    queryFn: async () =>
      (
        await Promise.all(
          saved
            .slice(-5)
            .map((s) =>
              api
                .get<CafeOrderDto>(`/public/cafe/orders/${s.id}`, { token: s.token })
                .catch(() => null),
            ),
        )
      ).filter(
        (o): o is CafeOrderDto => o !== null && o.status !== 'served' && o.status !== 'cancelled',
      ),
    enabled: saved.length > 0,
    refetchInterval: 10_000,
  });
  const order = useMutation({
    mutationFn: (b: { items: Array<{ itemId: string; qty: number }>; note: string }) =>
      asMember
        ? api.post<PlacedOrderDto>(`/me/cafe/orders?locale=${i18n.language}`, {
            ...b,
            tableCode: code,
          })
        : api.post<PlacedOrderDto>(`/public/cafe/orders?locale=${i18n.language}`, {
            ...b,
            tableCode: code,
            guestName: guestName.trim() || null,
          }),
    onSuccess: (o) => {
      if (!asMember && guestName.trim()) void secureStorage.setItem(NAME_KEY, guestName.trim());
      const next = [...saved, { id: o.id, token: o.guestToken }].slice(-10);
      setSaved(next);
      void secureStorage.setItem(KEY, JSON.stringify(next));
      void menu.refetch();
    },
  });

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.top}>
        <ClubLogo style={styles.logo} height={26} />
        <LanguagePicker compact />
      </View>
      <Text style={[type.display, styles.title, { fontFamily: displayFont(i18n.language) }]}>
        {t('app.cafe.title')}
      </Text>
      {menu.data?.table && (
        <Text style={type.bodySm}>{t('app.cafe.at_table', { table: menu.data.table.label })}</Text>
      )}
      {menu.isError && (
        <ErrorNote
          message={
            menu.error instanceof ApiError ? 'errors.cafe.table_not_found' : 'errors.network'
          }
        />
      )}
      {(orders.data ?? []).length > 0 && (
        <>
          <SectionTitle>{t('app.cafe.my_orders')}</SectionTitle>
          {orders.data!.map((o) => (
            <OrderStatus key={o.id} order={o} />
          ))}
        </>
      )}
      {menu.data?.tableOrdering &&
        (asMember ? (
          <Text style={type.bodySm}>
            {t('app.cafe.ordering_as', {
              name: `${me.data!.member!.firstName} ${me.data!.member!.lastName}`,
            })}
          </Text>
        ) : (
          <Field
            label={t('app.cafe.your_name')}
            value={guestName}
            onChangeText={setGuestName}
            placeholder={t('app.cafe.your_name_hint')}
            autoComplete="name"
            maxLength={60}
          />
        ))}
      {menu.isPending ? (
        <Skeleton height={300} />
      ) : menu.data && !menu.data.tableOrdering ? (
        <ErrorNote message="errors.cafe.table_ordering_off" />
      ) : menu.data ? (
        <CafeMenu
          key={order.data?.id ?? 'menu'}
          menu={menu.data}
          submitting={order.isPending}
          error={
            order.error
              ? order.error instanceof ApiError
                ? order.error.message
                : 'errors.internal'
              : null
          }
          onSubmit={(items, note) => order.mutate({ items, note })}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  logo: { width: 110, height: 30 },
  title: { fontSize: 24, lineHeight: 30 },
});
