import type { MapBackgroundDto, MapDto, MapFloorInput, RectShape } from '@grit/validation';
import { ROOM_STYLES, ROOM_TYPES } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Eye,
  EyeOff,
  ImagePlus,
  Layers,
  Map as MapIcon,
  Plus,
  Save,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { useCan } from '@/lib/me';
import { fitImage } from '../classes/resize-image';
import { useEquipmentList } from './EquipmentPage';

type Floor = MapFloorInput;
type Room = Floor['rooms'][number];
type Lang = 'sr' | 'en' | 'ru';
type Drag =
  | { kind: 'room'; room: number; dx: number; dy: number }
  | { kind: 'resize'; room: number }
  | { kind: 'placement'; room: number; placement: number };

const SNAP = 0.5;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Draft DTO → editable floors (the exact shape the API accepts back). */
function toEditable(map: MapDto): Floor[] {
  return map.floors.map((f) => ({
    key: f.key,
    level: f.level,
    width: f.width,
    height: f.height,
    names: {
      sr: f.names.sr ?? f.name,
      ...(f.names.en && { en: f.names.en }),
      ...(f.names.ru && { ru: f.names.ru }),
    },
    backgroundPath: f.backgroundPath,
    backgroundOpacity: f.backgroundOpacity,
    roomStyle: f.roomStyle,
    rooms: f.rooms.map((r) => ({
      key: r.key,
      type: r.type,
      shape: r.shape,
      names: {
        sr: r.names.sr ?? r.name,
        ...(r.names.en && { en: r.names.en }),
        ...(r.names.ru && { ru: r.names.ru }),
      },
      descriptions: {
        sr: r.descriptions.sr ?? null,
        en: r.descriptions.en ?? null,
        ru: r.descriptions.ru ?? null,
      },
      isHidden: r.isHidden,
      isUnavailable: r.isUnavailable,
      unavailableNote: r.unavailableNote,
      placements: r.placements.map((p) => ({ equipmentId: p.equipmentId, x: p.x, y: p.y })),
    })),
  }));
}

function uniqueKey(base: string, taken: string[]) {
  let i = 1;
  let k = base;
  while (taken.includes(k)) k = `${base}-${++i}`;
  return k;
}

export function MapEditorPage() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const qc = useQueryClient();
  const draft = useQuery({
    queryKey: ['map', 'draft', i18n.language],
    queryFn: () => api.get<MapDto>('/admin/map/draft', { locale: i18n.language }),
    refetchOnWindowFocus: false,
  });
  const equipment = useEquipmentList();
  const equipmentName = useMemo(
    () => new Map((equipment.data ?? []).map((e) => [e.id, e.name])),
    [equipment.data],
  );

  const [floors, setFloors] = useState<Floor[]>([]);
  const [revision, setRevision] = useState(1);
  const [isSchematic, setIsSchematic] = useState(true);
  // Saved changes members do not see yet (the draft is newer than the published map).
  const [unpublished, setUnpublished] = useState(false);
  const [floorIdx, setFloorIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  // Background path -> displayable URL (from the server, plus fresh uploads not saved yet).
  const [bgUrls, setBgUrls] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState(true);
  // Content language starts from the UI language (sr/en/ru); Serbian name is the required base.
  const [lang, setLang] = useState<Lang>(
    (['sr', 'en', 'ru'] as const).find((l) => i18n.language === l) ?? 'sr',
  );

  const load = (map: MapDto) => {
    setFloors(toEditable(map));
    setRevision(map.revision);
    setIsSchematic(map.isSchematic);
    setVisible(map.visibleToMembers);
    setUnpublished(Boolean(map.unpublishedChanges));
    setBgUrls((prev) => ({
      ...prev,
      ...Object.fromEntries(
        map.floors.flatMap((f) =>
          f.backgroundPath && f.backgroundUrl ? [[f.backgroundPath, f.backgroundUrl]] : [],
        ),
      ),
    }));
    setDirty(false);
  };
  useEffect(() => {
    if (draft.data && !dirty) load(draft.data);
    // only when fresh server data arrives (never overwrite unsaved edits)
  }, [draft.data]);

  // Warn before losing unsaved work.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const floor = floors[floorIdx];
  const room = floor && selected !== null ? floor.rooms[selected] : undefined;

  const update = (fn: (draft: Floor[]) => void) => {
    setFloors((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
  };
  const updateRoom = (fn: (r: Room) => void) =>
    update((d) => selected !== null && fn(d[floorIdx]!.rooms[selected]!));

  const save = useMutation({
    mutationFn: () =>
      api
        .raw<MapDto>('PUT', '/admin/map/draft', { body: { revision, isSchematic, floors } })
        .then((r) => r.data),
    onSuccess: (map) => {
      load(map);
      void qc.invalidateQueries({ queryKey: ['equipment'] });
      if (can('map.publish')) publish.mutate();
      else toast.success(t('admin.map.saved'));
    },
  });
  const publish = useMutation({
    mutationFn: () => api.post<MapDto>('/admin/map/publish'),
    onSuccess: () => {
      setConfirmPublish(false);
      setUnpublished(false);
      void qc.invalidateQueries({ queryKey: ['equipment'] });
      toast.success(t('admin.map.published'));
    },
  });

  const visibility = useMutation({
    mutationFn: (next: boolean) =>
      api.put<{ visible: boolean }>('/admin/map/visibility', { visible: next }),
    onSuccess: (r) => {
      setVisible(r.visible);
      toast.success(t(r.visible ? 'admin.map.visibility_on' : 'admin.map.visibility_off'));
    },
  });
  const uploadBg = useMutation({
    mutationFn: async (file: File) => {
      const bitmap = await createImageBitmap(file);
      const ratio = bitmap.height / bitmap.width;
      bitmap.close();
      const res = await api.post<MapBackgroundDto>('/admin/map/background', {
        image: await fitImage(file, 2000),
      });
      return { ...res, ratio };
    },
    onSuccess: ({ path, url, ratio }) => {
      setBgUrls((prev) => ({ ...prev, [path]: url }));
      // The floor takes the picture's proportions so walls in the image line up with the rooms.
      update((d) => {
        const f = d[floorIdx]!;
        f.backgroundPath = path;
        f.height = clamp(Math.round(f.width * ratio * 2) / 2, 5, 500);
        if (f.roomStyle === 'filled') f.roomStyle = 'outline';
      });
      toast.success(t('admin.map.background_fit'));
    },
  });

  if (draft.isError) return <ErrorState error={draft.error} onRetry={() => void draft.refetch()} />;
  if (!draft.data) return <Skeleton className="h-[60vh]" />;

  const addFloor = () => {
    const key = uniqueKey(
      'floor',
      floors.map((f) => f.key),
    );
    update((d) =>
      d.push({
        key,
        level: (d.at(-1)?.level ?? 1) - 1,
        width: 40,
        height: 24,
        names: { sr: t('admin.map.new_floor') },
        backgroundPath: null,
        backgroundOpacity: 1,
        roomStyle: 'filled',
        rooms: [],
      }),
    );
    setFloorIdx(floors.length);
    setSelected(null);
  };
  const addRoom = () => {
    if (!floor) return;
    const key = uniqueKey(
      'room',
      floor.rooms.map((r) => r.key),
    );
    update((d) =>
      d[floorIdx]!.rooms.push({
        key,
        type: 'other',
        shape: { type: 'rect', x: 1, y: 1, w: 8, h: 6 },
        names: { sr: t('admin.map.new_room') },
        descriptions: {},
        isHidden: false,
        isUnavailable: false,
        unavailableNote: null,
        placements: [],
      }),
    );
    setSelected(floor.rooms.length);
  };

  const error = save.error ?? publish.error ?? uploadBg.error ?? visibility.error;
  return (
    <>
      <PageHeader
        title={t('admin.map.title')}
        subtitle={t('admin.map.subtitle')}
        actions={
          <>
            {can('map.publish') && (
              <Button
                variant="ghost"
                icon={visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                loading={visibility.isPending}
                aria-pressed={visible}
                title={t('admin.map.visible_hint')}
                onClick={() => visibility.mutate(!visible)}
              >
                {t(visible ? 'admin.map.visible_on' : 'admin.map.visible_off')}
              </Button>
            )}
            <Button
              icon={can('map.publish') ? <Send className="size-4" /> : <Save className="size-4" />}
              loading={save.isPending || publish.isPending}
              disabled={!dirty || floors.length === 0}
              onClick={() => save.mutate()}
            >
              {t(
                !dirty
                  ? 'admin.map.saved_state'
                  : can('map.publish')
                    ? 'admin.map.save_publish'
                    : 'admin.map.save',
              )}
            </Button>
          </>
        }
      />
      {(dirty || unpublished) && (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-sm border border-status-warning/50 bg-status-warning/10 px-4 py-3 text-sm"
        >
          <span className="min-w-0 flex-1 text-status-warning">
            {t(dirty ? 'admin.map.unsaved_banner' : 'admin.map.unpublished_banner')}
          </span>
          {dirty ? (
            <Button
              size="sm"
              variant="secondary"
              loading={save.isPending || publish.isPending}
              onClick={() => save.mutate()}
            >
              {t(can('map.publish') ? 'admin.map.save_publish' : 'admin.map.save')}
            </Button>
          ) : (
            can('map.publish') && (
              <Button size="sm" loading={publish.isPending} onClick={() => publish.mutate()}>
                {t('admin.map.publish_now')}
              </Button>
            )
          )}
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-sm border border-status-danger/50 bg-status-danger/10 px-4 py-3 text-sm text-status-danger"
        >
          {t(error instanceof ApiError ? error.message : 'errors.internal')}
        </p>
      )}

      {!visible && (
        <p className="mb-4 flex items-center gap-2 rounded-sm border border-status-warning/50 bg-status-warning/10 px-4 py-3 text-sm">
          <EyeOff className="size-4 shrink-0 text-status-warning" />
          {t('admin.map.hidden_from_members')}
        </p>
      )}
      {floors.length === 0 ? (
        <Card>
          <EmptyState
            icon={Layers}
            title={t('admin.map.empty')}
            description={t('admin.map.empty_hint')}
            action={
              <Button icon={<Plus className="size-4" />} onClick={addFloor}>
                {t('admin.map.add_floor')}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1">
              {floors.map((f, i) => (
                <button
                  key={f.key + i}
                  type="button"
                  aria-pressed={i === floorIdx}
                  onClick={() => (setFloorIdx(i), setSelected(null))}
                  className={cn(
                    'h-9 shrink-0 rounded-sm border px-3 text-sm font-semibold',
                    i === floorIdx
                      ? 'border-accent-500 bg-accent-tint'
                      : 'border-border-subtle text-text-secondary',
                  )}
                >
                  {f.names[lang] ?? f.names.sr}
                </button>
              ))}
              <IconButton label={t('admin.map.add_floor')} onClick={addFloor}>
                <Plus className="size-4" />
              </IconButton>
              <label className="ms-auto flex shrink-0 items-center gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-accent-500)]"
                  checked={isSchematic}
                  onChange={(e) => (setIsSchematic(e.target.checked), setDirty(true))}
                />
                {t('admin.map.schematic')}
              </label>
            </div>
            {floor && (
              <Canvas
                floor={floor}
                selected={selected}
                onSelect={setSelected}
                onChange={(fn) => update((d) => fn(d[floorIdx]!))}
                equipmentName={equipmentName}
                lang={lang}
                backgroundUrl={floor.backgroundPath ? bgUrls[floor.backgroundPath] : undefined}
              />
            )}
            <p className="text-xs text-text-secondary">{t('admin.map.canvas_hint')}</p>
          </div>

          <Card className="h-fit p-4">
            <div className="mb-4 flex gap-1">
              {(['sr', 'en', 'ru'] as Lang[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={lang === l}
                  onClick={() => setLang(l)}
                  className={cn(
                    'h-8 flex-1 rounded-sm text-xs font-semibold',
                    lang === l ? 'bg-accent-tint text-text-primary' : 'text-text-secondary',
                  )}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            {room ? (
              <RoomPanel
                room={room}
                lang={lang}
                onChange={updateRoom}
                onClose={() => setSelected(null)}
                onDelete={() => {
                  update((d) => void d[floorIdx]!.rooms.splice(selected!, 1));
                  setSelected(null);
                }}
                equipment={equipment.data ?? []}
                equipmentName={equipmentName}
              />
            ) : floor ? (
              <FloorPanel
                floor={floor}
                lang={lang}
                onChange={(fn) => update((d) => fn(d[floorIdx]!))}
                onAddRoom={addRoom}
                backgroundUrl={floor.backgroundPath ? bgUrls[floor.backgroundPath] : undefined}
                uploading={uploadBg.isPending}
                onUpload={(file) => uploadBg.mutate(file)}
                onDelete={
                  floors.length > 1
                    ? () => {
                        update((d) => void d.splice(floorIdx, 1));
                        setFloorIdx(0);
                      }
                    : undefined
                }
              />
            ) : null}
          </Card>
        </div>
      )}

      <Modal
        open={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        size="sm"
        title={t('admin.map.publish')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmPublish(false)}>
              {t('common.cancel')}
            </Button>
            <Button loading={publish.isPending} onClick={() => publish.mutate()}>
              {t('admin.map.publish_confirm')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">{t('admin.map.publish_consequence')}</p>
      </Modal>
    </>
  );
}

const ROOM_FILL: Partial<Record<Room['type'], string>> = {
  gym: 'var(--color-accent-tint)',
  crossfit: 'var(--color-accent-tint)',
  boxing: 'var(--color-accent-tint)',
};

function Canvas({
  floor,
  selected,
  onSelect,
  onChange,
  equipmentName,
  lang,
  backgroundUrl,
}: {
  floor: Floor;
  selected: number | null;
  onSelect: (i: number | null) => void;
  onChange: (fn: (f: Floor) => void) => void;
  equipmentName: Map<string, string>;
  lang: Lang;
  backgroundUrl?: string;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const style = floor.roomStyle;
  const [drag, setDrag] = useState<Drag | null>(null);

  const point = (e: React.PointerEvent) => {
    const el = svg.current!;
    const pt = el.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(el.getScreenCTM()!.inverse());
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = point(e);
    onChange((f) => {
      const r = f.rooms[drag.room]!;
      const s = r.shape as RectShape;
      if (drag.kind === 'room') {
        const nx = clamp(snap(p.x - drag.dx), 0, f.width - s.w);
        const ny = clamp(snap(p.y - drag.dy), 0, f.height - s.h);
        // Machines placed in the room move together with it.
        for (const pl of r.placements) {
          pl.x += nx - s.x;
          pl.y += ny - s.y;
        }
        s.x = nx;
        s.y = ny;
      } else if (drag.kind === 'resize') {
        s.w = clamp(snap(p.x - s.x), 1, f.width - s.x);
        s.h = clamp(snap(p.y - s.y), 1, f.height - s.y);
      } else {
        const pl = r.placements[drag.placement]!;
        pl.x = clamp(snap(p.x), 0, f.width);
        pl.y = clamp(snap(p.y), 0, f.height);
      }
    });
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (selected === null) return;
    const d = {
      ArrowLeft: [-SNAP, 0],
      ArrowRight: [SNAP, 0],
      ArrowUp: [0, -SNAP],
      ArrowDown: [0, SNAP],
    }[e.key];
    if (!d) return;
    e.preventDefault();
    onChange((f) => {
      const s = f.rooms[selected]!.shape as RectShape;
      s.x = clamp(s.x + d[0]!, 0, f.width - s.w);
      s.y = clamp(s.y + d[1]!, 0, f.height - s.h);
    });
  };

  const grid = [];
  for (let x = 0; x <= floor.width; x++)
    grid.push(
      <line
        key={`x${x}`}
        x1={x}
        y1={0}
        x2={x}
        y2={floor.height}
        strokeWidth={x % 5 ? 0.02 : 0.05}
      />,
    );
  for (let y = 0; y <= floor.height; y++)
    grid.push(
      <line
        key={`y${y}`}
        x1={0}
        y1={y}
        x2={floor.width}
        y2={y}
        strokeWidth={y % 5 ? 0.02 : 0.05}
      />,
    );

  return (
    <div className="overflow-hidden rounded-md border border-border-subtle bg-bg-surface">
      <svg
        ref={svg}
        viewBox={`-0.5 -0.5 ${floor.width + 1} ${floor.height + 1}`}
        className="block w-full touch-none select-none"
        style={{ aspectRatio: `${floor.width + 1} / ${floor.height + 1}` }}
        onPointerMove={onMove}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
        onPointerDown={(e) => e.target === svg.current && onSelect(null)}
        onKeyDown={onKey}
        tabIndex={0}
        role="application"
        aria-label="map editor"
      >
        {backgroundUrl && (
          <image
            href={backgroundUrl}
            x={0}
            y={0}
            width={floor.width}
            height={floor.height}
            preserveAspectRatio="none"
            opacity={floor.backgroundOpacity}
            pointerEvents="none"
          />
        )}
        <g stroke="var(--color-border-strong)" opacity={backgroundUrl ? 0.35 : 1}>
          {grid}
        </g>
        {floor.rooms.map((r, i) => {
          const s = r.shape as RectShape;
          const isSel = i === selected;
          return (
            <g key={r.key + i} opacity={r.isHidden ? 0.45 : 1}>
              <rect
                x={s.x}
                y={s.y}
                width={s.w}
                height={s.h}
                rx={0.25}
                fill={ROOM_FILL[r.type] ?? 'var(--color-bg-surface2)'}
                fillOpacity={style === 'filled' ? 1 : style === 'outline' || isSel ? 0.15 : 0.001}
                stroke={
                  isSel
                    ? 'var(--color-accent-400)'
                    : r.isUnavailable
                      ? 'var(--color-status-warning)'
                      : 'var(--color-border-strong)'
                }
                strokeWidth={isSel ? 0.15 : 0.08}
                strokeOpacity={style === 'labels' && !isSel ? 0.25 : 1}
                strokeDasharray={r.isHidden || r.isUnavailable ? '0.4 0.3' : undefined}
                className="cursor-move"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelect(i);
                  const p = point(e);
                  svg.current?.setPointerCapture(e.pointerId);
                  setDrag({ kind: 'room', room: i, dx: p.x - s.x, dy: p.y - s.y });
                }}
              />
              <text
                x={s.x + s.w / 2}
                y={s.y + s.h / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={Math.min(1, s.w / 6)}
                fontWeight={700}
                fill="var(--color-text-primary)"
                stroke="var(--color-bg-base)"
                strokeWidth={backgroundUrl ? 0.12 : 0}
                paintOrder="stroke"
                pointerEvents="none"
              >
                {r.names[lang] ?? r.names.sr}
              </text>
              {r.placements.map((p, pi) => (
                <g
                  key={p.equipmentId}
                  className="cursor-grab"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSelect(i);
                    svg.current?.setPointerCapture(e.pointerId);
                    setDrag({ kind: 'placement', room: i, placement: pi });
                  }}
                >
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={0.55}
                    fill="var(--color-accent-500)"
                    stroke="var(--color-bg-base)"
                    strokeWidth={0.1}
                  />
                  <title>{equipmentName.get(p.equipmentId) ?? ''}</title>
                </g>
              ))}
              {isSel && (
                <rect
                  x={s.x + s.w - 0.6}
                  y={s.y + s.h - 0.6}
                  width={0.9}
                  height={0.9}
                  fill="var(--color-accent-400)"
                  className="cursor-nwse-resize"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    svg.current?.setPointerCapture(e.pointerId);
                    setDrag({ kind: 'resize', room: i });
                  }}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Moves a room and the machines placed in it by the same offset. */
function moveRoom(r: Room, dx: number, dy: number) {
  const s = r.shape as RectShape;
  s.x += dx;
  s.y += dy;
  for (const p of r.placements) {
    p.x += dx;
    p.y += dy;
  }
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <Field label={label}>
      {(p) => (
        <Input
          {...p}
          type="number"
          step={0.5}
          min={min}
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
        />
      )}
    </Field>
  );
}

function FloorPanel({
  floor,
  lang,
  onChange,
  onAddRoom,
  onDelete,
  backgroundUrl,
  uploading,
  onUpload,
}: {
  floor: Floor;
  lang: Lang;
  onChange: (fn: (f: Floor) => void) => void;
  onAddRoom: () => void;
  onDelete?: () => void;
  backgroundUrl?: string;
  uploading: boolean;
  onUpload: (file: File) => void;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Layers className="size-4 text-accent-400" /> {t('admin.map.floor')}
      </p>
      <Field label={t('admin.fields.name')} required={lang === 'sr'}>
        {(p) => (
          <Input
            {...p}
            value={floor.names[lang] ?? ''}
            onChange={(e) => onChange((f) => void (f.names[lang] = e.target.value))}
          />
        )}
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <NumberField
          label={t('admin.map.level')}
          value={floor.level}
          min={-10}
          onChange={(v) => onChange((f) => void (f.level = Math.round(v)))}
        />
        <NumberField
          label={t('admin.map.width')}
          value={floor.width}
          min={5}
          onChange={(v) => onChange((f) => void (f.width = v))}
        />
        <NumberField
          label={t('admin.map.height')}
          value={floor.height}
          min={5}
          onChange={(v) => onChange((f) => void (f.height = v))}
        />
      </div>
      <Field label={t('admin.map.key')} hint={t('admin.map.key_hint')}>
        {(p) => (
          <Input
            {...p}
            value={floor.key}
            onChange={(e) => onChange((f) => void (f.key = e.target.value.toLowerCase()))}
          />
        )}
      </Field>
      <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
        <p className="text-xs font-semibold tracking-wide text-text-secondary uppercase">
          {t('admin.map.background')}
        </p>
        <p className="text-xs text-text-muted">{t('admin.map.background_hint')}</p>
        {backgroundUrl && (
          <img
            src={backgroundUrl}
            alt=""
            className="max-h-32 w-full rounded-sm border border-border-subtle object-contain"
          />
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onUpload(file);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon={<ImagePlus className="size-4" />}
            loading={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {t(
              floor.backgroundPath ? 'admin.map.background_change' : 'admin.map.background_upload',
            )}
          </Button>
          {floor.backgroundPath && (
            <Button
              variant="ghost"
              icon={<Trash2 className="size-4" />}
              onClick={() => onChange((f) => void (f.backgroundPath = null))}
            >
              {t('admin.map.background_remove')}
            </Button>
          )}
        </div>
        {floor.backgroundPath && (
          <Field
            label={`${t('admin.map.background_opacity')}: ${Math.round(floor.backgroundOpacity * 100)}%`}
          >
            {(p) => (
              <input
                {...p}
                type="range"
                min={10}
                max={100}
                step={5}
                className="w-full accent-[var(--color-accent-500)]"
                value={Math.round(floor.backgroundOpacity * 100)}
                onChange={(e) =>
                  onChange((f) => void (f.backgroundOpacity = Number(e.target.value) / 100))
                }
              />
            )}
          </Field>
        )}
        <Field label={t('admin.map.room_style')}>
          {(p) => (
            <Select
              {...p}
              value={floor.roomStyle}
              onChange={(e) =>
                onChange((f) => void (f.roomStyle = e.target.value as Floor['roomStyle']))
              }
            >
              {ROOM_STYLES.map((rs) => (
                <option key={rs} value={rs}>
                  {t(`admin.map.room_styles.${rs}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Button icon={<Plus className="size-4" />} onClick={onAddRoom}>
        {t('admin.map.add_room')}
      </Button>
      {onDelete && (
        <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={onDelete}>
          {t('admin.map.delete_floor')}
        </Button>
      )}
    </div>
  );
}

function RoomPanel({
  room,
  lang,
  onChange,
  onClose,
  onDelete,
  equipment,
  equipmentName,
}: {
  room: Room;
  lang: Lang;
  onChange: (fn: (r: Room) => void) => void;
  onClose: () => void;
  onDelete: () => void;
  equipment: Array<{ id: string; name: string; archivedAt: string | null }>;
  equipmentName: Map<string, string>;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState('');
  const s = room.shape as RectShape;
  const available = equipment.filter(
    (e) => !e.archivedAt && !room.placements.some((p) => p.equipmentId === e.id),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <MapIcon className="size-4 text-accent-400" /> {t('admin.map.room')}
          {room.isHidden && (
            <Badge tone="neutral" icon={<EyeOff className="size-3" />}>
              {t('admin.map.hidden_badge')}
            </Badge>
          )}
        </p>
        <IconButton label={t('common.close')} onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </div>
      <Field label={t('admin.fields.name')} required={lang === 'sr'}>
        {(p) => (
          <Input
            {...p}
            value={room.names[lang] ?? ''}
            onChange={(e) => onChange((r) => void (r.names[lang] = e.target.value))}
          />
        )}
      </Field>
      <Field label={t('admin.map.description')}>
        {(p) => (
          <Textarea
            {...p}
            className="min-h-16"
            value={room.descriptions[lang] ?? ''}
            onChange={(e) => onChange((r) => void (r.descriptions[lang] = e.target.value))}
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('admin.map.type')}>
          {(p) => (
            <Select
              {...p}
              value={room.type}
              onChange={(e) => onChange((r) => void (r.type = e.target.value as Room['type']))}
            >
              {ROOM_TYPES.map((rt) => (
                <option key={rt} value={rt}>
                  {t(`admin.map.types.${rt}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('admin.map.key')}>
          {(p) => (
            <Input
              {...p}
              value={room.key}
              onChange={(e) => onChange((r) => void (r.key = e.target.value.toLowerCase()))}
            />
          )}
        </Field>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <NumberField
          label="X"
          value={s.x}
          onChange={(v) => onChange((r) => moveRoom(r, v - s.x, 0))}
        />
        <NumberField
          label="Y"
          value={s.y}
          onChange={(v) => onChange((r) => moveRoom(r, 0, v - s.y))}
        />
        <NumberField
          label={t('admin.map.w')}
          value={s.w}
          min={1}
          onChange={(v) => onChange((r) => void ((r.shape as RectShape).w = v))}
        />
        <NumberField
          label={t('admin.map.h')}
          value={s.h}
          min={1}
          onChange={(v) => onChange((r) => void ((r.shape as RectShape).h = v))}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-[var(--color-accent-500)]"
          checked={room.isHidden}
          onChange={(e) => onChange((r) => void (r.isHidden = e.target.checked))}
        />
        {t('admin.map.is_hidden')}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-[var(--color-accent-500)]"
          checked={room.isUnavailable}
          onChange={(e) => onChange((r) => void (r.isUnavailable = e.target.checked))}
        />
        {t('admin.map.is_unavailable')}
      </label>
      {room.isUnavailable && (
        <Field label={t('admin.map.unavailable_note')}>
          {(p) => (
            <Input
              {...p}
              value={room.unavailableNote ?? ''}
              onChange={(e) => onChange((r) => void (r.unavailableNote = e.target.value))}
            />
          )}
        </Field>
      )}

      <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
        <p className="text-xs font-semibold tracking-wide text-text-secondary uppercase">
          {t('admin.map.equipment_here')}
        </p>
        {room.placements.length === 0 && (
          <p className="text-sm text-text-muted">{t('admin.map.no_equipment')}</p>
        )}
        {room.placements.map((p, i) => (
          <div key={p.equipmentId} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">{equipmentName.get(p.equipmentId) ?? '-'}</span>
            <IconButton
              label={t('admin.map.remove_from_map')}
              onClick={() => onChange((r) => void r.placements.splice(i, 1))}
            >
              <X className="size-4" />
            </IconButton>
          </div>
        ))}
        <div className="flex gap-2">
          <Select
            aria-label={t('admin.map.add_equipment')}
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
          >
            <option value="">{t('admin.map.add_equipment')}</option>
            {available.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
          <Button
            variant="secondary"
            disabled={!adding}
            onClick={() => {
              onChange(
                (r) =>
                  void r.placements.push({
                    equipmentId: adding,
                    x: s.x + s.w / 2,
                    y: s.y + s.h / 2,
                  }),
              );
              setAdding('');
            }}
          >
            <Plus className="size-4" />
          </Button>
        </div>
        <p className="text-xs text-text-muted">{t('admin.map.equipment_safe')}</p>
      </div>
      <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={onDelete}>
        {t('admin.map.delete_room')}
      </Button>
    </div>
  );
}
