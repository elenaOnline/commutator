// v4: T01 targets ∀x,y. x⁻¹ = y ⇒ x = y⁻¹. Assume x₁⁻¹ = y₁, invert both sides, the player's own saved
// Double Flip (authored lemma, see helpers.DOUBLE_FLIP), exit, ∀.
import {A,I,Builder,rw,schema,DOUBLE_FLIP} from '../helpers';
export function solution(){
 const b=new Builder(),x=A('x1'),y=A('y1');
 b.g.vars=[{id:'x1',label:'x₁',hue:5,variable:true},{id:'y1',label:'y₁',hue:4,variable:true}];
 b.g.rooms.push({id:'room1',parent:'root',kind:'assume',rel:'eq',l:I(x),r:y});b.scope='room1';
 const h=b.add({k:'assume',room:'room1'});
 let n=b.steps(h,[{k:'invert'}]);
 n=b.steps(n,[rw(schema(DOUBLE_FLIP.id),{u:x},'l',[0,1])]);
 b.scope='root';
 const ex=b.add({k:'exit',room:'room1',input:n,meta:{station:`st${++b.station}`}});
 b.add({k:'generalize',input:ex,meta:{station:`st${++b.station}`}});
 return b.g;
}
