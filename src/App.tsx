import { lazy, Suspense, useCallback, useEffect } from 'react';
import { Intro } from './components/intro/Intro';
import { Hero } from './components/sections/Hero';
import { Manifesto } from './components/sections/Manifesto';
import { SangueFrio } from './components/sections/SangueFrio';
import { Confrontos, Identidade, Reforcos } from './components/sections/Rooms';
import { About, Closing } from './components/sections/Outro';
import { PieceSheet } from './components/piece/PieceSheet';
import { Hud } from './components/hud/Hud';
import { Cursor } from './components/hud/Cursor';
import { Grain } from './components/hud/Grain';
import { calangoBus } from './lib/calangoBus';
import { initScroll, lockScroll, unlockScroll } from './lib/scroll';
import { useExperience } from './lib/store';

const Stage = lazy(() => import('./components/three/Stage'));

export default function App() {
  const phase = useExperience((s) => s.phase);

  useEffect(() => {
    const lenis = initScroll();
    lenis.on('scroll', () => (calangoBus.velocity = lenis.velocity));
    lockScroll();
  }, []);

  const enterSite = useCallback(() => {
    unlockScroll();
  }, []);

  const live = phase === 'site';
  const stageOn = phase === 'hacking' || phase === 'site';

  return (
    <>
      <div className="backdrop" aria-hidden="true" />
      {stageOn ? (
        <Suspense fallback={null}>
          <Stage />
        </Suspense>
      ) : null}

      <main className="site" aria-hidden={!live} inert={!live}>
        <Hero />
        <Manifesto />
        <SangueFrio />
        <Reforcos />
        <Confrontos />
        <Identidade />
        <About />
        <Closing />
      </main>

      <PieceSheet />
      {live ? <Hud /> : null}
      <Cursor />
      <Grain />
      <Intro onEnterSite={enterSite} />
    </>
  );
}
