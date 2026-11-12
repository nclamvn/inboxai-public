import DOMPurify from 'isomorphic-dompurify'

interface SanitizeOptions {
  allowImages?: boolean
}

const embeddedRaster = /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/]+=*$/i

function isEmailLink(href: string) {
  try {
    return ['https:', 'http:', 'mailto:'].includes(new URL(href).protocol)
  } catch {
    return false
  }
}

export function sanitizeEmailHtml(html: string, { allowImages = true }: SanitizeOptions = {}): string {
  const fragment = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: [
      'p', 'br', 'div', 'span', 'a', 'b', 'i', 'u', 'strong', 'em',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'img', 'hr', 'sub', 'sup', 'font', 'center',
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'width', 'height', 'align', 'valign', 'color', 'size', 'face', 'colspan', 'rowspan'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  })

  // A mail body cannot load tracking pixels or make requests to the app origin.
  for (const image of fragment.querySelectorAll('img')) {
    if (!allowImages || !embeddedRaster.test(image.getAttribute('src') ?? '')) image.remove()
    else image.setAttribute('loading', 'lazy')
  }
  for (const link of fragment.querySelectorAll('a[href]')) {
    if (!isEmailLink(link.getAttribute('href') ?? '')) {
      link.removeAttribute('href')
      continue
    }
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer')
  }
  const container = fragment.ownerDocument.createElement('div')
  container.append(fragment)
  return container.innerHTML
}
