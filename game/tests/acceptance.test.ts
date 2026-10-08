import {it,expect} from 'vitest';
import * as K from '../src/kernel';
import type {Fact,Term,StepOp,ProofGraph,Room,Card,Schema,Pallet} from '../src/kernel';
import {A,M,E,I,P,rep,eq,neq,ax,node,schema,rw,level,ctx,Builder,law} from './helpers';
import {REGISTRY,LEVEL_BY_ID} from '../src/levels/levels';
import {SOLUTIONS} from './solutions';
const a=A('a'),b=A('b'),c=A('c'),d=A('d'),p=A('e1'),x=M('x');
const registry:Record<string,Schema>={...REGISTRY,fl:{id:'fl',name:'FL',textbook:'first light',origin:'import',mirrorable:false,card:law(P(I(M('p')),M('p'),M('q')),M('q'),['p','q'])}};
function context(facts:Fact[]=[],target:Pallet=eq(a,E)){const l=level(facts,target);l.tools.schemas=Object.keys(registry);return ctx(l,registry);}
function test(n:number,name:string,fn:()=>void){it(`K${String(n).padStart(2,'0')} ${name}`,fn);}
function step(input:Term,op:StepOp,output?:Term,ruleFact?:Fact){const r=K.evalStep(eq(input,input),op,context(),ruleFact);if(output){expect(r).toEqual({ok:true,pallet:eq(input,output)});}else expect(r.ok).toBe(false);}
function graph(facts:Fact[],tail:Record<string,unknown>[],rooms:Room[]=[],target:Pallet=eq(a,E)){
 const g:ProofGraph={rooms,nodes:[...facts.map((_,i)=>({id:`g${i}`,scope:'root',k:'given' as const,givenId:`h${i}`})),...tail.map((n,i)=>({id:`n${i}`,scope:'root',...n}))] as ProofGraph['nodes']};const context0=context(facts,target);return {g,context:context0,result:K.check(g,context0)};
}
function apply(premise:Pallet,rule:K.RuleRef,subst:K.Subst,out?:Pallet,card?:Card){const facts:Fact[]=card?[premise,card]:[premise];const r=graph(facts,[{k:'apply',rule:card?node('g1'):rule,inputs:['g0'],subst}]).result.nodes.n0!;expect(r.ok).toBe(!!out);if(out)expect(r.fact).toEqual(out);return r;}
function binary(kind:'merge'|'clash',facts:Fact[],out?:Pallet){const r=graph(facts,[{k:kind,inputs:['g0','g1']}]).result.nodes.n0!;expect(r.ok).toBe(!!out);if(out)expect(r.fact).toEqual(out);}
const square=law(P(x,x),E),identity=law(P(p,x),x);
const H:Card={k:'cond',metas:['x'],premises:[neq(x,E)],concl:eq(P(a,x),x)};
const inside=(scope:string,n:Record<string,unknown>)=>({scope,...n});
const room:Room={id:'r',parent:'root',kind:'suppose',l:a,r:E};
function contradiction(kind:'suppose'|'classical'='suppose'){
 const bld=new Builder();const neg=bld.given('h0');const positive=bld.given('h1');const assumption=bld.room(kind,a,E);
 const last=kind==='suppose'?bld.clash(assumption,neg):bld.clash(positive,assumption);
 return {g:bld.g,last,result:K.check(bld.g,context([neq(a,E),eq(a,E)],kind==='suppose'?neq(a,E):eq(a,E)))};
}
test(1,'ordered associative normalization',()=>expect(K.mul([a,{k:'mul',fs:[b,c]}])).toEqual(P(a,b,c)));
test(2,'singleton product',()=>expect(K.norm({k:'mul',fs:[a]})).toEqual(a));
test(3,'empty product is invalid',()=>{expect(K.norm(a)).toEqual(a);expect(()=>K.norm({k:'mul',fs:[]})).toThrow();});
test(4,'normalization preserves explicit units',()=>expect(K.norm(P(a,E,I(a)))).toEqual(P(a,E,I(a))));
test(5,'normalization preserves double inverse',()=>expect(K.norm(I(I(a)))).toEqual(I(I(a))));
test(6,'normalization inside inverse retains cap',()=>expect(K.norm(I({k:'mul',fs:[a,{k:'mul',fs:[b,c]}]}))).toEqual(I(P(a,b,c))));
test(7,'compound right inverse',()=>step(P(a,b,I(P(a,b))),rw(ax('invR'),{x:P(a,b)}),E));
test(8,'compound left inverse',()=>step(P(I(P(a,b)),a,b),rw(ax('invL'),{x:P(a,b)}),E));
test(9,'missing external factor',()=>step(P(a,I(P(a,b))),rw(ax('invR'),{x:P(a,b)})));
test(10,'no cancellation through inverse cap',()=>step(P(a,I(P(a,b))),rw(ax('invR'),{x:a})));
test(11,'no noncontiguous cancellation',()=>step(P(a,b,I(a)),rw(ax('invR'),{x:a})));
test(12,'cancellation leaves explicit e',()=>step(P(a,b,I(b),c),rw(ax('invR'),{x:b},'r',[1,3]),P(a,E,c)));
// Graph records contain no claimed output; the authoritative replay must retain e.
test(13,'no hidden unit step',()=>{const r=K.evalStep(eq(a,P(a,b,I(b),c)),rw(ax('invR'),{x:b},'r',[1,3]),context());expect(r.ok).toBe(true);if(r.ok)expect(r.pallet).not.toEqual(eq(a,P(a,c)));});
test(14,'sole e cannot pop',()=>step(E,rw(ax('unitL'),{})));
test(15,'two units reduce to one',()=>step(P(E,E),rw(ax('unitL'),{x:E}),E));
test(16,'reverse unit with x=e',()=>step(E,rw(ax('unitL'),{x:E},'r',undefined,'rev'),P(E,E)));
test(17,'reverse compound inverse',()=>step(E,rw(ax('invL'),{x:P(a,b)},'r',undefined,'rev'),P(I(P(a,b)),a,b)));
test(18,'reverse inverse needs explicit parameter',()=>step(E,rw(ax('invR'),{},'r',undefined,'rev')));
test(19,'candidate identity is rigid',()=>step(P(p,a),rw(ax('unitL'),{x:a})));
test(20,'law citation retains provenance',()=>{const r=graph([identity],[{k:'start',term:P(p,E)},{k:'step',input:'n0',op:rw(node('g0'),{x:E})}]).result.nodes.n1!;expect(r.ok).toBe(true);expect(r.fact).toEqual(eq(P(p,E),E));expect(r.deps).toEqual(['g:h0']);});
test(21,'free candidate atom cannot be rebound',()=>step(P(a,b),rw(node('h'),{x:b,e1:a}),undefined,identity));
test(22,'repeated compound substitution',()=>step(P(a,b,a,b),rw(node('h'),{x:P(a,b)}),E,square));
test(23,'extra factor mismatches',()=>step(P(a,a,a),rw(node('h'),{x:a}),undefined,square));
test(24,'repeated metas have one binding',()=>{expect(K.match(P(x,x),P(a,b))).toEqual([]);step(P(a,b),rw(node('h'),{x:a}),undefined,square);});
test(25,'four-factor span leaves fifth factor',()=>step(rep(a,5),rw(node('h'),{x:P(a,a)},'r',[0,4]),P(E,a),square));
test(26,'reverse square compound order',()=>step(E,rw(node('h'),{x:P(b,a)},'r',undefined,'rev'),P(b,a,b,a),square));
test(27,'repeated inverse mismatch',()=>step(P(I(a),I(b)),rw(node('h'),{x:a}),undefined,law(P(I(x),I(x)),E)));
test(28,'gap insertion under cap',()=>step(I(P(a,b)),{k:'insertE',at:{side:'r',path:[0],gap:1}},I(P(a,E,b))));
test(29,'gap insertion in singleton inverse argument',()=>step(I(E),{k:'insertE',at:{side:'r',path:[0],gap:0}},I(P(E,E))));
test(30,'sole inverse argument unit cannot pop',()=>step(I(E),rw(ax('unitL'),{},'r',undefined,'fwd',[0])));
test(31,'congruence rewrite retains dependency',()=>{const r=graph([eq(b,E)],[{k:'start',term:I(P(a,b))},{k:'step',input:'n0',op:rw(node('g0'),{},'r',[1,2],'fwd',[0])}]).result.nodes.n1!;expect(r.fact).toEqual(eq(I(P(a,b)),I(P(a,E))));expect(r.deps).toEqual(['g:h0']);});
test(32,'congruence does not hide unit rewrite',()=>{const r=K.evalStep(eq(a,I(P(a,b))),rw(node('h'),{},'r',[1,2],'fwd',[0]),context(),eq(b,E));expect(r).toEqual({ok:true,pallet:eq(a,I(P(a,E)))});});
for(const [n,fact] of [[33,neq(a,E)],[34,{k:'bot'}],[35,H]] as [number,Fact][])test(n,'non-equation rule rejected',()=>step(a,rw(node('h'),{x:a}),undefined,fact));
test(36,'ground atoms are not metas',()=>step(P(c,b),rw(node('h'),{a:c}),undefined,eq(P(a,b),E)));
test(37,'left lift compound term',()=>expect(K.evalStep(eq(a,b),{k:'lift',side:'left',term:P(a,I(b))},context())).toEqual({ok:true,pallet:eq(P(a,I(b),a),P(a,I(b),b))}));
test(38,'undeclared lift atom',()=>expect(K.evalStep(eq(a,b),{k:'lift',side:'left',term:A('z')},context()).ok).toBe(false));
// v1 has one ambient group; a foreign group element is an undeclared stable ID.
test(39,'foreign stable atom ID',()=>expect(K.evalStep(eq(a,b),{k:'lift',side:'left',term:A('H:a')},context()).ok).toBe(false));
test(40,'lift requires equality',()=>{for(const f of [neq(a,b),{k:'bot'} as Pallet])expect(K.evalStep(f,{k:'lift',side:'left',term:a},context()).ok).toBe(false);});
test(41,'left cancellation',()=>apply(eq(P(a,b),P(a,c)),schema('cancel'),{u:a,v:b,w:c},eq(b,c)));
test(42,'compound cancellation prefix',()=>apply(eq(P(a,b,c),P(a,b,d)),schema('cancel'),{u:P(a,b),v:c,w:d},eq(c,d)));
test(43,'empty remainder invalid',()=>apply(eq(P(a,b),P(a,c)),schema('cancel'),{u:P(a,b),v:{k:'mul',fs:[]},w:c}));
test(44,'implicit unit remainder invalid',()=>apply(eq(P(a,a),a),schema('cancel'),{u:a,v:a,w:E}));
test(45,'explicit unit remainder',()=>apply(eq(P(a,a),P(a,E)),schema('cancel'),{u:a,v:a,w:E},eq(a,E)));
test(46,'unit as nonempty common prefix',()=>apply(eq(P(E,b),P(E,c)),schema('cancel'),{u:E,v:b,w:c},eq(b,c)));
test(47,'mirrored right cancellation',()=>apply(eq(P(a,b),P(E,b)),schema('cancel',true),{u:b,v:a,w:E},eq(a,E)));
test(48,'witness first cut',()=>apply(eq(P(a,b,c),E),schema('witness'),{u:a,v:P(b,c)},eq(P(b,c),I(a))));
test(49,'witness second cut',()=>apply(eq(P(a,b,c),E),schema('witness'),{u:P(a,b),v:c},eq(c,I(P(a,b)))));
test(50,'witness unconsumed factor',()=>apply(eq(P(a,b,c),E),schema('witness'),{u:a,v:b}));
test(51,'witness cannot bind empty term',()=>apply(eq(E,E),schema('witness'),{u:{k:'mul',fs:[]},v:E}));
test(52,'explicit unit witness factor',()=>apply(eq(P(E,a),E),schema('witness'),{u:E,v:a},eq(a,I(E))));
test(53,'witness cannot cut a crate',()=>apply(eq(P(I(P(a,b)),c),E),schema('witness'),{u:I(a),v:P(b,c)}));
test(54,'double inverse output requires ordered swap',()=>{const r=apply(eq(P(I(a),a),E),schema('witness'),{u:I(a),v:a},eq(a,I(I(a))));expect(r.fact).not.toEqual(eq(I(I(a)),a));});
test(55,'socks at compound input',()=>step(I(P(a,b,c)),rw(schema('socks'),{u:P(a,b),v:c}),P(I(c),I(P(a,b)))));
test(56,'wrong-order inverse distribution',()=>step(I(P(a,b)),rw(schema('socks'),{u:b,v:a})));
test(57,'merge shared ordered middle',()=>binary('merge',[eq(a,c),eq(b,c)],eq(a,b)));
test(58,'merge needs swap',()=>binary('merge',[eq(a,c),eq(c,b)]));
test(59,'merge middle is ordered word',()=>binary('merge',[eq(c,P(a,b)),eq(d,P(b,a))]));
test(60,'merge equality only',()=>{binary('merge',[eq(a,c),neq(b,c)]);binary('merge',[eq(a,c),{k:'bot'}]);});
test(61,'clash same orientation',()=>binary('clash',[eq(a,b),neq(a,b)],{k:'bot'}));
test(62,'clash opposite orientation',()=>binary('clash',[eq(a,b),neq(b,a)],{k:'bot'}));
test(63,'clash different right side',()=>binary('clash',[eq(a,b),neq(a,c)]));
test(64,'printed labels do not alias identities',()=>{const l=context([eq(a,b),neq(c,b)]);l.level.atoms.find(x=>x.id==='c')!.label='a';const g:ProofGraph={rooms:[],nodes:[{k:'given',id:'g0',scope:'root',givenId:'h0'},{k:'given',id:'g1',scope:'root',givenId:'h1'},{k:'clash',id:'n',scope:'root',inputs:['g0','g1']}]};expect(K.check(g,l).nodes.n!.ok).toBe(false);});
test(65,'root cannot cite room equality',()=>{const r=graph([],[inside('r',{k:'assume',room:'r'}),{k:'start',term:a},{k:'step',input:'n1',op:rw(node('n0'))}],[room]).result;expect(r.nodes.n2!.ok).toBe(false);});
test(66,'room can cite root equality',()=>{const r=graph([eq(a,E)],[inside('r',{k:'start',term:a}),inside('r',{k:'step',input:'n0',op:rw(node('g0'))})],[room]).result.nodes.n1!;expect(r.ok).toBe(true);expect(r.deps).toEqual(['g:h0']);});
test(67,'sibling facts invisible',()=>{const rooms=[room,{...room,id:'sibling'}];const r=graph([],[inside('r',{k:'assume',room:'r'}),inside('sibling',{k:'start',term:a}),inside('sibling',{k:'step',input:'n1',op:rw(node('n0'))})],rooms).result;expect(r.nodes.n2!.ok).toBe(false);});
// No user-supplied dependency field exists: recomputation is the v1 behaviour.
test(68,'exit discharges only own assumption',()=>{const r=contradiction();expect(r.result.nodes[r.last]!.deps).toEqual(['g:h0']);});
test(69,'No Fixed Points trace retains n',()=>{const g=SOLUTIONS.L09.solution(),r=K.check(g,ctx(LEVEL_BY_ID.L09!,REGISTRY));expect(r.solved).toBe(true);expect(r.nodes[g.nodes.at(-1)!.id]!.deps).toEqual(['g:n']);});
test(70,'interior equality cannot export',()=>{const r=graph([eq(a,E)],[inside('r',{k:'given',givenId:'h0'}),{k:'step',input:'n0',op:{k:'swap'}}],[room]).result;expect(r.nodes.n1!.ok).toBe(false);});
test(71,'suppose exit result fixed by room target',()=>{const r=contradiction();expect(r.result.nodes[r.last]!.fact).toEqual(neq(a,E));expect(r.result.nodes[r.last]!.fact).not.toEqual(eq(c,d));});
test(72,'exit requires bottom',()=>{for(const f of [eq(a,E),neq(a,E)]){const r=graph([f],[inside('r',{k:'given',givenId:'h0'}),{k:'exit',room:'r',input:'n0'}],[room]).result;expect(r.nodes.n1!.ok).toBe(false);}});
test(73,'classical exit propagates marker and provenance',()=>{const r=contradiction('classical');expect(r.result.nodes[r.last]!.fact).toEqual(eq(a,E));expect(r.result.nodes[r.last]!.deps).toEqual(['g:h1']);expect(r.result.nodes[r.last]!.classical).toBe(true);});
// Room type has l/r only, deliberately excluding proposition targets (F6).
test(74,'v1 room requires equation terms',()=>{for(const target of [neq(a,E),{k:'bot'},{k:'size',n:1}]){const malformed={id:'r',parent:'root',kind:'suppose',target} as unknown as Room;expect(graph([],[inside('r',{k:'assume',room:'r'})],[malformed]).result.ok).toBe(false);}});
test(75,'size assumptions excluded in v1',()=>{const malformed={id:'r',parent:'root',kind:'suppose',target:{k:'size',n:1}} as unknown as Room;const r=graph([],[inside('r',{k:'assume',room:'r'}),inside('r',{k:'press',input:'n0'})],[malformed]).result;expect(r.ok).toBe(false);});
test(76,'conditional given application',()=>{const r=apply(neq(a,E),node('g1'),{x:a},eq(P(a,a),a),H);expect(new Set(r.deps)).toEqual(new Set(['g:h0','g:h1']));});
test(77,'conditional input substitution mismatch',()=>apply(neq(a,E),node('g1'),{x:E},undefined,H));
// Rebinding a rigid free atom is not a schema substitution.
test(78,'rigid a survives specialization',()=>{apply(neq(b,E),node('g1'),{x:b,a:c},undefined,H);apply(neq(b,E),node('g1'),{x:b},eq(P(a,b),b),H);});
test(79,'whitelisted premise remains in theorem wrapper',()=>{const {result,context:c0}=graph([eq(a,b)],[],[],eq(a,b));expect(result.solved).toBe(true);expect(K.generalize(c0.level,'s')).toEqual({k:'cond',metas:expect.any(Array),premises:[eq(M('a'),M('b'))],concl:eq(M('a'),M('b'))});});
test(80,'unlisted given cannot fill socket',()=>{const f=graph([eq(a,b)],[],[],eq(a,b));f.context.level.sockets[0]!.allowedGivens=[];expect(K.check(f.g,f.context).solved).toBe(false);});
test(81,'socket kind exact',()=>{for(const f of [neq(a,b),{k:'bot'} as Fact])expect(graph([f],[],[],eq(a,b)).result.solved).toBe(false);});
test(82,'socket orientation exact',()=>expect(graph([eq(b,a)],[],[],eq(a,b)).result.solved).toBe(false));
// Two-socket campaign levels are avoided, but per-socket whitelist still applies.
function twoSockets(includeRight:boolean){
 const bld=new Builder(),left=bld.given('h0'),right=bld.given('h1');
 let n=bld.steps(left,[{k:'lift',side:'left',term:I(a)}]);
 n=bld.steps(n,[rw(ax('invL'),{x:a},'l',[0,2]),rw(ax('unitL'),{x:b},'l')]);
 bld.steps(n,[rw(ax('invL'),{x:a},'r',[0,2]),rw(ax('unitL'),{x:c})]);
 if(includeRight){let n=bld.steps(right,[{k:'lift',side:'right',term:I(a)}]);
 n=bld.steps(n,[rw(ax('invR'),{x:a},'l',[1,3]),rw(ax('unitR'),{x:b},'l')]);
 bld.steps(n,[rw(ax('invR'),{x:a},'r',[1,3]),rw(ax('unitR'),{x:c})]);}
 const c0=context([eq(P(a,b),P(a,c)),eq(P(b,a),P(c,a))],eq(b,c));
 c0.level.sockets=[{id:'left',target:eq(b,c),allowedGivens:['h0']},{id:'right',target:eq(b,c),allowedGivens:['h1']}];
 return K.check(bld.g,c0);
}
test(83,'per-socket whitelists',()=>expect(twoSockets(false).sockets.map(s=>s.ok)).toEqual([true,false]));
// V1 avoids these in campaign data, but verifies each independent certificate.
test(84,'independent five-edit cancellation certificates',()=>expect(twoSockets(true).solved).toBe(true));
test(85,'generalization retains external inverse premise',()=>{const l=level([eq(P(a,b),E)],eq(b,I(a)));const card=K.generalize(l,'s');expect(card?.k).toBe('cond');if(card?.k==='cond')expect(card.premises).toEqual([eq(P(M('a'),M('b')),E)]);});
test(86,'whole Witness wrapper generalization',()=>{const card=K.generalize(LEVEL_BY_ID.L03!,'s');expect(card).toEqual({k:'cond',metas:['a','b'],premises:[eq(P(M('a'),M('b')),E)],concl:eq(M('b'),I(M('a')))});});
// Card/size premises cannot be represented in PatFact in v1; return null.
test(87,'square law cannot vanish on generalization',()=>expect(K.generalize(LEVEL_BY_ID.L08!,'s')).toBeNull());
test(88,'size guard cannot vanish',()=>expect(K.generalize(LEVEL_BY_ID.L11!,'s')).toBeNull());
test(89,'literal size cannot generalize to n',()=>expect(K.generalize(level([{k:'size',n:10}],eq(rep(a,10),E)),'s')).toBeNull());
test(90,'atom and meta constructors do not capture',()=>{expect(K.instantiate(P(A('x'),M('x')),{x:a})).toEqual(P(A('x'),a));expect(K.match(P(A('x'),M('x')),P(a,b))).toEqual([]);});
test(91,'press resolves size inlet with provenance',()=>{const r=graph([{k:'size',n:10}],[{k:'press',input:'g0'}]).result.nodes.n0!;expect(r.ok).toBe(true);expect(r.fact).toEqual(K.pressCard(10));expect(r.deps).toEqual(['g:h0']);});
test(92,'element equality is not cardinality',()=>expect(graph([eq(A('|G|'),A('10'))],[{k:'press',input:'g0'}]).result.nodes.n0!.ok).toBe(false));
test(93,'fabricated given ID',()=>expect(graph([],[{k:'given',givenId:'size1'},{k:'press',input:'n0'}]).result.ok).toBe(false));
test(94,'invalid literal sizes rejected',()=>{for(const n of [0,-1,25,'n'])expect(graph([{k:'size',n} as Fact],[{k:'press',input:'g0'}]).result.ok,`invalid size ${n}`).toBe(false);});
// One ambient group; foreign atoms rejected by the ground-term check.
test(95,'press cannot instantiate foreign atoms',()=>{const r=graph([{k:'size',n:10}],[{k:'press',input:'g0'},{k:'apply',rule:node('n0'),inputs:[],subst:{x:A('H:a')}}]).result;expect(r.nodes.n1!.ok).toBe(false);});
test(96,'press instances preserve copies and order',()=>{for(const t of [E,P(a,b)]){const r=graph([{k:'size',n:10}],[{k:'press',input:'g0'},{k:'apply',rule:node('n0'),inputs:[],subst:{x:t}}]).result.nodes.n1!;expect(r.fact).toEqual(eq(rep(t,10),E));expect(r.deps).toEqual(['g:h0']);}});
test(97,'press only emits a power law',()=>{const card=K.pressCard(10);expect(card).toEqual(law(rep(x,10),E));expect(Object.keys(card).sort()).toEqual(['k','l','metas','r']);});
test(98,'manifest tools enforced',()=>{const g:ProofGraph={rooms:[],nodes:[{id:'g',scope:'root',k:'given',givenId:'s'},{id:'p',scope:'root',k:'press',input:'g'}]};const l=structuredClone(LEVEL_BY_ID.L02!);l.givens.push({id:'s',name:'size',fact:{k:'size',n:5}});expect(K.check(g,ctx(l,REGISTRY)).nodes.p!.ok).toBe(false);expect(K.evalStep(eq(I(P(a,b)),I(P(a,b))),rw(schema('socks'),{u:a,v:b}),ctx(LEVEL_BY_ID.L01!,REGISTRY)).ok).toBe(false);});
test(99,'current unlock unavailable even if whitelist is forged',()=>{const l=structuredClone(LEVEL_BY_ID.L03!);l.tools.schemas=['witness'];const g:ProofGraph={rooms:[],nodes:[{id:'g',scope:'root',k:'given',givenId:'h'},{id:'n',scope:'root',k:'apply',rule:schema('witness'),inputs:['g'],subst:{u:a,v:b}}]};expect(K.check(g,ctx(l,REGISTRY)).nodes.n!.ok).toBe(false);});
test(100,'cycles rejected before evaluation',()=>{const g:ProofGraph={rooms:[],nodes:[{id:'a',scope:'root',k:'step',input:'b',op:{k:'swap'}},{id:'b',scope:'root',k:'step',input:'a',op:{k:'swap'}}]};expect(K.check(g,context()).ok).toBe(false);});
// There is no formula hash field; replay detects a stale redex structurally.
test(101,'upstream edit invalidates recorded redex',()=>{const r=graph([],[{k:'start',term:P(a,I(b))},{k:'step',input:'n0',op:rw(ax('invR'),{x:a})}]).result;expect(r.nodes.n1!.ok).toBe(false);});
// Claimed output/deps are not part of ProofNode. Unknown metadata has no authority.
test(102,'kernel recomputes output and dependencies',()=>{const r=graph([eq(a,E)],[{k:'start',term:a},{k:'step',input:'n0',op:rw(node('g0')),fact:eq(a,b),deps:[]}]).result.nodes.n1!;expect(r.fact).toEqual(eq(a,E));expect(r.deps).toEqual(['g:h0']);});
// Campaign was revised (L04 Conjugate Pair, old L04→L05, L05→S01,
// old L07→L08, L08→L09, L09→L10; new L07 and compound L12).
test(103,'all current campaign traces solve',()=>{for(const [id,builders] of Object.entries(SOLUTIONS)){const r=K.check(builders.solution(),ctx(LEVEL_BY_ID[id]!,REGISTRY));expect(r.solved,id).toBe(true);}});
test(104,'two explicit e factors require final unit',()=>{step(P(E,E),rw(ax('unitL'),{x:E}),E);step(E,rw(ax('unitL'),{x:E}));});
test(105,'intermediate Start is legal',()=>expect(K.check(SOLUTIONS.L02.intermediate(),ctx(LEVEL_BY_ID.L02!,REGISTRY)).solved).toBe(true));
test(106,'earned mirrored cancellation room shortcut',()=>expect(K.check(SOLUTIONS.L09.shortcut(),ctx(LEVEL_BY_ID.L09!,REGISTRY)).solved).toBe(true));
test(107,'forward derived-ribbon Clockwork proof',()=>{const g=SOLUTIONS.L11.shortRoute(),r=K.check(g,ctx(LEVEL_BY_ID.L11!,REGISTRY));expect(r.solved).toBe(true);expect(new Set(r.nodes[g.nodes.at(-1)!.id]!.deps)).toEqual(new Set(['g:s','g:h']));});
// Generic local atoms are deliberately not in v1: even the inner lift is rejected.
test(108,'room-local undeclared generic atom excluded',()=>{const r=graph([],[inside('r',{k:'assume',room:'r'}),inside('r',{k:'step',input:'n0',op:{k:'lift',side:'left',term:A('z')}})],[room]).result;expect(r.nodes.n1!.ok).toBe(false);});
test(109,'explicitly authorized First Light card',()=>step(P(I(a),a,b),rw(schema('fl'),{p:a,q:b}),b));
test(110,'true card still requires whitelist',()=>{const c0=context();c0.level.tools.schemas=[];expect(K.evalStep(eq(a,P(I(a),a,b)),rw(schema('fl'),{p:a,q:b}),c0).ok).toBe(false);});
test(111,'lifted inverse uniqueness with FL fixture',()=>{const r=graph([eq(P(a,b),E)],[{k:'step',input:'g0',op:{k:'lift',side:'left',term:I(a)}},{k:'step',input:'n0',op:rw(schema('fl'),{p:a,q:b},'l')},{k:'step',input:'n1',op:rw(ax('unitR'),{x:I(a)})}],[],eq(b,I(a))).result;expect(r.solved).toBe(true);expect(r.nodes.n2!.deps).toEqual(['g:h0']);});
test(112,'FL cancellation fixture and whitelist',()=>{const f=graph([eq(P(a,b),P(a,c))],[{k:'step',input:'g0',op:{k:'lift',side:'left',term:I(a)}},{k:'step',input:'n0',op:rw(schema('fl'),{p:a,q:b},'l')},{k:'step',input:'n1',op:rw(schema('fl'),{p:a,q:c})}],[],eq(b,c));expect(f.result.solved).toBe(true);f.context.level.sockets[0]!.allowedGivens=[];expect(K.check(f.g,f.context).solved).toBe(false);});
test(113,'FL whole compound inverse crate',()=>step(P(I(P(a,b)),a,b,I(b),I(a)),rw(schema('fl'),{p:P(a,b),q:P(I(b),I(a))}),P(I(b),I(a))));
test(114,'arbitrary Start FL double inverse route',()=>{const r=graph([],[{k:'start',term:P(I(I(a)),I(a),a)},{k:'step',input:'n0',op:rw(ax('invL'),{x:a},'l',[1,3])},{k:'step',input:'n1',op:rw(ax('unitR'),{x:I(I(a))},'l')},{k:'step',input:'n2',op:rw(schema('fl'),{p:I(a),q:a})}],[],eq(I(I(a)),a)).result;expect(r.solved).toBe(true);});
test(115,'inverse meta matches whole argument',()=>expect(K.match(I(x),I(P(a,b)),{x:a})).toEqual([]));
test(116,'structured inverse pattern partitions whole argument',()=>expect(K.match(I(P(M('u'),M('v'))),I(P(a,b,c)),{u:P(a,b),v:c})).toEqual([{u:P(a,b),v:c}]));
test(117,'multi-factor Witness instance',()=>{const p=A('p'),q=A('q'),r=A('r'),s=A('s');apply(eq(P(p,q,r,s),E),schema('witness'),{u:P(p,q),v:P(r,s)},eq(P(r,s),I(P(p,q))));step(P(I(P(p,q)),p,q,r,s),rw(node('h'),{},'r',[1,5]),P(I(P(p,q)),E),eq(P(p,q,r,s),E));});
test(118,'stale generic range is rejected',()=>{const p=A('p'),q=A('q'),r=A('r'),s=A('s');step(P(I(P(p,q)),p,q,r,s),rw(node('h'),{},'r',[1,3]),undefined,eq(P(p,q,r,s),E));});

// Architect addition: L03 withholds lift, so the review's lifted-given route must be rejected.
import { liftedGiven as l03Lifted } from './solutions/L03-unavailable';
import { LEVEL_BY_ID as LBI, REGISTRY as REG } from '../src/levels/levels';
import { check as kcheck } from '../src/kernel';
test('L03 lifted-given route is rejected (lift withheld)', () => {
  const res = kcheck(l03Lifted(), { level: LBI['L03']!, registry: REG });
  expect(res.ok && res.solved).toBe(false);
});
