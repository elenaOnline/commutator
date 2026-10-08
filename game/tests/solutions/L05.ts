import {A,I,Builder,rw,ax} from '../helpers';
export function solution(){const b=new Builder(),a=A('a');let n=b.steps(b.given('h'),[{k:'lift',side:'left',term:I(a)}]);n=b.steps(n,[rw(ax('invL'),{x:a},'l',[0,2]),rw(ax('unitL'),{x:A('b')},'l')]);b.steps(n,[rw(ax('invL'),{x:a},'r',[0,2]),rw(ax('unitL'),{x:A('c')})]);return b.g;}
