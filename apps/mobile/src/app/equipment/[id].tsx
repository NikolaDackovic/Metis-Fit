import type { EquipmentDto } from '@grit/validation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { AlertTriangle, CheckCircle2, MapPin, PlayCircle } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { EquipmentStatusBadge } from '@/components/EquipmentStatusBadge';
import { BackButton } from '@/components/BackHeader';
import { Button, Card, ErrorNote, Screen, SectionTitle, Skeleton } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { color, fonts, radius, type } from '@/theme';

/** Machine profile: how to use it, safety, where it stands, and "report a problem". */
export default function EquipmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const q = useQuery({
    queryKey: ['equipment', id, i18n.language],
    queryFn: () => api.get<EquipmentDto>(`/public/equipment/${id}`, { locale: i18n.language }),
  });
  const [reporting, setReporting] = useState(false);
  const [text, setText] = useState('');
  const report = useMutation({
    mutationFn: () =>
      api.post('/me/maintenance-reports', { equipmentId: id, description: text.trim() }),
    onSuccess: () => {
      setReporting(false);
      setText('');
    },
  });
  const e = q.data;

  return (
    <Screen edges={['top', 'bottom']}>
      <BackButton />

      {q.isPending ? (
        <Skeleton height={300} />
      ) : q.isError || !e ? (
        <ErrorNote message={q.error instanceof ApiError ? q.error.message : 'errors.internal'} />
      ) : (
        <>
          <View style={{ gap: 8 }}>
            <Text style={type.label}>{e.categoryName}</Text>
            <Text style={type.h1}>{e.name}</Text>
            <View style={styles.meta}>
              <EquipmentStatusBadge status={e.status} />
              {(e.manufacturer || e.model) && (
                <Text style={type.bodySm}>
                  {[e.manufacturer, e.model].filter(Boolean).join(' ')}
                </Text>
              )}
            </View>
            {e.location && (
              <View style={styles.meta}>
                <MapPin size={16} color={color.accent[400]} />
                <Text style={type.bodySm}>
                  {e.location.floorName} · {e.location.roomName}
                </Text>
              </View>
            )}
          </View>

          {e.status !== 'available' && (
            <View style={styles.alert}>
              <AlertTriangle size={18} color={color.status.warning} />
              <Text style={styles.alertText}>{t('app.equipment.not_available')}</Text>
            </View>
          )}

          {e.description && <Text style={type.body}>{e.description}</Text>}

          {e.usageInstructions && (
            <>
              <SectionTitle>{t('app.equipment.how_to')}</SectionTitle>
              <Card>
                <Text style={type.body}>{e.usageInstructions}</Text>
              </Card>
            </>
          )}
          {e.safetyNotes && (
            <>
              <SectionTitle>{t('app.equipment.safety')}</SectionTitle>
              <Card>
                <Text style={type.body}>{e.safetyNotes}</Text>
              </Card>
            </>
          )}
          {e.videoUrl && (
            <Button
              label={t('app.equipment.video')}
              icon={PlayCircle}
              variant="secondary"
              onPress={() => void Linking.openURL(e.videoUrl!)}
            />
          )}

          <SectionTitle>{t('app.equipment.problem_title')}</SectionTitle>
          {report.isSuccess ? (
            <View style={styles.success}>
              <CheckCircle2 size={18} color={color.status.success} />
              <Text style={[type.body, { flex: 1 }]}>{t('app.equipment.reported')}</Text>
            </View>
          ) : reporting ? (
            <Card style={{ gap: 12 }}>
              <TextInput
                value={text}
                onChangeText={setText}
                multiline
                placeholder={t('app.equipment.problem_placeholder')}
                placeholderTextColor={color.text.muted}
                style={styles.input}
                accessibilityLabel={t('app.equipment.problem_title')}
                maxLength={2000}
              />
              {report.error && (
                <ErrorNote
                  message={
                    report.error instanceof ApiError ? report.error.message : 'errors.internal'
                  }
                />
              )}
              <Button
                label={t('app.equipment.send_report')}
                onPress={() => report.mutate()}
                loading={report.isPending}
                disabled={text.trim().length < 5}
              />
            </Card>
          ) : (
            <Button
              label={t('app.equipment.report')}
              variant="secondary"
              icon={AlertTriangle}
              onPress={() => setReporting(true)}
            />
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { width: 44, height: 44, justifyContent: 'center', marginTop: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  alert: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${color.status.warning}66`,
    backgroundColor: `${color.status.warning}14`,
    borderRadius: radius.sm,
    padding: 12,
  },
  alertText: { flex: 1, color: color.status.warning, fontFamily: fonts.semibold, fontSize: 14 },
  input: {
    minHeight: 110,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: radius.sm,
    backgroundColor: color.bg.surface2,
    color: color.text.primary,
    fontFamily: fonts.regular,
    fontSize: 16,
    padding: 12,
  },
  success: { flexDirection: 'row', gap: 10, alignItems: 'center' },
});
