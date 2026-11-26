import type { EquipmentDto, MapDto } from '@grit/validation';
import { BackHeader } from '@/components/BackHeader';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronRight, Info, MapPinned, Maximize2, Search, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FloorMap } from '@/components/FloorMap';
import { Card, EmptyState, Screen, SectionTitle, Skeleton } from '@/components/ui';
import { EquipmentStatusBadge } from '@/components/EquipmentStatusBadge';
import { api } from '@/lib/api';
import { useClub } from '@/lib/queries';
import { dirIcon } from '@/lib/rtl';
import { color, fonts, radius, type } from '@/theme';

export default function ExploreScreen() {
  const { t, i18n } = useTranslation();
  const map = useQuery({
    queryKey: ['map', i18n.language],
    queryFn: () => api.get<MapDto | null>('/public/map', { locale: i18n.language }),
    staleTime: 5 * 60_000,
  });
  // The club can switch the map off; then this screen is only the equipment catalogue.
  const club = useClub();
  const mapHidden = club.data?.info.map_visible === false;
  const [floorIdx, setFloorIdx] = useState(0);
  const [roomKey, setRoomKey] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [zoom, setZoom] = useState(false);
  const { width: screenW } = useWindowDimensions();
  const equipment = useQuery({
    queryKey: ['equipment', i18n.language],
    queryFn: () => api.get<EquipmentDto[]>('/public/equipment', { locale: i18n.language }),
    staleTime: 5 * 60_000,
  });

  const floor = map.data?.floors[floorIdx];
  const room = floor?.rooms.find((r) => r.key === roomKey) ?? null;
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (equipment.data ?? []).filter(
      (e) =>
        !term || e.name.toLowerCase().includes(term) || e.categoryName.toLowerCase().includes(term),
    );
  }, [equipment.data, q]);

  const zoomModal = floor ? (
    <Modal visible={zoom} animationType="fade" onRequestClose={() => setZoom(false)}>
      <SafeAreaView style={styles.zoomRoot} edges={['top', 'bottom']}>
        <View style={styles.zoomTop}>
          <Text style={[type.h3, { flex: 1 }]}>{floor.name}</Text>
          <Pressable
            onPress={() => setZoom(false)}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            hitSlop={10}
          >
            <X size={26} color={color.text.primary} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          <ScrollView horizontal contentContainerStyle={{ paddingEnd: 12 }}>
            <FloorMap
              floor={floor}
              selected={roomKey}
              onSelect={setRoomKey}
              fixedWidth={Math.max(screenW * 2, 700)}
            />
          </ScrollView>
        </ScrollView>
        <Text style={[type.bodySm, { textAlign: 'center', padding: 12 }]}>
          {t('app.explore.zoom_hint')}
        </Text>
      </SafeAreaView>
    </Modal>
  ) : null;

  return (
    <Screen
      refreshing={map.isFetching || equipment.isFetching}
      onRefresh={() => {
        void map.refetch();
        void equipment.refetch();
      }}
    >
      <BackHeader title={t('app.hub.map')} />
      {zoomModal}

      {mapHidden ? null : map.isPending ? (
        <Skeleton height={240} />
      ) : !map.data || map.data.floors.length === 0 ? (
        <Card>
          <EmptyState
            icon={MapPinned}
            title={t('app.explore.no_map')}
            text={t('app.explore.no_map_text')}
          />
        </Card>
      ) : (
        <>
          {map.data.isSchematic && (
            <View style={styles.notice}>
              <Info size={16} color={color.text.secondary} />
              <Text style={[type.bodySm, { flex: 1 }]}>{t('app.explore.schematic')}</Text>
            </View>
          )}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {map.data.floors.map((f, i) => (
              <Pressable
                key={f.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: i === floorIdx }}
                onPress={() => {
                  setFloorIdx(i);
                  setRoomKey(null);
                }}
                style={[styles.chip, i === floorIdx && styles.chipActive]}
              >
                <Text style={[styles.chipText, i === floorIdx && { color: color.text.primary }]}>
                  {f.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {floor && (
            <Card style={{ padding: 8 }}>
              <FloorMap floor={floor} selected={roomKey} onSelect={setRoomKey} />
              <Pressable
                onPress={() => setZoom(true)}
                accessibilityRole="button"
                accessibilityLabel={t('app.explore.zoom')}
                style={styles.zoomBtn}
                hitSlop={6}
              >
                <Maximize2 size={18} color={color.text.primary} />
              </Pressable>
            </Card>
          )}
          {floor && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
              accessibilityLabel={t('app.explore.rooms')}
            >
              {floor.rooms.map((r) => (
                <Pressable
                  key={r.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: r.key === roomKey }}
                  onPress={() => setRoomKey(r.key)}
                  style={[styles.roomChip, r.key === roomKey && styles.chipActive]}
                >
                  <Text
                    style={[
                      styles.roomChipText,
                      r.key === roomKey && { color: color.text.primary },
                    ]}
                  >
                    {r.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          {room ? (
            <Card style={{ gap: 10 }}>
              <Text style={type.h2}>{room.name}</Text>
              {room.isUnavailable && (
                <Text style={styles.warning}>
                  {room.unavailableNote ?? t('app.explore.unavailable')}
                </Text>
              )}
              {room.description && <Text style={type.bodySm}>{room.description}</Text>}
              {room.placements.length === 0 ? (
                <Text style={type.bodySm}>{t('app.explore.room_no_equipment')}</Text>
              ) : (
                room.placements.map((p) => (
                  <Pressable
                    key={p.equipmentId}
                    style={styles.row}
                    accessibilityRole="link"
                    onPress={() =>
                      router.push({ pathname: '/equipment/[id]', params: { id: p.equipmentId } })
                    }
                  >
                    <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <EquipmentStatusBadge status={p.status} />
                    <ChevronRight style={dirIcon} size={18} color={color.text.muted} />
                  </Pressable>
                ))
              )}
            </Card>
          ) : (
            <Text style={[type.bodySm, { textAlign: 'center' }]}>{t('app.explore.tap_room')}</Text>
          )}
        </>
      )}

      <SectionTitle>{t('app.explore.equipment')}</SectionTitle>
      <View style={styles.search}>
        <Search size={18} color={color.text.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t('app.explore.search')}
          placeholderTextColor={color.text.muted}
          style={styles.searchInput}
          accessibilityLabel={t('app.explore.search')}
        />
      </View>
      {equipment.isPending ? (
        <Skeleton height={160} />
      ) : filtered.length === 0 ? (
        <Text style={type.bodySm}>
          {t(q ? 'app.explore.no_results' : 'app.explore.no_equipment')}
        </Text>
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {filtered.map((e, i) => (
            <Pressable
              key={e.id}
              style={[styles.row, i > 0 && styles.divider]}
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/equipment/[id]', params: { id: e.id } })}
            >
              <View style={{ flex: 1 }}>
                <Text style={type.body} numberOfLines={1}>
                  {e.name}
                </Text>
                <Text style={type.bodySm} numberOfLines={1}>
                  {e.categoryName}
                  {e.location ? ` · ${e.location.roomName}` : ''}
                </Text>
              </View>
              <EquipmentStatusBadge status={e.status} />
              <ChevronRight style={dirIcon} size={18} color={color.text.muted} />
            </Pressable>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  zoomBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.bg.surface2,
    borderWidth: 1,
    borderColor: color.border.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomRoot: { flex: 1, backgroundColor: color.bg.base },
  zoomTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  title: { fontSize: 24, lineHeight: 30, paddingTop: 12 },
  notice: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: radius.sm,
    padding: 10,
  },
  chips: { gap: 8 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  chipActive: { borderColor: color.accent[500], backgroundColor: color.accent.tint },
  roomChip: {
    minHeight: 36,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: color.bg.surface2,
  },
  roomChipText: { fontFamily: fonts.medium, fontSize: 13, color: color.text.secondary },
  chipText: { fontFamily: fonts.semibold, fontSize: 14, color: color.text.secondary },
  warning: { color: color.status.warning, fontFamily: fonts.semibold, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
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
});
