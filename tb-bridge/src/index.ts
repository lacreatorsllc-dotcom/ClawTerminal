import * as http from 'http'
import OpenAI from 'openai'
import { db, FieldValue } from './firebase'
import { listAgents } from './api'
import { startPoller } from './poller'
import { startChatListener } from './chat'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

process.on('uncaughtException', (err) => {
  console.error('[tb-bridge] uncaughtException:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[tb-bridge] unhandledRejection:', reason)
})

// Track running agents to avoid duplicate listeners
const runningAgents = new Set<string>()

function activateAgent(firestoreId: string, apiKey: string, tbAgentId: string, tbTraderId: string, agentName: string): void {
  if (runningAgents.has(firestoreId)) return
  runningAgents.add(firestoreId)
  startPoller(firestoreId, apiKey, tbAgentId, tbTraderId)
  startChatListener(firestoreId, apiKey, tbAgentId, agentName)
  console.log(`[tb-bridge] activated agent ${firestoreId} (${agentName})`)
}

function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString()
        resolve(raw ? JSON.parse(raw) : {})
      } catch (e) {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(payload)
}

const server = http.createServer(async (req, res) => {
  const url = req.url ?? '/'
  const method = req.method ?? 'GET'

  // Health check
  if (method === 'GET' && (url === '/' || url === '/health')) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('tb-bridge running')
    return
  }

  // OpenAI connectivity test
  if (method === 'GET' && url === '/test-openai') {
    try {
      const result = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Reply with just: OK' }],
        max_tokens: 5,
      }, { timeout: 15_000 })
      const reply = result.choices[0]?.message?.content ?? '?'
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end(`OpenAI OK: ${reply}`)
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end(`OpenAI error: ${err?.message} | code: ${err?.code} | type: ${err?.type}`)
    }
    return
  }

  // Connect endpoint
  if (method === 'POST' && url === '/connect') {
    try {
      const body = await parseBody(req)
      const { userId, apiKey } = body as { userId?: string; apiKey?: string }

      if (!userId || typeof userId !== 'string') {
        return send(res, 400, { error: 'userId is required' })
      }
      if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('tb_')) {
        return send(res, 400, { error: 'apiKey must start with tb_' })
      }

      // Discover agents from trading-boy API
      const tbAgents = await listAgents(apiKey)

      const connectedAgents: { id: string; name: string; tbAgentId: string }[] = []

      for (const agent of tbAgents) {
        // Check if a Firestore doc already exists for this agent + user
        const existing = await db
          .collection('agents')
          .where('tb_agent_id', '==', agent.id)
          .where('user_id', '==', userId)
          .limit(1)
          .get()

        let firestoreId: string

        if (existing.empty) {
          // Create new doc
          const docRef = await db.collection('agents').add({
            user_id: userId,
            name: agent.name,
            agent_type: 'cabal_trading_boy',
            tb_agent_id: agent.id,
            tb_trader_id: agent.traderId,
            tb_api_key: apiKey,
            status: 'connected',
            autonomy_level: agent.autonomyLevel,
            watchlist: agent.watchlist,
            tick_count: agent.tickCount,
            last_tick_at: agent.lastTickAt,
            next_scan_at: agent.nextScanAt,
            live_state: null,
            live_admin: null,
            last_synced: null,
            created_at: FieldValue.serverTimestamp(),
          })
          firestoreId = docRef.id
        } else {
          // Update existing doc
          const docRef = existing.docs[0].ref
          firestoreId = docRef.id
          await docRef.update({
            name: agent.name,
            tb_api_key: apiKey,
            status: 'connected',
            autonomy_level: agent.autonomyLevel,
            watchlist: agent.watchlist,
            tick_count: agent.tickCount,
            last_tick_at: agent.lastTickAt,
            next_scan_at: agent.nextScanAt,
          })
        }

        // Activate poller + chat listener
        activateAgent(firestoreId, apiKey, agent.id, agent.traderId, agent.name)
        connectedAgents.push({ id: firestoreId, name: agent.name, tbAgentId: agent.id })
      }

      return send(res, 200, { agents: connectedAgents })
    } catch (err: any) {
      console.error('[tb-bridge] /connect error:', err?.message ?? err)
      return send(res, 400, { error: err?.message ?? 'Connect failed' })
    }
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found')
})

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080

async function startup(): Promise<void> {
  // Load all existing cabal_trading_boy agents from Firestore
  const snap = await db.collection('agents').where('agent_type', '==', 'cabal_trading_boy').get()

  let count = 0
  for (const doc of snap.docs) {
    const data = doc.data()
    if (data.tb_agent_id && data.tb_trader_id && data.tb_api_key) {
      activateAgent(doc.id, data.tb_api_key, data.tb_agent_id, data.tb_trader_id, data.name ?? 'Agent')
      count++
    }
  }

  console.log(`[tb-bridge] started — watching ${count} existing agents`)

  // Watch for new agents added after startup
  db.collection('agents')
    .where('agent_type', '==', 'cabal_trading_boy')
    .onSnapshot((snap) => {
      for (const change of snap.docChanges()) {
        if (change.type !== 'added') continue
        const data = change.doc.data()
        if (data.tb_agent_id && data.tb_trader_id && data.tb_api_key && !runningAgents.has(change.doc.id)) {
          activateAgent(change.doc.id, data.tb_api_key, data.tb_agent_id, data.tb_trader_id, data.name ?? 'Agent')
        }
      }
    })

  server.listen(PORT, () => {
    console.log(`[tb-bridge] HTTP server listening on port ${PORT}`)
  })
}

startup().catch((err) => {
  console.error('[tb-bridge] startup failed:', err)
  process.exit(1)
})
