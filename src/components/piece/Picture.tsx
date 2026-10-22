import { forwardRef, type CSSProperties } from 'react';
import { media, srcSet } from '../../lib/media';

/** Outra foto para outra tela (direção de arte): entra no lugar da principal quando `media` vale. */
interface ArtSource {
  slug: string;
  media: string;
  sizes?: string;
}

interface Props {
  slug: string;
  /** a mesma imagem em outro recorte, para outra tela (ex.: a horizontal no computador) */
  art?: ArtSource;
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
  { slug, art, alt, sizes = '(max-width: 760px) 90vw, 40vw', eager, className, imgClassName, style, fit = 'cover', position },
  ref,
) {
  const info = media(slug);
  if (!info) return null;
  const fallback = `/media/img/${slug}-${info.widths.filter((w) => w <= 960).at(-1) ?? info.widths[0]}.jpg`;
  const alt2 = art && media(art.slug);
  return (
    <picture
      className={className}
      style={{
        // com direção de arte, o placeholder de cada recorte vem por variável (o CSS escolhe pela tela)
        ...(alt2
          ? ({ '--lqip': `url(${info.lqip})`, '--lqip-art': `url(${alt2.lqip})` } as CSSProperties)
          : { backgroundImage: `url(${info.lqip})` }),
        backgroundSize: fit,
        backgroundPosition: position ?? (alt2 ? undefined : 'center'),
        backgroundColor: info.color,
        ...style,
      }}
    >
      {art && alt2
        ? (['avif', 'webp', 'jpg'] as const).map((f) => (
            <source key={f} media={art.media} type={f === 'jpg' ? 'image/jpeg' : `image/${f}`} srcSet={srcSet(art.slug, f)} sizes={art.sizes ?? sizes} />
          ))
        : null}
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
