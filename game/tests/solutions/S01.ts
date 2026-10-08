import {A,I,P,Builder,rw,ax,schema} from '../helpers';
export function solution(){const b=new Builder(),a=A('a');let n=b.steps(b.start(P(I(a),a)),[rw(ax('invL'),{x:a})]);n=b.apply(n,schema('witness'),{u:I(a),v:a});b.swap(n);return b.g;}
export function bench(){const b=new Builder(),a=A('a');let n=b.start(I(I(a)));n=b.steps(n,[{k:'insertE',at:{side:'r',path:[],gap:1}},rw(ax('invL'),{x:a},'r',[1,2],'rev')]);b.steps(n,[rw(ax('invL'),{x:I(a)},'r',[0,2]),rw(ax('unitL'),{x:a})]);return b.g;}
