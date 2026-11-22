import {
  ACTIVITY_INTENSITIES,
  ACTIVITY_KINDS,
  type ActivityDto,
  type ActivityInput,
  type ActivityKind,
} from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Activity, ArrowLeft, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Screen,
  SectionTitle,
  Skeleton,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { dirIcon } from '@/lib/rtl';
import { uuid } from '@/lib/workout-store';
import { color, displayFont, fonts, radius, type } from '@/theme';

const WITH_DISTANCE: ReadonlySet<ActivityKind> = new Set([
  'running',
  'walking',
  'cycling',
  'swimming',
  'hiking',
]);
const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function Chips<T extends string>({
  value,
  options,
  label,
  onChange,
}: {
  value: T;
  options: readonly T[];
  label: (v: T) => string;
  onChange: (v: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 6 }}
    >
      {options.map((o) => (
        <Pressable
          key={o}
          onPress={() => onChange(o)}
          accessibilityRole="button"
          accessibilityState={{ selected: o === value }}
          style={[styles.chip, o === value && styles.chipOn]}
        >
          <Text style={[styles.chipText, o === value && { color: color.text.primary }]}>
            {label(o)}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** Activities outside the gym (running, cycling, sports…) with an approximate calorie estimate. */
export default function ActivitiesScreen() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const key = ['me', 'activities'];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<ActivityDto[]>('/me/activities') });
  const [kind, setKind] = useState<ActivityKind>('running');
  const [intensity, setIntensity] = useState<ActivityInput['intensity']>('moderate');
  const [minutes, setMinutes] = useState('');
  const [km, setKm] = useState('');
  const [yesterday, setYesterday] = useState(false);
  const done = (d: ActivityDto[]) => {
    qc.setQueryData(key, d);
    void qc.invalidateQueries({ queryKey: ['me', 'week'] });
  };
  const add = useMutation({
    mutationFn: () => {
      const d = new Date();
      if (yesterday) d.setDate(d.getDate() - 1);
      return api.post<ActivityDto[]>('/me/activities', {
        id: uuid(),
        kind,
        intensity,
        doneOn: localDay(d),
        durationMin: Number(minutes),
        distanceKm: WITH_DISTANCE.has(kind) && km ? Number(km.replace(',', '.')) : null,
      });
    },
    onSuccess: (d) => {
      done(d);
      setMinutes('');
      setKm('');
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del<ActivityDto[]>(`/me/activities/${id}`),
    onSuccess: done,
  });
  const valid = Number(minutes) >= 1 && Number(minutes) <= 1440;
  const error = add.error ?? remove.error;

  return (
    <Screen edges={['top', 'bottom']}>
      <Pressable
        onPress={() => router.back()}
        style={styles.back}
        accessibilityRole="button"
        accessibilityLabel={t('app.common.back')}
        hitSlop={8}
      >
        <ArrowLeft style={dirIcon} size={22} color={color.text.primary} />
      </Pressable>
      <Text style={[type.display, styles.title, { fontFamily: displayFont(i18n.language) }]}>
        {t('app.activities.title')}
      </Text>
      <Text style={type.bodySm}>{t('app.activities.intro')}</Text>

      <Card style={{ gap: 12 }}>
        <Chips
          value={kind}
          options={ACTIVITY_KINDS}
          label={(k) => t(`app.activities.kind.${k}`)}
          onChange={setKind}
        />
        <Chips
          value={intensity}
          options={ACTIVITY_INTENSITIES}
          label={(k) => t(`app.activities.intensity.${k}`)}
          onChange={setIntensity}
        />
        <View style={styles.inputs}>
          <View style={styles.cell}>
            <Field
              label={t('app.activities.minutes')}
              value={minutes}
              onChangeText={(v) => setMinutes(v.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
            />
          </View>
          {WITH_DISTANCE.has(kind) && (
            <View style={styles.cell}>
              <Field
                label={t('app.activities.km')}
                value={km}
                onChangeText={setKm}
                keyboardType="decimal-pad"
                maxLength={6}
              />
            </View>
          )}
        </View>
        <Chips
          value={yesterday ? 'yesterday' : 'today'}
          options={['today', 'yesterday'] as const}
          label={(d) => t(`app.activities.${d}`)}
          onChange={(d) => setYesterday(d === 'yesterday')}
        />
        <Button
          label={t('app.activities.add')}
          icon={Plus}
          disabled={!valid}
          loading={add.isPending}
          onPress={() => add.mutate()}
        />
        {error && (
          <ErrorNote message={error instanceof ApiError ? error.message : 'errors.internal'} />
        )}
      </Card>

      <SectionTitle>{t('app.activities.history')}</SectionTitle>
      {q.isPending ? (
        <Skeleton height={160} />
      ) : !q.data?.length ? (
        <Card>
          <EmptyState
            icon={Activity}
            title={t('app.activities.empty')}
            text={t('app.activities.empty_text')}
          />
        </Card>
      ) : (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {q.data.map((a, i) => (
            <View key={a.id} style={[styles.item, i > 0 && styles.divider]}>
              <View style={{ flex: 1 }}>
                <Text style={type.body}>{t(`app.activities.kind.${a.kind}`)}</Text>
                <Text style={type.bodySm}>
                  {[
                    f.date(a.doneOn),
                    `${a.durationMin} min`,
                    a.distanceKm ? `${a.distanceKm} km` : null,
                    t(`app.activities.intensity.${a.intensity}`),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              {a.kcal != null && <Text style={styles.kcal}>~{a.kcal} kcal</Text>}
              <Pressable
                onPress={() => remove.mutate(a.id)}
                accessibilityRole="button"
                accessibilityLabel={t('app.food.remove')}
                hitSlop={8}
                style={styles.icon}
              >
                <Trash2 size={16} color={color.text.muted} />
              </Pressable>
            </View>
          ))}
        </Card>
      )}
      <Text style={styles.note}>{t('app.activities.kcal_note')}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { width: 44, height: 44, justifyContent: 'center', marginTop: 4 },
  title: { fontSize: 24, lineHeight: 30 },
  chip: {
    minHeight: 34,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  chipOn: { borderColor: color.accent[500], backgroundColor: color.accent.tint },
  chipText: { fontFamily: fonts.semibold, fontSize: 13, color: color.text.secondary },
  inputs: { flexDirection: 'row', gap: 10 },
  cell: { flex: 1, flexBasis: 0, minWidth: 0 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
  kcal: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: color.text.secondary,
    fontVariant: ['tabular-nums'],
  },
  icon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  note: { fontFamily: fonts.regular, fontSize: 12, color: color.text.muted, textAlign: 'center' },
});
