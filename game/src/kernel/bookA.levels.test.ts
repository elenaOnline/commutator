// Authoring checks over every Book level that declares an open dock or a multi-desk room (kernel lead).
// SYNTHESIS §4.1 pin 5: a well-formed hole declaration, holes only in conclusions, and no bare Spool of a side
// fills the dock.
import { describe, expect, it } from 'vitest';
import * as K from './index';
import { BOOK_LEVELS } from '../levels/book';

const open = BOOK_LEVELS.flatMap((lv) => lv.sockets.filter((s) => K.isOpen(s)).map((s) => ({ lv, s })));

describe('Book open docks: authoring pins', () => {
  it('there is at least one open dock (or none yet: vacuous)', () => { expect(open.length).toBeGreaterThanOrEqual(0); });
  for (const { lv, s } of open) {
    it(`${lv.id} dock ${s.id}`, () => {
      expect(K.holesProblem(s)).toBeNull();
      const t = K.trivialFill(s);
      expect(t ? K.factText(t, K.labelsOf(lv.atoms)) : null, 'a bare Spool fills this dock').toBeNull();
    });
  }
});
