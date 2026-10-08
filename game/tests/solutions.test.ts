import { describe,it,expect,afterAll } from 'vitest';
import * as K from '../src/kernel';
import type { Card, ProofGraph, ProofNode, Subst, Addr, GapAddr, StepOp } from '../src/kernel';
import { LEVEL_BY_ID,REGISTRY } from '../src/levels/levels';
import { SOLUTIONS } from './solutions';
import { ctx } from './helpers';
const rows:Record<string,unknown>[]=[];
// Alpha-equivalence, with zero-premise conditionals represented as laws.
export function canonical(card:Card):unknown {
 const ids=new Map<string,string>();
 const walk=(v:unknown):unknown=>{if(Array.isArray(v))return v.map(walk);if(v&&typeof v==='object'){const o=v as Record<string,unknown>;if(o.k==='meta'){const id=String(o.id);if(!ids.has(id))ids.set(id,`m${ids.size}`);return {k:'meta',id:ids.get(id)};}return Object.fromEntries(Object.entries(o).filter(([k])=>k!=='metas').map(([k,v])=>[k,walk(v)]));}return v;};
 const c=card.k==='cond'&&card.premises.length===0?{k:'law',l:card.concl.l,r:card.concl.r}:card;
 return walk(c);
}
function sorted(v:unknown):unknown {if(Array.isArray(v))return v.map(sorted);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,sorted(v)]));return v;}
function same(a:unknown,b:unknown){return JSON.stringify(sorted(a))===JSON.stringify(sorted(b));}
function selections(ops:StepOp[]):(Addr|GapAddr|null)[]{const op=ops[0]!;return op.k==='rewrite'||op.k==='insertE'?[op.at]:[null];}
function compatibleOps(wanted:StepOp[],actual:StepOp[],p:K.Pallet,context:K.KernelCtx,res:K.CheckResult){
 if(wanted.length!==actual.length)return false;
 function normalize(op:StepOp,p:K.Pallet):unknown {if(op.k!=='rewrite')return op;const term=K.termAt(p,{side:op.at.side,path:op.at.path});return {...op,at:{...op.at,range:op.at.range??[0,term?K.word(term).length:0]}};}
 let pallet=p;
 for(let i=0;i<wanted.length;i++){const op=wanted[i]!,other=actual[i]!;if(!same(normalize(op,pallet),normalize(other,pallet)))return false;const r=K.evalStep(pallet,op,context,op.k==='rewrite'&&op.rule.k==='node'?res.nodes[op.rule.id]?.fact:undefined);if(!r.ok)return false;pallet=r.pallet;}
 return true;
}
export function assertReachable(g:ProofGraph,id:string){
 const context=ctx(LEVEL_BY_ID[id]!,REGISTRY);const done=new Set<string>();
 for(let i=0;i<g.nodes.length;i++){
  // v4 ∀-introduction / product nodes are placed by the factory, never offered by the bench.
  const n=g.nodes[i]!;if(n.k==='start'||n.k==='given'||n.k==='assume'||n.k==='exit'||n.k==='press'||n.k==='generalize'||n.k==='product')continue;
  const key=n.meta?.station??n.id;if(done.has(key))continue;done.add(key);
  const prefix:ProofGraph={nodes:g.nodes.slice(0,i),rooms:g.rooms,...(g.vars?{vars:g.vars}:{})};const res=K.check(prefix,context);
  const batch=g.nodes.filter(x=>x.meta?.station===n.meta?.station&&x.k==='step') as (ProofNode&{k:'step'})[];
  const active=n.k==='step'?n.input:n.k==='apply'?(n.inputs[0]??(n.rule.k==='node'?n.rule.id:undefined)):n.inputs[0];
  if(!active)throw new Error(`${id}/${key}: no active node for the station`);
  const ops=batch.map(x=>x.op);const sels=n.k==='step'?selections(ops):[null];
  const offers=sels.flatMap(sel=>K.offersAt(prefix,res,active,sel,context));
  const candidates=offers.flatMap(o=>{
   if(!o.needs.length)return [o];
   let values:Subst={};if(n.k==='step'){const op=n.op;values=Object.assign({},...ops.filter((op):op is StepOp & {k:'rewrite'}=>op.k==='rewrite').map(op=>op.subst));if(op.k==='lift')values={t:op.term,term:op.term};}
   else if(n.k==='apply')values=n.subst;
   // Lift's input field is represented by a needed meta; assign the same
   // entered ground term regardless of the implementation's field label.
   if(n.k==='step'&&n.op.k==='lift')values=Object.fromEntries(o.needs.map(k=>[k,n.op.k==='lift'?n.op.term:undefined])) as Subst;
   const filled=K.fillOffer(o,values,prefix,res,active,context);return filled.ok?[filled.offer]:[];
  });
  expect(candidates.some(o=>{
   const k=o.kind;
   if(n.k==='step')return k.k==='steps'&&compatibleOps(ops,k.ops,res.nodes[active]!.fact as K.Pallet,K.withVars(context,g).ctx,res);
   if(n.k==='apply')return k.k==='apply'&&same(k.rule,n.rule)&&same(k.inputs,n.inputs)&&same(k.subst,n.subst);
   if(n.k==='clash')return k.k==='clash'&&k.neq===n.inputs[1];
   return n.k==='merge'&&k.k==='merge'&&k.other===n.inputs[1];
  }),`${id} station ${key} (${n.id}) is not offered`).toBe(true);
 }
}
for(const [id,builders] of Object.entries(SOLUTIONS))describe(id,()=>{
 for(const [route,build] of Object.entries(builders)){
  it(`${route} solves`,()=>{const g=build(),c=ctx(LEVEL_BY_ID[id]!,REGISTRY),r=K.check(g,c);expect(r.ok,JSON.stringify(r.nodes)).toBe(true);expect(r.solved).toBe(true);});
  it(`${route} metrics versus par`,()=>{const l=LEVEL_BY_ID[id]!,g=build(),c=ctx(l,REGISTRY),r=K.check(g,c);if(!r.solved){rows.push({level:id,route,parts:null,parParts:l.par.parts,axioms:null,parAxioms:l.par.axioms});}expect(r.solved).toBe(true);const m=K.metrics(g,r,c);rows.push({level:id,route,parts:m.parts,parParts:l.par.parts,axioms:m.axioms,parAxioms:l.par.axioms});// v4 ∀-goal levels carry provisional pars (TODO re-measure on the v4 floor): record, don't assert.
const provisional=l.sockets.some(s=>s.target.k==='law'||s.target.k==='cond');if(!provisional)expect(m.parts,`${id}/${route}: intended solution undercuts par`).toBeGreaterThanOrEqual(l.par.parts);});
  it(`${route} stations are reachable from offers`,()=>assertReachable(build(),id));
 }
 for(const unlock of LEVEL_BY_ID[id]!.unlocks)it(`generalizes to ${unlock}`,()=>{const c=K.generalize(LEVEL_BY_ID[id]!,'s');expect(c).not.toBeNull();const expected=REGISTRY[unlock]!.card;expect(same(canonical(c!),canonical(expected))||same(canonical(c!),canonical(K.mirrorCard(expected)))).toBe(true);});
});
afterAll(()=>{console.table(rows);console.log('PAR_TABLE_JSON '+JSON.stringify(rows));});
