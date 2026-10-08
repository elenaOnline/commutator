// LEMMA WORKS — bench-only harness page (dev/test). Owner: bench builder.
// /src/bench/dev.html?level=L03&fresh=1&h=380
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '../ui/base.css';
import { Store } from '../state/store';
import { mountBench } from './index';

const q = new URLSearchParams(location.search);
if (q.get('fresh')) localStorage.clear();
if (q.get('earned')) {
  // pre-earn schemas for testing later levels: ?earned=witness,cancel
  const raw = localStorage.getItem('lemma-works/v1');
  const save = raw ? JSON.parse(raw) : { version: 1, levels: {}, earned: [], settings: { reducedMotion: false, speed: 1 } };
  save.earned = q.get('earned')!.split(',');
  localStorage.setItem('lemma-works/v1', JSON.stringify(save));
}
const host = document.getElementById('bench')!;
if (q.get('h')) { host.style.bottom = 'auto'; host.style.height = `${q.get('h')}px`; }
const store = new Store();
(window as unknown as { __lw: Store }).__lw = store;
store.openLevel(q.get('level') ?? 'L03');
mountBench(host, store);
