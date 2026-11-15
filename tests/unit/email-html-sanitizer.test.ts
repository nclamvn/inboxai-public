// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { sanitizeEmailHtml } from '@/lib/email/html-sanitizer'

function fragment(html: string) {
  const template = document.createElement('template')
  template.innerHTML = html
  return template.content
}

it('keeps readable mail and removes executable markup, CSS, tracking pixels and app-relative URLs', () => {
  const sanitized = sanitizeEmailHtml(`
    <div id="main-content" class="fixed" style="background:url(https://tracker.example.test/css)">
      <strong>Đã xác nhận giao hàng.</strong>
      <script>window.executed = true</script>
      <img src="https://tracker.example.test/pixel" onerror="window.executed = true">
      <img src="/api/inbox" alt="relative image">
      <a href="java&#x09;script:alert(1)">Unsafe</a>
      <a href="/settings">Internal</a>
      <a href="https://vendor.example.test/order" target="_self" rel="opener">Order</a>
    </div>`)
  const result = fragment(sanitized)
  expect(result.querySelector('strong')?.textContent).toBe('Đã xác nhận giao hàng.')
  expect(result.querySelectorAll('script, img, [onerror], [style], [id], [class]')).toHaveLength(0)
  const links = result.querySelectorAll('a[href]')
  expect(links).toHaveLength(1)
  expect(links[0].getAttribute('href')).toBe('https://vendor.example.test/order')
  expect(links[0].getAttribute('target')).toBe('_blank')
  expect(links[0].getAttribute('rel')).toBe('noopener noreferrer')
})

it('allows only embedded raster images and honors an explicit image block', () => {
  const html = '<img src="data:image/png;base64,iVBORw0KGgo=" alt="Diagram"><img src="data:image/svg+xml;base64,PHN2Zz4=" alt="Active">'
  const image = fragment(sanitizeEmailHtml(html)).querySelectorAll('img')
  expect(image).toHaveLength(1)
  expect(image[0].getAttribute('alt')).toBe('Diagram')
  expect(image[0].hasAttribute('onerror')).toBe(false)
  expect(fragment(sanitizeEmailHtml(html, { allowImages: false })).querySelector('img')).toBeNull()
})
