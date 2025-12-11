// Background worker to sync emails periodically
const https = require('https')
const http = require('http')

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://inboxai.onrender.com'
const CRON_SECRET = process.env.CRON_SECRET
const SYNC_INTERVAL = 5 * 60 * 1000 // 5 minutes

async function triggerSync() {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/cron/sync-emails', APP_URL)
    const isHttps = url.protocol === 'https:'
    const client = isHttps ? https : http

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`,
        'Content-Type': 'application/json'
      }
    }

    const req = client.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        console.log(`[${new Date().toISOString()}] Sync completed (${res.statusCode}):`, data.substring(0, 200))
        resolve(data)
      })
    })

    req.on('error', (error) => {
      console.error(`[${new Date().toISOString()}] Sync error:`, error.message)
      reject(error)
    })

    req.setTimeout(60000, () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })

    req.end()
  })
}

async function main() {
  console.log('='.repeat(50))
  console.log('InboxAI Sync Worker started')
  console.log('='.repeat(50))
  console.log(`App URL: ${APP_URL}`)
  console.log(`Sync interval: ${SYNC_INTERVAL / 1000 / 60} minutes`)
  console.log(`Time: ${new Date().toISOString()}`)
  console.log('='.repeat(50))

  // Initial sync after 10 seconds (let main app start first)
  setTimeout(async () => {
    console.log('[Initial] Starting first sync...')
    try {
      await triggerSync()
    } catch (error) {
      console.error('[Initial] First sync failed:', error.message)
    }
  }, 10000)

  // Schedule periodic sync
  setInterval(async () => {
    console.log('[Scheduled] Starting periodic sync...')
    try {
      await triggerSync()
    } catch (error) {
      console.error('[Scheduled] Sync failed:', error.message)
    }
  }, SYNC_INTERVAL)

  // Keep process alive
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...')
    process.exit(0)
  })

  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...')
    process.exit(0)
  })
}

main()
