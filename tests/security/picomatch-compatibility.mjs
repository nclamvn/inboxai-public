import { createHash } from 'node:crypto';
export const patterns=['*.js','**/*.js','src/**/*.{ts,tsx}','a?b','[ab]*','[!a]*','a/**/b','!*.js','@(a|b)','+(a|b)','?(a|b)','*(a|b)','+(a*b)','*(a*b)c','+(*a)','*(*a)','+(a*)b','+(?*a)','+([ab]*a)','+(a/*)','a/**','.*','a\\*b','a+b','+(*.js)','+(*a*b)','*(a*b*)','+(a?*b)','foo/**/!(bar).js'];
export const options=[{}, {dot:true}, {windows:true}, {bash:true}, {nocase:true}, {capture:true}];
export function compatibility(pm) {
  let inputs=['']; let layer=[''];
  for(let depth=0;depth<4;depth++) {layer=layer.flatMap(p=>['a','b','.','/','\\'].map(c=>p+c));inputs.push(...layer);}
  inputs.push('a.js','a/b.js','src/a.ts','src/b/a.tsx','foo/a/x.js','abab','ababc','a/b/a/c');
  return patterns.flatMap(pattern=>options.map(option=>{
    const match=pm(pattern,option);
    const actual=inputs.map(value=>match(value)?'1':'0').join('');
    return {pattern,option,count:inputs.length,sha256:createHash('sha256').update(actual).digest('hex')};
  }));
}
