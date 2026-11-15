import { beforeEach, vi } from 'vitest'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => {
    throw new Error('External network disabled in tests; mock the provider explicitly')
  }))
})
