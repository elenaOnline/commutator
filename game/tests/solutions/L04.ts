// v4: L04 targets ∀x,y. (xy)⁵ = e ⇒ (yx)⁵ = e. Towers x₁, y₁; an assume room supposes (x₁y₁)⁵ = e;
// inside, (y₁x₁)⁵ is re-read in a shifted frame; the gate exports the implication; ∀ binds x₁, y₁.
import {A,E,I,P,rep,Builder,rw,ax,node} from '../helpers';
export function solution(){
 const b=new Builder(),x=A('x1'),y=A('y1');
 b.g.vars=[{id:'x1',label:'x₁',hue:5,variable:true},{id:'y1',label:'y₁',hue:4,variable:true}];
 b.g.rooms.push({id:'room1',parent:'root',kind:'assume',rel:'eq',l:rep(P(x,y),5),r:E});b.scope='room1';
 const h=b.add({k:'assume',room:'room1'});
 let n=b.start(rep(P(y,x),5));
 n=b.steps(n,[{k:'insertE',at:{side:'r',path:[],gap:0}},rw(ax('invL'),{x},'r',[0,1],'rev')]);
 n=b.steps(n,[rw(node(h),{},'r',[1,11]),rw(ax('unitL'),{x},'r',[1,3])]);
 n=b.steps(n,[rw(ax('invL'),{x})]);
 b.scope='root';
 const ex=b.add({k:'exit',room:'room1',input:n,meta:{station:`st${++b.station}`}});
 b.add({k:'generalize',input:ex,meta:{station:`st${++b.station}`}});
 void I;return b.g;
}
