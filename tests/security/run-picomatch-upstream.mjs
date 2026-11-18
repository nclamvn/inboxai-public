import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = path.resolve(process.argv[2]);
const suite = { name: '', children: [], before: [], after: [], beforeEach: [], afterEach: [] };
let current = suite;
global.describe = (name, fn) => { const parent=current; const next={ name, children: [], before: [], after: [], beforeEach: [], afterEach: [] }; parent.children.push(next); current=next; fn(); current=parent; };
global.it = (name, fn) => current.children.push({ name, fn });
for (const kind of ['before','after','beforeEach','afterEach']) global[kind] = fn => current[kind].push(fn);
for (const f of fs.readdirSync(path.join(root, 'test')).filter(x=>x.endsWith('.js'))) require(path.join(root, 'test', f));
let passed=0; const failures=[];
async function run(s, ancestors=[]) {
  const chain=[...ancestors,s];
  for(const hook of s.before) await hook();
  for(const child of s.children) {
    if(!child.fn) { await run(child,chain); continue; }
    try { for(const parent of chain) for(const hook of parent.beforeEach) await hook(); await child.fn(); passed++; }
    catch(e) { failures.push({name:[...chain.map(x=>x.name),child.name].filter(Boolean).join(' / '),error:e.message}); }
    finally { for(const parent of [...chain].reverse()) for(const hook of parent.afterEach) await hook(); }
  }
  for(const hook of s.after) await hook();
}
run(suite).then(()=>{console.log(JSON.stringify({passed,failed:failures.length,failures},null,2));process.exitCode=failures.length?1:0;}).catch(e=>{console.error(e);process.exitCode=1;});
