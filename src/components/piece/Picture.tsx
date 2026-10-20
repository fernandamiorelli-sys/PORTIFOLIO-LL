import { forwardRef, type CSSProperties } from 'react';
import { media, srcSet } from '../../lib/media';

interface Props {
  slug: string;
  alt: string;
  sizes?: string;
  eager?: boolean;
  className?: string;
  imgClassName?: string;
  style?: CSSProperties;
  fit?: 'cover' | 'contain';
  position?: string;
}

/** <picture> com AVIF/WebP/JPG, placeholder borrado e proporção reservada (sem layout shift). */
export const Picture = forwardRef<HTMLImageElement, Props>(function Picture(
  { slug, alt, sizes = '(max-width: 760px) 90vw, 40vw', eager, className, imgClassName, style, fit = 'cover', position },
  ref,
) {
  const info = media(slug);
  if (!info) return null;
  const fallback = `/media/img/${slug}-${info.widths.filter((w) => w <= 960).at(-1) ?? info.widths[0]}.jpg`;
  return (
    <picture
      className={className}
      style={{
        backgroundImage: `url(${info.lqip})`,
        backgroundSize: fit,
        backgroundPosition: position ?? 'center',
        backgroundColor: info.color,
        ...style,
      }}
    >
      <source type="image/avif" srcSet={srcSet(slug, 'avif')} sizes={sizes} />
      <source type="image/webp" srcSet={srcSet(slug, 'webp')} sizes={sizes} />
      <img
        ref={ref}
        src={fallback}
        srcSet={srcSet(slug, 'jpg')}
        sizes={sizes}
        alt={alt}
        width={info.width}
        height={info.height}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={eager ? 'high' : undefined}
        className={imgClassName}
        style={{ objectFit: fit, objectPosition: position }}
        draggable={false}
      />
    </picture>
  );
});
