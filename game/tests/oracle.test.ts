import {describe,it,expect} from 'vitest';
import {check} from '../src/kernel';
import {oracleCheck} from '../src/groups/oracle';
import {LEVEL_BY_ID,REGISTRY} from '../src/levels/levels';
import {SOLUTIONS} from './solutions';
import {ctx} from './helpers';
for(const [id,builders] of Object.entries(SOLUTIONS))describe(`finite-model oracle ${id}`,()=>{
 for(const [route,build] of Object.entries(builders))it(route,()=>{
  const level=LEVEL_BY_ID[id]!,graph=build(),result=check(graph,ctx(level,REGISTRY));
  // An oracle that skips invalid nodes cannot certify a malformed fixture.
  expect(result.ok).toBe(true);expect(result.solved).toBe(true);
  expect(oracleCheck(level,result.nodes,graph.rooms)).toEqual([]);
 });
});
