import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onMessagePublished } from 'firebase-functions/v2/pubsub'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { onRequest } from 'firebase-functions/v2/https'
import { PubSub } from '@google-cloud/pubsub'
import { AGENTS_COL } from './firebase'
import { runAgentTick } from './agentLoop'
import { runChatReply } from './chatLoop'
import { getMcpHealthReport } from './mcpHealth'
import { runMarketNewsPoller } from './newsPoller'
import { syncAgentFundingState } from './solana'
export { startTwitterSignIn, completeTwitterSignIn } from './twitterAuth'

const pubsub = new PubSub()
const TOPIC = 'agent-tick'

// ── Every 5 minutes: fan out one Pub/Sub message per active agent ─────────────
export const clockAgents = onSchedule(
  { schedule: 'every 5 minutes', region: 'us-central1', timeoutSeconds: 60 },
  async () => {
    const snap = await AGENTS_COL
      .where('agent_type', '==', 'claude_managed')
      .where('status', 'in', ['active', 'connected'])
      .get()

    if (snap.empty) {
      console.log('[clock] no active claude_managed agents')
      return
    }

    console.log(`[clock] fanning out to ${snap.size} agents`)

    const topic = pubsub.topic(TOPIC)
    await Promise.all(
      snap.docs.map((doc) =>
        topic.publishMessage({ json: { agentId: doc.id } })
      )
    )
  }
)

// ── One message per agent: run its Claude loop ────────────────────────────────
export const tickAgent = onMessagePublished(
  { topic: TOPIC, region: 'us-central1', timeoutSeconds: 120, memory: '512MiB', secrets: ['GEMINI_API_KEY'] },
  async (event) => {
    const { agentId } = event.data.message.json as { agentId: string }
    if (!agentId) return
    await runAgentTick(agentId)
  }
)

// ── Instant chat reply: fires the moment a user sends a message ───────────────
export const onChatMessage = onDocumentCreated(
  {
    document: 'agents/{agentId}/messages/{messageId}',
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '512MiB',
    secrets: ['GEMINI_API_KEY'],
  },
  async (event) => {
    const data = event.data?.data()
    console.log(`[onChatMessage] doc=${event.params.agentId}/${event.params.messageId} direction=${data?.direction} hasData=${!!data}`)
    if (!data) return
    if (data.direction !== 'inbound') return
    if (data.agent_reply === true) return

    const { agentId, messageId } = event.params
    await runChatReply(agentId, messageId, data.content)
  }
)

// ── Every 15 minutes: ingest fresh market news into Firestore ────────────────
export const pollMarketNews = onSchedule(
  { schedule: 'every 15 minutes', region: 'us-central1', timeoutSeconds: 120, memory: '512MiB' },
  async () => {
    await runMarketNewsPoller()
  }
)

export const syncAgentWalletFunding = onSchedule(
  { schedule: 'every 5 minutes', region: 'us-central1', timeoutSeconds: 120, memory: '512MiB' },
  async () => {
    const snap = await AGENTS_COL
      .where('wallet_ready', '==', true)
      .get()

    if (snap.empty) {
      console.log('[funding-sync] no wallet-ready agents found')
      return
    }

    await Promise.all(
      snap.docs.map(async (doc) => {
        try {
          await syncAgentFundingState(doc.id, doc.data())
        } catch (error) {
          console.error(`[funding-sync] failed for ${doc.id}:`, error)
        }
      }),
    )
  },
)

export const mcpStatus = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (req, res) => {
    if (req.method !== 'GET') {
      res.set('Allow', 'GET')
      res.status(405).json({ ok: false, error: 'Method not allowed' })
      return
    }

    const report = await getMcpHealthReport()
    res.status(report.ok ? 200 : 503).json(report)
  },
)
