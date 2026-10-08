import {A,I,P,Builder,rw,ax} from '../helpers';
export function solution(){const b=new Builder(),a=A('a'),v=A('b');b.steps(b.start(P(I(a),a,v)),[rw(ax('invL'),{x:a},'r',[0,2]),rw(ax('unitL'),{x:v})]);return b.g;}
