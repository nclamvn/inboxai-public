// Loaded only into the local staging Next process.
const fixture = 'http://127.0.0.1:56321'
if (process.env.NEXT_PUBLIC_SUPABASE_URL !== fixture) throw new Error('Expected the staging loopback database gateway')
const request = globalThis.fetch
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input)
  if (url.origin !== fixture) throw new Error('Outbound fetch blocked in local staging')
  return request(input, { ...init, redirect: 'error' })
}
