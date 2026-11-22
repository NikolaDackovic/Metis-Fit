/**
 * Center-crops an image file to a square and scales it to `size` px, returning a JPEG data URL.
 * Done in the browser so uploads stay small (well under the API's 1 MB limit) and EXIF/GPS
 * metadata from phone cameras is dropped.
 */
export async function squareJpeg(file: File, size = 800, quality = 0.85): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  // Portraits: keep a bit more of the top (faces) than a strict center crop.
  const sy =
    bitmap.height > bitmap.width ? (bitmap.height - side) * 0.2 : (bitmap.height - side) / 2;
  const out = Math.min(size, side);
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Scales an image to fit `max` px on its longer side (no crop). PNG keeps transparency (logos);
 * photos become JPEG. Steps the quality down until the data URL fits the API limit.
 */
export async function fitImage(
  file: File,
  max = 1600,
  type: 'image/jpeg' | 'image/png' = 'image/jpeg',
) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  if (type === 'image/png') return canvas.toDataURL('image/png');
  for (const q of [0.85, 0.75, 0.65, 0.5]) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (url.length < 1_350_000) return url;
  }
  return canvas.toDataURL('image/jpeg', 0.4);
}
