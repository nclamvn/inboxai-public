import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

export function readPilotVersion() {
  const files = execFileSync('git',['ls-files','-co','--exclude-standard','-z'],{encoding:'utf8'})
    .split('\0').filter(file=>/^(src\/|public\/|scripts\/|tests\/|supabase\/migrations\/|package(?:-lock)?\.json$|next\.config|tsconfig)/.test(file))
  const hash = createHash('sha256')
  for (const file of [...new Set(files)].sort()) hash.update(file+'\0').update(existsSync(file)?readFileSync(file):'<deleted>')
  return { commit:execFileSync('git',['rev-parse','--short','HEAD'],{encoding:'utf8'}).trim(),
    fingerprint:hash.digest('hex').slice(0,12) }
}
