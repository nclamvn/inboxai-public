# InboxAI Deployment Guide

## Prerequisites
- Domain name (e.g., inboxai.vn)
- Vercel account
- Resend account
- Supabase project (already set up)

## Step 1: Resend Setup

1. Go to [resend.com](https://resend.com) and create an account
2. Get your API key from Dashboard > API Keys
3. Add your domain:
   - Go to Domains > Add Domain
   - Enter your domain (e.g., inboxai.vn)
   - Copy the DNS records

## Step 2: Domain DNS Configuration

Add these DNS records to your domain:

### For Sending (Resend)
| Type | Name | Value |
|------|------|-------|
| TXT | @ | v=spf1 include:_spf.resend.com ~all |
| CNAME | resend._domainkey | [provided by Resend] |
| TXT | _dmarc | v=DMARC1; p=none |

### For Receiving (MX Records)
| Type | Name | Priority | Value |
|------|------|----------|-------|
| MX | @ | 10 | inbound.resend.com |

Wait for DNS propagation (up to 48 hours, usually faster)

## Step 3: Resend Inbound Setup

1. In Resend Dashboard > Inbound
2. Create new inbound:
   - Domain: your domain
   - Webhook URL: https://yourdomain.com/api/webhooks/resend
3. Copy the Webhook Secret

## Step 4: Vercel Deployment

1. Connect your GitHub repo to Vercel
2. Add Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL` (e.g., noreply@inboxai.vn)
   - `RESEND_WEBHOOK_SECRET`
   - `NEXT_PUBLIC_APP_URL` (e.g., https://inboxai.vn)

3. Deploy!

## Step 5: Custom Domain on Vercel

1. Go to Project Settings > Domains
2. Add your domain
3. Update DNS:
   - A record: 76.76.21.21
   - Or CNAME: cname.vercel-dns.com

## Step 6: Database Migration

Run this SQL in Supabase SQL Editor:

```sql
-- Add delivery_status column to emails
ALTER TABLE emails
ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT NULL;

-- Add index for faster webhook lookups
CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id);

-- Add email column to profiles if not exists
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS email TEXT;

-- Update profiles email from auth.users
UPDATE profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;
```

## Step 7: Test

1. Send an email TO your domain (e.g., test@inboxai.vn)
2. Check Resend Dashboard for webhook delivery
3. Check Supabase for new email record
4. Open InboxAI and verify email appears
5. Try sending an email FROM InboxAI

## Troubleshooting

### Emails not arriving
- Check MX records are correct
- Verify webhook URL is accessible
- Check Resend Dashboard for errors

### Emails not sending
- Verify domain is verified in Resend
- Check SPF/DKIM records
- Check API key is correct

### 500 errors
- Check Vercel logs
- Verify environment variables
- Check Supabase connection

## Environment Variables Reference

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI
OPENAI_API_KEY=sk-your-openai-key

# Resend
RESEND_API_KEY=re_your-resend-api-key
RESEND_FROM_EMAIL=noreply@yourdomain.com
RESEND_WEBHOOK_SECRET=whsec_your-webhook-secret

# App
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```
