import type { MyClubDto, PublicClubDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ArrowLeft, Building2, Check, MapPin, Search } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Card, EmptyState, Screen, SectionTitle, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { selectClub, selectedClub } from '@/lib/club-select';
import { dirIcon } from '@/lib/rtl';
import { color, displayFont, fonts, radius, type } from '@/theme';

/**
 * F12-4 "Gyms": the gyms I belong to (switch the current one) and the directory of all active
 * gyms on the platform. Personal data stays the same in every gym.
 */
export default function GymsScreen() {
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState('');
  const mine = useQuery({
    queryKey: ['me', 'clubs'],
    queryFn: () => api.get<MyClubDto[]>('/me/clubs'),
  });
  const directory = useQuery({
    queryKey: ['public', 'clubs', q.trim()],
    queryFn: () =>
      api.get<PublicClubDto[]>('/public/clubs', q.trim() ? { q: q.trim() } : undefined),
  });
  const myGyms = (mine.data ?? []).filter((c) => c.isMember || c.roles.length > 0);
  // No explicit choice yet: the first gym listed is the one in use (the default gym).
  const current = selectedClub() ?? myGyms[0]?.slug ?? directory.data?.[0]?.slug ?? null;

  const choose = async (slug: string) => {
    await selectClub(slug);
    router.replace('/');
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          hitSlop={10}
        >
          <ArrowLeft style={dirIcon} size={24} color={color.text.primary} />
        </Pressable>
        <Text style={[type.display, styles.title, { fontFamily: displayFont(i18n.language) }]}>
          {t('app.gyms.title')}
        </Text>
      </View>
      <Text style={type.bodySm}>{t('app.gyms.subtitle')}</Text>

      <SectionTitle>{t('app.gyms.mine')}</SectionTitle>
      {mine.isPending ? (
        <Skeleton height={80} />
      ) : myGyms.length === 0 ? (
        <Card>
          <Text style={type.bodySm}>{t('app.gyms.mine_empty')}</Text>
        </Card>
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {myGyms.map((c, i) => (
            <GymRow
              key={c.id}
              name={c.name}
              city={c.city}
              note={c.isMember ? t('app.gyms.member') : t('app.gyms.staff')}
              active={c.slug === current}
              divider={i > 0}
              onPress={() => void choose(c.slug)}
            />
          ))}
        </Card>
      )}

      <SectionTitle>{t('app.gyms.find')}</SectionTitle>
      <View style={styles.search}>
        <Search size={18} color={color.text.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t('app.gyms.search')}
          placeholderTextColor={color.text.muted}
          style={styles.searchInput}
          accessibilityLabel={t('app.gyms.search')}
        />
      </View>
      {directory.isPending ? (
        <Skeleton height={160} />
      ) : !directory.data?.length ? (
        <Card>
          <EmptyState icon={Building2} title={t('app.gyms.none_found')} />
        </Card>
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {directory.data.map((c, i) => (
            <GymRow
              key={c.id}
              name={c.name}
              city={c.city}
              active={c.slug === current}
              divider={i > 0}
              onPress={() => void choose(c.slug)}
            />
          ))}
        </Card>
      )}
      <Text style={[type.bodySm, { textAlign: 'center' }]}>{t('app.gyms.personal_note')}</Text>
    </Screen>
  );
}

function GymRow({
  name,
  city,
  note,
  active,
  divider,
  onPress,
}: {
  name: string;
  city: string | null;
  note?: string;
  active: boolean;
  divider: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.row, divider && styles.divider]}
    >
      <View style={[styles.icon, active && styles.iconActive]}>
        <Building2 size={18} color={active ? color.onAccent : color.accent[400]} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={type.body} numberOfLines={1}>
          {name}
        </Text>
        <Text style={type.bodySm} numberOfLines={1}>
          {city ? (
            <>
              <MapPin size={12} color={color.text.muted} /> {city}
            </>
          ) : null}
          {note ? `${city ? ' · ' : ''}${note}` : ''}
        </Text>
      </View>
      {active ? (
        <View style={styles.current}>
          <Check size={14} color={color.accent[400]} />
          <Text style={styles.currentText}>{t('app.gyms.current')}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12 },
  title: { fontSize: 22, lineHeight: 28, flex: 1 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: radius.sm,
    backgroundColor: color.bg.surface2,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    color: color.text.primary,
    fontFamily: fonts.medium,
    fontSize: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: color.accent.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActive: { backgroundColor: color.accent[500] },
  current: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  currentText: { color: color.accent[400], fontFamily: fonts.semibold, fontSize: 13 },
});
