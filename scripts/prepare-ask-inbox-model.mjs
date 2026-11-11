import { mkdir, rename, rm } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { files, modelDirectory, revision, verifyAsset } from '../src/lib/search/ask-model-assets.mjs'

// This explicit setup command downloads only public, pinned weights. Runtime inference has no network client.
const destination = modelDirectory()
await mkdir(destination, { recursive: true })
for (const file of files) {
  const path = join(destination, file.local)
  if (await verifyAsset(path, file).catch(() => false)) continue
  const scratch = path + '.' + process.pid + '.download'
  const url = 'https://huggingface.co/Xenova/multilingual-e5-small/resolve/' + revision + '/' + file.remote
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(110_000) })
    if (!response.ok || !response.body) throw new Error('Model asset download failed (' + response.status + ')')
    await pipeline(response.body, async function* (chunks) {
      let bytes = 0
      for await (const chunk of chunks) {
        bytes += chunk.length
        if (bytes > file.size) throw new Error('Model asset exceeds pinned size')
        yield chunk
      }
    }, createWriteStream(scratch, { flags: 'wx' }))
    if (!await verifyAsset(scratch, file)) throw new Error('Model asset checksum mismatch')
    await rename(scratch, path)
    console.log('Verified ' + file.local + ' (' + file.size + ' bytes)')
  } finally {
    await rm(scratch, { force: true })
  }
}
console.log('Local model verified in ' + destination)
