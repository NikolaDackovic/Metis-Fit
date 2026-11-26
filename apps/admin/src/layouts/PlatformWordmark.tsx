import { PLATFORM_COLOR, PLATFORM_NAME, PLATFORM_WORDMARK as W } from '@grit/design-tokens';
import { useId } from 'react';

/** "|||Metis Fit|||": the same full wordmark the member app shows on its sign-in screen. */
export function PlatformWordmark({ className }: { className?: string }) {
  const mask = `metis-wm-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox={W.viewBox} className={className} role="img" aria-label={PLATFORM_NAME}>
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x="-500" y="-500" width="3000" height="1500">
          <rect x="-500" y="-500" width="3000" height="1500" fill="white" />
          {W.cuts.map((d) => (
            <path key={d} d={d} stroke="black" strokeWidth={W.cutWidth} fill="none" />
          ))}
        </mask>
      </defs>
      <g fill={PLATFORM_COLOR} mask={`url(#${mask})`}>
        <g
          transform={`translate(0 ${W.plateSkew.cy}) skewX(${W.plateSkew.angle}) translate(0 ${-W.plateSkew.cy})`}
        >
          {W.plates.map((p) => (
            <rect key={p.x} x={p.x} y={p.y} width={p.width} height={p.height} rx={p.rx} />
          ))}
        </g>
        {W.letters.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}
