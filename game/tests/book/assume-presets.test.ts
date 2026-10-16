// The docks' "Assume …" presets find the floor's Towers, integer Towers included (final playtest W8: on P10.2 the
// preset "Assume xⁿ = e" kept asking for a Tower for n after n₁ ∈ ℤ was placed).
import { describe, expect, it } from 'vitest';
import { assumePresets } from '../../src/hud/roomedit';
import type { S } from '../../src/hud/util';
import { bookFloor, lv89, tower, towerZ } from './kit-w89';
import { EARNED } from './lemmas-w89';
import { elemTower, groupTower, homTower, lvZ } from './kit-w1214';
import { lvM, membersFloor } from './kit-members';
import * as F from '../../src/factory';

const stateOf = (f: ReturnType<typeof bookFloor>) => ({ level: f.level, ctx: f.ctx, canvas: f.c, compiled: null }) as unknown as S;

describe('Assume presets', () => {
  it('P10.2: an integer Tower plays the exponent n', () => {
    const f = bookFloor(lv89('P10.2'), EARNED);
    f.add(tower('x1', 'x₁'), { x: 2, y: 44 });
    f.add(tower('y1', 'y₁'), { x: 4, y: 44 });
    expect(assumePresets(stateOf(f)).map((p) => p.missing)).toEqual([['n'], ['n']]);
    f.add(towerZ('n1', 'n₁'), { x: 6, y: 44 });
    const ps = assumePresets(stateOf(f));
    for (const p of ps) {
      expect(p.missing).toEqual([]);
      expect(JSON.stringify(p.assumes)).toContain('{"k":"zvar","id":"n1"}');
      expect(JSON.stringify(p.assumes)).not.toContain('meta');
    }
  });

  it('P5.4 (final W1–7 #14): with no Tower named u, the first unused element Tower plays u', () => {
    const f = membersFloor(lvM('P5.4'));
    expect(assumePresets(stateOf(f))[0]!.missing).toEqual(['u']);
    expect(assumePresets(stateOf(f))[0]!.need).toBe('a Tower for u');
    f.add(tower('x1', 'x₁'), { x: 2, y: 44 }); // the default name, never renamed
    const [p] = assumePresets(stateOf(f));
    expect(p!.missing).toEqual([]);
    expect(JSON.stringify(p!.assumes)).toContain('{"k":"atom","id":"x1"}');
  });

  it('a Tower named after the variable wins over an earlier unnamed one; others fill in order', () => {
    const f = bookFloor(lv89('P10.2'), EARNED);
    f.add(tower('y1', 'y₁'), { x: 2, y: 44 });
    f.add(tower('a1', 'a₁'), { x: 4, y: 44 });
    f.add(towerZ('n1', 'n₁'), { x: 6, y: 44 });
    const p = assumePresets(stateOf(f))[1]!; // dock t: assume (y⁻¹xy)ⁿ = e
    expect(p.missing).toEqual([]);
    const j = JSON.stringify(p.assumes);
    // y ↦ y₁ (by name, though placed first), x ↦ a₁ (the first unused), n ↦ n₁
    expect(j).toBe(JSON.stringify([{ rel: 'eq', l: { k: 'pow', base: { k: 'mul', fs: [{ k: 'inv', arg: { k: 'atom', id: 'y1' } }, { k: 'atom', id: 'a1' }, { k: 'atom', id: 'y1' }] }, exp: [{ coefficient: '1', monomial: [{ ref: { k: 'zvar', id: 'n1' }, degree: 1 }] }] }, r: { k: 'e' } }]));
  });

  it('P14.1 (final W8–14 N4): a dock about every homomorphism takes the floor\'s Hom Tower f₁ and its groups', () => {
    const f = bookFloor(lvZ('P14.1'), EARNED);
    const before = assumePresets(stateOf(f));
    for (const p of before) {
      expect(p.assumes).toBeNull();
      expect(p.html).not.toMatch(/T</); // never the binder's internal name e_T
      expect(p.need).toMatch(/^a Hom Tower f : G → K/);
    }
    f.add(groupTower('K1', 'K₁'), { x: 2, y: 40 });
    f.add(homTower('f1', 'f₁', 'G', 'K1'), { x: 4, y: 40 });
    f.add(elemTower('x1', 'x₁'), { x: 2, y: 44 });
    f.add(elemTower('y1', 'y₁'), { x: 4, y: 44 });
    const ps = assumePresets(stateOf(f));
    expect(ps.map((p) => p.missing)).toEqual([[], [], []]);
    const prod = JSON.stringify(ps[0]!.assumes);
    expect(prod).toContain('"fn":"f1"');
    expect(prod).toContain('{"k":"e","s":"K1"}');
    expect(prod).not.toMatch(/"fn":"f"|"s":"T"|meta/);
    // the room it paints has working desks: f₁(x₁) = e_K₁ and f₁(y₁) = e_K₁, no "f is not a map here"
    const e = F.paintRoom(f.c, { x: 20, y: 4, w: 9, h: 7 }, 'assume', { k: 'e' }, { k: 'e' }, f.ctx, 'eq', ps[0]!.assumes!);
    expect(e.ok, e.ok ? '' : e.reason).toBe(true);
    if (!e.ok) return;
    const comp = F.compile(e.canvas, f.ctx);
    const desks = e.canvas.machines.filter((m) => m.kind === 'desk');
    expect(desks).toHaveLength(2);
    for (const d of desks) expect(comp.machines[d.id]!.status).toMatchObject({ k: 'ok' });
  });
});
