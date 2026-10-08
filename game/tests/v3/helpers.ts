import { expect } from 'vitest';
import * as F from '../../src/factory';
import { ctxFor } from '../../src/state/factoryStore';
import { LEVEL_BY_ID } from '../../src/levels/levels';
import type { Fact, LevelManifest, Term } from '../../src/kernel';
export { A, I, P, E, M, eq, neq, law, rep } from '../helpers';
import { A, I, P, E, eq, rep, level } from '../helpers';
export const knob = (term: Term): F.Param => ({ k: 'knob', term });
export const first = { k: 'first' } as const;
// v4 machine configs (four verbs with recipes)
export const RW=(recipe:F.RewriteRecipe,o:Partial<Extract<F.MachineConfig,{kind:'rewriter'}>>={}):F.MachineConfig=>({kind:'rewriter',recipe,dir:'fwd',target:first,gap:first,values:{},tidy:true,...o} as F.MachineConfig);
export const SWAP:F.MachineConfig={kind:'operator',recipe:{k:'swap'}};
export const CLASH:F.MachineConfig={kind:'joiner',recipe:{k:'clash'}};
export const CHAIN:F.MachineConfig={kind:'joiner',recipe:{k:'chain'}};
export const THM=(ref:F.LibRef|'routed',values:Record<string,F.Param>={},choice=0):F.MachineConfig=>({kind:'theorem',recipe:ref==='routed'?{k:'routed'}:{k:'library',ref},choice,values});
export const SCHEMA=(id:string,mirror=false):F.LibRef=>({k:'schema',id,...(mirror?{mirror:true}:{})});
export const pin = (selected: Term, side: 'l'|'r', left: Term[]=[], right: Term[]=[], ancestors: F.Anchor[]=[]): F.SpanTarget => ({k:'pin', side, selected, neighbours:{left,right,leftEdge:left.length===0,rightEdge:right.length===0},ancestors});
export const gap = (side: 'l'|'r', left: Term[], right: Term[], ancestors: F.Anchor[]=[]): F.GapTarget => ({k:'pin',side,neighbours:{left,right,leftEdge:left.length===0,rightEdge:right.length===0},ancestors});
export class Floor {
 ctx; c: F.Canvas; serial=0;
 constructor(public level: LevelManifest, earned: string[]=[]) { this.ctx=ctxFor(level,earned); this.c=F.initialCanvas(level,this.ctx); }
 edit(e: F.Edit) { expect(e.ok, !e.ok ? e.reason : '').toBe(true); if(!e.ok)throw new Error(e.reason); this.c=e.canvas; return e.ids?.[0]; }
 add(config:F.MachineConfig, at?:F.Tile, rot:F.Rot=0) { const before=new Set(this.c.machines.map(m=>m.id)); this.edit(F.place(this.c,config.kind,at??{x:8+5*this.serial++,y:10},rot,this.ctx,config)); return this.c.machines.find(m=>!before.has(m.id))!.id; }
 source(term:Term,at?:F.Tile) { return this.add({kind:'spool',t:knob(term)},at); }
 given(id='h0') { return this.c.machines.find(m=>m.config.kind==='given'&&m.config.givenId===id)!.id; }
 socket(id='s') { return this.c.machines.find(m=>m.config.kind==='socket'&&m.config.socketId===id)!.id; }
 wire(from:string,to:string,port='q',path?:F.Tile[]) { this.edit(F.connect(this.c,{m:from,port:'out'},{m:to,port},this.ctx,path)); return this.c.belts.at(-1)!.id; }
 tryWire(from:string,to:string,port='q',path?:F.Tile[]) { const e=F.connect(this.c,{m:from,port:'out'},{m:to,port},this.ctx,path); if(e.ok)this.c=e.canvas; else expect(e.reason.trim()).not.toBe(''); return e; }
 config(id:string,config:F.MachineConfig) { this.edit(F.setConfig(this.c,id,config)); }
 room(rect:F.Rect,kind:F.Room['kind']='suppose',l:Term=A('a'),r:Term=A('b')) { const before=new Set(this.c.rooms.map(r=>r.id)); this.edit(F.paintRoom(this.c,rect,kind,l,r,this.ctx)); const room=this.c.rooms.find(r=>!before.has(r.id))!; return { room, desk:this.c.machines.find(m=>m.config.kind==='desk'&&m.config.room===room.id)!.id, gate:this.c.machines.find(m=>m.config.kind==='gate'&&m.config.room===room.id)!.id }; }
 compile() {return F.compile(this.c,this.ctx);}
}
export function fixture(facts:Fact[]=[], target=eq(A('a'),A('b')), earned:string[]=[]) {return new Floor(level(facts,target),earned);}
export function rejected(f:Floor, id:string, e?:F.Edit) { const c=f.compile(); expect(c.solvable).toBe(false); if(e&&!e.ok){expect(e.reason.trim()).not.toBe('');return c;} expect(c.machines[id]?.status.k,JSON.stringify(c.machines[id])).toBe('jammed'); const s=c.machines[id]!.status; if(s.k==='jammed')expect(s.reason.trim()).not.toBe(''); expect(c.machines[id]?.out).toBeUndefined(); return c; }
export function good(f:Floor,id:string) {const c=f.compile();expect(c.machines[id]?.status,JSON.stringify(c.beltErrors)).toEqual({k:'ok'});return c;}
export const IDS=['L01','L02','L03','S01','T01','L05','L06','L04','L07'] as const;
export function reference(id:typeof IDS[number]) {
 const earned:Record<string,string[]>={L01:[],L02:[],L03:[],S01:['witness'],T01:['witness'],L05:['witness'],L06:['witness','cancel'],L04:['witness','cancel','socks'],L07:['witness','cancel','socks']};
 const f=new Floor(LEVEL_BY_ID[id]!,earned[id]); const a=A('a'),b=A('b');
 const cancel=(input:string,target:F.SpanTarget=first)=>{const m=f.add(RW({k:'cancel'},{target}));f.wire(input,m);return m;};
 const lift=(input:string,side:'left'|'right',t:Term)=>{const m=f.add({kind:'operator',recipe:{k:'multiply',side,t:knob(t)}});f.wire(input,m);return m;};
 const pop=(input:string)=>{const m=f.add(RW({k:'pop'}));f.wire(input,m);return m;};
 const stamp=(input:string,schema:string,mirror=false,values:Record<string,F.Param>={})=>{const m=f.add(THM(SCHEMA(schema,mirror),values));f.wire(input,m,'p0');return m;};
 let out:string;
 switch(id){
 case 'L01':out=cancel(f.c.machines.find(m=>m.kind==='spool')!.id);break;
 case 'L02':{const e1=A('e1');const s=f.source(e1);const ex=f.add(RW({k:'insertE'},{gap:gap('r',[e1],[])}));f.wire(s,ex);const rw=f.add(RW({k:'law',ref:{k:'given',givenId:'H'}},{values:{x:knob(E)},tidy:false}));f.wire(ex,rw);out=rw;break;}
 case 'L03':out=pop(cancel(lift(f.given('h'),'left',I(a)),pin(P(I(a),a),'l',[],[b])));break;
 case 'S01':{/* Astra §4: Spool(x₁⁻¹x₁) → cancel → Witness (u=x₁⁻¹ | v=x₁) → swap → ∀ */const x1=A('x1');f.add({kind:'tower',varId:'x1',label:'x₁',sort:'G'},{x:4,y:2});out=f.add({kind:'forall'});const w=stamp(cancel(f.source(P(I(x1),x1))),'witness');const sw=f.add(SWAP);f.wire(w,sw);f.wire(sw,out);break;}
 case 'T01':{/* Assume x₁⁻¹ = y₁ → multiply left by x₁ → cancel → swap → Witness ᵒᵖ (vu = e ⇒ v = u⁻¹) → gate exports ⇒ → ∀ */const x1=A('x1'),y1=A('y1');f.add({kind:'tower',varId:'x1',label:'x₁',sort:'G'},{x:2,y:30});f.add({kind:'tower',varId:'y1',label:'y₁',sort:'G'},{x:4,y:30});const r=f.room({x:10,y:4,w:30,h:10},'assume',I(x1),y1);const mu=f.add({kind:'operator',recipe:{k:'multiply',side:'left',t:knob(x1)}},{x:12,y:8});const cn=f.add(RW({k:'cancel'}),{x:17,y:8});const sw=f.add(SWAP,{x:22,y:8});const wt=f.add(THM(SCHEMA('witness',true)),{x:27,y:8});out=f.add({kind:'forall'},{x:44,y:20});f.wire(r.desk,mu);f.wire(mu,cn);f.wire(cn,sw);f.wire(sw,wt,'p0');f.wire(wt,r.gate);f.wire(r.gate,out);break;}
 case 'L05':out=cancel(cancel(lift(f.given('h'),'left',I(a))));break;
 case 'L06':out=stamp(cancel(cancel(f.source(P(a,b,I(b),I(a))))),'witness',false,{u:knob(P(a,b)),v:knob(P(I(b),I(a)))});break;
 case 'L04':{/* v4: ∀x,y. (xy)⁵ = e ⇒ (yx)⁵ = e — Towers, an Assume room, ∀ */const x1=A('x1'),y1=A('y1');f.add({kind:'tower',varId:'x1',label:'x₁',sort:'G'},{x:2,y:30});f.add({kind:'tower',varId:'y1',label:'y₁',sort:'G'},{x:4,y:30});const r=f.room({x:10,y:4,w:26,h:12},'assume',rep(P(x1,y1),5),E);const sp=f.add({kind:'spool',t:knob(rep(P(y1,x1),5))},{x:12,y:12});const ins=f.add(RW({k:'insertPair',inv:true,x:knob(x1)}),{x:16,y:12});const re=f.add(RW({k:'routed'}),{x:22,y:12});const can=f.add(RW({k:'cancel'}),{x:28,y:12});const all=f.add({kind:'forall'},{x:40,y:20});f.wire(sp,ins);f.wire(ins,re);f.wire(r.desk,re,'rule');f.wire(re,can);f.wire(can,r.gate);f.wire(r.gate,all);out=all;break;}
 case 'L07':out=stamp(stamp(f.given('h'),'cancel',false,{u:knob(a),v:knob(P(b,a,b)),w:knob(P(a,b,b))}),'cancel',true,{u:knob(b),v:knob(P(b,a)),w:knob(P(a,b))});break;
 }
 f.wire(out,f.socket());return f;
}
export function run(f:Floor) { const comp=f.compile();let state=F.initRun(f.c,comp);while(state.tick<400&&!f.level.sockets.every(s=>state.delivered[s.id]!==undefined))state=F.stepRun(state,f.c,comp);return {comp,state,metrics:F.factoryMetrics(f.c,state,comp)}; }

/** R01's real shared-return manifest: reduce a^6 by h4,
 * then branch a^2=e to the first dock and a Witness Stamp. */
export function sharedReturn() {
 const f=new Floor(LEVEL_BY_ID.R01!,['witness','cancel','socks']);const a=A('a');
 for(const [id,at] of [['s',{x:35,y:6}],['t',{x:35,y:22}]] as const){const m=f.c.machines.find(m=>m.id===f.socket(id))!;f.edit(F.moveMachines(f.c,[m.id],{x:at.x-m.at.x,y:at.y-m.at.y},f.ctx));}
 const r=f.add(RW({k:'routed'}));
 f.wire(f.given('h6'),r);f.wire(f.given('h4'),r,'rule');
 // h6 has no right-rail forward match. Rewriting its left yields a^2=e.
 // Both sockets share this certified intermediate.
 const belt=f.wire(r,f.socket('s'));
 const stamp=f.add(THM(SCHEMA('witness'),{u:knob(a),v:knob(a)}),{x:18,y:16});
 f.edit(F.branch(f.c,belt,{m:stamp,port:'p0'},f.ctx));f.wire(stamp,f.socket('t'));return f;
}
