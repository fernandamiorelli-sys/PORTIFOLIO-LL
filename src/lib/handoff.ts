import type { AsciiCalango } from '../components/intro/asciiCalango';

// Passagem de bastão entre a abertura, o hero e o palco 3D: onde o calango ASCII estava
// no fim do hacking, e a instância do hero (para as partículas nascerem dos mesmos caracteres).
export const handoff: {
  asciiRect: DOMRect | null;
  asciiProgress: number;
  heroAscii: AsciiCalango | null;
  heroCanvas: HTMLCanvasElement | null;
} = {
  asciiRect: null,
  asciiProgress: 0,
  heroAscii: null,
  heroCanvas: null,
};
