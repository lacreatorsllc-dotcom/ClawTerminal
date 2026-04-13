import OpenAI from 'openai'
import { db, FieldValue } from './firebase'
import { pauseAgent, resumeAgent } from './api'

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

async function handlePnl(firestoreAgentId: string, agentName: string): Promise<void> {
  const doc = await db.collection('agents').doc(firestoreAgentId).get()
  const d = doc.data() ?? {}
  const live = d.live_state ?? {}
  const pnl = live.dailyPnlUsd ?? 0
  const trades = live.dailyTradeCount ?? 0
  const positions: any[] = live.openPositions ?? []

  let unrealized = 0
  for (const p of positions) {
    unrealized += Number(p.unrealizedPnl ?? p.pnl ?? 0)
  }

  const sign = (n: number) => (n >= 0 ? '+' : '')
  const reply =
    `💰 ${agentName} PnL\n\n` +
    `Daily realized: ${sign(pnl)}$${Number(pnl).toFixed(2)}\n` +
    `Unrealized: ${sign(unrealized)}$${unrealized.toFixed(2)}\n` +
    `Daily trades: ${trades}\n` +
    `Open positions: ${positions.length}`

  await writeReply(firestoreAgentId, reply)
}

async function handleSummary(firestoreAgentId: string, agentName: string): Promise<void> {
  const doc = await db.collection('agents').doc(firestoreAgentId).get()
  const d = doc.data() ?? {}
  const live = d.live_state ?? {}
  const state = live.state ?? 'UNKNOWN'
  const pnl = live.dailyPnlUsd ?? 0
  const trades = live.dailyTradeCount ?? 0
  const setups = live.activeConditionalSetups ?? 0
  const positions: any[] = live.openPositions ?? []
  const watchlist: string[] = d.watchlist ?? []
  const paused = d.live_admin?.paused === true

  const decisionsSnap = await db
    .collection('agents').doc(firestoreAgentId).collection('decisions')
    .orderBy('eventTime', 'desc').limit(3).get()

  const latestDecisions = decisionsSnap.docs.map((dd) => {
    const dec = dd.data()
    return `  · ${dec.actionType ?? '?'} ${dec.tokenSymbol ?? ''} (${dec.confidence ?? '?'}%)`
  })

  const lines = [
    `📋 ${agentName} Daily Summary`,
    ``,
    `State: ${paused ? 'PAUSED' : state}`,
    `Watchlist: ${watchlist.length} tokens`,
    `Trades today: ${trades}`,
    `Daily PnL: $${Number(pnl).toFixed(2)}`,
    `Open positions: ${positions.length}`,
    `Active setups: ${setups}`,
  ]
  if (latestDecisions.length > 0) {
    lines.push(`\nRecent decisions:`)
    lines.push(...latestDecisions)
  }

  await writeReply(firestoreAgentId, lines.join('\n'))
}

function handleHelp(firestoreAgentId: string, agentName: string): Promise<void> {
  const msg =
    `🤖 ${agentName} Commands\n\n` +
    `/status — Agent status & health\n` +
    `/agents — All your active agents\n` +
    `/positions — Open positions\n` +
    `/decisions — Recent trade decisions\n` +
    `/pnl — Daily profit & loss\n` +
    `/summary — Daily activity summary\n` +
    `/pause — Pause this agent\n` +
    `/resume — Resume this agent`
  return writeReply(firestoreAgentId, msg)
}


export function startChatListener(
  firestoreAgentId: string,
  apiKey: string,
  tbAgentId: string,
  agentName: string,
  openaiApiKey?: string,
): void {
  const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null
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
          if (text === '/pnl') {
            await handlePnl(firestoreAgentId, agentName)
            continue
          }
          if (text === '/summary') {
            await handleSummary(firestoreAgentId, agentName)
            continue
          }
          if (text === '/help') {
            await handleHelp(firestoreAgentId, agentName)
            continue
          }

          // Free-form text — use LLM if key available
          if (!openai) {
            await writeReply(firestoreAgentId, `Use /help to see available commands.`)
            continue
          }

          const agentDoc = await db.collection('agents').doc(firestoreAgentId).get()
          const agentData = agentDoc.data() ?? {}
          const live = agentData.live_state ?? {}
          const state = live.state ?? 'UNKNOWN'
          const positions = live.openPositions ?? []
          const pnl = live.dailyPnlUsd ?? 0
          const trades = live.dailyTradeCount ?? 0

          const decisionsSnap = await db
            .collection('agents').doc(firestoreAgentId).collection('decisions')
            .orderBy('eventTime', 'desc').limit(10).get()
          const decisions = decisionsSnap.docs.map((d) => d.data())

          const system = `You are ${agentName}, a fully autonomous crypto trading agent on Cabal Ventures.

STATE: ${state} | Positions: ${positions.length} | Daily PnL: $${Number(pnl).toFixed(2)} | Trades: ${trades}

RECENT DECISIONS:
${decisions.length > 0 ? decisions.map((d) => `[${d.eventTime}] ${d.tokenSymbol} ${d.actionType} (${d.confidence}%): ${d.details}`).join('\n') : 'None.'}

Be concise and data-driven. Plain text only. Never fabricate data.`

          const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'system', content: system }, { role: 'user', content: text }],
            max_tokens: 400,
          }, { timeout: 30_000 })

          await writeReply(firestoreAgentId, completion.choices[0]?.message?.content ?? 'No response.')
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
