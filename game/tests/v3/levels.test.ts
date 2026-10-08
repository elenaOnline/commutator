import { writeFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import { IDS, reference, run } from './helpers';
const rows:Record<string,unknown>[]=[];
for(const id of IDS)it(`${id}: editor factory compiles and delivers within 400 ticks`,()=>{
 const f=reference(id);const {comp,state,metrics}=run(f);rows.push({level:id,...metrics});
 expect(comp.solvable,JSON.stringify(comp.machines)).toBe(true);
 expect(comp.check.ok,JSON.stringify(comp.check.nodes)).toBe(true);expect(comp.check.solved).toBe(true);
 for(const s of f.level.sockets)expect(state.delivered[s.id],`${id}/${s.id} delivery`).toBeDefined();
 expect(metrics.cycles).not.toBeNull();expect(metrics.cycles).toBeLessThanOrEqual(400);
});
afterAll(()=>{writeFileSync(new URL('./metrics.json',import.meta.url),JSON.stringify(rows,null,2));console.table(rows);console.log('V3_METRICS '+JSON.stringify(rows));});
