import type { WorkoutTemplateDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState, ErrorNote } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { color, fonts, radius, type } from '@/theme';

/**
 * F17-2: give a client a program from a template in two taps. The client gets their own copy
 * (adjustable later); templates are written in the admin (or saved from an existing plan).
 */
export function AssignTemplate({
  memberId,
  name,
  onClose,
}: {
  memberId: string;
  name: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['coach', 'templates'],
    queryFn: () => api.get<WorkoutTemplateDto[]>('/admin/workout-templates'),
  });
  const assign = useMutation({
    mutationFn: (id: string) =>
      api.post(`/admin/workout-templates/${id}/assign`, { memberIds: [memberId] }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['coach'] });
      onClose();
    },
  });
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      >
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.top}>
            <View style={{ flex: 1 }}>
              <Text style={type.h2}>{t('app.coach.assign_title')}</Text>
              <Text style={type.bodySm}>{name}</Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              hitSlop={8}
            >
              <X size={22} color={color.text.primary} />
            </Pressable>
          </View>
          {q.data && q.data.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={t('app.coach.no_templates')}
              text={t('app.coach.no_templates_text')}
            />
          ) : (
            <ScrollView style={{ maxHeight: 380 }}>
              {(q.data ?? []).map((tpl, i) => (
                <Pressable
                  key={tpl.id}
                  onPress={() => assign.mutate(tpl.id)}
                  disabled={assign.isPending}
                  accessibilityRole="button"
                  style={[styles.row, i > 0 && styles.divider]}
                >
                  <ClipboardList size={18} color={color.accent[400]} />
                  <View style={{ flex: 1 }}>
                    <Text style={type.body} numberOfLines={1}>
                      {tpl.title}
                    </Text>
                    <Text style={type.bodySm} numberOfLines={1}>
                      {tpl.days.map((d) => d.title).join(' · ')}
                    </Text>
                  </View>
                  <Text style={styles.give}>{t('app.coach.give')}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          {assign.error && (
            <ErrorNote
              message={assign.error instanceof ApiError ? assign.error.message : 'errors.internal'}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    gap: 12,
    padding: 20,
    paddingBottom: 28,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: color.bg.surface,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
  give: { fontFamily: fonts.semibold, fontSize: 14, color: color.accent[400] },
});
