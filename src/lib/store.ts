import { useSyncExternalStore } from 'react';

export type Phase = 'boot' | 'title' | 'hacking' | 'site';

export interface ExperienceState {
  phase: Phase;
  /** 0..1, carregamento do acervo exibido na title screen */
  loaded: number;
  muted: boolean;
  /** peça aberta na ficha (id) */
  sheet: string | null;
  /** sala atual, para o HUD */
  room: string;
  /** rótulo do cursor customizado */
  cursor: string | null;
}

type Listener = () => void;

function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(patch: Partial<T> | ((s: T) => Partial<T>)) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      let changed = false;
      for (const key in next) {
        if (!Object.is(next[key], state[key])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...next };
      listeners.forEach((l) => l());
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const prefersMute = (() => {
  try {
    return localStorage.getItem('tqns:muted') === '1';
  } catch {
    return false;
  }
})();

export const experience = createStore<ExperienceState>({
  phase: 'boot',
  loaded: 0,
  muted: prefersMute,
  sheet: null,
  room: '',
  cursor: null,
});

export function useExperience<S>(selector: (s: ExperienceState) => S): S {
  return useSyncExternalStore(
    experience.subscribe,
    () => selector(experience.get()),
    () => selector(experience.get()),
  );
}

export const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const isTouch = typeof window !== 'undefined' && window.matchMedia('(hover: none), (pointer: coarse)').matches;
