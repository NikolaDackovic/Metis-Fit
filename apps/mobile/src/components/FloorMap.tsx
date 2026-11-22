import type { MapDto } from '@grit/validation';
import { useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import Svg, { Circle, G, Image as SvgImage, Rect, Text as SvgText } from 'react-native-svg';
import { color, fonts } from '@/theme';

type Floor = MapDto['floors'][number];

const ACTIVE_TYPES = new Set(['gym', 'crossfit', 'boxing']);

/**
 * Read-only floor plan. Tap a room to select it (the same rooms are also listed as accessible
 * buttons by the screen, for screen readers and small rooms). Scales to the available width;
 * it is a schematic illustration, never indoor navigation or location tracking.
 */
export function FloorMap({
  floor,
  selected,
  onSelect,
}: {
  floor: Floor;
  selected: string | null;
  onSelect: (roomKey: string) => void;
}) {
  const [width, setWidth] = useState(0);
  const pad = 0.5;
  const vbW = floor.width + pad * 2;
  const vbH = floor.height + pad * 2;
  const height = width ? (width * vbH) / vbW : 0;

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={{ width: '100%' }}
    >
      {width > 0 && (
        <Svg width={width} height={height} viewBox={`${-pad} ${-pad} ${vbW} ${vbH}`}>
          {floor.backgroundUrl && (
            <SvgImage
              href={floor.backgroundUrl}
              x={0}
              y={0}
              width={floor.width}
              height={floor.height}
              preserveAspectRatio="none"
              opacity={floor.backgroundOpacity}
            />
          )}
          {floor.rooms.map((r) => {
            const s = r.shape;
            const isSel = r.key === selected;
            const fill = isSel
              ? color.accent[500]
              : ACTIVE_TYPES.has(r.type)
                ? '#2A1A14'
                : color.bg.surface2;
            return (
              <G key={r.key}>
                <Rect
                  onPress={() => onSelect(r.key)}
                  x={s.x}
                  y={s.y}
                  width={s.w}
                  height={s.h}
                  rx={0.3}
                  fill={fill}
                  fillOpacity={
                    isSel
                      ? 0.35
                      : floor.roomStyle === 'filled'
                        ? 1
                        : floor.roomStyle === 'outline'
                          ? 0.2
                          : 0.01
                  }
                  strokeOpacity={floor.roomStyle === 'labels' && !isSel ? 0 : 1}
                  stroke={
                    isSel
                      ? color.accent[400]
                      : r.isUnavailable
                        ? color.status.warning
                        : color.border.strong
                  }
                  strokeWidth={isSel ? 0.18 : 0.08}
                  strokeDasharray={r.isUnavailable ? '0.4 0.3' : undefined}
                />
                {floor.backgroundUrl && (
                  // Dark halo under the name so it stays readable on any picture.
                  <SvgText
                    x={s.x + s.w / 2}
                    y={s.y + s.h / 2}
                    textAnchor="middle"
                    alignmentBaseline="middle"
                    fontSize={Math.min(1.1, s.w / 6)}
                    fontFamily={fonts.bold}
                    fill={color.bg.base}
                    stroke={color.bg.base}
                    strokeWidth={0.28}
                    strokeLinejoin="round"
                  >
                    {r.name}
                  </SvgText>
                )}
                <SvgText
                  x={s.x + s.w / 2}
                  y={s.y + s.h / 2}
                  textAnchor="middle"
                  alignmentBaseline="middle"
                  fontSize={Math.min(1.1, s.w / 6)}
                  fontFamily={fonts.bold}
                  fill={color.text.primary}
                >
                  {r.name}
                </SvgText>
                {r.placements.map((p) => (
                  <Circle
                    key={p.equipmentId}
                    cx={p.x}
                    cy={p.y}
                    r={0.4}
                    fill={p.status === 'available' ? color.accent[500] : color.status.warning}
                  />
                ))}
              </G>
            );
          })}
        </Svg>
      )}
    </View>
  );
}
