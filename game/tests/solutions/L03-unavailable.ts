import {A,E,I,P,Builder,rw,ax,node} from '../helpers';
// Architect: L03 deliberately withholds lift (the lesson is the chosen pair). This route must be REJECTED.
export function liftedGiven(){const b=new Builder(),a=A('a'),v=A('b');let n=b.steps(b.given('h'),[{k:'lift',side:'left',term:I(a)}]);n=b.steps(n,[rw(ax('invL'),{x:a},'l',[0,2]),rw(ax('unitL'),{x:v},'l')]);b.steps(n,[rw(ax('unitR'),{x:I(a)})]);return b.g;}
