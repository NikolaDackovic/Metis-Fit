import type { CafeMenuDto, CafeOrderDto } from '@grit/validation';
import { Coffee, Minus, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, EmptyState, ErrorNote, SectionTitle } from '@/components/ui';
import { useFormat } from '@/lib/format';
import { color, fonts, radius, type } from '@/theme';

export type CartLine = { itemId: string; qty: number };

/** Menu by category with a cart; used by members in the app and by guests at a table. */
export function CafeMenu({
  menu,
  submitting,
  error,
  onSubmit,
}: {
  menu: CafeMenuDto;
  submitting: boolean;
  error: string | null;
  onSubmit: (lines: CartLine[], note: string) => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const items = useMemo(() => menu.categories.flatMap((c) => c.items), [menu]);
  const total = items.reduce((s, i) => s + (cart[i.id] ?? 0) * i.priceAmount, 0);
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const set = (id: string, qty: number) =>
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[id];
      else next[id] = Math.min(qty, 50);
      return next;
    });

  if (!menu.enabled || !menu.categories.length)
    return (
      <Card>
        <EmptyState icon={Coffee} title={t('app.cafe.closed')} text={t('app.cafe.closed_text')} />
      </Card>
    );

  return (
    <>
      {menu.categories.map((c) => (
        <View key={c.id} style={{ gap: 8 }}>
          <SectionTitle>{c.name}</SectionTitle>
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {c.items.map((i, idx) => {
              const qty = cart[i.id] ?? 0;
              const max = i.trackStock && i.stockQty != null ? i.stockQty : 50;
              return (
                <View
                  key={i.id}
                  style={[styles.item, idx > 0 && styles.divider, !i.inStock && { opacity: 0.5 }]}
                >
                  {i.photoUrl ? <Image source={{ uri: i.photoUrl }} style={styles.photo} /> : null}
                  <View style={{ flex: 1 }}>
                    <Text style={type.body}>{i.name}</Text>
                    {i.description ? <Text style={type.bodySm}>{i.description}</Text> : null}
                    <Text style={styles.price}>
                      {i.inStock ? f.money(i.priceAmount, i.currency) : t('app.cafe.sold_out')}
                    </Text>
                  </View>
                  {i.inStock &&
                    (qty === 0 ? (
                      <Pressable
                        onPress={() => set(i.id, 1)}
                        accessibilityRole="button"
                        accessibilityLabel={`${t('app.cafe.add')} ${i.name}`}
                        style={[styles.round, styles.roundOn]}
                      >
                        <Plus size={18} color={color.onAccent} />
                      </Pressable>
                    ) : (
                      <View style={styles.stepper}>
                        <Pressable
                          onPress={() => set(i.id, qty - 1)}
                          accessibilityRole="button"
                          accessibilityLabel={`${t('app.cafe.less')} ${i.name}`}
                          style={styles.round}
                        >
                          <Minus size={16} color={color.text.primary} />
                        </Pressable>
                        <Text style={styles.qty}>{qty}</Text>
                        <Pressable
                          onPress={() => set(i.id, qty + 1)}
                          disabled={qty >= max}
                          accessibilityRole="button"
                          accessibilityLabel={`${t('app.cafe.add')} ${i.name}`}
                          style={[styles.round, styles.roundOn, qty >= max && { opacity: 0.4 }]}
                        >
                          <Plus size={16} color={color.onAccent} />
                        </Pressable>
                      </View>
                    ))}
                </View>
              );
            })}
          </Card>
        </View>
      ))}

      {count > 0 && (
        <Card style={{ gap: 12, borderColor: color.accent[500] }}>
          <Text style={type.h3}>{t('app.cafe.cart', { count })}</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            maxLength={300}
            placeholder={t('app.cafe.note')}
            placeholderTextColor={color.text.muted}
            style={styles.note}
            accessibilityLabel={t('app.cafe.note')}
          />
          <View style={styles.totalRow}>
            <Text style={type.bodySm}>{t('app.cafe.total')}</Text>
            <Text style={styles.total}>{f.money(total)}</Text>
          </View>
          <Button
            label={t('app.cafe.order')}
            loading={submitting}
            onPress={() =>
              onSubmit(
                Object.entries(cart).map(([itemId, qty]) => ({ itemId, qty })),
                note.trim(),
              )
            }
          />
          <Text style={type.bodySm}>{t('app.cafe.pay_hint')}</Text>
          {error && <ErrorNote message={error} />}
        </Card>
      )}
    </>
  );
}

const STEPS = ['new', 'preparing', 'ready', 'served'] as const;

/** Live status of an order (polled by the screen). */
export function OrderStatus({ order }: { order: CafeOrderDto }) {
  const { t } = useTranslation();
  const f = useFormat();
  const step = order.status === 'cancelled' ? -1 : STEPS.indexOf(order.status);
  return (
    <Card
      style={{
        gap: 12,
        borderColor: order.status === 'ready' ? color.status.success : color.border.subtle,
      }}
    >
      <View style={styles.totalRow}>
        <Text style={type.h2}>#{order.number}</Text>
        <Text style={[styles.status, order.status === 'ready' && { color: color.status.success }]}>
          {t(`app.cafe.status.${order.status}`)}
        </Text>
      </View>
      {step >= 0 && (
        <View style={styles.steps}>
          {STEPS.map((s, i) => (
            <View key={s} style={[styles.step, i <= step && styles.stepOn]} />
          ))}
        </View>
      )}
      <Text style={type.bodySm}>
        {order.items.map((i) => `${i.qty} × ${i.name}`).join(', ')}
        {order.tableLabel ? ` · ${order.tableLabel}` : ` · ${t('app.cafe.pickup')}`}
      </Text>
      <View style={styles.totalRow}>
        <Text style={type.bodySm}>
          {order.paymentStatus === 'paid' ? t('app.cafe.paid') : t('app.cafe.unpaid')}
        </Text>
        <Text style={styles.total}>{f.money(order.totalAmount, order.currency)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
  photo: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: color.bg.surface2 },
  price: { fontFamily: fonts.semibold, fontSize: 14, color: color.accent[400], marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  round: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg.surface2,
  },
  roundOn: { backgroundColor: color.accent[500] },
  qty: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: color.text.primary,
    minWidth: 20,
    textAlign: 'center',
  },
  note: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    backgroundColor: color.bg.surface2,
    color: color.text.primary,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  total: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: color.text.primary,
    fontVariant: ['tabular-nums'],
  },
  status: { fontFamily: fonts.bold, fontSize: 15, color: color.accent[400] },
  steps: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, height: 6, borderRadius: 3, backgroundColor: color.bg.surface2 },
  stepOn: { backgroundColor: color.accent[500] },
});
