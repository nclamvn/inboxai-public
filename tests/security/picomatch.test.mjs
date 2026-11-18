import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { compatibility } from './picomatch-compatibility.mjs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateAdvisories, verifySources, verifyInstalled } from '../../scripts/security/picomatch.mjs';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
const patterns = ['+(*a)', '*(*a)', '+(*)b', '*(*)b', '+(a*)b', '+(a*b)c', '+(*.js)x', '+(?*)b', '+([a-z]*)b', '+([.-0]*a)b', '+(@(*a))b', '+(@(*)a)b', '*(@(a*))b', '+(**a)b', '+(a/*)b'];
const options = [{}, {dot:true}, {windows:true}, {bash:true}, {nocase:true}, {capture:true}, {regex:true}, {maxExtglobRecursion:false}];

for (const major of [2,4]) {
  test(`v${major}: bounded adversarial patterns and option bypasses`, () => {
    const modulePath = `${root}vendor/picomatch-v${major}/index.js`;
    const code = `const pm=require(${JSON.stringify(modulePath)}); for(const p of ${JSON.stringify(patterns)}) for(const o of ${JSON.stringify(options)}) for(const input of ['a'.repeat(1024)+'!', 'a/'.repeat(512)+'!']) pm.makeRe(p,o).test(input);`;
    const child = spawnSync(process.execPath, ['-e', code], {timeout:5000, encoding:'utf8'});
    assert.equal(child.error, undefined, String(child.error));
    assert.equal(child.status, 0, child.stderr);
  });
  test(`v${major}: frozen upstream compatibility corpus`, () => {
    const baseline=JSON.parse(readFileSync(new URL('./picomatch-compatibility.json',import.meta.url),'utf8'));
    const pm=require(`${root}vendor/picomatch-v${major}`);
    const actual=compatibility(pm);
    for(let i=0;i<actual.length;i++) {
      const entry=actual[i];
      if(entry.pattern==='+(a/*)' && entry.option.bash===true) {
        assert.equal(pm(entry.pattern,entry.option)('a/b'),false,'Unsafe separator-crossing repetition must fail closed');
      } else assert.deepEqual(entry,baseline[major][i]);
    }
  });
  test(`v${major}: ordinary and flattened extglob semantics`, () => {
    const pm = require(`${root}vendor/picomatch-v${major}`);
    for(const [pattern, input, expected] of [
      ['src/**/*.ts','src/a/b.ts',true], ['src/**/*.ts','src/a.js',false],
      ['+(a*b)','abab',true], ['*(a*b)','',false], // picomatch rejects empty inputs
      ['+(*a)','aaaa!',false], ['+(*a)','baaa',true],
      ['*(a*b)c','c',true], ['*(a*b)c','ababc',true],
      ['+(foo|bar)','foobar',true], ['+(a/*)','a/b',true],
    ]) assert.equal(pm(pattern)(input), expected, `${pattern}: ${input}`);
    for(const p of ['+(@(*a))', '+([.-0]*a)', '+(**a)']) {
      assert.equal(pm(p)('aaaa'),false, `complex unsafe body must fail closed: ${p}`);
    }
    for(const opts of [{},{capture:true},{maxExtglobRecursion:false}]) {
      assert.equal(pm.makeRe('+(*a)',opts).source.includes(')+'),false);
    }
  });
}

test('negative control: the former nested quantifier must exceed the deadline', () => {
  const child=spawnSync(process.execPath,['-e',"/^(?:(?=.)(?:[^/]*?a)+)$/.test('a'.repeat(32)+'b')"],{timeout:600,encoding:'utf8'});
  assert.equal(child.error?.code,'ETIMEDOUT');
});

test('advisory gate rejects unknown advisories, invalid feeds and drift', () => {
  const known={id:1247710,url:'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',severity:'high',vulnerable_versions:'<=4.0.7'};
  assert.doesNotThrow(()=>validateAdvisories({picomatch:[known]}));
  assert.throws(()=>validateAdvisories({picomatch:[{...known,id:999,url:'https://github.com/advisories/GHSA-new'}]}));
  assert.throws(()=>validateAdvisories({picomatch:[{...known,vulnerable_versions:'*'}]}));
  for(const invalid of [null,[],{}, {picomatch:'bad'}]) assert.throws(()=>validateAdvisories(invalid));
  verifySources(root);
  assert.throws(()=>verifySources(root, {'lib/parse.js':'changed'}), /hash/);
});

test('installed-copy gate rejects a reintroduced official vulnerable package', () => {
  const parent=`${root}test-results/security`;
  mkdirSync(parent,{recursive:true});
  const fixture=mkdtempSync(`${parent}/picomatch-`);
  try {
    mkdirSync(`${fixture}/node_modules/picomatch`,{recursive:true});
    writeFileSync(`${fixture}/node_modules/picomatch/package.json`,JSON.stringify({name:'picomatch',version:'4.0.7'}));
    assert.throws(()=>verifyInstalled(fixture,verifySources(root)),/Unpatched or unknown/);
  } finally { rmSync(fixture,{recursive:true}); }
});
