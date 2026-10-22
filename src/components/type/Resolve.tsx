import { Fragment, memo, useEffect, useRef, useState, type CSSProperties, type ElementType } from 'react';
import { reducedMotion } from '../../lib/store';
import { ADV } from './advances';

/**
 * Escada de resolução da Redaction: 100 é o bitmap mais grosso, 0 é a serifa limpa.
 * Cada letra sobe a escada no seu próprio tempo, como um sinal sendo captado.
 */
export const LADDER = [100, 70, 50, 35, 20, 0] as const;
export type Level = (typeof LADDER)[number];
/** degrau extra, antes do 100: a letra ainda não chegou (ou já foi embora) */
export type Rung = Level | 'off';

/** acaso fixo por letra: o mesmo índice sempre dá o mesmo número */
export const hash = (i: number, seed = 1) => {
  const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Os degraus entre dois pontos da escada (com 'off' antes do 100). */
export function rungs(from: Rung, to: Rung): Rung[] {
  const full: Rung[] = ['off', ...LADDER];
  const a = full.indexOf(from);
  const b = full.indexOf(to);
  const out: Rung[] = [];
  if (a <= b) for (let i = a; i <= b; i++) out.push(full[i]);
  else for (let i = a; i >= b; i--) out.push(full[i]);
  return out;
}

interface RunOptions {
  /** janela (s) em que as letras começam a andar */
  spread?: number;
  /** duração (s) de cada degrau */
  step?: number;
  delay?: number;
  /** chance, por quadro, de uma letra voltar um degrau (interferência) */
  jitter?: number;
  onDone?: () => void;
}

/** Leva cada letra pela sua sequência de degraus, cada uma no seu tempo. Devolve uma função que cancela. */
function runSeqs(chars: HTMLElement[], seqs: Rung[][], opts: RunOptions = {}) {
  const step = opts.step ?? 0.07;
  const spread = opts.spread ?? 0.6;
  const delay = opts.delay ?? 0;
  const jitter = opts.jitter ?? 0.012;
  const n = Math.max(1, chars.length - 1);
  // da esquerda para a direita, mas com acaso: nenhuma palavra resolve de uma vez
  const starts = chars.map((_, i) => delay + (i / n) * spread * 0.55 + Math.random() * spread * 0.45);
  const t0 = performance.now();
  let raf = 0;
  let finished = false;
  const tick = (now: number) => {
    const t = (now - t0) / 1000;
    let done = true;
    for (let i = 0; i < chars.length; i++) {
      const seq = seqs[i];
      const steps = seq.length - 1;
      const k = Math.floor((t - starts[i]) / step);
      let idx: number;
      if (steps <= 0) idx = 0;
      else if (k < 0) {
        idx = 0;
        done = false;
      } else if (k >= steps) {
        idx = steps;
      } else {
        idx = k;
        done = false;
        if (k > 0 && Math.random() < jitter) idx = k - 1;
      }
      const l = String(seq[idx]);
      if (chars[i].dataset.l !== l) chars[i].dataset.l = l;
    }
    if (done) {
      finished = true;
      opts.onDone?.();
    } else raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    if (!finished) cancelAnimationFrame(raf);
  };
}

/** Leva todas as letras pela mesma sequência de degraus. */
export function runLadder(chars: HTMLElement[], seq: Rung[], opts: RunOptions = {}) {
  return runSeqs(
    chars,
    chars.map(() => seq),
    opts,
  );
}

/** Anima um conjunto de letras (.rz) pela escada. Devolve uma função que cancela. */
export function runResolve(chars: HTMLElement[], opts: RunOptions & { from?: Rung; to?: Rung } = {}) {
  return runLadder(chars, rungs(opts.from ?? 100, opts.to ?? 0), opts);
}

const rungOf = (el: HTMLElement): Rung => {
  const v = el.dataset.l;
  return v == null || v === 'off' ? 'off' : (Number(v) as Level);
};

/** Leva cada letra do degrau em que está até o alvo (que pode variar por letra, ex.: o "não" fica em 100). */
export function runTo(chars: HTMLElement[], target: Rung | ((el: HTMLElement) => Rung), opts: RunOptions = {}) {
  return runSeqs(
    chars,
    chars.map((c) => rungs(rungOf(c), typeof target === 'function' ? target(c) : target)),
    opts,
  );
}

/** O degrau em que a letra descansa (data-rest), para usar como alvo de runTo. */
export const restOf = (el: HTMLElement): Rung => Number(el.dataset.rest ?? 0) as Level;

/** Coloca todas as letras num degrau, sem animar. */
export function setLevel(chars: HTMLElement[], level: Rung) {
  const l = String(level);
  for (const c of chars) if (c.dataset.l !== l) c.dataset.l = l;
}

/**
 * Resolução guiada (pelo scroll, por exemplo): com `p` indo de 0 a 1, uma faixa de foco atravessa as
 * letras da esquerda para a direita. O acaso é fixo por letra, então o mesmo `p` sempre dá o mesmo quadro.
 * `positions` (0..1, uma por letra) permite ordenar pela posição real na tela.
 */
export function scrubResolve(chars: HTMLElement[], p: number, opts: { from?: Rung; to?: Rung; band?: number; seed?: number; positions?: number[] } = {}) {
  const seq = rungs(opts.from ?? 100, opts.to ?? 0);
  const steps = seq.length - 1;
  const band = opts.band ?? 0.35;
  const seed = opts.seed ?? 1;
  const n = chars.length;
  for (let i = 0; i < n; i++) {
    const x = opts.positions?.[i] ?? (n > 1 ? i / (n - 1) : 0.5);
    const s = (x * 0.72 + hash(i, seed) * 0.28) * (1 - band);
    const local = Math.min(1, Math.max(0, (p - s) / band));
    const l = String(seq[Math.round(local * steps)]);
    if (chars[i].dataset.l !== l) chars[i].dataset.l = l;
  }
}

/** As letras animáveis de um <Resolve />, na ordem do texto. */
export const charsOf = (root: Element | null) => (root ? Array.from(root.querySelectorAll<HTMLElement>('.rz-c')) : []);

/** Posição horizontal (0..1) de cada letra dentro do bloco, para varrer o foco pela tela e não pela ordem. */
export function positionsOf(chars: HTMLElement[]) {
  if (!chars.length) return [];
  const rects = chars.map((c) => c.getBoundingClientRect());
  const left = Math.min(...rects.map((r) => r.left));
  const right = Math.max(...rects.map((r) => r.right));
  const w = Math.max(1, right - left);
  return rects.map((r) => (r.left + r.width / 2 - left) / w);
}

/** Largura (em em) de um texto na Redaction limpa, com o espaçamento da classe. */
export function measureEm(text: string, ls = -0.035) {
  let w = 0;
  for (const ch of text) w += (ADV[ch] ?? 0.55) + ls;
  return w - ls;
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
  from?: Rung;
  /** 'view': quando entra na tela · 'mount': ao montar · 'none': controlado por fora (nunca assenta) */
  trigger?: 'view' | 'mount' | 'none';
  /** o texto aparece em caixa alta: as larguras precisam ser as das maiúsculas */
  upper?: boolean;
  /** mantém as letras separadas mesmo com movimento reduzido (quando o estilo depende delas) */
  split?: boolean;
  delay?: number;
  spread?: number;
  step?: number;
  style?: CSSProperties;
}

/**
 * Texto que entra em foco. Enquanto resolve, cada letra ocupa a largura exata da versão limpa
 * (nada se mexe); quando termina, volta a ser texto corrido, com kerning.
 */
export const Resolve = memo(function Resolve({
  text,
  as: Tag = 'span',
  className,
  id,
  rest = 0,
  from = 100,
  trigger = 'view',
  upper = false,
  split = false,
  delay = 0,
  spread = 0.6,
  step = 0.07,
  style,
}: ResolveProps) {
  const ref = useRef<HTMLElement>(null);
  const shown = upper ? text.toLocaleUpperCase('pt-BR') : text;
  const segments = parseSegments(shown, rest);
  const [settled, setSettled] = useState(reducedMotion && !split);

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
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
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
          // palavras (e as partes de palavras hifenizadas, para a linha poder quebrar depois do hífen)
          const words = seg.text.split(/(\s+)/).flatMap((w) => (/^\s+$/.test(w) ? [w] : w.split(/(?<=-)/)));
          const Wrap = seg.italic ? 'em' : Fragment;
          return (
            <Wrap key={si} {...(seg.italic ? { className: 'rz-no' } : {})}>
              {words.map((w, wi) =>
                /^\s+$/.test(w) ? (
                  <Fragment key={wi}> </Fragment>
                ) : w ? (
                  <span key={wi} className="rz-word">
                    {[...w].map((ch, ci) => (
                      <span key={ci} className="rz rz-c" data-l={from} data-rest={seg.rest} style={{ '--adv': ADV[ch] ?? 0.55 } as CSSProperties}>
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
});
