import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import ts from 'typescript'

// Deterministic inventory, not a claim of manual semantic review or exploitability.
const files = execFileSync('git', ['ls-tree', '-r', '--name-only', '240d9e1'], { encoding: 'utf8' }).trim().split('\n')
const entries = files.map(path => {
  const bytes = execFileSync('git', ['show', `240d9e1:${path}`], { maxBuffer: 20 * 1024 * 1024 })
  const base = { path, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }
  if (bytes.includes(0)) return { ...base, kind: 'binary' }
  const text = bytes.toString('utf8')
  const imports = []
  const exports = []
  if (/\.[cm]?[jt]sx?$/.test(path)) {
    const ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
    for (const node of ast.statements) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text)
      if (node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) && node.name) exports.push(node.name.getText(ast))
    }
  }
  return { ...base, kind: 'text', lines: text.split('\n').length, imports, exports,
    serviceRole: text.includes('SUPABASE_SERVICE_ROLE_KEY'),
    tables: [...new Set([...text.matchAll(/\.from\(['"]([^'"]+)['"]\)/g)].map(m => m[1]))],
    envNames: [...new Set([...text.matchAll(/process\.env\.([A-Z_]+)/g)].map(m => m[1]))],
    ...(path.endsWith('.sql') ? { sqlTables: [...text.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)/gi)].map(m => m[1]) } : {}),
  }
})
mkdirSync('docs/phase-2/evidence', { recursive: true })
writeFileSync('docs/phase-2/evidence/repository-inventory.json', JSON.stringify({
  revision: '240d9e1', method: 'All tracked blobs hashed; text indexed; TS/JS imports/exports parsed; no secrets read from environment.',
  totals: { files: entries.length, text: entries.filter(e => e.kind === 'text').length,
    apiRoutes: entries.filter(e => e.path.startsWith('src/app/api/') && e.path.endsWith('/route.ts')).length,
    migrations: entries.filter(e => e.path.startsWith('supabase/migrations/')).length }, entries,
}, null, 2) + '\n')
// Deliberately only file names/counts, never environment values or email content.
console.log(JSON.stringify({ files: files.length, text: entries.filter(e => e.kind === 'text').length, inventory: 'docs/phase-2/evidence/repository-inventory.json' }))
