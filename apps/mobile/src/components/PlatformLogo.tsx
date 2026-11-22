import { PLATFORM_COLOR, PLATFORM_MARK, PLATFORM_NAME } from '@grit/design-tokens';
import { useId } from 'react';
import { Text, View } from 'react-native';
import Svg, { Defs, G, Mask, Path, Rect } from 'react-native-svg';
import { fonts } from '@/theme';

/** The platform mark ("M" with barbell plates) and, unless `markOnly`, the name at the same slant. */
export function PlatformLogo({
  height = 40,
  markOnly,
  color = PLATFORM_COLOR,
}: {
  height?: number;
  markOnly?: boolean;
  color?: string;
}) {
  const mask = `metis-cut-${useId().replace(/:/g, '')}`;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={PLATFORM_NAME}
      style={{ flexDirection: 'row', alignItems: 'center', gap: height * 0.25 }}
    >
      <Svg width={height * PLATFORM_MARK.ratio} height={height} viewBox={PLATFORM_MARK.viewBox}>
        <Defs>
          <Mask id={mask} maskUnits="userSpaceOnUse" x="-200" y="-50" width="500" height="220">
            <Rect x="-200" y="-50" width="500" height="220" fill="white" />
            <Path
              d={PLATFORM_MARK.cut}
              stroke="black"
              strokeWidth={PLATFORM_MARK.cutWidth}
              fill="none"
            />
          </Mask>
        </Defs>
        <G transform={`skewX(${PLATFORM_MARK.skewX})`} fill={color} mask={`url(#${mask})`}>
          {PLATFORM_MARK.plates.map((p) => (
            <Rect key={p.x} {...p} rx={PLATFORM_MARK.plateRadius} />
          ))}
          <Path d={PLATFORM_MARK.path} />
        </G>
      </Svg>
      {!markOnly && (
        <Text
          style={{
            color,
            fontFamily: fonts.extrabold,
            fontSize: height * 0.82,
            lineHeight: height,
            letterSpacing: height * 0.04,
            transform: [{ skewX: `${PLATFORM_MARK.skewX}deg` }],
          }}
        >
          {PLATFORM_NAME}
        </Text>
      )}
    </View>
  );
}
