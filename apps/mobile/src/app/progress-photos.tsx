import { PHOTO_POSES, type ProgressPhotoDto, type ProgressPhotoFullDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Columns2, ImagePlus, Lock, Trash2, Users, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { BackHeader } from '@/components/BackHeader';
import { Toggle } from '@/components/Toggle';
import { Button, Card, EmptyState, ErrorNote, Field, Screen } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { localDay, toNum } from '@/lib/food';
import { useFormat } from '@/lib/format';
import { color, fonts, radius, type } from '@/theme';

type Pose = (typeof PHOTO_POSES)[number];
type Picked = { image: string; thumb: string; preview: string };

/** Resizes on the phone: the full photo (~1080 px) and a small preview for lists. */
async function prepare(uri: string): Promise<Picked | null> {
  const full = await (
    await ImageManipulator.manipulate(uri).resize({ width: 1080 }).renderAsync()
  ).saveAsync({ compress: 0.72, format: SaveFormat.JPEG, base64: true });
  const small = await (
    await ImageManipulator.manipulate(uri).resize({ width: 240 }).renderAsync()
  ).saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
  if (!full.base64 || !small.base64) return null;
  return {
    image: `data:image/jpeg;base64,${full.base64}`,
    thumb: `data:image/jpeg;base64,${small.base64}`,
    preview: full.uri,
  };
}

async function pick(source: 'camera' | 'library'): Promise<Picked | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const r =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets[0]) return null;
  return prepare(r.assets[0].uri);
}

/**
 * F18-1 progress photos: private photos of the body over time (front, side, back), compared
 * side by side. Stored privately; each photo can be shared with the trainer, off by default.
 */
export default function ProgressPhotosScreen() {
  const { t } = useTranslation();
  const f = useFormat();
  const { width } = useWindowDimensions();
  const [adding, setAdding] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[] | null>(null);
  const q = useQuery({
    queryKey: ['me', 'progress-photos'],
    queryFn: () => api.get<ProgressPhotoDto[]>('/me/progress-photos'),
  });
  const tile = (Math.min(width, 560) - 32 - 16) / 3;

  const start = async (source: 'camera' | 'library') => {
    setBusy(true);
    try {
      const p = await pick(source);
      if (p) setAdding(p);
    } finally {
      setBusy(false);
    }
  };
  const onTile = (id: string) => {
    if (!compare) return setOpen(id);
    if (compare.includes(id)) return setCompare(compare.filter((x) => x !== id));
    const next = [...compare, id].slice(-2);
    setCompare(next);
  };

  return (
    <Screen>
      <BackHeader title={t('app.photos.title')} />
      <View style={styles.privacy}>
        <Lock size={16} color={color.text.secondary} />
        <Text style={[type.bodySm, { flex: 1 }]}>{t('app.photos.privacy')}</Text>
      </View>

      <View style={styles.actions}>
        {Platform.OS !== 'web' && (
          <View style={{ flex: 1 }}>
            <Button
              label={t('app.photos.take')}
              icon={Camera}
              onPress={() => void start('camera')}
              loading={busy}
            />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Button
            label={t('app.photos.choose')}
            icon={ImagePlus}
            variant={Platform.OS === 'web' ? 'primary' : 'secondary'}
            onPress={() => void start('library')}
            loading={busy && Platform.OS === 'web'}
          />
        </View>
      </View>

      {q.data && q.data.length >= 2 && (
        <Pressable
          onPress={() => setCompare(compare ? null : [])}
          accessibilityRole="button"
          style={[styles.compareBtn, compare && styles.compareOn]}
        >
          <Columns2 size={18} color={compare ? color.onAccent : color.accent[400]} />
          <Text style={[styles.compareText, compare && { color: color.onAccent }]}>
            {compare
              ? t('app.photos.compare_pick', { n: compare.length })
              : t('app.photos.compare')}
          </Text>
        </Pressable>
      )}

      {q.error ? (
        <ErrorNote message={q.error instanceof ApiError ? q.error.message : 'errors.internal'} />
      ) : q.data && q.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Camera}
            title={t('app.photos.empty')}
            text={t('app.photos.empty_text')}
          />
        </Card>
      ) : (
        <View style={styles.grid}>
          {(q.data ?? []).map((p) => {
            const sel = compare?.includes(p.id);
            return (
              <Pressable
                key={p.id}
                onPress={() => onTile(p.id)}
                accessibilityRole="button"
                accessibilityLabel={`${f.date(p.takenOn)} ${t(`app.photos.poses.${p.pose}`)}`}
                style={[styles.tile, { width: tile, height: tile * 1.33 }, sel && styles.tileSel]}
              >
                <Image
                  source={{ uri: p.thumb }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
                <View style={styles.tileFoot}>
                  <Text style={styles.tileDate}>
                    {f.date(p.takenOn, { day: 'numeric', month: 'short' })}
                  </Text>
                  {p.shared && <Users size={12} color="#fff" />}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {compare && compare.length === 2 && (
        <Button
          label={t('app.photos.compare_show')}
          onPress={() => setOpen(`compare:${compare.join(',')}`)}
        />
      )}

      {adding && <AddSheet picked={adding} onClose={() => setAdding(null)} />}
      {open && !open.startsWith('compare:') && (
        <PhotoView id={open} onClose={() => setOpen(null)} />
      )}
      {open?.startsWith('compare:') && (
        <CompareView
          ids={open.slice(8).split(',')}
          list={q.data ?? []}
          onClose={() => {
            setOpen(null);
            setCompare(null);
          }}
        />
      )}
    </Screen>
  );
}

function PoseChips({ value, onChange }: { value: Pose; onChange: (p: Pose) => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.chips}>
      {PHOTO_POSES.map((p) => (
        <Pressable
          key={p}
          onPress={() => onChange(p)}
          accessibilityRole="button"
          accessibilityState={{ selected: p === value }}
          style={[styles.chip, p === value && styles.chipOn]}
        >
          <Text style={[styles.chipText, p === value && { color: color.text.primary }]}>
            {t(`app.photos.poses.${p}`)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      >
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.sheetTop}>
            <Text style={[type.h2, { flex: 1 }]}>{title}</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              hitSlop={8}
            >
              <X size={22} color={color.text.primary} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 14 }}>{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function AddSheet({ picked, onClose }: { picked: Picked; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [pose, setPose] = useState<Pose>('front');
  const [weight, setWeight] = useState('');
  const [shared, setShared] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      api.post<ProgressPhotoDto>('/me/progress-photos', {
        image: picked.image,
        thumb: picked.thumb,
        takenOn: localDay(new Date()),
        pose,
        weightKg: toNum(weight),
        shared,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me', 'progress-photos'] });
      onClose();
    },
  });
  return (
    <Sheet title={t('app.photos.new')} onClose={onClose}>
      <Image source={{ uri: picked.image }} style={styles.preview} resizeMode="contain" />
      <Text style={type.label}>{t('app.photos.pose')}</Text>
      <PoseChips value={pose} onChange={setPose} />
      <Field
        label={t('app.photos.weight')}
        value={weight}
        onChangeText={setWeight}
        keyboardType="decimal-pad"
        maxLength={5}
        placeholder="80,5"
      />
      <View style={styles.shareRow}>
        <View style={{ flex: 1 }}>
          <Text style={type.body}>{t('app.photos.share')}</Text>
          <Text style={type.bodySm}>{t('app.photos.share_hint')}</Text>
        </View>
        <Toggle
          value={shared}
          onValueChange={setShared}
          accessibilityLabel={t('app.photos.share')}
        />
      </View>
      {save.error && (
        <ErrorNote
          message={save.error instanceof ApiError ? save.error.message : 'errors.internal'}
        />
      )}
      <Button label={t('app.photos.save')} loading={save.isPending} onPress={() => save.mutate()} />
    </Sheet>
  );
}

function useFullPhoto(id: string) {
  return useQuery({
    queryKey: ['me', 'progress-photos', id],
    queryFn: () => api.get<ProgressPhotoFullDto>(`/me/progress-photos/${id}`),
    staleTime: 10 * 60_000,
  });
}

function PhotoView({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const q = useFullPhoto(id);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['me', 'progress-photos'] });
  const share = useMutation({
    mutationFn: (v: boolean) => api.patch(`/me/progress-photos/${id}`, { shared: v }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/me/progress-photos/${id}`),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });
  const p = q.data;
  return (
    <Sheet
      title={p ? f.date(p.takenOn, { day: 'numeric', month: 'long', year: 'numeric' }) : ' '}
      onClose={onClose}
    >
      {p ? (
        <Image source={{ uri: p.image }} style={styles.preview} resizeMode="contain" />
      ) : (
        <ActivityIndicator color={color.accent[500]} />
      )}
      {p && (
        <>
          <Text style={type.bodySm}>
            {[t(`app.photos.poses.${p.pose}`), p.weightKg != null ? `${p.weightKg} kg` : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <View style={styles.shareRow}>
            <View style={{ flex: 1 }}>
              <Text style={type.body}>{t('app.photos.share')}</Text>
              <Text style={type.bodySm}>{t('app.photos.share_hint')}</Text>
            </View>
            <Toggle
              value={share.isPending ? Boolean(share.variables) : p.shared}
              onValueChange={(v) => share.mutate(v)}
              accessibilityLabel={t('app.photos.share')}
            />
          </View>
          <Button
            label={t('app.photos.delete')}
            icon={Trash2}
            variant="ghost"
            loading={remove.isPending}
            onPress={() => remove.mutate()}
          />
        </>
      )}
    </Sheet>
  );
}

function CompareView({
  ids,
  list,
  onClose,
}: {
  ids: string[];
  list: ProgressPhotoDto[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const sorted = [...ids].sort((a, b) =>
    (list.find((p) => p.id === a)?.takenOn ?? '').localeCompare(
      list.find((p) => p.id === b)?.takenOn ?? '',
    ),
  );
  const a = useFullPhoto(sorted[0]!);
  const b = useFullPhoto(sorted[1]!);
  const diff =
    a.data?.weightKg != null && b.data?.weightKg != null
      ? Math.round((b.data.weightKg - a.data.weightKg) * 10) / 10
      : null;
  const days =
    a.data && b.data
      ? Math.round((Date.parse(b.data.takenOn) - Date.parse(a.data.takenOn)) / 86_400_000)
      : null;
  return (
    <Sheet title={t('app.photos.compare')} onClose={onClose}>
      <View style={styles.compareRow}>
        {[a, b].map((x, i) => (
          <View key={i} style={{ flex: 1, gap: 6 }}>
            {x.data ? (
              <Image source={{ uri: x.data.image }} style={styles.half} resizeMode="cover" />
            ) : (
              <View style={[styles.half, { alignItems: 'center', justifyContent: 'center' }]}>
                <ActivityIndicator color={color.accent[500]} />
              </View>
            )}
            <Text style={[type.bodySm, { textAlign: 'center' }]}>
              {x.data ? f.date(x.data.takenOn) : ' '}
              {x.data?.weightKg != null ? ` · ${x.data.weightKg} kg` : ''}
            </Text>
          </View>
        ))}
      </View>
      {days != null && (
        <Text style={[type.h3, { textAlign: 'center' }]}>
          {t('app.photos.diff_days', { n: days })}
          {diff != null ? ` · ${diff > 0 ? '+' : ''}${diff} kg` : ''}
        </Text>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  privacy: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  actions: { flexDirection: 'row', gap: 10 },
  compareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: color.accent[500],
  },
  compareOn: { backgroundColor: color.accent[500] },
  compareText: { fontFamily: fonts.semibold, fontSize: 14, color: color.accent[400] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: color.bg.surface2 },
  tileSel: { borderWidth: 3, borderColor: color.accent[500] },
  tileFoot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  tileDate: { fontFamily: fonts.semibold, fontSize: 11, color: '#fff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  chipOn: { borderColor: color.accent[500], backgroundColor: color.accent.tint },
  chipText: { fontFamily: fonts.semibold, fontSize: 13, color: color.text.secondary },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '92%',
    alignSelf: 'center',
    gap: 14,
    padding: 20,
    paddingBottom: 28,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: color.bg.surface,
  },
  sheetTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  preview: { width: '100%', height: 380, borderRadius: radius.md, backgroundColor: '#000' },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  compareRow: { flexDirection: 'row', gap: 8 },
  half: { width: '100%', aspectRatio: 0.75, borderRadius: radius.md, backgroundColor: '#000' },
});
