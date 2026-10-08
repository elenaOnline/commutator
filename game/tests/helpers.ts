import type { Term, Pallet, Fact, Card, LevelManifest, ProofGraph, ProofNode, RuleRef, StepOp, Subst, Addr } from '../src/kernel/types';
import type { KernelCtx } from '../src/kernel';
export const A=(id:string):Term=>({k:'atom',id});
export const M=(id:string):Term=>({k:'meta',id});
export const E:Term={k:'e'};
export const I=(arg:Term):Term=>({k:'inv',arg});
export const P=(...fs:Term[]):Term=>{const flat=fs.flatMap(f=>f.k==='mul'?f.fs:[f]);return flat.length===1?flat[0]!:{k:'mul',fs:flat};};
export const rep=(t:Term,n:number)=>P(...Array.from({length:n},()=>t));
export const eq=(l:Term,r:Term):Pallet&{k:'eq'}=>({k:'eq',l,r});
export const neq=(l:Term,r:Term):Pallet&{k:'neq'}=>({k:'neq',l,r});
export const ax=(id:'unitL'|'unitR'|'invL'|'invR'):RuleRef=>({k:'axiom',id});
export const node=(id:string):RuleRef=>({k:'node',id});
export const schema=(id:string,mirror=false):RuleRef=>({k:'schema',id,...(mirror?{mirror:true}:{})});
export const at=(side:'l'|'r'='r',range?:[number,number],path:number[]=[]):Addr=>({side,path,...(range?{range}:{})});
export const rw=(rule:RuleRef,subst:Subst={},side:'l'|'r'='r',range?:[number,number],dir:'fwd'|'rev'='fwd',path:number[]=[]):StepOp=>({k:'rewrite',rule,subst,dir,at:at(side,range,path)});
export function level(givens:Fact[]=[],target:Pallet=eq(A('a'),E)):LevelManifest{return {id:'fixture',index:0,chapter:1,title:'fixture',memo:'',atoms:['a','b','c','d','e1','p','q','r','s','x'].map((id,hue)=>({id,label:id,hue})),givens:givens.map((fact,i)=>({id:`h${i}`,name:`h${i}`,fact})),sockets:[{id:'s',target,allowedGivens:givens.map((_,i)=>`h${i}`)}],tools:{lift:true,merge:true,suppose:true,classical:true,press:true,schemas:[],conjecture:false},unlocks:[],idea:'',par:{parts:0,axioms:0},uses:[]};}
export const ctx=(l:LevelManifest,registry:KernelCtx['registry']={}):KernelCtx=>({level:l,registry});
export class Builder {
 g:ProofGraph={nodes:[],rooms:[]}; scope='root'; serial=0; station=0;
 add(n:Omit<ProofNode,'id'|'scope'>|Record<string,unknown>,id?:string):string {const key=id??`n${++this.serial}`;this.g.nodes.push({...n,id:key,scope:this.scope} as ProofNode);return key;}
 start(term:Term,id?:string){return this.add({k:'start',term},id);}
 given(givenId:string){return this.add({k:'given',givenId},`g-${givenId}`);}
 steps(input:string,ops:StepOp[],gesture='move'){const station=`st${++this.station}`;let last=input;ops.forEach((op,i)=>{last=this.add({k:'step',input:last,op,meta:{station,gesture:i?'auto-tidy':gesture}});});return last;}
 apply(input:string,rule:RuleRef,subst:Subst){return this.add({k:'apply',rule,inputs:[input],subst,meta:{station:`st${++this.station}`}});}
 swap(input:string){return this.steps(input,[{k:'swap'}],'auto-swap');}
 room(kind:'suppose'|'classical',l:Term,r:Term){const id=`room${this.g.rooms.length+1}`;this.g.rooms.push({id,parent:this.scope,kind,l,r});this.scope=id;return this.add({k:'assume',room:id});}
 clash(input:string,negative:string){const room=this.scope;const clash=this.add({k:'clash',inputs:[input,negative],meta:{station:`st${++this.station}`}});this.scope=this.g.rooms.find(r=>r.id===room)!.parent;return this.add({k:'exit',room,input:clash});}
 press(input:string){return this.add({k:'press',input,meta:{station:`st${++this.station}`}});}
}
export const law=(l:Term,r:Term,metas=['x']):Card=>({k:'law',metas,l,r});
