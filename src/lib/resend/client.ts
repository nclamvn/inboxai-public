import { Resend } from 'resend'

// Create Resend client lazily to avoid build-time errors
let resendInstance: Resend | null = null

export function getResendClient(): Resend {
  if (!resendInstance) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not set')
    }
    resendInstance = new Resend(process.env.RESEND_API_KEY)
  }
  return resendInstance
}

// For backwards compatibility - lazy getter
export const resend = {
  emails: {
    send: async (...args: Parameters<Resend['emails']['send']>) => {
      const client = getResendClient()
      return client.emails.send(...args)
    }
  }
}

// Default from address (will be configured after domain setup)
export const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL || 'noreply@inboxai.vn'
