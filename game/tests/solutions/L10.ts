import {A,E,Builder,node,schema} from '../helpers';
export function solution(){const b=new Builder(),a=A('a');const h=b.given('H'),negative=b.room('classical',a,E);let n=b.apply(negative,node(h),{x:a});n=b.steps(n,[{k:'insertE',at:{side:'r',path:[],gap:1}}]);n=b.apply(n,schema('cancel'),{u:a,v:a,w:E});b.clash(n,negative);return b.g;}
// The review's "L10 short route" is Clockwork, now L11 (exported there).

