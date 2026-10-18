// LEMMA WORKS — entry. Architect-owned. v3 (factory) by default; ?v2 mounts the old bench build for reference.
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import './ui/base.css';

const root = document.getElementById('app')!;
const UNLOCK_KEY = 'commutator/unlock-all';
if (new URLSearchParams(location.search).has('v2')) {
  const [{ Store }, { mountShell }] = await Promise.all([import('./state/store'), import('./shell')]);
  const store = new Store();
  (window as unknown as { __lw: unknown }).__lw = store;
  mountShell(root, store);
} else {
  const { importSaveFromHash } = await import('./ui/savelink');
  await importSaveFromHash(); // #save=… links from another copy (before the store reads localStorage)
  const [{ FactoryStore }, { mountApp }, { setUnlockAll }] = await Promise.all([import('./state/factoryStore'), import('./hud'), import('./state/progress')]);
  // hidden play-testing switch: every level open (⌥⇧U toggles it in the game; ?unlock=1 / ?unlock=0 sets it)
  const q = new URLSearchParams(location.search).get('unlock');
  if (q !== null) localStorage.setItem(UNLOCK_KEY, q === '0' ? '0' : '1');
  setUnlockAll(localStorage.getItem(UNLOCK_KEY) === '1');
  const store = new FactoryStore();
  (window as unknown as { __lw: unknown }).__lw = store;
  mountApp(root, store);
}
