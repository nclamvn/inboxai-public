#!/usr/bin/env node

const https = require('https');

const APP_URL = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL;
const CRON_SECRET = process.env.CRON_SECRET;

async function triggerSync() {
  console.log(`[CRON] Starting at ${new Date().toISOString()}`);

  if (!APP_URL) {
    console.error('[CRON] APP_URL not set');
    process.exit(1);
  }

  if (!CRON_SECRET) {
    console.error('[CRON] CRON_SECRET not set');
    process.exit(1);
  }

  const url = new URL('/api/cron/sync-emails', APP_URL);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`,
        'User-Agent': 'InboxAI-Cron/1.0'
      },
      timeout: 60000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`[CRON] Status: ${res.statusCode}`);

        try {
          const json = JSON.parse(data);
          console.log(`[CRON] Processed: ${json.results?.processed || 0} accounts`);
          console.log(`[CRON] Synced: ${json.results?.synced || 0} emails`);

          if (json.accounts) {
            json.accounts.forEach(r => {
              const status = r.errors?.length ? '✗' : '✓';
              console.log(`  - ${r.email}: ${status} (${r.synced || 0} new)`);
            });
          }
        } catch (e) {
          console.log(`[CRON] Response: ${data}`);
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

triggerSync()
  .then(() => {
    console.log('[CRON] Completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[CRON] Failed:', error.message);
    process.exit(1);
  });
