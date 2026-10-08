import {A,I,P,rep,Builder,rw,ax,node} from '../helpers';
export function solution(){const b=new Builder(),a=A('a'),v=A('b');b.given('h');let n=b.start(rep(P(v,a),5));n=b.steps(n,[{k:'insertE',at:{side:'r',path:[],gap:0}},rw(ax('invL'),{x:a},'r',[0,1],'rev')]);n=b.steps(n,[rw(node('g-h'),{},'r',[1,11]),rw(ax('unitL'),{x:a},'r',[1,3])]);b.steps(n,[rw(ax('invL'),{x:a})]);return b.g;}
