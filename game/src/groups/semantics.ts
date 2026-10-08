import type { Fact, PatFact, Poly, Term } from '../kernel/types';

/** v4 Phase B: integer variables (ℤ Towers, ℤ metas) range over this window in the oracle. With the
 *  catalogue's group orders ≤ 13, 13 consecutive integers cover every residue class of an exponent. */
export const Z_RANGE: number[] = Array.from({ length: 13 }, (_, i) => i - 6);

/** Exact exponent value (BigInt): Z ids read their integer from the assignment maps. */
export function evalPoly(p: Poly, atoms: Assignment, metas?: Assignment): bigint {
  let s = 0n;
  for (const t of p) {
    let v = BigInt(t.coefficient);
    for (const m of t.monomial) {
      const src = m.ref.k === 'zvar' ? atoms : metas;
      const x = src && Object.hasOwn(src, m.ref.id) ? src[m.ref.id] : undefined;
      if (x === undefined || !Number.isInteger(x)) throw new Error(`Missing integer assignment: ${m.ref.id}`);
      v *= BigInt(x) ** BigInt(m.degree);
    }
    s += v;
  }
  return s;
}

/** g^k in a finite group, k any integer (reduced modulo the group order, which is exact there). */
export function groupPow(G: FiniteGroup, g: number, k: bigint): number {
  let r = k % BigInt(G.order);
  if (r < 0n) r += BigInt(G.order);
  let acc = 0, base = g, e = Number(r);
  while (e > 0) { if (e & 1) acc = G.mul(acc, base); base = G.mul(base, base); e >>= 1; }
  return acc;
}

/** ℤ-sorted metas of a card (occurring inside exponents). */
export function cardZmetaIds(f: Fact): Set<string> {
  const out = new Set<string>();
  const walk = (t: Term): void => {
    if (t.k === 'inv') walk(t.arg);
    else if (t.k === 'mul') t.fs.forEach(walk);
    else if (t.k === 'pow') { walk(t.base); for (const e of t.exp) for (const m of e.monomial) if (m.ref.k === 'zmeta') out.add(m.ref.id); }
  };
  if (f.k === 'eq' || f.k === 'neq' || f.k === 'law') { walk(f.l); walk(f.r); }
  else if (f.k === 'cond') for (const p of [...f.premises, f.concl]) { walk(p.l); walk(p.r); }
  return out;
}

/** Enumerate G ids over the group and Z ids over Z_RANGE. False short-circuits. */
export function everySortedAssignment(gids: string[], zids: string[], order: number, s: Assignment, visit: () => boolean): boolean {
  const walkZ = (at: number): boolean => {
    if (at === zids.length) return visit();
    const id = zids[at]!;
    for (const v of Z_RANGE) { s[id] = v; if (!walkZ(at + 1)) return false; }
    return true;
  };
  return everyAssignment(gids, order, s, () => walkZ(0));
}
import type { Assignment, FiniteGroup } from './index';

/** False short-circuits enumeration. An empty list has one assignment. */
export function everyAssignment(ids: string[], order: number, s: Assignment, visit: () => boolean): boolean {
  const walk = (at: number): boolean => {
    if (at === ids.length) return visit();
    const id = ids[at]!;
    for (let i = 0; i < order; i++) {
      s[id] = i;
      if (!walk(at + 1)) return false;
    }
    return true;
  };
  return walk(0);
}

export function evaluate(G: FiniteGroup, t: Term, atoms: Assignment, metas?: Assignment): number {
  switch (t.k) {
    case 'e': return 0;
    case 'atom': {
      const value = Object.hasOwn(atoms, t.id) ? atoms[t.id] : undefined;
      if (value === undefined || !Number.isInteger(value) || value < 0 || value >= G.order) throw new Error(`Missing or invalid atom assignment: ${t.id}`);
      return value;
    }
    case 'meta': {
      const value = metas && Object.hasOwn(metas, t.id) ? metas[t.id] : undefined;
      if (value === undefined) throw new Error(`Cannot evaluate unassigned meta: ${t.id}`);
      return value;
    }
    case 'inv': return G.inv(evaluate(G, t.arg, atoms, metas));
    case 'pow': return groupPow(G, evaluate(G, t.base, atoms, metas), evalPoly(t.exp, atoms, metas));
    case 'int': throw new Error('an integer is not a group element');
    case 'mul': {
      let value = 0;
      for (const f of t.fs) value = G.mul(value, evaluate(G, f, atoms, metas));
      return value;
    }
  }
}
function patternHolds(G: FiniteGroup, f: PatFact, s: Assignment, metas?: Assignment): boolean {
  const equal = evaluate(G, f.l, s, metas) === evaluate(G, f.r, s, metas);
  return f.k === 'eq' ? equal : !equal;
}
export function factHolds(G: FiniteGroup, f: Fact, s: Assignment): boolean {
  switch (f.k) {
    case 'eq': case 'neq': return patternHolds(G, f, s);
    case 'bot': return false;
    case 'size': return G.order === f.n;
    case 'law': {
      const metas: Assignment = Object.create(null);
      const z = cardZmetaIds(f);
      return everySortedAssignment(f.metas.filter(m => !z.has(m)), [...z], G.order, metas, () => evaluate(G, f.l, s, metas) === evaluate(G, f.r, s, metas));
    }
    case 'cond': {
      const metas: Assignment = Object.create(null);
      const z = cardZmetaIds(f);
      return everySortedAssignment(f.metas.filter(m => !z.has(m)), [...z], G.order, metas, () =>
        !f.premises.every(p => patternHolds(G, p, s, metas)) || patternHolds(G, f.concl, s, metas));
    }
  }
}
export function labeledAssignment(s: Assignment, G: FiniteGroup): Record<string, string> {
  return Object.fromEntries(Object.entries(s).map(([id, value]) => [id, G.labels[value]!]));
}
