import DOMPurify from 'isomorphic-dompurify'

interface SanitizeOptions {
  allowImages?: boolean
}

export function sanitizeEmailHtml(
  html: string,
  options: SanitizeOptions = {}
): string {
  const { allowImages = true } = options

  // Configure DOMPurify
  const config = {
    ALLOWED_TAGS: [
      'p', 'br', 'div', 'span', 'a', 'b', 'i', 'u', 'strong', 'em',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'img', 'hr', 'sub', 'sup', 'font', 'center'
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'width', 'height', 'style',
      'class', 'id', 'target', 'rel', 'border', 'cellpadding',
      'cellspacing', 'align', 'valign', 'bgcolor', 'color', 'size', 'face'
    ],
    ALLOW_DATA_ATTR: false,
  }

  // Sanitize
  let sanitized = DOMPurify.sanitize(html, config)

  // Fix image issues
  if (allowImages) {
    // Replace cid: references with placeholder
    sanitized = sanitized.replace(
      /src=["']cid:[^"']+["']/gi,
      'src="/images/image-placeholder.svg" data-cid="true"'
    )

    // Add loading="lazy" and error handling to all images
    sanitized = sanitized.replace(
      /<img\s+([^>]*?)(?:\s*\/)?>/gi,
      (match, attrs) => {
        // Skip if already has onerror
        if (attrs.includes('onerror')) return match
        return `<img ${attrs} loading="lazy" onerror="this.onerror=null;this.src='/images/image-error.svg';this.classList.add('image-error');" />`
      }
    )

    // Ensure external links open in new tab
    sanitized = sanitized.replace(
      /<a\s+([^>]*?)>/gi,
      (match, attrs) => {
        if (attrs.includes('target=')) return match
        return `<a ${attrs} target="_blank" rel="noopener noreferrer">`
      }
    )
  }

  return sanitized
}
