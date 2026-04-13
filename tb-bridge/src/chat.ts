import OpenAI from 'openai'
import { db, FieldValue } from './firebase'
import { pauseAgent, resumeAgent } from './api'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

async function writeReply(firestoreAgentId: string, content: string): Promise<void> {
  await db.collection('agents').doc(firestoreAgentId).collection('messages').add({
    direction: 'outbound',
    content,
    agent_id: firestoreAgentId,
    user_id: firestoreAgentId,
    created_at: FieldValue.serverTimestamp(),
  })
}

function stateEmoji(state: string): string {
  if (!state) return '❓'
  const s = state.toUpperCase()
  if (s === 'IDLE') return '💤'
  if (s === 'ACTIVE' || s === 'SCANNING') return '🔍'
  if (s === 'TRADING') return '⚡'
  if (s === 'PAUSED') return '⏸️'
  return '🤖'
}

async function handleAgents(firestoreAgentId: string): Promise<void> {
  // Get user_id from this agent doc
  const thisDoc = await db.collection('agents').doc(firestoreAgentId).get()
  const userId = thisDoc.data()?.user_id
  if (!userId) {
    await writeReply(firestoreAgentId, 'Could not find your agents.')
    return
  }

  // Query all trading boy agents for this user
  const snap = await db
    .collection('agents')
    .where('user_id', '==', userId)
    .where('agent_type', '==', 'cabal_trading_boy')
    .get()

  if (snap.empty) {
    await writeReply(firestoreAgentId, 'No active agents found.')
    return
  }

  const lines: string[] = ['🤖 Active Agents\n']
  for (const doc of snap.docs) {
    const d = doc.data()
    const live = d.live_state ?? {}
    const state = live.state ?? 'UNKNOWN'
    const watchlist = d.watchlist ?? []
    const positions = live.openPositions ?? []
    const pnl = live.dailyPnlUsd ?? 0
    const paused = d.live_admin?.paused === true

    lines.push(
      `${stateEmoji(paused ? 'PAUSED' : state)} ${d.name ?? 'Agent'}` +
      (paused ? ' (paused)' : '') +
      `\n  State: ${paused ? 'PAUSED' : state}` +
      `\n  Watchlist: ${watchlist.length} tokens` +
      `\n  Open: ${positions.length} positions` +
      `\n  Daily PnL: $${Number(pnl).toFixed(2)}`,
    )
  }

  await writeReply(firestoreAgentId, lines.join('\n\n'))
}

async function handleStatus(firestoreAgentId: string, agentName: string): Promise<void> {
  const doc = await db.collection('agents').doc(firestoreAgentId).get()
  const d = doc.data() ?? {}
  const live = d.live_state ?? {}
  const admin = d.live_admin ?? {}
  const state = live.state ?? 'UNKNOWN'
  const paused = admin.paused === true
  const positions = live.openPositions ?? []
  const pnl = live.dailyPnlUsd ?? 0
  const trades = live.dailyTradeCount ?? 0
  const setups = live.activeConditionalSetups ?? 0
  const watchlist = d.watchlist ?? []
  const lastSync = d.last_synced?.toDate?.()?.toLocaleTimeString() ?? 'unknown'

  const reply =
    `${stateEmoji(paused ? 'PAUSED' : state)} ${agentName} — ${paused ? 'PAUSED' : state}\n\n` +
    `📋 Watchlist: ${watchlist.length} tokens\n` +
    `📊 Open positions: ${positions.length}\n` +
    `📈 Daily PnL: $${Number(pnl).toFixed(2)}\n` +
    `🔢 Daily trades: ${trades}\n` +
    `🎯 Active setups: ${setups}\n` +
    `🕐 Last sync: ${lastSync}`

  await writeReply(firestoreAgentId, reply)
}

async function handlePositions(firestoreAgentId: string): Promise<void> {
  const doc = await db.collection('agents').doc(firestoreAgentId).get()
  const live = doc.data()?.live_state ?? {}
  const positions: any[] = live.openPositions ?? []

  if (positions.length === 0) {
    await writeReply(firestoreAgentId, '📊 No open positions.')
    return
  }

  const lines = ['📊 Open Positions\n']
  for (const p of positions) {
    const pnl = p.unrealizedPnl ?? p.pnl ?? 0
    const sign = pnl >= 0 ? '+' : ''
    lines.push(
      `${p.symbol ?? p.token} ${p.direction ?? ''}\n` +
      `  Entry: $${p.entryPrice ?? '—'}\n` +
      `  Current: $${p.currentPrice ?? p.markPrice ?? '—'}\n` +
      `  PnL: ${sign}$${Number(pnl).toFixed(2)}`,
    )
  }

  await writeReply(firestoreAgentId, lines.join('\n\n'))
}

async function handleDecisions(firestoreAgentId: string, limit = 5): Promise<void> {
  const snap = await db
    .collection('agents').doc(firestoreAgentId).collection('decisions')
    .orderBy('eventTime', 'desc')
    .limit(limit)
    .get()

  if (snap.empty) {
    await writeReply(firestoreAgentId, '📝 No recent decisions.')
    return
  }

  const lines = [`📝 Last ${snap.size} Decisions\n`]
  for (const doc of snap.docs) {
    const d = doc.data()
    const action = d.actionType ?? d.decisionType ?? '?'
    const tag = d.emotionalTag ? ` [${d.emotionalTag}]` : ''
    lines.push(
      `${action} ${d.tokenSymbol ?? ''}${tag}\n` +
      `  ${d.details ?? ''}\n` +
      `  Confidence: ${d.confidence ?? '?'}% · ${d.eventTime ? new Date(d.eventTime).toLocaleDateString() : ''}`,
    )
  }

  await writeReply(firestoreAgentId, lines.join('\n\n'))
}

function buildSystemPrompt(agentName: string, liveState: any, decisions: any[]): string {
  const state = liveState.state ?? 'UNKNOWN'
  const positions = liveState.openPositions ?? []
  const pnl = liveState.dailyPnlUsd ?? 0
  const trades = liveState.dailyTradeCount ?? 0

  return `You are ${agentName}, a fully autonomous crypto trading agent on the Cabal Ventures platform.

CURRENT STATE:
- Status: ${state}
- Open positions: ${positions.length}
- Daily PnL: $${Number(pnl).toFixed(2)}
- Daily trades: ${trades}
${positions.length > 0 ? `\nPOSITIONS:\n${JSON.stringify(positions, null, 2)}` : ''}

RECENT DECISIONS (last 10):
${decisions.length > 0
  ? decisions.map((d) => `[${d.eventTime}] ${d.tokenSymbol} ${d.actionType} (${d.confidence}%): ${d.details}`).join('\n')
  : 'No recent decisions.'}

Behavior:
- Be concise and data-driven. Use plain text (no markdown).
- Answer questions about your state, positions, and reasoning.
- For /help, list the available commands: /status, /agents, /positions, /decisions, /pnl, /pause, /resume.
- For /pnl, summarize PnL from your state above.
- For /summary, give a brief daily summary of activity and performance.
- Never fabricate data not in your context.`
}

export function startChatListener(
  firestoreAgentId: string,
  apiKey: string,
  tbAgentId: string,
  agentName: string,
): void {
  const processedIds = new Set<string>()
  let initialized = false

  const messagesRef = db.collection('agents').doc(firestoreAgentId).collection('messages')
  const q = messagesRef.orderBy('created_at', 'asc')

  console.log(`[chat:${firestoreAgentId}] listener starting for ${agentName}`)

  q.onSnapshot(
    async (snap) => {
      if (!initialized) {
        for (const doc of snap.docs) processedIds.add(doc.id)
        initialized = true
        console.log(`[chat:${firestoreAgentId}] initialized, skipped ${processedIds.size} existing messages`)
        return
      }

      for (const change of snap.docChanges()) {
        if (change.type !== 'added') continue
        if (processedIds.has(change.doc.id)) continue
        processedIds.add(change.doc.id)

        const msgData = change.doc.data()
        if (msgData.direction !== 'inbound') continue

        const text: string = (msgData.content ?? '').trim()
        if (!text) continue

        console.log(`[chat:${firestoreAgentId}] received: ${text}`)

        try {
          // Hard-coded slash commands (no LLM needed)
          if (text === '/pause') {
            await pauseAgent(apiKey, tbAgentId)
            await writeReply(firestoreAgentId, `⏸️ ${agentName} paused.`)
            continue
          }
          if (text === '/resume') {
            await resumeAgent(apiKey, tbAgentId)
            await writeReply(firestoreAgentId, `▶️ ${agentName} resumed.`)
            continue
          }
          if (text === '/agents') {
            await handleAgents(firestoreAgentId)
            continue
          }
          if (text === '/status') {
            await handleStatus(firestoreAgentId, agentName)
            continue
          }
          if (text === '/positions') {
            await handlePositions(firestoreAgentId)
            continue
          }
          if (text === '/decisions' || text === '/review') {
            await handleDecisions(firestoreAgentId)
            continue
          }

          // LLM for everything else (free chat + /help, /pnl, /summary, etc.)
          const agentDoc = await db.collection('agents').doc(firestoreAgentId).get()
          const agentData = agentDoc.data() ?? {}
          const liveState = agentData.live_state ?? {}

          const decisionsSnap = await db
            .collection('agents').doc(firestoreAgentId).collection('decisions')
            .orderBy('eventTime', 'desc')
            .limit(10)
            .get()
          const decisions = decisionsSnap.docs.map((d) => d.data())

          const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: buildSystemPrompt(agentName, liveState, decisions) },
              { role: 'user', content: text },
            ],
            max_tokens: 400,
          })

          const reply = completion.choices[0]?.message?.content ?? 'No response.'
          await writeReply(firestoreAgentId, reply)
        } catch (err: any) {
          console.error(`[chat:${firestoreAgentId}] error processing message:`, err?.message ?? err)
          await writeReply(firestoreAgentId, 'Error processing your message. Please try again.').catch(() => {})
        }
      }
    },
    (err) => {
      console.error(`[chat:${firestoreAgentId}] snapshot error:`, err?.message ?? err)
    },
  )
}
