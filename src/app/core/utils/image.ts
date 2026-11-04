export interface ShrunkImage {
  mediaType: 'image/jpeg';
  /** Base64 without the data: prefix. */
  data: string;
}

/** Longest side after shrinking: enough to read small text in a phone screenshot. */
const MAX_SIDE = 1600;
const QUALITY = 0.82;

/**
 * Redraws a screenshot as a JPEG no larger than MAX_SIDE, so a batch stays well under the
 * server's request limit and uploads quickly on mobile data. Runs only in the browser.
 */
export async function shrinkImage(file: Blob): Promise<ShrunkImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot prepare images.');
  // White behind transparent PNGs, so JPEG does not turn them black.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
  return { mediaType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1) };
}
