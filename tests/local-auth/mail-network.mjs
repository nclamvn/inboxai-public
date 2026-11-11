// Loaded only by the disposable Next test process. Gmail requests go to the local fixture.
const nativeFetch = globalThis.fetch
const fixture = new URL(process.env.INBOXAI_TEST_GMAIL_URL)
if (fixture.hostname !== '127.0.0.1' || fixture.protocol !== 'http:') throw new Error('Expected loopback Gmail fixture')
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input)
  if (url.origin === 'https://gmail.googleapis.com' && url.pathname.startsWith('/gmail/v1/users/me/messages')) {
    const local = new URL(url.pathname + url.search, fixture)
    const request = input instanceof Request ? new Request(local, input) : local
    return nativeFetch(request, { ...init, redirect: 'error' })
  }
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') throw new Error('Non-loopback fetch blocked by local test')
  return nativeFetch(input, { ...init, redirect: 'error' })
}
