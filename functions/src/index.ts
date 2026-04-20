import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onMessagePublished } from 'firebase-functions/v2/pubsub'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { defineSecret } from 'firebase-functions/params'
import { PubSub } from '@google-cloud/pubsub'
import { AGENTS_COL } from './firebase'
import { runAgentTick } from './agentLoop'
import { runChatReply } from './chatLoop'

const anthropicKey = defineSecret('ANTHROPIC_API_KEY')

const pubsub = new PubSub()
const TOPIC = 'agent-tick'

// ── Every 5 minutes: fan out one Pub/Sub message per active agent ─────────────
export const clockAgents = onSchedule(
  { schedule: 'every 5 minutes', region: 'us-central1', timeoutSeconds: 60 },
  async () => {
    const snap = await AGENTS_COL
      .where('type', '==', 'claude_managed')
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
  { topic: TOPIC, region: 'us-central1', timeoutSeconds: 120, memory: '512MiB', secrets: [anthropicKey] },
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
    secrets: [anthropicKey],
  },
  async (event) => {
    const data = event.data?.data()
    if (!data) return
    if (data.direction !== 'inbound') return  // only reply to user messages

    const { agentId, messageId } = event.params
    await runChatReply(agentId, messageId, data.content)
  }
)
