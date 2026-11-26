import type { ProgressPhotoDto, ProgressPhotoFullDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SectionTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { color, fonts, radius, type } from '@/theme';

/** F18-1 for the trainer: the progress photos a client chose to share (nothing otherwise). */
export function ClientPhotos({ memberId }: { memberId: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['coach', 'client-photos', memberId],
    queryFn: () => api.get<ProgressPhotoDto[]>(`/admin/members/${memberId}/progress-photos`),
    retry: false,
  });
  const full = useQuery({
    queryKey: ['coach', 'client-photo', memberId, open],
    queryFn: () =>
      api.get<ProgressPhotoFullDto>(`/admin/members/${memberId}/progress-photos/${open}`),
    enabled: Boolean(open),
  });
  if (!q.data?.length) return null;
  return (
    <>
      <SectionTitle>{t('app.photos.title')}</SectionTitle>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {q.data.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => setOpen(p.id)}
            accessibilityRole="button"
            accessibilityLabel={f.date(p.takenOn)}
            style={styles.tile}
          >
            <Image source={{ uri: p.thumb }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <Text style={styles.date}>{f.date(p.takenOn, { day: 'numeric', month: 'short' })}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Modal
        visible={Boolean(open)}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(null)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setOpen(null)}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <View style={styles.top}>
            <Text style={[type.h3, { flex: 1, color: '#fff' }]}>
              {full.data ? f.date(full.data.takenOn) : ' '}
              {full.data?.weightKg != null ? ` · ${full.data.weightKg} kg` : ''}
            </Text>
            <X size={24} color="#fff" />
          </View>
          {full.data ? (
            <Image source={{ uri: full.data.image }} style={styles.full} resizeMode="contain" />
          ) : (
            <ActivityIndicator color={color.accent[500]} />
          )}
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 90,
    height: 120,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: color.bg.surface2,
  },
  date: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 3,
    textAlign: 'center',
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    padding: 16,
    gap: 12,
  },
  top: { flexDirection: 'row', alignItems: 'center' },
  full: { width: '100%', height: '80%' },
});
