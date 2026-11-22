import type { AvailabilityBody } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Plus, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BackHeader } from '@/components/BackHeader';
import { Toggle } from '@/components/Toggle';
import { Button, Card, ErrorNote, Screen, Skeleton } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { color, fonts, radius, type } from '@/theme';

type Window = { startsAt: string; endsAt: string };
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const LENGTHS = [30, 45, 60, 90] as const;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** 2024-01-01 was a Monday: weekday n is 2024-01-0n. */
const isoDayOf = (weekday: number) => `2024-01-0${weekday}`;

/**
 * F14-4: the trainer says when they take personal sessions (e.g. Mon 16:00-20:00). Members see
 * those hours cut into free slots, minus classes and booked sessions, and book with one tap.
 */
export default function AvailabilityScreen() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['coach', 'availability'],
    queryFn: () => api.get<AvailabilityBody>('/admin/my-availability'),
  });
  const [slot, setSlot] = useState(60);
  const [days, setDays] = useState<Record<number, Window[]> | null>(null);
  useEffect(() => {
    if (q.data && !days) {
      const d: Record<number, Window[]> = {};
      for (const w of WEEKDAYS) d[w] = [];
      for (const r of q.data.rules) d[r.weekday]!.push({ startsAt: r.startsAt, endsAt: r.endsAt });
      setDays(d);
      setSlot(q.data.slotMinutes);
    }
  }, [q.data, days]);

  const rules = days
    ? WEEKDAYS.flatMap((weekday) => days[weekday]!.map((w) => ({ weekday, ...w })))
    : [];
  const bad = (w: Window) =>
    !HHMM.test(w.startsAt) || !HHMM.test(w.endsAt) || w.endsAt <= w.startsAt;
  const valid = rules.every((r) => !bad(r));

  const save = useMutation({
    mutationFn: () => api.put('/admin/my-availability', { slotMinutes: slot, rules }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['coach', 'availability'] });
      router.back();
    },
  });
  const setDay = (weekday: number, list: Window[]) =>
    setDays((d) => d && { ...d, [weekday]: list });

  return (
    <Screen>
      <BackHeader title={t('app.availability.title')} />
      <Text style={type.bodySm}>{t('app.availability.hint')}</Text>
      {q.isPending || !days ? (
        q.error ? (
          <ErrorNote message={q.error instanceof ApiError ? q.error.message : 'errors.internal'} />
        ) : (
          <Skeleton height={320} />
        )
      ) : (
        <>
          <Card style={{ gap: 10 }}>
            <Text style={type.label}>{t('app.availability.slot_length')}</Text>
            <View style={styles.chips}>
              {LENGTHS.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setSlot(m)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: m === slot }}
                  style={[styles.chip, m === slot && styles.chipOn]}
                >
                  <Text style={[styles.chipText, m === slot && { color: color.onAccent }]}>
                    {t('app.availability.minutes', { n: m })}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Card>

          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {WEEKDAYS.map((weekday, i) => {
              const list = days[weekday]!;
              const on = list.length > 0;
              return (
                <View key={weekday} style={[styles.day, i > 0 && styles.divider]}>
                  <View style={styles.row}>
                    <Text style={[type.body, { flex: 1, fontFamily: fonts.semibold }]}>
                      {f.date(isoDayOf(weekday), { weekday: 'long' })}
                    </Text>
                    <Toggle
                      value={on}
                      onValueChange={(v) =>
                        setDay(weekday, v ? [{ startsAt: '16:00', endsAt: '20:00' }] : [])
                      }
                      accessibilityLabel={f.date(isoDayOf(weekday), { weekday: 'long' })}
                    />
                  </View>
                  {list.map((w, k) => (
                    <View key={k} style={styles.row}>
                      <TextInput
                        value={w.startsAt}
                        onChangeText={(v) =>
                          setDay(
                            weekday,
                            list.map((x, j) => (j === k ? { ...x, startsAt: v } : x)),
                          )
                        }
                        maxLength={5}
                        placeholder="16:00"
                        placeholderTextColor={color.text.muted}
                        accessibilityLabel={t('app.availability.from')}
                        style={[styles.input, bad(w) && styles.inputBad]}
                      />
                      <Text style={type.bodySm}>-</Text>
                      <TextInput
                        value={w.endsAt}
                        onChangeText={(v) =>
                          setDay(
                            weekday,
                            list.map((x, j) => (j === k ? { ...x, endsAt: v } : x)),
                          )
                        }
                        maxLength={5}
                        placeholder="20:00"
                        placeholderTextColor={color.text.muted}
                        accessibilityLabel={t('app.availability.to')}
                        style={[styles.input, bad(w) && styles.inputBad]}
                      />
                      <View style={{ flex: 1 }} />
                      <Pressable
                        onPress={() =>
                          setDay(
                            weekday,
                            list.filter((_, j) => j !== k),
                          )
                        }
                        accessibilityRole="button"
                        accessibilityLabel={t('app.availability.remove')}
                        hitSlop={8}
                      >
                        <Trash2 size={18} color={color.text.muted} />
                      </Pressable>
                    </View>
                  ))}
                  {on && list.length < 3 && (
                    <Pressable
                      onPress={() =>
                        setDay(weekday, [...list, { startsAt: list.at(-1)!.endsAt, endsAt: '' }])
                      }
                      accessibilityRole="button"
                      style={styles.add}
                    >
                      <Plus size={16} color={color.accent[400]} />
                      <Text style={styles.addText}>{t('app.availability.add')}</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </Card>
          {save.error && (
            <ErrorNote
              message={save.error instanceof ApiError ? save.error.message : 'errors.internal'}
            />
          )}
          <Button
            label={t('app.availability.save')}
            onPress={() => save.mutate()}
            loading={save.isPending}
            disabled={!valid}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.surface2,
  },
  chipOn: { backgroundColor: color.accent[500], borderColor: color.accent[500] },
  chipText: { fontFamily: fonts.semibold, fontSize: 14, color: color.text.primary },
  day: { gap: 8, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    width: 76,
    minHeight: 40,
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: radius.sm,
    backgroundColor: color.bg.surface2,
    color: color.text.primary,
    fontFamily: fonts.semibold,
    fontSize: 15,
    textAlign: 'center',
  },
  inputBad: { borderColor: color.status.danger },
  add: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  addText: { color: color.accent[400], fontFamily: fonts.semibold, fontSize: 14 },
});
