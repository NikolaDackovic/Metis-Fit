import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CheckCircle2, Minus, Plus, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMyPauses } from '@/components/PauseCard';
import { Button, Card, ErrorNote, Field, Screen, SectionTitle, Skeleton } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { clubToday, useFormat } from '@/lib/format';
import { color, fonts, radius, type } from '@/theme';

const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const AHEAD = 21;

/**
 * F13-2 "Freeze my membership": pick the first day and how many days; the front desk approves
 * it and the membership is extended by the same number of days.
 */
export default function PauseScreen() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const q = useMyPauses();
  const [pick, setPick] = useState<string | null>(null);
  const a = q.data?.allowance.find((x) => x.membershipId === pick) ?? q.data?.allowance[0];
  const today = clubToday();
  const [start, setStart] = useState(today);
  const left = a ? Math.max(0, a.maxDays - a.usedDays) : 0;
  const [days, setDays] = useState(7);
  const n = Math.max(1, Math.min(days, left));
  const end = addDays(start, n - 1);
  const [reason, setReason] = useState('');

  const starts = useMemo(() => {
    const last = a ? a.endDate : today;
    return Array.from({ length: AHEAD }, (_, i) => addDays(today, i)).filter((d) => d <= last);
  }, [a, today]);

  const send = useMutation({
    mutationFn: () =>
      api.post(`/me/pauses?locale=${i18n.language}`, {
        membershipId: a!.membershipId,
        startsOn: start,
        endsOn: end,
        reason: reason.trim() || undefined,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['me', 'pauses'] }),
  });
  const long = (d: string) => f.date(d, { weekday: 'short', day: 'numeric', month: 'long' });

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
      <Text style={type.h1}>{t('app.pause.title')}</Text>
      <Text style={type.bodySm}>{t('app.pause.text')}</Text>

      {q.isPending ? (
        <Skeleton height={220} />
      ) : send.isSuccess ? (
        <Card style={{ gap: 12, alignItems: 'center' }}>
          <CheckCircle2 size={40} color={color.status.success} />
          <Text style={[type.h3, { textAlign: 'center' }]}>{t('app.pause.sent_title')}</Text>
          <Text style={[type.bodySm, { textAlign: 'center' }]}>{t('app.pause.sent_text')}</Text>
          <Button label={t('common.close')} onPress={() => router.back()} />
        </Card>
      ) : !a || left === 0 ? (
        <Card>
          <Text style={type.body}>{t('app.pause.none_left')}</Text>
        </Card>
      ) : (
        <>
          {(q.data?.allowance.length ?? 0) > 1 && (
            <>
              <SectionTitle>{t('app.pause.membership')}</SectionTitle>
              <View style={styles.wrap}>
                {q.data!.allowance.map((x) => (
                  <Chip
                    key={x.membershipId}
                    label={`${x.planName} · ${f.date(x.endDate, { day: 'numeric', month: 'short' })}`}
                    on={x.membershipId === a.membershipId}
                    onPress={() => setPick(x.membershipId)}
                  />
                ))}
              </View>
            </>
          )}

          <SectionTitle>{t('app.pause.start')}</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
            <View style={styles.row}>
              {starts.map((d) => (
                <Chip
                  key={d}
                  label={f.date(d, { weekday: 'short', day: 'numeric' })}
                  on={d === start}
                  onPress={() => setStart(d)}
                />
              ))}
            </View>
          </ScrollView>

          <SectionTitle>{t('app.pause.length')}</SectionTitle>
          <Card style={styles.stepper}>
            <Pressable
              onPress={() => setDays(Math.max(1, n - 1))}
              accessibilityRole="button"
              accessibilityLabel={t('app.pause.less')}
              style={styles.step}
              disabled={n <= 1}
            >
              <Minus size={20} color={n <= 1 ? color.text.muted : color.text.primary} />
            </Pressable>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={styles.big}>{f.number(n)}</Text>
              <Text style={type.bodySm}>{t('app.pause.days_label', { left })}</Text>
            </View>
            <Pressable
              onPress={() => setDays(Math.min(left, n + 1))}
              accessibilityRole="button"
              accessibilityLabel={t('app.pause.more')}
              style={styles.step}
              disabled={n >= left}
            >
              <Plus size={20} color={n >= left ? color.text.muted : color.text.primary} />
            </Pressable>
          </Card>

          <Card style={{ gap: 6 }}>
            <Text style={type.body}>
              {t('app.pause.summary', { from: long(start), to: long(end) })}
            </Text>
            <Text style={type.bodySm}>
              {t('app.pause.extends', { date: long(addDays(a.endDate, n)) })}
            </Text>
          </Card>

          <Field
            label={t('app.pause.reason')}
            value={reason}
            onChangeText={setReason}
            maxLength={300}
            placeholder={t('app.pause.reason_hint')}
          />

          {send.error ? (
            <ErrorNote
              message={send.error instanceof ApiError ? send.error.message : 'errors.internal'}
            />
          ) : null}
          <Button
            label={t('app.pause.send')}
            onPress={() => send.mutate()}
            loading={send.isPending}
          />
          <Text style={styles.note}>{t('app.pause.note')}</Text>
        </>
      )}
    </Screen>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={[styles.chip, on && styles.chipOn]}
    >
      <Text style={[styles.chipText, on && { color: color.onAccent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: color.border.strong,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: color.bg.surface,
  },
  chipOn: { backgroundColor: color.accent[500], borderColor: color.accent[500] },
  chipText: { fontFamily: fonts.semibold, fontSize: 14, color: color.text.primary },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  step: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: color.border.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  big: { fontFamily: fonts.extrabold, fontSize: 36, lineHeight: 40, color: color.text.primary },
  note: { color: color.text.muted, fontFamily: fonts.regular, fontSize: 12 },
});
