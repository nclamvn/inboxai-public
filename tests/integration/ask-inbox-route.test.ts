import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/ask-inbox/route'

const mocks = vi.hoisted(() => ({ user: vi.fn(), rpc: vi.fn(), embed: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClientForRequest: async () => ({ auth: { getUser: mocks.user }, rpc: mocks.rpc }),
}))
vi.mock('@/lib/search/ask-embeddings', () => ({ embedTexts: mocks.embed }))

const request = (input: object) => new NextRequest('http://localhost/api/ask-inbox', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
})

describe('Ask Inbox API boundaries', () => {
  beforeEach(() => {
    mocks.user.mockResolvedValue({ data: { user: { id: 'authenticated-owner' } } })
  })

  it('explicitly returns keyword results when the verified local model is unavailable', async () => {
    mocks.embed.mockRejectedValue(new Error('Missing local asset'))
    mocks.rpc.mockImplementation((name: string) => ({
      abortSignal: async () => name === 'ask_inbox_pending'
        ? { data: [], error: null }
        : { data: { hits: [{ id: 'synthetic-keyword-match' }], coverage: null }, error: null },
    }))
    const response = await POST(request({ query: 'biên bản' }))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({
      hits: [{ id: 'synthetic-keyword-match' }], coverage: null, semantic: 'unavailable',
    })
    expect(mocks.rpc).toHaveBeenCalledWith('ask_inbox_search', expect.objectContaining({ p_vector: null }))
  })

  it('rejects foreign scope before local inference', async () => {
    mocks.rpc.mockImplementation(() => ({ abortSignal: async () => ({ data: null, error: { code: 'PT404' } }) }))
    const response = await POST(request({ query: 'biên bản', accountIds: ['10000000-0000-4000-8000-000000000091'] }))
    expect(response.status).toBe(404)
    expect(mocks.embed).not.toHaveBeenCalled()
  })

  it('rejects anonymous requests before reading or indexing email', async () => {
    mocks.user.mockResolvedValue({ data: { user: null } })
    const response = await POST(request({ query: 'biên bản' }))
    expect(response.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
