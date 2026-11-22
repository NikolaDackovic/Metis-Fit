import { create } from 'qrcode';
import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { color } from '@/theme';

/**
 * Pure-SVG QR renderer: black modules on white with a 4-module quiet zone -
 * the most reliable contrast for reception scanners (docs/DESIGN_SYSTEM.md §7).
 */
export function QrCode({ value, size }: { value: string; size: number }) {
  const { path, dim } = useMemo(() => {
    const qr = create(value, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const quiet = 4;
    let d = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.modules.get(x, y)) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
      }
    }
    return { path: d, dim: n + quiet * 2 };
  }, [value]);

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${dim} ${dim}`} accessibilityElementsHidden>
      <Rect width={dim} height={dim} fill={color.qr.background} />
      <Path d={path} fill={color.qr.foreground} />
    </Svg>
  );
}
