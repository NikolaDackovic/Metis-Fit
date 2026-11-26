import type { CafeMenuDto, CafeOrderDto, PlacedOrderDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';
import { CafeMenu, OrderStatus } from '@/components/cafe/CafeMenu';
import { BackButton } from '@/components/BackHeader';
import { Screen, SectionTitle, Skeleton } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { displayFont, type } from '@/theme';

/** Café for members: order to pick up at the bar (or to a table, when opened from its QR). */
export default function CafeScreen() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { table } = useLocalSearchParams<{ table?: string }>();
  const menu = useQuery({
    queryKey: ['cafe-menu', i18n.language, table ?? null],
    queryFn: () =>
      api.get<CafeMenuDto>('/public/cafe/menu', { locale: i18n.language, ...(table && { table }) }),
  });
  const mine = useQuery({
    queryKey: ['me', 'cafe-orders'],
    queryFn: () => api.get<CafeOrderDto[]>('/me/cafe/orders'),
    refetchInterval: 10_000,
  });
  const order = useMutation({
    mutationFn: (b: { items: Array<{ itemId: string; qty: number }>; note: string }) =>
      api.post<PlacedOrderDto>(`/me/cafe/orders?locale=${i18n.language}`, {
        ...b,
        tableCode: table ?? null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me', 'cafe-orders'] });
      void menu.refetch();
    },
  });
  const open = (mine.data ?? []).filter((o) => o.status !== 'served' && o.status !== 'cancelled');

  return (
    <Screen edges={['top', 'bottom']}>
      <BackButton />
      <Text style={[type.display, styles.title, { fontFamily: displayFont(i18n.language) }]}>
        {t('app.cafe.title')}
      </Text>
      {menu.data?.table && (
        <Text style={type.bodySm}>{t('app.cafe.at_table', { table: menu.data.table.label })}</Text>
      )}
      {open.length > 0 && (
        <>
          <SectionTitle>{t('app.cafe.my_orders')}</SectionTitle>
          {open.map((o) => (
            <OrderStatus key={o.id} order={o} />
          ))}
        </>
      )}
      {menu.isPending ? (
        <Skeleton height={300} />
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
  back: { width: 44, height: 44, justifyContent: 'center', marginTop: 4 },
  title: { fontSize: 24, lineHeight: 30 },
});
