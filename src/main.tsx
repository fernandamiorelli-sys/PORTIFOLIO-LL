import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './App';

const bench = import.meta.env.DEV && new URLSearchParams(location.search).has('bancada');
const Bench = bench ? lazy(() => import('./dev/Bench')) : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {Bench ? (
      <Suspense fallback={null}>
        <Bench />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
