// LEMMA WORKS — entry. Architect-owned. v3 (factory) by default; ?v2 mounts the old bench build for reference.
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import './ui/base.css';

const root = document.getElementById('app')!;
if (new URLSearchParams(location.search).has('v2')) {
  const [{ Store }, { mountShell }] = await Promise.all([import('./state/store'), import('./shell')]);
  const store = new Store();
  (window as unknown as { __lw: unknown }).__lw = store;
  mountShell(root, store);
} else {
  const [{ FactoryStore }, { mountApp }] = await Promise.all([import('./state/factoryStore'), import('./hud')]);
  const store = new FactoryStore();
  (window as unknown as { __lw: unknown }).__lw = store;
  mountApp(root, store);
}
