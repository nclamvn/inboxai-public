/**
 * DEBUG API: Gmail Sync Diagnostics
 * Deep dive into Gmail sync issues
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { isTokenExpired, refreshAccessToken } from '@/lib/oauth/google';

// Lazy admin client
function getSupabaseAdmin() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface DiagnosticStep {
  step: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  data?: unknown;
  duration?: number;
}

export async function GET(request: NextRequest) {
  const diagnostics: DiagnosticStep[] = [];
  const startTime = Date.now();

  try {
    // Step 1: Check authentication
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      diagnostics.push({
        step: '1. Authentication',
        status: 'error',
        message: 'User not authenticated',
        data: { error: authError?.message }
      });
      return NextResponse.json({ diagnostics, totalTime: Date.now() - startTime });
    }

    diagnostics.push({
      step: '1. Authentication',
      status: 'ok',
      message: `User authenticated: ${user.email}`,
      data: { userId: user.id, email: user.email }
    });

    // Step 2: Get source accounts (OAuth Gmail)
    const adminClient = getSupabaseAdmin();
    const { data: accounts, error: accountsError } = await adminClient
      .from('source_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('auth_type', 'oauth_google');

    if (accountsError) {
      diagnostics.push({
        step: '2. Source Accounts Query',
        status: 'error',
        message: 'Failed to query source_accounts',
        data: { error: accountsError.message, code: accountsError.code }
      });
      return NextResponse.json({ diagnostics, totalTime: Date.now() - startTime });
    }

    if (!accounts || accounts.length === 0) {
      diagnostics.push({
        step: '2. Source Accounts Query',
        status: 'error',
        message: 'No Gmail OAuth accounts found',
        data: { accountCount: 0 }
      });
      return NextResponse.json({ diagnostics, totalTime: Date.now() - startTime });
    }

    diagnostics.push({
      step: '2. Source Accounts Query',
      status: 'ok',
      message: `Found ${accounts.length} Gmail OAuth account(s)`,
      data: accounts.map(a => ({
        id: a.id,
        email: a.email_address,
        provider: a.provider,
        auth_type: a.auth_type,
        is_active: a.is_active,
        is_connected: a.is_connected,
        last_sync_at: a.last_sync_at,
        last_error: a.last_error,
        has_access_token: !!a.oauth_access_token,
        has_refresh_token: !!a.oauth_refresh_token,
        oauth_expires_at: a.oauth_expires_at,
        total_emails_synced: a.total_emails_synced
      }))
    });

    // Process first Gmail account
    const account = accounts[0];

    // Step 3: Check OAuth tokens
    if (!account.oauth_access_token) {
      diagnostics.push({
        step: '3. OAuth Token Check',
        status: 'error',
        message: 'No access token stored',
        data: {
          has_access_token: false,
          has_refresh_token: !!account.oauth_refresh_token
        }
      });
      return NextResponse.json({ diagnostics, totalTime: Date.now() - startTime });
    }

    const tokenExpired = account.oauth_expires_at
      ? isTokenExpired(new Date(account.oauth_expires_at))
      : false;

    diagnostics.push({
      step: '3. OAuth Token Check',
      status: tokenExpired ? 'warning' : 'ok',
      message: tokenExpired ? 'Access token expired, needs refresh' : 'Access token valid',
      data: {
        has_access_token: true,
        has_refresh_token: !!account.oauth_refresh_token,
        expires_at: account.oauth_expires_at,
        is_expired: tokenExpired,
        token_preview: account.oauth_access_token?.substring(0, 20) + '...'
      }
    });

    // Step 4: Refresh token if needed
    let accessToken = account.oauth_access_token;

    if (tokenExpired) {
      if (!account.oauth_refresh_token) {
        diagnostics.push({
          step: '4. Token Refresh',
          status: 'error',
          message: 'Token expired but no refresh token available',
          data: { has_refresh_token: false }
        });
        return NextResponse.json({ diagnostics, totalTime: Date.now() - startTime });
      }

      try {
        const refreshStart = Date.now();
        const newTokens = await refreshAccessToken(account.oauth_refresh_token);
        accessToken = newTokens.access_token;

        // Update database
        const expiresAt = new Date(Date.now() + newTokens.expires_in * 1000);
        await adminClient
          .from('source_accounts')
          .update({
            oauth_access_token: newTokens.access_token,
            oauth_expires_at: expiresAt.toISOString(),
            ...(newTokens.refresh_token && { oauth_refresh_token: newTokens.refresh_token }),
          })
          .eq('id', account.id);

        diagnostics.push({
          step: '4. Token Refresh',
          status: 'ok',
          message: 'Token refreshed successfully',
          duration: Date.now() - refreshStart,
          data: {
            new_expires_in: newTokens.expires_in,
            new_expires_at: expiresAt.toISOString(),
            got_new_refresh_token: !!newTokens.refresh_token
          }
        });
      } catch (refreshError) {
        diagnostics.push({
          step: '4. Token Refresh',
          status: 'error',
          message: 'Failed to refresh token',
          data: {
            error: refreshError instanceof Error ? refreshError.message : 'Unknown error',
            refresh_token_preview: account.oauth_refresh_token?.substring(0, 20) + '...'
          }
        });
        return NextResponse.json({ diagnostics, totalTime: Date.now() - startTime });
      }
    } else {
      diagnostics.push({
        step: '4. Token Refresh',
        status: 'ok',
        message: 'Token still valid, no refresh needed'
      });
    }

    // Step 5: Test Gmail API - List messages
    const gmailApiStart = Date.now();
    const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';

    try {
      // First, test basic profile access
      const profileResponse = await fetch(`${GMAIL_API_BASE}/users/me/profile`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!profileResponse.ok) {
        const profileError = await profileResponse.text();
        diagnostics.push({
          step: '5. Gmail API - Profile',
          status: 'error',
          message: `Failed to get Gmail profile (${profileResponse.status})`,
          data: {
            status: profileResponse.status,
            error: profileError
          }
        });
        return NextResponse.json({ diagnostics, totalTime: Date.now() - startTime });
      }

      const profile = await profileResponse.json();
      diagnostics.push({
        step: '5. Gmail API - Profile',
        status: 'ok',
        message: `Gmail profile OK: ${profile.emailAddress}`,
        duration: Date.now() - gmailApiStart,
        data: {
          emailAddress: profile.emailAddress,
          messagesTotal: profile.messagesTotal,
          threadsTotal: profile.threadsTotal,
          historyId: profile.historyId
        }
      });

      // Step 6: List messages
      const listStart = Date.now();
      const params = new URLSearchParams({
        maxResults: '10',
        labelIds: 'INBOX'
      });

      const listResponse = await fetch(
        `${GMAIL_API_BASE}/users/me/messages?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!listResponse.ok) {
        const listError = await listResponse.text();
        diagnostics.push({
          step: '6. Gmail API - List Messages',
          status: 'error',
          message: `Failed to list messages (${listResponse.status})`,
          data: {
            status: listResponse.status,
            error: listError,
            url: `${GMAIL_API_BASE}/users/me/messages?${params.toString()}`
          }
        });
        return NextResponse.json({ diagnostics, totalTime: Date.now() - startTime });
      }

      const messageList = await listResponse.json();
      diagnostics.push({
        step: '6. Gmail API - List Messages',
        status: messageList.messages?.length > 0 ? 'ok' : 'warning',
        message: messageList.messages?.length > 0
          ? `Found ${messageList.messages.length} messages in INBOX`
          : 'INBOX is empty or no messages returned',
        duration: Date.now() - listStart,
        data: {
          messageCount: messageList.messages?.length || 0,
          resultSizeEstimate: messageList.resultSizeEstimate,
          hasNextPage: !!messageList.nextPageToken,
          firstMessageIds: messageList.messages?.slice(0, 3).map((m: {id: string}) => m.id)
        }
      });

      // Step 7: Check if messages already exist in database
      if (messageList.messages?.length > 0) {
        const messageIds = messageList.messages.map((m: {id: string}) => m.id);
        const { data: existingEmails, error: checkError } = await adminClient
          .from('emails')
          .select('message_id')
          .eq('user_id', user.id)
          .in('message_id', messageIds);

        if (checkError) {
          diagnostics.push({
            step: '7. Database - Check Duplicates',
            status: 'error',
            message: 'Failed to check existing emails',
            data: { error: checkError.message }
          });
        } else {
          const existingCount = existingEmails?.length || 0;
          const newCount = messageIds.length - existingCount;

          diagnostics.push({
            step: '7. Database - Check Duplicates',
            status: newCount > 0 ? 'ok' : 'warning',
            message: newCount > 0
              ? `${newCount} new messages to sync (${existingCount} already exist)`
              : `All ${existingCount} messages already synced`,
            data: {
              totalFromGmail: messageIds.length,
              alreadyInDb: existingCount,
              newToSync: newCount,
              existingMessageIds: existingEmails?.map(e => e.message_id)
            }
          });
        }

        // Step 8: Fetch one message details for testing
        const testMsgId = messageList.messages[0].id;
        const msgStart = Date.now();

        const msgResponse = await fetch(
          `${GMAIL_API_BASE}/users/me/messages/${testMsgId}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!msgResponse.ok) {
          const msgError = await msgResponse.text();
          diagnostics.push({
            step: '8. Gmail API - Get Message Detail',
            status: 'error',
            message: `Failed to get message detail (${msgResponse.status})`,
            data: {
              messageId: testMsgId,
              status: msgResponse.status,
              error: msgError
            }
          });
        } else {
          const message = await msgResponse.json();
          const headers: Record<string, string> = {};
          message.payload?.headers?.forEach((h: {name: string, value: string}) => {
            headers[h.name.toLowerCase()] = h.value;
          });

          diagnostics.push({
            step: '8. Gmail API - Get Message Detail',
            status: 'ok',
            message: 'Successfully fetched message details',
            duration: Date.now() - msgStart,
            data: {
              messageId: message.id,
              threadId: message.threadId,
              subject: headers['subject']?.substring(0, 50),
              from: headers['from']?.substring(0, 50),
              date: headers['date'],
              labelIds: message.labelIds,
              snippet: message.snippet?.substring(0, 100),
              hasPayload: !!message.payload,
              hasParts: !!message.payload?.parts
            }
          });
        }
      }

    } catch (apiError) {
      diagnostics.push({
        step: '5-8. Gmail API',
        status: 'error',
        message: 'Gmail API call failed',
        data: { error: apiError instanceof Error ? apiError.message : 'Unknown error' }
      });
    }

    // Step 9: Check database write permissions
    const testStart = Date.now();
    try {
      // Try to update source_accounts
      const { error: updateError } = await adminClient
        .from('source_accounts')
        .update({ last_error: null })
        .eq('id', account.id);

      if (updateError) {
        diagnostics.push({
          step: '9. Database - Write Test',
          status: 'error',
          message: 'Cannot write to source_accounts',
          data: { error: updateError.message, code: updateError.code }
        });
      } else {
        diagnostics.push({
          step: '9. Database - Write Test',
          status: 'ok',
          message: 'Database write permission OK',
          duration: Date.now() - testStart
        });
      }
    } catch (dbError) {
      diagnostics.push({
        step: '9. Database - Write Test',
        status: 'error',
        message: 'Database write failed',
        data: { error: dbError instanceof Error ? dbError.message : 'Unknown error' }
      });
    }

    // Summary
    const errors = diagnostics.filter(d => d.status === 'error');
    const warnings = diagnostics.filter(d => d.status === 'warning');

    return NextResponse.json({
      summary: {
        status: errors.length > 0 ? 'FAILED' : warnings.length > 0 ? 'WARNING' : 'OK',
        totalSteps: diagnostics.length,
        errors: errors.length,
        warnings: warnings.length,
        totalTime: Date.now() - startTime
      },
      diagnostics,
      recommendation: errors.length > 0
        ? `Fix ${errors.length} error(s): ${errors.map(e => e.step).join(', ')}`
        : warnings.length > 0
          ? `Check ${warnings.length} warning(s): ${warnings.map(w => w.step).join(', ')}`
          : 'All checks passed. Try running sync again.'
    });

  } catch (error) {
    diagnostics.push({
      step: 'Unexpected Error',
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      data: { stack: error instanceof Error ? error.stack : undefined }
    });

    return NextResponse.json({
      summary: { status: 'FAILED', totalTime: Date.now() - startTime },
      diagnostics
    });
  }
}
