/**
 * Google OAuth 2.0 Client
 */
import { z } from 'zod';
import { gmailModifyScope, gmailReadScope, gmailSendScope, googleEmailScope } from '@/lib/gmail/scopes';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

const tokenResponse = z.object({
  access_token: z.string().min(1).max(16384),
  refresh_token: z.string().min(1).max(16384).optional(),
  expires_in: z.number().int().positive().max(86400),
  token_type: z.string().regex(/^Bearer$/i).optional(),
  scope: z.string().max(4096).optional(),
});
const userInfoResponse = z.object({
  id: z.string().min(1).max(128), email: z.email().max(254), verified_email: z.literal(true),
  name: z.string().max(254).optional(), picture: z.string().max(2048).optional(),
});
export type GoogleTokens = z.infer<typeof tokenResponse>;
export type GoogleUserInfo = z.infer<typeof userInfoResponse>;

/**
 * Generate OAuth authorization URL
 * @param state - Optional state for CSRF protection
 * @param customRedirectUri - Optional custom redirect URI (for add account flow)
 */
export function getGoogleAuthUrl(state: string, customRedirectUri?: string, codeChallenge?: string, sendFor?: string, reconnect?: { email: string; includeSend: boolean; includeModify: boolean }): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = customRedirectUri || process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new Error('Missing Google OAuth configuration');
  }

  const scopes = sendFor ? [gmailSendScope, googleEmailScope] : [reconnect?.includeModify ? gmailModifyScope : gmailReadScope, googleEmailScope];
  if (reconnect?.includeSend) scopes.push(gmailSendScope);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline', // Get refresh token
    prompt: 'consent', // Force consent to get refresh token
    ...(sendFor && { include_granted_scopes: 'true', login_hint: sendFor }),
    ...(reconnect && { login_hint: reconnect.email, ...(reconnect.includeSend && { include_granted_scopes: 'true' }) }),
    ...(state && { state }),
    ...(codeChallenge && { code_challenge: codeChallenge, code_challenge_method: 'S256' }),
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 * @param code - Authorization code from OAuth callback
 * @param customRedirectUri - Optional custom redirect URI (must match the one used in getGoogleAuthUrl)
 */
export async function exchangeCodeForTokens(code: string, customRedirectUri?: string, codeVerifier?: string): Promise<GoogleTokens> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = customRedirectUri || process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Google OAuth configuration');
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    signal: AbortSignal.timeout(10_000),
    redirect: 'error',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      ...(codeVerifier && { code_verifier: codeVerifier }),
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to exchange code for tokens');
  }

  return tokenResponse.parse(await response.json());
}

/**
 * Refresh access token using refresh token
 */
export class GoogleRefreshRevoked extends Error {}

export async function refreshAccessToken(refreshToken: string, signal?: AbortSignal): Promise<GoogleTokens> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing Google OAuth configuration');
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
    redirect: 'error',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const failure = response.status === 400 ? await response.json().catch(() => null) : null;
    if (failure?.error === 'invalid_grant') throw new GoogleRefreshRevoked();
    throw new Error('Failed to refresh access token');
  }

  return tokenResponse.parse(await response.json());
}

/**
 * Get user info from Google
 */
export async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    signal: AbortSignal.timeout(10_000),
    redirect: 'error',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get user info');
  }

  return userInfoResponse.parse(await response.json());
}

/**
 * Check if token is expired (with 5 minute buffer)
 */
export function isTokenExpired(expiresAt: Date): boolean {
  const buffer = 5 * 60 * 1000; // 5 minutes
  return new Date().getTime() > new Date(expiresAt).getTime() - buffer;
}
