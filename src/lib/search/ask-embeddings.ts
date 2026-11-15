import 'server-only'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Tokenizer } from '@huggingface/tokenizers'
import type { Tensor as OrtTensor } from 'onnxruntime-node'
import { files, modelDirectory, verifyAsset } from './ask-model-assets.mjs'

const dimension = 384
const tokenLimit = 384
const batchSize = 6

async function loadModel() {
  const directory = modelDirectory()
  const checks = await Promise.all(files.map(file => verifyAsset(join(directory, file.local), file)))
  if (checks.some(check => !check)) throw new Error('Local search model failed verification')
  const { InferenceSession, Tensor } = await import('onnxruntime-node')
  const tokenizer = new Tokenizer(
    JSON.parse(await readFile(/* turbopackIgnore: true */ join(directory, 'tokenizer.json'), 'utf8')),
    JSON.parse(await readFile(/* turbopackIgnore: true */ join(directory, 'tokenizer_config.json'), 'utf8')),
  )
  const session = await InferenceSession.create(join(directory, 'model.onnx'), {
    executionProviders: ['cpu'], intraOpNumThreads: 2, interOpNumThreads: 1,
  })
  return { tokenizer, session, Tensor }
}

let model: ReturnType<typeof loadModel> | undefined

export async function embedTexts(texts: string[], signal: AbortSignal): Promise<number[][]> {
  signal.throwIfAborted()
  const { tokenizer, session, Tensor } = await (model ??= loadModel().catch(error => {
    model = undefined
    throw error
  }))
  const vectors: number[][] = []
  for (let offset = 0; offset < texts.length; offset += batchSize) {
    signal.throwIfAborted()
    const encoded = texts.slice(offset, offset + batchSize).map(text => {
      const { ids } = tokenizer.encode(text)
      return ids.length > tokenLimit ? [...ids.slice(0, tokenLimit - 1), ids[ids.length - 1]] : ids
    })
    const width = Math.max(...encoded.map(ids => ids.length))
    const ids = new BigInt64Array(encoded.length * width).fill(BigInt(1))
    const mask = new BigInt64Array(ids.length)
    encoded.forEach((row, index) => {
      ids.set(row.map(BigInt), index * width)
      mask.fill(BigInt(1), index * width, index * width + row.length)
    })
    const dims = [encoded.length, width]
    const inputs: Record<string, OrtTensor> = {
      input_ids: new Tensor('int64', ids, dims),
      attention_mask: new Tensor('int64', mask, dims),
    }
    if (session.inputNames.includes('token_type_ids')) inputs.token_type_ids = new Tensor('int64', new BigInt64Array(ids.length), dims)
    const output = (await session.run(inputs))[session.outputNames[0]]
    const values = output.data
    if (!(values instanceof Float32Array) || output.dims.length !== 3 ||
      output.dims[0] !== encoded.length || output.dims[1] !== width || output.dims[2] !== dimension) {
      throw new Error('Unexpected embedding output')
    }
    for (const [row, tokens] of encoded.entries()) {
      const pooled: number[] = Array(dimension).fill(0)
      for (let token = 0; token < tokens.length; token++) {
        const start = (row * width + token) * dimension
        for (let i = 0; i < dimension; i++) pooled[i] += values[start + i]
      }
      const norm = Math.hypot(...pooled)
      if (!Number.isFinite(norm) || norm <= 0) throw new Error('Invalid embedding')
      vectors.push(pooled.map(value => value / norm))
    }
  }
  signal.throwIfAborted()
  return vectors
}
