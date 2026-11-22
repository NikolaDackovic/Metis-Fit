import type { MeasurementDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { color, fonts, radius, type } from '@/theme';

type Metric = 'weightKg' | 'bodyFatPct' | 'waistCm' | 'muscleMassKg' | 'hipsCm' | 'armCm';
const METRICS: Array<[Metric, string]> = [
  ['weightKg', 'kg'],
  ['bodyFatPct', '%'],
  ['waistCm', 'cm'],
  ['muscleMassKg', 'kg'],
  ['hipsCm', 'cm'],
  ['armCm', 'cm'],
];

/**
 * Measurement history as a line over time (weight, body fat, waist...), with the change since the
 * first entry. Only metrics with at least two values are offered. No chart library: plain SVG.
 */
export function MeasurementTrend() {
  const { t } = useTranslation();
  const f = useFormat();
  const q = useQuery({
    queryKey: ['me', 'measurements'],
    queryFn: () => api.get<MeasurementDto[]>('/me/measurements'),
  });
  const list = [...(q.data ?? [])].sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
  const available = METRICS.filter(([k]) => list.filter((m) => m[k] != null).length >= 2);
  const [metric, setMetric] = useState<Metric | null>(null);
  const active = available.find(([k]) => k === metric) ?? available[0];
  if (!active) return null;
  const [key, unit] = active;
  const points = list
    .filter((m) => m[key] != null)
    .map((m) => ({ date: m.measuredOn, value: m[key] as number }));
  const first = points[0]!;
  const last = points.at(-1)!;
  const diff = Math.round((last.value - first.value) * 10) / 10;

  return (
    <View style={{ gap: 10 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 6 }}
      >
        {available.map(([k]) => (
          <Pressable
            key={k}
            accessibilityRole="tab"
            accessibilityState={{ selected: k === key }}
            onPress={() => setMetric(k)}
            style={[styles.chip, k === key && styles.chipOn]}
          >
            <Text style={[styles.chipText, k === key && { color: color.text.primary }]}>
              {t(`app.progress.m.${k}`)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={type.body}>
        {f.number(last.value)} {unit}
        <Text
          style={[styles.diff, { color: diff === 0 ? color.text.secondary : color.accent[400] }]}
        >
          {'  '}
          {diff > 0 ? '+' : ''}
          {f.number(diff)} {unit}{' '}
          {t('app.progress.since', {
            date: f.date(first.date, { day: 'numeric', month: 'numeric', year: 'numeric' }),
          })}
        </Text>
      </Text>
      <LineChart
        points={points}
        label={`${t(`app.progress.m.${key}`)}: ${points.map((p) => `${f.date(p.date)} ${p.value} ${unit}`).join(', ')}`}
        dateLabel={(d) => f.date(d, { day: 'numeric', month: 'numeric' })}
        valueLabel={f.number}
      />
    </View>
  );
}

function LineChart({
  points,
  label,
  dateLabel,
  valueLabel,
  height = 150,
}: {
  points: Array<{ date: string; value: number }>;
  label: string;
  dateLabel: (d: string) => string;
  valueLabel: (v: number) => string;
  height?: number;
}) {
  const [width, setWidth] = useState(0);
  const padX = 8;
  const top = 14;
  const bottom = 22;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const t0 = Date.parse(points[0]!.date);
  const t1 = Date.parse(points.at(-1)!.date);
  const x = (d: string) =>
    padX +
    (t1 === t0 ? (width - padX * 2) / 2 : ((Date.parse(d) - t0) / (t1 - t0)) * (width - padX * 2));
  const y = (v: number) => top + (1 - (v - min) / span) * (height - top - bottom);
  const path = points
    .map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(' ');
  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={label}
    >
      {width > 0 && (
        <Svg width={width} height={height}>
          {[min, max].map((v, i) => (
            <Line
              key={i}
              x1={padX}
              x2={width - padX}
              y1={y(v)}
              y2={y(v)}
              stroke={color.border.subtle}
              strokeDasharray="3 4"
            />
          ))}
          <Path d={path} stroke={color.accent[500]} strokeWidth={2.5} fill="none" />
          {points.map((p, i) => (
            <Circle
              key={p.date + i}
              cx={x(p.date)}
              cy={y(p.value)}
              r={i === points.length - 1 ? 5 : 3.5}
              fill={i === points.length - 1 ? color.accent[400] : color.bg.surface2}
              stroke={color.accent[500]}
              strokeWidth={1.5}
            />
          ))}
          <SvgText
            x={padX}
            y={height - 6}
            fontSize={10}
            fontFamily={fonts.medium}
            fill={color.text.muted}
          >
            {dateLabel(points[0]!.date)}
          </SvgText>
          <SvgText
            x={width - padX}
            y={height - 6}
            fontSize={10}
            fontFamily={fonts.medium}
            fill={color.text.muted}
            textAnchor="end"
          >
            {dateLabel(points.at(-1)!.date)}
          </SvgText>
          <SvgText
            x={width - padX}
            y={top - 3}
            fontSize={10}
            fontFamily={fonts.medium}
            fill={color.text.muted}
            textAnchor="end"
          >
            {valueLabel(max)}
          </SvgText>
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 32,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  chipOn: { borderColor: color.accent[500], backgroundColor: color.accent.tint },
  chipText: { fontFamily: fonts.semibold, fontSize: 13, color: color.text.secondary },
  diff: { fontFamily: fonts.semibold, fontSize: 14 },
});
