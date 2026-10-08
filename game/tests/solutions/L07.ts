import {A,P,Builder,schema} from '../helpers';
export function solution(){const b=new Builder(),a=A('a'),v=A('b');let n=b.apply(b.given('h'),schema('cancel'),{u:a,v:P(v,a,v),w:P(a,v,v)});n=b.apply(n,schema('cancel',true),{u:v,v:P(v,a),w:P(a,v)});b.swap(n);return b.g;}
