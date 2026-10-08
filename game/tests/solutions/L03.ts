import {A,E,I,P,Builder,rw,ax,node} from '../helpers';
export function solution(){const b=new Builder(),a=A('a'),v=A('b');b.given('h');let n=b.start(v);n=b.steps(n,[{k:'insertE',at:{side:'r',path:[],gap:0}},rw(ax('invL'),{x:a},'r',[0,1],'rev')]);b.steps(n,[rw(node('g-h'),{},'r',[1,3]),rw(ax('unitR'),{x:I(a)})]);return b.g;}
// L03 disables lift. The second legal bench route uses an intermediate start,
// rather than the review's lifted-given route, which needs a different manifest.
export function intermediate(){const b=new Builder(),a=A('a'),v=A('b');b.given('h');let n=b.start(P(I(a),a,v));n=b.steps(n,[rw(ax('invL'),{x:a},'l',[0,2]),rw(ax('unitL'),{x:v},'l')]);b.steps(n,[rw(node('g-h'),{},'r',[1,3]),rw(ax('unitR'),{x:I(a)})]);return b.g;}
// Exact alternate trace from review §3. L03's current manifest withholds lift;
// keep this route visible so acceptance reports that tool-contract mismatch.
