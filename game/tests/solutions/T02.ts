// v4 r2: T02 'Returning a Return' targets ∀x,y. (y⁻¹x⁻¹)⁻¹ = xy (intended factory: comment in levels.ts).
// Towers x₁, y₁. Spool (y₁⁻¹x₁⁻¹)⁻¹; Sock Drawer BACKWARDS inside the crate (u = x₁, v = y₁) gives
// ((x₁y₁)⁻¹)⁻¹; the player's saved Double Flip at u = x₁y₁ gives x₁y₁; ∀ binds y₁, x₁.
import {A,I,P,Builder,rw,schema,DOUBLE_FLIP} from '../helpers';
export function solution(){
 const b=new Builder(),x=A('x1'),y=A('y1');
 b.g.vars=[{id:'x1',label:'x₁',hue:5,variable:true},{id:'y1',label:'y₁',hue:4,variable:true}];
 let n=b.start(I(P(I(y),I(x))));
 n=b.steps(n,[rw(schema('socks'),{u:x,v:y},'r',[0,2],'rev',[0])]);
 n=b.steps(n,[rw(schema(DOUBLE_FLIP.id),{u:P(x,y)},'r',[0,1])]);
 b.add({k:'generalize',input:n,meta:{station:`st${++b.station}`}});
 return b.g;
}
