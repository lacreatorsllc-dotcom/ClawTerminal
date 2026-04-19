import * as http from 'http'
import type { DocumentReference } from 'firebase-admin/firestore'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { db, FieldValue } from './firebase'
import { AGENT_PRIVATE_COLLECTION, AGENT_SECRETS_DOC_ID, getAgentDataWithSecrets } from './agentSecrets'
import { listAgents } from './api'
import { startPoller } from './poller'
import { startChatListener, startMarketAdvisorChatListener, startRangeFarmerChatListener } from './chat'

let _openai: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  return _openai
}
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

process.on('uncaughtException', (err) => {
  console.error('[tb-bridge] uncaughtException:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[tb-bridge] unhandledRejection:', reason)
})

// Track running agents to avoid duplicate listeners
const runningAgents = new Set<string>()

function activateAgent(firestoreId: string, apiKey: string, tbAgentId: string, tbTraderId: string, agentName: string, openaiKey?: string): void {
  if (runningAgents.has(firestoreId)) return
  runningAgents.add(firestoreId)
  startPoller(firestoreId, apiKey, tbAgentId, tbTraderId, openaiKey)
  startChatListener(firestoreId, apiKey, tbAgentId, agentName, openaiKey)
  console.log(`[tb-bridge] activated agent ${firestoreId} (${agentName}) openai=${openaiKey ? 'yes' : 'no'}`)
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
      const result = await getOpenAI().chat.completions.create({
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
      const { userId, apiKey, openaiKey } = body as { userId?: string; apiKey?: string; openaiKey?: string }

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

        const secretsRef = (id: DocumentReference) =>
          id.collection(AGENT_PRIVATE_COLLECTION).doc(AGENT_SECRETS_DOC_ID)

        if (existing.empty) {
          const docRef = db.collection('agents').doc()
          const batch = db.batch()
          batch.set(docRef, {
            user_id: userId,
            name: agent.name,
            agent_type: 'cabal_trading_boy',
            tb_agent_id: agent.id,
            tb_trader_id: agent.traderId,
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
          const secretFields: Record<string, unknown> = {
            tb_api_key: apiKey,
            updated_at: FieldValue.serverTimestamp(),
          }
          if (openaiKey) secretFields.openai_api_key = openaiKey
          batch.set(secretsRef(docRef), secretFields)
          await batch.commit()
          firestoreId = docRef.id
        } else {
          const docRef = existing.docs[0].ref
          firestoreId = docRef.id
          const batch = db.batch()
          batch.update(docRef, {
            name: agent.name,
            status: 'connected',
            autonomy_level: agent.autonomyLevel,
            watchlist: agent.watchlist,
            tick_count: agent.tickCount,
            last_tick_at: agent.lastTickAt,
            next_scan_at: agent.nextScanAt,
          })
          const secretFields: Record<string, unknown> = {
            tb_api_key: apiKey,
            updated_at: FieldValue.serverTimestamp(),
          }
          if (openaiKey) secretFields.openai_api_key = openaiKey
          batch.set(secretsRef(docRef), secretFields, { merge: true })
          await batch.commit()
        }

        const docRef = db.collection('agents').doc(firestoreId)
        const secSnap = await secretsRef(docRef).get()
        const currentOpenaiKey =
          openaiKey ?? (secSnap.data()?.openai_api_key as string | undefined) ?? undefined

        activateAgent(firestoreId, apiKey, agent.id, agent.traderId, agent.name, currentOpenaiKey)
        connectedAgents.push({ id: firestoreId, name: agent.name, tbAgentId: agent.id })
      }

      return send(res, 200, { agents: connectedAgents })
    } catch (err: any) {
      console.error('[tb-bridge] /connect error:', err?.message ?? err)
      return send(res, 400, { error: err?.message ?? 'Connect failed' })
    }
  }

  // Create Claude Managed Agent
  if (method === 'POST' && url === '/claude-agents/create') {
    try {
      const body = await parseBody(req)
      const { userId, name, strategy, skills } = body as {
        userId?: string
        name?: string
        strategy?: string
        skills?: string[]
      }

      if (!userId || typeof userId !== 'string') {
        return send(res, 400, { error: 'userId is required' })
      }
      if (!name || typeof name !== 'string') {
        return send(res, 400, { error: 'name is required' })
      }

      const skillsList = Array.isArray(skills) ? skills : []
      const systemPrompt = [
        `You are ${name}, an AI trading agent built on Claude.`,
        `Strategy: ${strategy ?? 'Grid Trader'}.`,
        `Your active capabilities: ${skillsList.length > 0 ? skillsList.join(', ') : 'general market analysis'}.`,
        `You monitor markets, analyze opportunities, and provide trading insights.`,
        `Always be concise, data-driven, and risk-aware in your responses.`,
      ].join(' ')

      // Create environment (persistent sandbox for sessions)
      const env = await anthropic.beta.environments.create({
        name: `${name} Environment`,
      })

      // Create the persistent agent with the standard toolset
      const agent = await anthropic.beta.agents.create({
        name,
        model: 'claude-opus-4-7',
        system: systemPrompt,
        tools: [{ type: 'agent_toolset_20260401' }],
      })

      console.log(`[tb-bridge] created claude agent ${agent.id} env ${env.id} for user ${userId}`)
      return send(res, 200, { claudeAgentId: agent.id, claudeEnvId: env.id })
    } catch (err: any) {
      console.error('[tb-bridge] /claude-agents/create error:', err?.message ?? err)
      return send(res, 500, { error: err?.message ?? 'Agent creation failed' })
    }
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found')
})

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080

async function startup(): Promise<void> {
  let count = 0

  // Load all existing cabal_trading_boy agents
  const tbSnap = await db.collection('agents').where('agent_type', '==', 'cabal_trading_boy').get()
  for (const doc of tbSnap.docs) {
    const data = await getAgentDataWithSecrets(doc)
    if (data.tb_agent_id && data.tb_trader_id && data.tb_api_key) {
      activateAgent(
        doc.id,
        data.tb_api_key as string,
        data.tb_agent_id as string,
        data.tb_trader_id as string,
        (data.name as string) ?? 'Agent',
        (data.openai_api_key as string | undefined) ?? undefined,
      )
      count++
    }
  }

  // Load all existing market_advisor agents
  const advisorSnap = await db.collection('agents').where('agent_type', '==', 'market_advisor').get()
  for (const doc of advisorSnap.docs) {
    const data = await getAgentDataWithSecrets(doc)
    if (data.user_id && !runningAgents.has(doc.id)) {
      runningAgents.add(doc.id)
      startMarketAdvisorChatListener(
        doc.id,
        data.user_id as string,
        (data.name as string) ?? 'Market Advisor',
        (data.gemini_api_key as string) ?? '',
      )
      count++
    }
  }

  // Load all existing range_farmer agents (per-user instances)
  const rangerSnap = await db.collection('agents').where('agent_type', '==', 'range_farmer').get()
  for (const doc of rangerSnap.docs) {
    const data = doc.data()
    if (!runningAgents.has(doc.id)) {
      runningAgents.add(doc.id)
      startRangeFarmerChatListener(doc.id, data.name ?? 'Range Farmer', data.coin ?? 'BTC')
      count++
    }
  }

  // Always start slug-001 listener (shared paper agent used by all users)
  if (!runningAgents.has('slug-001')) {
    runningAgents.add('slug-001')
    startRangeFarmerChatListener('slug-001', 'Slug #001', 'BTC')
    console.log(`[tb-bridge] activated slug-001 chat listener`)
  }

  console.log(`[tb-bridge] started — watching ${count} existing agents`)

  // Watch for new cabal_trading_boy agents
  db.collection('agents')
    .where('agent_type', '==', 'cabal_trading_boy')
    .onSnapshot((snap) => {
      void Promise.all(
        snap.docChanges().map(async (change) => {
          if (change.type !== 'added') return
          const data = await getAgentDataWithSecrets(change.doc)
          if (
            data.tb_agent_id &&
            data.tb_trader_id &&
            data.tb_api_key &&
            !runningAgents.has(change.doc.id)
          ) {
            activateAgent(
              change.doc.id,
              data.tb_api_key as string,
              data.tb_agent_id as string,
              data.tb_trader_id as string,
              (data.name as string) ?? 'Agent',
              (data.openai_api_key as string | undefined) ?? undefined,
            )
          }
        }),
      )
    })

  // Watch for new market_advisor agents
  db.collection('agents')
    .where('agent_type', '==', 'market_advisor')
    .onSnapshot((snap) => {
      void Promise.all(
        snap.docChanges().map(async (change) => {
          if (change.type !== 'added') return
          const data = await getAgentDataWithSecrets(change.doc)
          if (data.user_id && !runningAgents.has(change.doc.id)) {
            runningAgents.add(change.doc.id)
            startMarketAdvisorChatListener(
              change.doc.id,
              data.user_id as string,
              (data.name as string) ?? 'Market Advisor',
              (data.gemini_api_key as string) ?? '',
            )
            console.log(`[tb-bridge] activated market advisor ${change.doc.id}`)
          }
        }),
      )
    })

  // Watch for new range_farmer agents
  db.collection('agents')
    .where('agent_type', '==', 'range_farmer')
    .onSnapshot((snap) => {
      for (const change of snap.docChanges()) {
        if (change.type !== 'added') continue
        const data = change.doc.data()
        if (!runningAgents.has(change.doc.id)) {
          runningAgents.add(change.doc.id)
          startRangeFarmerChatListener(change.doc.id, data.name ?? 'Range Farmer', data.coin ?? 'BTC')
          console.log(`[tb-bridge] activated range farmer ${change.doc.id} (${data.coin ?? 'BTC'})`)
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
