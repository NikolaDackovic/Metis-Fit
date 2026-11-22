import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GroupClasses } from '@/components/training/GroupClasses';
import { ProgressView } from '@/components/training/ProgressView';
import { WorkoutLog } from '@/components/training/WorkoutLog';
import { color, displayFont, fonts, radius, type } from '@/theme';

type Segment = 'classes' | 'log' | 'progress';
// My workout first: starting a workout is the most common thing here.
const SEGMENTS: Segment[] = ['log', 'classes', 'progress'];

/** Training tab: my workout (start, plan, history), group classes, my progress. */
export default function TrainingScreen() {
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ view?: Segment }>();
  const [segment, setSegment] = useState<Segment>(
    params.view && SEGMENTS.includes(params.view) ? params.view : 'log',
  );
  const header = (
    <View style={{ gap: 14 }}>
      <Text style={[type.display, styles.title, { fontFamily: displayFont(i18n.language) }]}>
        {t('app.training.title')}
      </Text>
      <View style={styles.segments} accessibilityRole="tablist">
        {SEGMENTS.map((s) => (
          <Pressable
            key={s}
            accessibilityRole="tab"
            accessibilityState={{ selected: s === segment }}
            onPress={() => setSegment(s)}
            style={[styles.segment, s === segment && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, s === segment && { color: color.text.primary }]}>
              {t(`app.training.segments.${s}`)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
  if (segment === 'log') return <WorkoutLog header={header} />;
  if (segment === 'progress') return <ProgressView header={header} />;
  return <GroupClasses header={header} />;
}

const styles = StyleSheet.create({
  title: { fontSize: 24, lineHeight: 30, paddingTop: 12 },
  segments: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: radius.sm,
    backgroundColor: color.bg.surface,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm - 2,
  },
  segmentActive: { backgroundColor: color.bg.surface2 },
  segmentText: { fontFamily: fonts.semibold, fontSize: 14, color: color.text.secondary },
});
