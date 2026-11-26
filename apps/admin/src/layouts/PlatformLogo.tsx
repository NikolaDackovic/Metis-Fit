import { PLATFORM_COLOR, PLATFORM_MARK, PLATFORM_NAME } from '@grit/design-tokens';
import { useId } from 'react';
import { cn } from '@/components/ui/cn';

/** The platform mark ("M" with barbell plates) and, unless `markOnly`, the name at the same slant. */
export function PlatformLogo({ className, markOnly }: { className?: string; markOnly?: boolean }) {
  const mask = `metis-cut-${useId().replace(/:/g, '')}`;
  return (
    <span
      className={cn('inline-flex h-8 items-center gap-[0.3em] leading-none', className)}
      role="img"
      aria-label={PLATFORM_NAME}
    >
      <svg viewBox={PLATFORM_MARK.viewBox} className="h-full w-auto shrink-0" aria-hidden>
        <defs>
          <mask id={mask} maskUnits="userSpaceOnUse" x="-200" y="-50" width="500" height="220">
            <rect x="-200" y="-50" width="500" height="220" fill="white" />
            <path
              d={PLATFORM_MARK.cut}
              stroke="black"
              strokeWidth={PLATFORM_MARK.cutWidth}
              fill="none"
            />
          </mask>
        </defs>
        <g transform={`skewX(${PLATFORM_MARK.skewX})`} fill={PLATFORM_COLOR} mask={`url(#${mask})`}>
          {PLATFORM_MARK.plates.map((p) => (
            <rect key={p.x} {...p} rx={PLATFORM_MARK.plateRadius} />
          ))}
          <path d={PLATFORM_MARK.path} />
        </g>
      </svg>
      {!markOnly && (
        <span
          aria-hidden
          style={{
            color: PLATFORM_COLOR,
            fontFamily: "'Montserrat Variable', 'Montserrat', sans-serif",
            fontWeight: 800,
            fontSize: '0.95em',
            letterSpacing: '0.04em',
            transform: `skewX(${PLATFORM_MARK.skewX}deg)`,
            display: 'inline-block',
          }}
        >
          {PLATFORM_NAME}
        </span>
      )}
    </span>
  );
}
