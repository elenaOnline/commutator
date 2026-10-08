// COMMUTATOR — move a save between copies of the game (dev server ↔ the live site).
// Browsers keep localStorage per origin, so a save made on localhost can't be seen by
// webreceptor.net. A save link carries the whole save, deflated and base64url'd, in the
// URL *fragment* (#save=…), which never leaves the browser in a request.
export const SAVE_KEY = 'lemma-works/v3';
export const LIVE_URL = 'https://webreceptor.net/artifacts/commutator/';

const b64url = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
};
async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** A link to the live site that imports this browser's save. */
export async function makeSaveLink(base = LIVE_URL): Promise<string> {
  const raw = localStorage.getItem(SAVE_KEY) ?? '';
  const packed = await pipe(new TextEncoder().encode(raw) as Uint8Array<ArrayBuffer>, new CompressionStream('deflate-raw'));
  return `${base}#save=${b64url(packed)}`;
}

const solvedCount = (raw: string | null): number => {
  try { return Object.values((JSON.parse(raw ?? '{}') as { levels?: Record<string, { solvedAt?: number }> }).levels ?? {}).filter((l) => l.solvedAt).length; }
  catch { return 0; }
};

/** If the page was opened with #save=…, offer to import it (before the store reads localStorage). */
export async function importSaveFromHash(): Promise<void> {
  const m = /^#save=([A-Za-z0-9_-]+)$/.exec(location.hash);
  if (!m) return;
  const clear = () => history.replaceState(null, '', location.pathname + location.search);
  try {
    const raw = new TextDecoder().decode(await pipe(unb64url(m[1]!), new DecompressionStream('deflate-raw')));
    const parsed = JSON.parse(raw) as { version?: number };
    if (parsed.version !== 3) throw new Error('not a Commutator v3 save');
    const here = localStorage.getItem(SAVE_KEY);
    const ok = !here || window.confirm(
      `Import this save? It has ${solvedCount(raw)} solved level(s); the save already in this browser has ${solvedCount(here)}.\n\nImporting replaces the save here.`);
    if (ok) localStorage.setItem(SAVE_KEY, raw);
  } catch (e) {
    window.alert(`That save link couldn't be read (${(e as Error).message}).`);
  }
  clear();
}
