/** Downscale to max 256px longest side, re-encode as WebP/JPEG ~0.8 → data URL */
export async function fileToDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 256 / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  const webp = c.toDataURL('image/webp', 0.8)
  return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', 0.8)
}
