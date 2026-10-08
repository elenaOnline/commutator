// v4: S01 targets the law ∀x. (x⁻¹)⁻¹ = x. A Tower variable x₁ stands for an arbitrary element; the
// proof is about x₁, then ∀-introduction binds it (no hypotheses mention x₁).
import {A,I,P,Builder,rw,ax,schema} from '../helpers';
const vars=[{id:'x1',label:'x₁',hue:5,variable:true}];
export function solution(){const b=new Builder(),x=A('x1');b.g.vars=vars;let n=b.steps(b.start(P(I(x),x)),[rw(ax('invL'),{x})]);n=b.apply(n,schema('witness'),{u:I(x),v:x});n=b.swap(n);b.add({k:'generalize',input:n,meta:{station:`st${++b.station}`}});return b.g;}
export function bench(){const b=new Builder(),x=A('x1');b.g.vars=vars;let n=b.start(I(I(x)));n=b.steps(n,[{k:'insertE',at:{side:'r',path:[],gap:1}},rw(ax('invL'),{x},'r',[1,2],'rev')]);n=b.steps(n,[rw(ax('invL'),{x:I(x)},'r',[0,2]),rw(ax('unitL'),{x})]);b.add({k:'generalize',input:n,meta:{station:`st${++b.station}`}});return b.g;}
