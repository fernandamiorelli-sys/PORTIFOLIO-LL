import manifest from '../data/media-manifest.json';

export interface MediaInfo {
  width: number;
  height: number;
  widths: number[];
  lqip: string;
  color: string;
}

const MEDIA = manifest as Record<string, MediaInfo>;

export function media(slug: string): MediaInfo | undefined {
  return MEDIA[slug];
}

export function hasMedia(slug: string) {
  return slug in MEDIA;
}

export function srcSet(slug: string, format: 'avif' | 'webp' | 'jpg') {
  const info = MEDIA[slug];
  if (!info) return '';
  return info.widths.map((w) => `/media/img/${slug}-${w}.${format} ${w}w`).join(', ');
}

/** URL de uma variante específica (a maior até `max` px). */
export function imageUrl(slug: string, max = 960, format: 'avif' | 'webp' | 'jpg' = 'jpg') {
  const info = MEDIA[slug];
  if (!info) return '';
  const w = info.widths.filter((x) => x <= max).at(-1) ?? info.widths[0];
  return `/media/img/${slug}-${w}.${format}`;
}

/** A variante que o navegador escolhe para `need` pixels de tela (a menor que basta, senão a maior):
 *  para pré-carregar a mesma que o <picture> vai pedir. */
export function imageFor(slug: string, need: number, format: 'avif' | 'webp' | 'jpg' = 'jpg') {
  const info = MEDIA[slug];
  if (!info) return '';
  const w = info.widths.find((x) => x >= need) ?? info.widths.at(-1);
  return `/media/img/${slug}-${w}.${format}`;
}

/** Melhor formato suportado, detectado uma vez (para canvas/WebGL, que não usam <picture>). */
export const bestFormat: Promise<'avif' | 'webp' | 'jpg'> = (async () => {
  const test = (src: string) =>
    new Promise<boolean>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.width > 0);
      img.onerror = () => resolve(false);
      img.src = src;
    });
  if (await test('data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=')) return 'avif';
  if (await test('data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==')) return 'webp';
  return 'jpg';
})();

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
