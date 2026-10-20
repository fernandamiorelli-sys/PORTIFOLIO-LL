import { forwardRef, useId, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { SIGNATURE_FILL, SIGNATURE_STROKES, SIGNATURE_VIEWBOX } from '../../assets/signature';

export interface SignatureHandle {
  /** 0 = nada escrito, 1 = assinatura completa */
  set(progress: number): void;
}

/**
 * A assinatura se escreve traço a traço: as linhas centrais (extraídas por esqueletização)
 * funcionam como máscara que revela o preenchimento da letra, na ordem da escrita.
 */
export const Signature = forwardRef<SignatureHandle, { className?: string; title?: string }>(function Signature(
  { className, title = 'Assinatura de Lucas Lopes' },
  ref,
) {
  const id = useId().replace(/:/g, '');
  const strokesRef = useRef<SVGGElement>(null);
  const finalRef = useRef<SVGPathElement>(null);
  const lengths = useRef<number[]>([]);
  const total = useRef(0);

  useLayoutEffect(() => {
    const paths = Array.from(strokesRef.current?.querySelectorAll('path') ?? []);
    lengths.current = paths.map((p) => p.getTotalLength());
    total.current = lengths.current.reduce((a, b) => a + b, 0);
    paths.forEach((p, i) => {
      p.style.strokeDasharray = `${lengths.current[i]} ${lengths.current[i]}`;
      p.style.strokeDashoffset = `${lengths.current[i]}`;
      p.style.visibility = 'hidden';
    });
  }, []);

  useImperativeHandle(ref, () => ({
    set(progress: number) {
      const paths = strokesRef.current?.children;
      if (!paths) return;
      let budget = Math.max(0, Math.min(1, progress)) * total.current * 1.02;
      for (let i = 0; i < paths.length; i++) {
        const len = lengths.current[i];
        const drawn = Math.max(0, Math.min(len, budget));
        budget -= len;
        const path = paths[i] as SVGPathElement;
        path.style.strokeDashoffset = `${len - drawn}`;
        path.style.visibility = drawn > 0.01 ? 'visible' : 'hidden';
      }
      if (finalRef.current) finalRef.current.style.opacity = String(Math.max(0, (progress - 0.94) / 0.06));
    },
  }));

  return (
    <svg className={className} viewBox={`0 0 ${SIGNATURE_VIEWBOX.width} ${SIGNATURE_VIEWBOX.height}`} role="img" aria-label={title}>
      <defs>
        <mask id={`sig-${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width={SIGNATURE_VIEWBOX.width} height={SIGNATURE_VIEWBOX.height}>
          <g ref={strokesRef} fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
            {SIGNATURE_STROKES.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        </mask>
      </defs>
      <path d={SIGNATURE_FILL} fill="currentColor" mask={`url(#sig-${id})`} />
      <path ref={finalRef} d={SIGNATURE_FILL} fill="currentColor" style={{ opacity: 0 }} />
    </svg>
  );
});
