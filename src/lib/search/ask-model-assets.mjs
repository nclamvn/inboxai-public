import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { join, resolve } from 'node:path'

export const revision = '761b726dd34fb83930e26aab4e9ac3899aa1fa78'
export function modelDirectory() {
  const configured = process.env.ASK_INBOX_MODEL_DIR
  return configured ? resolve(/* turbopackIgnore: true */ configured)
    : join(process.cwd(), 'node_modules/.cache/inboxai-ask-e5')
}
export const files = [
  { local: 'model.onnx', remote: 'onnx/model_quantized.onnx', size: 118308185, sha: 'f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193' },
  { local: 'tokenizer.json', remote: 'tokenizer.json', size: 17082730, sha: '0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39' },
  { local: 'tokenizer_config.json', remote: 'tokenizer_config.json', size: 443, sha: 'a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b' },
]

export async function verifyAsset(path, file) {
  const hash = createHash('sha256')
  let size = 0
  for await (const chunk of createReadStream(/* turbopackIgnore: true */ path)) {
    size += chunk.length
    if (size > file.size) return false
    hash.update(chunk)
  }
  return size === file.size && hash.digest('hex') === file.sha
}
