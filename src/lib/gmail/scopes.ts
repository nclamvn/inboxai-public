const gmailScope = 'https://www.googleapis.com/auth/gmail.'
export const gmailReadScope = `${gmailScope}readonly`
export const gmailModifyScope = `${gmailScope}modify`
export const gmailSendScope = `${gmailScope}send`
export const googleEmailScope = 'https://www.googleapis.com/auth/userinfo.email'
export const gmailSendPermissionRequired = 'gmail_send_permission_required'

function includesAny(scope: string | undefined, allowed: readonly string[]) {
  return scope?.split(/\s+/).some(value => allowed.includes(value)) ?? false
}

export function canReadGmail(scope: string | undefined) {
  return includesAny(scope, [gmailReadScope, gmailModifyScope, 'https://mail.google.com/'])
}

export function hasGmailSendScope(scope: string | undefined) {
  return includesAny(scope, [gmailSendScope, gmailModifyScope, `${gmailScope}compose`, 'https://mail.google.com/'])
}

export function canSendGmail(credential: { scope?: string; sendDisabled?: boolean }) {
  return !credential.sendDisabled && hasGmailSendScope(credential.scope)
}

export function canModifyGmail(scope: string | undefined) {
  return includesAny(scope, [gmailModifyScope, 'https://mail.google.com/'])
}
