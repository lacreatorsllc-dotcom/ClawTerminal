import * as http from 'http'
import { runTradingLoop } from './trading'
import { startChatListener } from './chat'
import { runNewsPoller } from './news'

// Prevent any unhandled error from crashing the process
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err))
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err))

const PORT = process.env.PORT ?? 8080
const TRADING_INTERVAL_MS = 30_000 // 30 seconds

// Cloud Run requires an HTTP server
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200).end('ok')
  } else {
    res.writeHead(200).end('Slug #001 trading agent is running.')
  }
})

server.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`)







  // Start trading loop immediately, then every 30s
async function startTradingLoop() {
  while (true) {
    try {
      await runTradingLoop();
    } catch (err) {
      console.error("Trading loop error:", err);
    }

    await new Promise(resolve => setTimeout(resolve, TRADING_INTERVAL_MS));
  }
}

// start once
startTradingLoop();

  
  
  
  
  
  
  // Start chat listener
  startChatListener()

  // News poller — runs immediately then every 15 minutes
  async function startNewsLoop() {
    while (true) {
      await runNewsPoller()
      await new Promise(resolve => setTimeout(resolve, 15 * 60 * 1000))
    }
  }
  startNewsLoop()

  console.log('[slug-001] agent started')
})
