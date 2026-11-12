const gmailScope = 'https://www.googleapis.com/auth/gmail.'
export const gmailReadScope = `${gmailScope}readonly`
export const gmailSendScope = `${gmailScope}send`
export const googleEmailScope = 'https://www.googleapis.com/auth/userinfo.email'
export const gmailSendPermissionRequired = 'gmail_send_permission_required'

function includesAny(scope: string | undefined, allowed: readonly string[]) {
  return scope?.split(/\s+/).some(value => allowed.includes(value)) ?? false
}

export function canReadGmail(scope: string | undefined) {
  return includesAny(scope, [gmailReadScope, `${gmailScope}modify`, 'https://mail.google.com/'])
}

export function hasGmailSendScope(scope: string | undefined) {
  return includesAny(scope, [gmailSendScope, `${gmailScope}modify`, `${gmailScope}compose`, 'https://mail.google.com/'])
}

export function canSendGmail(credential: { scope?: string; sendDisabled?: boolean }) {
  return !credential.sendDisabled && hasGmailSendScope(credential.scope)
}
