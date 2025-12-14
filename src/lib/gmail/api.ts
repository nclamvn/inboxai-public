/**
 * Gmail API Wrapper
 */

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: {
    mimeType?: string;
    headers: { name: string; value: string }[];
    body?: { data?: string };
    parts?: GmailMessagePart[];
  };
  internalDate: string;
}

export interface GmailMessagePart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailMessagePart[];
}

export interface GmailMessageList {
  messages: { id: string; threadId: string }[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}

/**
 * List messages from Gmail
 */
export async function listMessages(
  accessToken: string,
  options: {
    maxResults?: number;
    pageToken?: string;
    q?: string; // Gmail search query
    labelIds?: string[];
  } = {}
): Promise<GmailMessageList> {
  const params = new URLSearchParams({
    maxResults: String(options.maxResults || 50),
  });

  if (options.pageToken) {
    params.append('pageToken', options.pageToken);
  }
  if (options.q) {
    params.append('q', options.q);
  }
  if (options.labelIds) {
    options.labelIds.forEach(id => params.append('labelIds', id));
  }

  const url = `${GMAIL_API_BASE}/users/me/messages?${params.toString()}`;
  console.log(`[Gmail API] listMessages URL: ${url.replace(accessToken, 'TOKEN')}`);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`[Gmail API] listMessages error (${response.status}):`, error);
    throw new Error(`Failed to list messages: ${response.status} - ${error}`);
  }

  const data = await response.json();
  console.log(`[Gmail API] listMessages result: ${data.messages?.length || 0} messages, estimate: ${data.resultSizeEstimate}`);
  return data;
}

/**
 * Get a single message with full details
 */
export async function getMessage(
  accessToken: string,
  messageId: string,
  format: 'full' | 'metadata' | 'minimal' = 'full'
): Promise<GmailMessage> {
  const response = await fetch(
    `${GMAIL_API_BASE}/users/me/messages/${messageId}?format=${format}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to get message');
  }

  return response.json();
}

/**
 * Parse email headers
 */
export function parseHeaders(headers: { name: string; value: string }[]): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach(h => {
    result[h.name.toLowerCase()] = h.value;
  });
  return result;
}

/**
 * Decode base64url encoded content
 */
export function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Extract email body from message
 */
export function extractBody(message: GmailMessage): { text: string; html: string } {
  let text = '';
  let html = '';

  function processPayload(payload: GmailMessagePart) {
    if (payload.body?.data) {
      const content = decodeBase64Url(payload.body.data);
      const mimeType = payload.mimeType || '';

      if (mimeType.includes('text/plain')) {
        text = content;
      } else if (mimeType.includes('text/html')) {
        html = content;
      }
    }

    if (payload.parts) {
      payload.parts.forEach(processPayload);
    }
  }

  processPayload(message.payload);

  return { text, html };
}

/**
 * Modify message labels (mark as read, archive, etc.)
 */
export async function modifyMessage(
  accessToken: string,
  messageId: string,
  addLabelIds: string[] = [],
  removeLabelIds: string[] = []
): Promise<void> {
  const response = await fetch(
    `${GMAIL_API_BASE}/users/me/messages/${messageId}/modify`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ addLabelIds, removeLabelIds }),
    }
  );

  if (!response.ok) {
    throw new Error('Failed to modify message');
  }
}

/**
 * Mark message as read
 */
export async function markAsRead(accessToken: string, messageId: string): Promise<void> {
  await modifyMessage(accessToken, messageId, [], ['UNREAD']);
}

/**
 * Archive message
 */
export async function archiveMessage(accessToken: string, messageId: string): Promise<void> {
  await modifyMessage(accessToken, messageId, [], ['INBOX']);
}

/**
 * Trash message
 */
export async function trashMessage(accessToken: string, messageId: string): Promise<void> {
  const response = await fetch(
    `${GMAIL_API_BASE}/users/me/messages/${messageId}/trash`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to trash message');
  }
}
