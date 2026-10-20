import { Fragment, useEffect, useRef, useState, type CSSProperties, type ElementType } from 'react';
import { reducedMotion } from '../../lib/store';
import { ADV } from './advances';

/**
 * Escada de resolução da Redaction: 100 é o bitmap mais grosso, 0 é a serifa limpa.
 * Cada letra sobe a escada no seu próprio tempo, como um sinal sendo captado.
 */
export const LADDER = [100, 70, 50, 35, 20, 0] as const;
export type Level = (typeof LADDER)[number];

interface RunOptions {
  from?: Level;
  to?: Level;
  /** janela (s) em que as letras começam a resolver */
  spread?: number;
  /** duração (s) de cada degrau */
  step?: number;
  delay?: number;
  /** chance, por quadro, de uma letra voltar um degrau (interferência) */
  jitter?: number;
  onDone?: () => void;
}

/** Anima um conjunto de letras (.rz) pela escada. Devolve uma função que cancela. */
export function runResolve(chars: HTMLElement[], opts: RunOptions = {}) {
  const from = LADDER.indexOf(opts.from ?? 100);
  const to = LADDER.indexOf(opts.to ?? 0);
  const dir = to >= from ? 1 : -1;
  const steps = Math.abs(to - from);
  const step = opts.step ?? 0.07;
  const spread = opts.spread ?? 0.6;
  const delay = opts.delay ?? 0;
  const jitter = opts.jitter ?? 0.012;
  const n = Math.max(1, chars.length - 1);
  // da esquerda para a direita, mas com acaso: nenhuma palavra resolve de uma vez
  const starts = chars.map((_, i) => delay + (i / n) * spread * 0.55 + Math.random() * spread * 0.45);
  const t0 = performance.now();
  let raf = 0;
  const tick = (now: number) => {
    const t = (now - t0) / 1000;
    let done = true;
    for (let i = 0; i < chars.length; i++) {
      const k = Math.floor((t - starts[i]) / step);
      let idx: number;
      if (k < 0) {
        idx = from;
        done = false;
      } else if (k >= steps) {
        idx = to;
      } else {
        idx = from + dir * k;
        done = false;
        if (Math.random() < jitter) idx = Math.max(0, Math.min(LADDER.length - 1, idx - dir));
      }
      const l = String(LADDER[idx]);
      if (chars[i].dataset.l !== l) chars[i].dataset.l = l;
    }
    if (done) opts.onDone?.();
    else raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

/** Coloca todas as letras num degrau, sem animar. */
export function setLevel(chars: HTMLElement[], level: Level) {
  const l = String(level);
  for (const c of chars) c.dataset.l = l;
}

interface Segment {
  text: string;
  /** degrau em que o trecho termina (o "não" fica em 100) */
  rest: Level;
  italic: boolean;
}

/** `Tudo o que [[não]] somos`: trechos entre [[ ]] ficam em baixa resolução e em itálico. */
export function parseSegments(text: string, rest: Level = 0): Segment[] {
  const out: Segment[] = [];
  const re = /\[\[(.+?)\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), rest, italic: false });
    out.push({ text: m[1], rest: 100, italic: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), rest, italic: false });
  return out;
}

export const plain = (text: string) => text.replace(/\[\[|\]\]/g, '');

interface ResolveProps {
  text: string;
  as?: ElementType;
  className?: string;
  id?: string;
  /** degrau final */
  rest?: Level;
  /** degrau inicial */
  from?: Level;
  /** 'view': quando entra na tela · 'mount': ao montar · 'none': controlado por fora */
  trigger?: 'view' | 'mount' | 'none';
  delay?: number;
  spread?: number;
  step?: number;
  style?: CSSProperties;
}

/**
 * Texto que entra em foco. Enquanto resolve, cada letra ocupa a largura exata da versão limpa
 * (nada se mexe); quando termina, volta a ser texto corrido, com kerning.
 */
export function Resolve({ text, as: Tag = 'span', className, id, rest = 0, from = 100, trigger = 'view', delay = 0, spread = 0.6, step = 0.07, style }: ResolveProps) {
  const ref = useRef<HTMLElement>(null);
  const segments = parseSegments(text, rest);
  const [settled, setSettled] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) return;
    setSettled(false);
  }, [text]);

  useEffect(() => {
    const el = ref.current;
    if (!el || settled) return;
    const groups = new Map<Level, HTMLElement[]>();
    el.querySelectorAll<HTMLElement>('.rz[data-rest]').forEach((c) => {
      const r = Number(c.dataset.rest) as Level;
      groups.set(r, [...(groups.get(r) ?? []), c]);
    });
    const all = [...groups.values()].flat();
    setLevel(all, from);
    if (trigger === 'none') return;
    let cancels: (() => void)[] = [];
    let pending = groups.size;
    const play = () => {
      groups.forEach((chars, r) =>
        cancels.push(
          runResolve(chars, {
            from,
            to: r,
            delay,
            spread,
            step,
            onDone: () => {
              pending -= 1;
              if (pending === 0) setSettled(true);
            },
          }),
        ),
      );
    };
    if (trigger === 'mount') {
      play();
      return () => cancels.forEach((c) => c());
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        play();
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancels.forEach((c) => c());
      cancels = [];
    };
  }, [text, rest, from, trigger, delay, spread, step, settled]);

  return (
    <Tag ref={ref} className={className} id={id} style={style} data-resolve={settled ? 'done' : 'live'}>
      <span className="sr-only">{plain(text)}</span>
      <span aria-hidden="true">
        {segments.map((seg, si) => {
          if (settled) {
            return seg.italic ? (
              <em key={si} className="rz rz-no" data-l={seg.rest}>
                {seg.text}
              </em>
            ) : (
              <Fragment key={si}>{seg.text}</Fragment>
            );
          }
          const words = seg.text.split(/(\s+)/);
          const Wrap = seg.italic ? 'em' : Fragment;
          return (
            <Wrap key={si} {...(seg.italic ? { className: 'rz-no' } : {})}>
              {words.map((w, wi) =>
                /^\s+$/.test(w) ? (
                  <Fragment key={wi}> </Fragment>
                ) : w ? (
                  <span key={wi} className="rz-word">
                    {[...w].map((ch, ci) => (
                      <span key={ci} className="rz rz-c" data-l={from} data-rest={seg.rest} style={{ '--a': ADV[ch] ?? 0.55 } as CSSProperties}>
                        {ch}
                      </span>
                    ))}
                  </span>
                ) : null,
              )}
            </Wrap>
          );
        })}
      </span>
    </Tag>
  );
}
