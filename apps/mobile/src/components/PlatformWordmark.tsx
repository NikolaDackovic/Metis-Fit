import { PLATFORM_COLOR, PLATFORM_NAME, PLATFORM_WORDMARK as W } from '@grit/design-tokens';
import { useId } from 'react';
import Svg, { Defs, G, Mask, Path, Rect } from 'react-native-svg';

/** "|||Metis Fit|||": the full name between barbell plates, for sign-in and welcome screens. */
export function PlatformWordmark({
  width = 300,
  color = PLATFORM_COLOR,
}: {
  width?: number;
  color?: string;
}) {
  const mask = `metis-wm-${useId().replace(/:/g, '')}`;
  return (
    <Svg
      width={width}
      height={width / W.ratio}
      viewBox={W.viewBox}
      accessible
      accessibilityRole="image"
      accessibilityLabel={PLATFORM_NAME}
    >
      <Defs>
        <Mask id={mask} maskUnits="userSpaceOnUse" x="-500" y="-500" width="3000" height="1500">
          <Rect x="-500" y="-500" width="3000" height="1500" fill="white" />
          {W.cuts.map((d) => (
            <Path key={d} d={d} stroke="black" strokeWidth={W.cutWidth} fill="none" />
          ))}
        </Mask>
      </Defs>
      <G fill={color} mask={`url(#${mask})`}>
        <G
          transform={`translate(0 ${W.plateSkew.cy}) skewX(${W.plateSkew.angle}) translate(0 ${-W.plateSkew.cy})`}
        >
          {W.plates.map((p) => (
            <Rect key={p.x} x={p.x} y={p.y} width={p.width} height={p.height} rx={p.rx} />
          ))}
        </G>
        {W.letters.map((d, i) => (
          <Path key={i} d={d} />
        ))}
      </G>
    </Svg>
  );
}
