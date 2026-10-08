import { expect,it } from 'vitest';
import { oracleCheck } from '../../src/groups/oracle';
import { IDS,reference } from './helpers';
for(const id of IDS)it(`${id}: compiled checked facts have no finite-model counterexample`,()=>{
 const f=reference(id);const comp=f.compile();
 expect(comp.solvable).toBe(true);expect(comp.check.ok).toBe(true);expect(comp.check.solved).toBe(true);
 expect(Object.keys(comp.check.nodes).length).toBeGreaterThan(0);
 expect(oracleCheck(f.ctx.level,comp.check.nodes,comp.graph.rooms)).toEqual([]);
});
