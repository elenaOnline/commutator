import {A,E,P,Builder,rw,ax,node} from '../helpers';
export function solution(){const b=new Builder(),p=A('e1');b.given('H');let n=b.start(p);n=b.steps(n,[{k:'insertE',at:{side:'r',path:[],gap:1}}]);b.steps(n,[rw(node('g-H'),{x:E})]);return b.g;}
export function intermediate(){const b=new Builder(),p=A('e1');b.given('H');let n=b.steps(b.start(P(p,E)),[rw(ax('unitR'),{x:p},'l')]);b.steps(n,[rw(node('g-H'),{x:E})]);return b.g;}
