import { useState } from 'react';
import { type LayoutChangeEvent, Text, View } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { color, fonts } from '@/theme';

/**
 * Minimal bar chart (react-native-svg, no chart library). The last bar is highlighted.
 * Screen readers get a text summary instead of the graphic.
 */
export function BarChart({
  data,
  format = (v) => String(v),
  label,
  height = 140,
}: {
  data: Array<{ label: string; value: number }>;
  format?: (v: number) => string;
  label: string;
  height?: number;
}) {
  const [width, setWidth] = useState(0);
  const max = Math.max(1, ...data.map((d) => d.value));
  const gap = 6;
  const barW = data.length ? (width - gap * (data.length - 1)) / data.length : 0;
  const chartH = height - 34;
  const summary = data.map((d) => `${d.label}: ${format(d.value)}`).join(', ');
  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={`${label}. ${summary}`}
    >
      {width > 0 && (
        <Svg width={width} height={height}>
          {data.map((d, i) => {
            const h = Math.max(2, (d.value / max) * chartH);
            const x = i * (barW + gap);
            const last = i === data.length - 1;
            return (
              <Rect
                key={`${d.label}-${i}`}
                x={x}
                y={chartH - h + 14}
                width={Math.max(2, barW)}
                height={h}
                rx={3}
                fill={last ? color.accent[500] : color.bg.surface2}
              />
            );
          })}
          {data.length > 0 && (
            <SvgText
              x={width}
              y={10}
              textAnchor="end"
              fontSize={11}
              fontFamily={fonts.semibold}
              fill={color.text.secondary}
            >
              {format(data[data.length - 1]!.value)}
            </SvgText>
          )}
          {data.map((d, i) =>
            i === 0 || i === data.length - 1 ? (
              <SvgText
                key={`l-${i}`}
                x={i === 0 ? 0 : width}
                y={height - 4}
                textAnchor={i === 0 ? 'start' : 'end'}
                fontSize={10}
                fontFamily={fonts.medium}
                fill={color.text.muted}
              >
                {d.label}
              </SvgText>
            ) : null,
          )}
        </Svg>
      )}
      {data.length === 0 && <Text style={{ color: color.text.muted }}>-</Text>}
    </View>
  );
}
