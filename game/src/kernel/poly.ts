// LEMMA WORKS kernel — exact integer polynomials for exponents (v4 Phase B, sol-exponents.md §2.2).
// Pure. Coefficients are BigInt in arithmetic and canonical decimal strings at rest. No JS number is
// ever used for a coefficient or an integer value.
import type { MetaId, Monomial, Poly, ZRef } from './types';
import { KErr } from './errors';

// ───────────── limits (shared, versioned; never adjustable by data) ─────────────

export const POLY_LIMITS = {
  version: 1,
  coefficientBits: 4096,
  monomials: 4096,
  totalDegree: 128,
  astDepth: 256,
  termNodes: 100_000,
  operations: 1_000_000,
  literalPower: 10_000,
} as const;

/** A refusal for size, not a mathematical verdict. Its message always starts with RESOURCE_LIMIT. */
export class ResourceLimit extends KErr {
  constructor(what: string) { super(`RESOURCE_LIMIT: ${what}`); }
}

/** Sparse-operation budget for one certificate (reset by check()). */
let opsBudget: number = POLY_LIMITS.operations;
export function resetPolyBudget() { opsBudget = POLY_LIMITS.operations; }
function spend(n: number) {
  opsBudget -= n;
  if (opsBudget < 0) throw new ResourceLimit(`more than ${POLY_LIMITS.operations} exponent operations in one certificate`);
}

// ───────────── internal representation ─────────────

/** Internal: key-sorted monomial → BigInt coefficient. */
type Mono = { ref: ZRef; degree: number }[];
interface PTerm { c: bigint; m: Mono }

const refKey = (r: ZRef) => `${r.k}\u0000${r.id}`;
function cmpStr(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }
function cmpRef(a: ZRef, b: ZRef) { return cmpStr(a.k, b.k) || cmpStr(a.id, b.id); }
function cmpMono(a: Mono, b: Mono): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const c = cmpRef(a[i]!.ref, b[i]!.ref) || a[i]!.degree - b[i]!.degree;
    if (c) return c;
  }
  return a.length - b.length;
}
const monoKey = (m: Mono) => m.map((x) => `${refKey(x.ref)}^${x.degree}`).join('*');
const degreeOf = (m: Mono) => m.reduce((n, x) => n + x.degree, 0);

const MAXC = 1n << BigInt(POLY_LIMITS.coefficientBits);
function checkCoeff(c: bigint) {
  if (c >= MAXC || -c >= MAXC) throw new ResourceLimit(`an exponent coefficient exceeds ${POLY_LIMITS.coefficientBits} bits`);
}

/** Canonicalize a list of terms: merge equal monomials, drop zeros, sort; enforce limits. */
function canon(ts: PTerm[]): PTerm[] {
  spend(ts.length + 1);
  const acc = new Map<string, PTerm>();
  for (const t of ts) {
    if (t.c === 0n) continue;
    const k = monoKey(t.m);
    const prev = acc.get(k);
    if (prev) prev.c += t.c; else acc.set(k, { c: t.c, m: t.m });
  }
  const out = [...acc.values()].filter((t) => t.c !== 0n);
  for (const t of out) {
    checkCoeff(t.c);
    if (degreeOf(t.m) > POLY_LIMITS.totalDegree) throw new ResourceLimit(`an exponent has total degree above ${POLY_LIMITS.totalDegree}`);
  }
  if (out.length > POLY_LIMITS.monomials) throw new ResourceLimit(`an exponent has more than ${POLY_LIMITS.monomials} terms`);
  out.sort((a, b) => cmpMono(a.m, b.m));
  return out;
}

/** Merge two monomials (multiply). */
function mulMono(a: Mono, b: Mono): Mono {
  const map = new Map<string, { ref: ZRef; degree: number }>();
  for (const x of [...a, ...b]) {
    const k = refKey(x.ref);
    const p = map.get(k);
    if (p) p.degree += x.degree; else map.set(k, { ref: { ...x.ref }, degree: x.degree });
  }
  return [...map.values()].sort((x, y) => cmpRef(x.ref, y.ref));
}

// ───────────── decode / encode ─────────────

const DEC = /^[+-]?\d+$/;

/** Validate raw exponent data and convert to internal form (BigInt). Throws KErr on malformed data. */
function decode(p: unknown): PTerm[] {
  if (!Array.isArray(p)) throw new KErr('an exponent must be an integer polynomial');
  if (p.length > POLY_LIMITS.monomials * 4) throw new ResourceLimit(`an exponent has more than ${POLY_LIMITS.monomials} terms`);
  const out: PTerm[] = [];
  for (const e of p) {
    if (!e || typeof e !== 'object') throw new KErr('malformed exponent term');
    const { coefficient, monomial } = e as { coefficient: unknown; monomial: unknown };
    if (typeof coefficient !== 'string') throw new KErr('exponent coefficients must be exact decimal strings (a JSON number may have been rounded)');
    if (!DEC.test(coefficient)) throw new KErr(`“${coefficient}” is not an integer`);
    if (coefficient.replace(/^[+-]/, '').length > Math.ceil(POLY_LIMITS.coefficientBits / 3) + 2) throw new ResourceLimit(`an exponent coefficient exceeds ${POLY_LIMITS.coefficientBits} bits`);
    const c = BigInt(coefficient);
    checkCoeff(c);
    if (!Array.isArray(monomial)) throw new KErr('malformed exponent monomial');
    const m: Mono = [];
    for (const x of monomial) {
      if (!x || typeof x !== 'object') throw new KErr('malformed exponent monomial');
      const { ref, degree } = x as { ref: unknown; degree: unknown };
      if (typeof degree !== 'number' || !Number.isSafeInteger(degree) || degree < 1) throw new KErr('an exponent degree must be a positive whole number');
      if (degree > POLY_LIMITS.totalDegree) throw new ResourceLimit(`an exponent has total degree above ${POLY_LIMITS.totalDegree}`);
      const r = ref as { k?: unknown; id?: unknown } | null;
      if (!r || (r.k !== 'zvar' && r.k !== 'zmeta') || typeof r.id !== 'string' || !r.id) throw new KErr('malformed exponent variable');
      m.push({ ref: { k: r.k, id: r.id }, degree });
    }
    out.push({ c, m: mulMono(m, []) });
  }
  return out;
}

function encode(ts: PTerm[]): Poly {
  return ts.map((t) => ({ coefficient: t.c.toString(), monomial: t.m.map((x) => ({ ref: { k: x.ref.k, id: x.ref.id } as ZRef, degree: x.degree })) }));
}

// ───────────── public API ─────────────

/** Canonical form of a (validated) polynomial. */
export function polyNorm(p: Poly): Poly { return encode(canon(decode(p))); }

/** Structural equality of two CANONICAL polynomials. */
export function polyEq(a: Poly, b: Poly): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!, y = b[i]!;
    if (x.coefficient !== y.coefficient || x.monomial.length !== y.monomial.length) return false;
    for (let j = 0; j < x.monomial.length; j++) {
      const u = x.monomial[j]!, v = y.monomial[j]!;
      if (u.degree !== v.degree || u.ref.k !== v.ref.k || u.ref.id !== v.ref.id) return false;
    }
  }
  return true;
}

export function polyKey(p: Poly): string {
  return p.map((t) => `${t.coefficient}${t.monomial.map((x) => `*${x.ref.k === 'zvar' ? 'v' : 'm'}${x.ref.id.length}:${x.ref.id}^${x.degree}`).join('')}`).join('+') || '0';
}

export const polyConst = (n: bigint | number | string): Poly => polyNorm([{ coefficient: BigInt(n).toString(), monomial: [] }]);
export const polyRef = (ref: ZRef): Poly => [{ coefficient: '1', monomial: [{ ref, degree: 1 }] }];
export const polyZvar = (id: string): Poly => polyRef({ k: 'zvar', id });
export const polyZmeta = (id: MetaId): Poly => polyRef({ k: 'zmeta', id });

export function polyAdd(a: Poly, b: Poly): Poly { return encode(canon([...decode(a), ...decode(b)])); }
export function polyNeg(a: Poly): Poly { return encode(canon(decode(a).map((t) => ({ c: -t.c, m: t.m })))); }
export function polySub(a: Poly, b: Poly): Poly { return polyAdd(a, polyNeg(b)); }
export function polyMul(a: Poly, b: Poly): Poly {
  const A = decode(a), B = decode(b);
  spend(A.length * B.length);
  if (A.length * B.length > POLY_LIMITS.monomials * 64) throw new ResourceLimit(`an exponent product has more than ${POLY_LIMITS.monomials} terms`);
  const out: PTerm[] = [];
  for (const x of A) for (const y of B) {
    const c = x.c * y.c;
    checkCoeff(c);
    const m = mulMono(x.m, y.m);
    if (degreeOf(m) > POLY_LIMITS.totalDegree) throw new ResourceLimit(`an exponent has total degree above ${POLY_LIMITS.totalDegree}`);
    out.push({ c, m });
  }
  return encode(canon(out));
}
/** p^k for a literal natural k (p^0 = 1, also for p = 0, by convention of the exponent language). */
export function polyPowNat(p: Poly, k: number): Poly {
  if (!Number.isSafeInteger(k) || k < 0) throw new KErr('an exponent power must be a natural number');
  let r = polyConst(1);
  let base = p;
  let e = k;
  while (e > 0) {
    if (e & 1) r = polyMul(r, base);
    e >>= 1;
    if (e) base = polyMul(base, base);
  }
  return r;
}

/** The literal value if the polynomial is a constant (0 for []), else null. */
export function polyLiteral(p: Poly): bigint | null {
  if (p.length === 0) return 0n;
  if (p.length === 1 && p[0]!.monomial.length === 0) return BigInt(p[0]!.coefficient);
  return null;
}

/** Every reference occurring, in canonical order (dedup). */
export function polyRefs(p: Poly): ZRef[] {
  const seen = new Set<string>();
  const out: ZRef[] = [];
  for (const t of p) for (const x of t.monomial) {
    const k = refKey(x.ref);
    if (!seen.has(k)) { seen.add(k); out.push(x.ref); }
  }
  return out;
}

/** Simultaneous substitution: replace refs by polynomials (composition), then normalize. */
export function polySubst(p: Poly, f: (r: ZRef) => Poly | null): Poly {
  let acc: Poly = [];
  for (const t of decode(p)) {
    let term: Poly = polyConst(t.c);
    for (const x of t.m) {
      const v = f(x.ref);
      const factor = v ? polyPowNat(v, x.degree) : [{ coefficient: '1', monomial: [{ ref: x.ref, degree: x.degree }] }] as Poly;
      term = polyMul(term, factor);
    }
    acc = polyAdd(acc, term);
  }
  return acc;
}

/** Rename refs (e.g. zvar → zmeta); re-normalizes (ordering depends on names). */
export function polyRename(p: Poly, f: (r: ZRef) => ZRef): Poly {
  return encode(canon(decode(p).map((t) => ({ c: t.c, m: mulMono(t.m.map((x) => ({ ref: f(x.ref), degree: x.degree })), []) }))));
}

/** Exact evaluation (BigInt) under an assignment of every ref. */
export function polyEval(p: Poly, val: (r: ZRef) => bigint): bigint {
  let s = 0n;
  for (const t of p) {
    let v = BigInt(t.coefficient);
    for (const x of t.monomial) v *= val(x.ref) ** BigInt(x.degree);
    s += v;
  }
  return s;
}

/**
 * Bounded inference (§4.2): solve pattern P (after known bindings) = target T for ONE unbound ℤ meta.
 * Returns the binding, null if impossible, or 'ambiguous' when knobs are required.
 */
export function polySolve(P: Poly, T: Poly, unbound: Set<MetaId>): { id: MetaId; val: Poly } | null | 'ambiguous' {
  const metas = polyRefs(P).filter((r) => r.k === 'zmeta' && unbound.has(r.id));
  if (metas.length === 0) return null; // callers compare fully-bound patterns directly
  if (metas.length > 1) return 'ambiguous';
  const M = metas[0]!;
  // P = c*M + R with c a nonzero literal and M only in that degree-1 monomial
  let c: bigint | null = null;
  const R: Poly = [];
  for (const t of P) {
    const has = t.monomial.some((x) => x.ref.k === M.k && x.ref.id === M.id);
    if (!has) { R.push(t); continue; }
    if (t.monomial.length !== 1 || t.monomial[0]!.degree !== 1 || c !== null) return 'ambiguous';
    c = BigInt(t.coefficient);
  }
  if (c === null || c === 0n) return 'ambiguous';
  const D = polySub(T, polyNorm(R));
  const q: Poly = [];
  for (const t of D) {
    const v = BigInt(t.coefficient);
    if (v % c !== 0n) return null; // not an integer polynomial
    q.push({ coefficient: (v / c).toString(), monomial: t.monomial });
  }
  return { id: M.id, val: polyNorm(q) };
}

/** Exponent text: conventional order (higher degree first, constant last), e.g. 2n₁+1, n₁k₁, -3. */
export function polyText(p: Poly, name: (r: ZRef) => string, tex: boolean): string {
  if (!p.length) return '0';
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const sup = (n: number) => (tex ? `^{${n}}` : String(n).split('').map((d) => SUP[+d]).join(''));
  const terms = [...p].sort((a, b) => degreeOfP(b) - degreeOfP(a));
  let out = '';
  terms.forEach((t, i) => {
    let c = BigInt(t.coefficient);
    const neg = c < 0n;
    if (neg) c = -c;
    const vars = t.monomial.map((x) => `${name(x.ref)}${x.degree > 1 ? sup(x.degree) : ''}`).join(tex ? ' ' : '');
    const body = vars ? (c === 1n ? vars : `${c}${vars}`) : `${c}`;
    out += i === 0 ? (neg ? `-${body}` : body) : `${neg ? '-' : '+'}${body}`;
  });
  return out;
}
function degreeOfP(t: { monomial: Monomial }) { return t.monomial.reduce((n, x) => n + x.degree, 0); }
