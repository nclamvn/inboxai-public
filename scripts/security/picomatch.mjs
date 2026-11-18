import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export function validateAdvisories(feed) {
  assert.ok(feed && !Array.isArray(feed) && Array.isArray(feed.picomatch), 'Invalid upstream advisory feed');
  for (const entry of feed.picomatch) {
    assert.equal(entry.id, 1247710, `Uncovered upstream advisory: ${entry.url}`);
    assert.equal(entry.url, 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf');
    assert.equal(entry.severity, 'high');
    assert.equal(entry.vulnerable_versions, '<=4.0.7', 'Advisory changed; review the backport again');
  }
}
const hash = data => createHash('sha256').update(data).digest('hex');
export function verifySources(root, corruption = {}) {
  const manifest=JSON.parse(readFileSync(join(root,'vendor/picomatch-manifest.json'),'utf8'));
  for(const pkg of manifest.packages) {
    if(pkg.archiveIntegrity) assert.equal('sha512-'+createHash('sha512').update(readFileSync(join(root,pkg.archive))).digest('base64'),pkg.archiveIntegrity,'Archive hash mismatch: '+pkg.archive);
    const original = JSON.parse(readFileSync(join(root, `vendor/picomatch-upstream-v${pkg.upstream.version.startsWith('2.') ? 2 : 4}.json`), 'utf8'));
    for(const [file, expected] of Object.entries(pkg.files)) {
      if (!['lib/parse.js', 'package.json'].includes(file)) assert.equal(expected, original.files[file], `Unexpected upstream modification: ${file}`);
      assert.equal(hash(corruption[file] ?? readFileSync(join(root,pkg.directory,file))),expected,`Source hash mismatch: ${pkg.directory}/${file}`);
    }
  }
  return manifest;
}
export function verifyInstalled(root, manifest) {
  const found=[];
  const check = directory => {
    const metadata=JSON.parse(readFileSync(join(directory,'package.json'),'utf8'));
    const expected=manifest.packages.find(pkg=>pkg.name===metadata.name && pkg.version===metadata.version);
    assert.ok(expected,`Unpatched or unknown picomatch at ${directory}: ${metadata.name}@${metadata.version}`);
    for(const [file,value] of Object.entries(expected.files)) {
      assert.equal(hash(readFileSync(join(directory,file))),value,`Installed hash mismatch: ${directory}/${file}`);
    }
    found.push(directory);
  };
  const visit = modules => {
    for(const entry of readdirSync(modules,{withFileTypes:true})) {
      if(entry.name.startsWith('.')) continue;
      const directory=join(modules,entry.name);
      if(entry.name.startsWith('@') && entry.isDirectory()) {
        for(const child of readdirSync(directory,{withFileTypes:true})) if(child.isDirectory()) visitPackage(join(directory,child.name),child.name);
      } else if(entry.isDirectory() || entry.isSymbolicLink()) visitPackage(directory,entry.name);
    }
  };
  const visitPackage = (directory,name) => {
    if(name==='picomatch' || name.startsWith('picomatch-v')) check(directory);
    const nested = join(directory, 'node_modules');
    if (existsSync(nested)) visit(nested);
  };
  visit(join(root,'node_modules'));
  assert.ok(found.length>0,'No installed picomatch found');
  const lock=JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8'));
  for(const [key,pkg] of Object.entries(lock.packages)) {
    if(!key.endsWith('/picomatch')) continue;
    assert.ok(manifest.packages.some(p=>p.name===pkg.name && p.version===pkg.version),`Unpatched lock entry: ${key}`);
    assert.ok(found.includes(join(root,key)),`Lock entry missing on disk: ${key}`);
    assert.equal(pkg.integrity,manifest.packages.find(p=>p.name===pkg.name).archiveIntegrity,`Archive integrity mismatch: ${key}`);
  }
  return found.length;
}

async function main() {
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
  const manifest=verifySources(root);
  const count=verifyInstalled(root,manifest);
  const regression=spawnSync(process.execPath,['--test','tests/security/picomatch.test.mjs'],{cwd:root,stdio:'inherit',timeout:30000});
  assert.equal(regression.error,undefined,String(regression.error));
  assert.equal(regression.status,0,'Backport regression gate failed');
  const response=await fetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({picomatch:manifest.packages.map(p=>p.upstream.version)}),signal:AbortSignal.timeout(20000)
  });
  assert.ok(response.ok,`Upstream advisory request failed: ${response.status}`);
  validateAdvisories(await response.json());
  console.log(`Verified ${count} installed picomatch copies, exact backport sources, ReDoS regressions and upstream advisory coverage.`);
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(error=>{console.error(error);process.exitCode=1;});
