import OpenAI from 'openai'
import { db, FieldValue } from './firebase'
import { pauseAgent, resumeAgent, overrideAgent, fetchAgentStatus, fetchAgentPositions } from './api'
import { getCached } from './cache'
import { getCurrentPrices, calcUnrealized } from './prices'

function makeAIClient(apiKey: string): { client: OpenAI; model: string } {
  if (apiKey.startsWith('AIza')) {
    // Google Gemini — uses OpenAI-compatible endpoint
    return {
      client: new OpenAI({
        apiKey,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      }),
      model: 'gemini-2.0-flash',
    }
  }
  if (apiKey.startsWith('sk-ant-')) {
    // Anthropic Claude via their OpenAI-compatible layer (if available)
    return { client: new OpenAI({ apiKey }), model: 'gpt-4o' }
  }
  // Default: OpenAI
  return { client: new OpenAI({ apiKey }), model: 'gpt-4o' }
}

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

  const fmt = (n: number) => `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(2)}`

  const lines: string[] = ['🤖 Active Agents\n']
  for (const doc of snap.docs) {
    const d = doc.data()
    const live = d.live_state ?? {}
    const state = live.state ?? 'UNKNOWN'
    const watchlist = d.watchlist ?? []
    const positions = live.openPositions ?? []
    const pnl = live.dailyPnlUsd ?? 0
    const unrealized = live.unrealizedPnlUsd ?? 0
    const paused = d.live_admin?.paused === true

    lines.push(
      `${stateEmoji(paused ? 'PAUSED' : state)} ${d.name ?? 'Agent'}` +
      (paused ? ' (paused)' : '') +
      `\n  State: ${paused ? 'PAUSED' : state}` +
      `\n  Watchlist: ${watchlist.length} tokens` +
      `\n  Open: ${positions.length} positions` +
      `\n  Daily PnL: ${fmt(Number(pnl))}` +
      `\n  Unrealized: ${fmt(unrealized)}`,
    )
  }

  await writeReply(firestoreAgentId, lines.join('\n\n'))
}

async function handleStatus(
  firestoreAgentId: string,
  agentName: string,
  apiKey: string,
  tbAgentId: string,
): Promise<void> {
  let live: any = {}
  let admin: any = {}
  let watchlist: string[] = []
  let freshData = false

  // Fetch fresh data directly from API for accurate unrealized PnL
  try {
    const fresh = await fetchAgentStatus(apiKey, tbAgentId)
    live = fresh.live?.state ?? {}
    admin = fresh.live?.admin ?? {}
    watchlist = fresh.agent?.watchlist ?? []
    freshData = true
  } catch {
    const cached = getCached(firestoreAgentId)
    live = cached?.liveState ?? (await db.collection('agents').doc(firestoreAgentId).get()).data()?.live_state ?? {}
    admin = cached?.liveAdmin ?? {}
    watchlist = cached?.watchlist ?? []
  }

  const state = live.state ?? 'UNKNOWN'
  const paused = admin.paused === true

  const positions: any[] = (await fetchAgentPositions(apiKey, tbAgentId)) ?? live.openPositions ?? []

  // Fetch live prices for all position tokens
  const symbols = positions.map((p) => (p.symbol ?? p.tokenSymbol ?? p.token ?? '').toUpperCase()).filter(Boolean)
  const prices = await getCurrentPrices(symbols)
  const pnl = live.dailyPnlUsd ?? 0
  const trades = live.dailyTradeCount ?? 0
  const setups = live.activeConditionalSetups ?? 0
  const lastSync = freshData ? 'just now' : (getCached(firestoreAgentId) ? new Date(getCached(firestoreAgentId)!.updatedAt ?? Date.now()).toLocaleTimeString() : 'unknown')

  const unrealized = positions.reduce((sum, p) => sum + calcUnrealized(p, prices), 0)
  const fmt = (n: number) => `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(2)}`

  const reply =
    `${stateEmoji(paused ? 'PAUSED' : state)} ${agentName} — ${paused ? 'PAUSED' : state}\n\n` +
    `📋 Watchlist: ${watchlist.length} tokens\n` +
    `📊 Open positions: ${positions.length}\n` +
    `📈 Daily PnL: ${fmt(Number(pnl))}\n` +
    `💸 Unrealized PnL: ${fmt(unrealized)}\n` +
    `🔢 Daily trades: ${trades}\n` +
    `🎯 Active setups: ${setups}\n` +
    `🕐 Last sync: ${lastSync}`

  await writeReply(firestoreAgentId, reply)
}

async function handlePositions(
  firestoreAgentId: string,
  apiKey: string,
  tbAgentId: string,
): Promise<void> {
  let positions: any[] = []
  try {
    const fresh = await fetchAgentStatus(apiKey, tbAgentId)
    positions = fresh.live?.state?.openPositions ?? []
  } catch {
    const cached = getCached(firestoreAgentId)
    const live = cached?.liveState ?? (await db.collection('agents').doc(firestoreAgentId).get()).data()?.live_state ?? {}
    positions = live.openPositions ?? []
  }

  if (positions.length === 0) {
    await writeReply(firestoreAgentId, '📊 No open positions.')
    return
  }

  const syms = positions.map((p) => (p.symbol ?? p.tokenSymbol ?? '').toUpperCase()).filter(Boolean)
  const prices = await getCurrentPrices(syms)

  const lines = ['📊 Open Positions\n']
  for (const p of positions) {
    const sym = (p.symbol ?? p.tokenSymbol ?? p.token ?? '?').toUpperCase()
    const currentPrice = prices.get(sym)
    const pnl = calcUnrealized(p, prices)
    const sign = pnl >= 0 ? '+' : ''
    lines.push(
      `${sym} ${p.direction ?? p.side ?? ''}\n` +
      `  Entry: $${p.entryPrice ?? '—'} · Current: $${currentPrice?.toFixed(4) ?? '—'}\n` +
      `  Size: $${p.sizeUsd ?? '—'} · Unrealized: ${sign}$${Number(pnl).toFixed(2)}`,
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

async function handlePnl(
  firestoreAgentId: string,
  agentName: string,
  apiKey: string,
  tbAgentId: string,
): Promise<void> {
  let live: any = {}
  try {
    const fresh = await fetchAgentStatus(apiKey, tbAgentId)
    live = fresh.live?.state ?? {}
  } catch {
    const cached = getCached(firestoreAgentId)
    live = cached?.liveState ?? (await db.collection('agents').doc(firestoreAgentId).get()).data()?.live_state ?? {}
  }
  const pnl = live.dailyPnlUsd ?? 0
  const trades = live.dailyTradeCount ?? 0
  const positions: any[] = (await fetchAgentPositions(apiKey, tbAgentId)) ?? live.openPositions ?? []

  const syms = positions.map((p) => (p.symbol ?? p.tokenSymbol ?? '').toUpperCase()).filter(Boolean)
  const prices = await getCurrentPrices(syms)
  const unrealized = positions.reduce((sum, p) => sum + calcUnrealized(p, prices), 0)

  const fmt = (n: number) => `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(2)}`
  const reply =
    `💰 ${agentName} PnL\n\n` +
    `Daily realized: ${fmt(Number(pnl))}\n` +
    `Unrealized: ${fmt(unrealized)}\n` +
    `Daily trades: ${trades}\n` +
    `Open positions: ${positions.length}`

  await writeReply(firestoreAgentId, reply)
}

async function handleSummary(firestoreAgentId: string, agentName: string): Promise<void> {
  const cached = getCached(firestoreAgentId)
  const live = cached?.liveState ?? (await db.collection('agents').doc(firestoreAgentId).get()).data()?.live_state ?? {}
  const admin = cached?.liveAdmin ?? {}
  const state = live.state ?? 'UNKNOWN'
  const pnl = live.dailyPnlUsd ?? 0
  const trades = live.dailyTradeCount ?? 0
  const setups = live.activeConditionalSetups ?? 0
  const positions: any[] = live.openPositions ?? []
  const watchlist: string[] = cached?.watchlist ?? []
  const paused = admin.paused === true

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
    `/analyze-slug001 — AI analysis of the Range Farmer\n` +
    `/pause — Pause this agent\n` +
    `/resume — Resume this agent\n` +
    `/override <text> — Send instruction to agent`
  return writeReply(firestoreAgentId, msg)
}

async function handleAnalyzeSlug001(
  firestoreAgentId: string,
  agentName: string,
  ai: { client: any; model: string } | null,
): Promise<void> {
  if (!ai) {
    await writeReply(firestoreAgentId, 'AI key required to run analysis. Add a Gemini or OpenAI key in Deploy settings.')
    return
  }

  const slugDoc = await db.collection('agents').doc('slug-001').get()
  const s = slugDoc.data()
  if (!s) {
    await writeReply(firestoreAgentId, '⚠️ Could not fetch Slug #001 data.')
    return
  }

  const tradesSnap = await db
    .collection('agents').doc('slug-001').collection('trades')
    .orderBy('created_at', 'desc').limit(10).get()

  const tradeLines = tradesSnap.docs.map((d) => {
    const t = d.data()
    return `  ${(t.side ?? '?').toUpperCase()} ${t.qty} BTC @ $${Math.round(t.fillPrice ?? 0).toLocaleString()} · PnL ${t.pnl != null ? (t.pnl >= 0 ? '+' : '') + '$' + Number(t.pnl).toFixed(2) : 'n/a'}`
  })

  const positions: any[] = s.positions ?? []
  const sessionPnl = s.session_pnl ?? 0
  const totalFills = s.total_fills ?? 0
  const regime = s.regime ?? 'unknown'
  const btcPrice = s.btc_price ?? 0
  const gridCenter = s.grid_center ?? 0

  const context =
    `SLUG #001 — RANGE FARMER (Paper BTC Grid)\n` +
    `Status: ${(s.status ?? 'unknown').toUpperCase()} | Regime: ${regime.toUpperCase()}\n` +
    `BTC: $${Math.round(btcPrice).toLocaleString()} | Grid center: $${Math.round(gridCenter).toLocaleString()}\n` +
    `Grid: ${s.grid_levels ?? '?'} levels × ${s.grid_spacing_pct ?? '?'}% spacing\n` +
    `Session PnL: ${sessionPnl >= 0 ? '+' : ''}$${Number(sessionPnl).toFixed(2)} | Fills: ${totalFills}\n` +
    `Open positions: ${positions.length}\n\n` +
    `RECENT TRADES:\n${tradeLines.length > 0 ? tradeLines.join('\n') : '  None yet.'}\n\n` +
    `OPEN POSITIONS:\n${positions.length > 0
      ? positions.map((p: any) => {
          const pnl = (p.currentPrice - p.fillPrice) * p.qty * (p.side === 'sell' ? -1 : 1)
          return `  ${(p.side ?? '?').toUpperCase()} ${p.qty} BTC @ $${Math.round(p.fillPrice).toLocaleString()} · Unrealized ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`
        }).join('\n')
      : '  None.'}`

  const prompt =
    `You are ${agentName}, a professional crypto trading agent analyzing a sister bot called Slug #001 that runs a BTC grid (range farming) strategy.\n\n` +
    `Current state:\n${context}\n\n` +
    `Provide a concise analysis covering:\n` +
    `1. Performance — is the grid generating healthy PnL for a range farmer?\n` +
    `2. Market fit — does the current regime suit this strategy?\n` +
    `3. Grid config — is the center/spacing appropriate for current BTC price?\n` +
    `4. Position risk — any concerns with open positions?\n` +
    `5. Verdict — one concrete recommendation.\n\n` +
    `Be direct, data-first. 2-4 sentences per section.`

  try {
    const completion = await ai.client.chat.completions.create(
      { model: ai.model, messages: [{ role: 'user', content: prompt }], max_tokens: 700 },
      { timeout: 40_000 },
    )
    const reply = completion.choices[0]?.message?.content ?? 'No response.'
    await writeReply(firestoreAgentId, `🔬 Slug #001 Analysis\n\n${reply}`)
  } catch (err: any) {
    console.error(`[chat:${firestoreAgentId}] analyze error:`, err?.message ?? err)
    await writeReply(firestoreAgentId, 'Analysis failed. Try again.')
  }
}


// ── Per-agent pending trade confirmations ────────────────────────────────────
interface PendingTrade {
  token: string
  type: 'BUY' | 'SELL'
  size: number
  instruction: string
  expiresAt: number // auto-cancel after 2 minutes
}
const pendingTrades = new Map<string, PendingTrade>()

// ── Build live agent context for AI system prompt ─────────────────────────────
async function buildLiveContext(
  firestoreAgentId: string,
  agentName: string,
  apiKey: string,
  tbAgentId: string,
): Promise<string> {
  let live: any = {}
  let admin: any = {}
  let watchlist: string[] = []
  try {
    const fresh = await fetchAgentStatus(apiKey, tbAgentId)
    live = fresh.live?.state ?? {}
    admin = fresh.live?.admin ?? {}
    watchlist = fresh.agent?.watchlist ?? []
  } catch {
    const cached = getCached(firestoreAgentId)
    live = cached?.liveState ?? {}
    admin = cached?.liveAdmin ?? {}
    watchlist = cached?.watchlist ?? []
  }

  const state = live.state ?? 'UNKNOWN'
  const paused = admin.paused === true
  const positions: any[] = (await fetchAgentPositions(apiKey, tbAgentId)) ?? live.openPositions ?? []
  const pnl = live.dailyPnlUsd ?? 0
  const trades = live.dailyTradeCount ?? 0

  const syms = positions.map((p) => (p.symbol ?? p.tokenSymbol ?? '').toUpperCase()).filter(Boolean)
  const prices = await getCurrentPrices(syms)

  const positionLines = positions.length > 0
    ? positions.map((p) => {
        const sym = (p.symbol ?? p.tokenSymbol ?? p.token ?? '?').toUpperCase()
        const currentPrice = prices.get(sym)
        const upnl = calcUnrealized(p, prices)
        const sign = upnl >= 0 ? '+' : ''
        return `  ${p.direction ?? 'LONG'} ${sym} | Entry: $${p.entryPrice ?? '?'} | Current: $${currentPrice?.toFixed(4) ?? '?'} | Size: $${p.sizeUsd ?? '?'} | Unrealized: ${sign}$${upnl.toFixed(2)} | SL: $${p.stopLoss ?? '?'} | TP: $${p.takeProfit ?? '?'}`
      }).join('\n')
    : '  None'

  const decisionsSnap = await db
    .collection('agents').doc(firestoreAgentId).collection('decisions')
    .orderBy('eventTime', 'desc').limit(6).get()
  const decisionLines = decisionsSnap.docs.map((d) => {
    const dec = d.data()
    const ts = dec.eventTime ? new Date(dec.eventTime).toLocaleString() : '?'
    return `  [${ts}] ${dec.actionType ?? dec.decisionType} ${dec.tokenSymbol ?? ''} (${dec.confidence ?? 0}%): ${(dec.details ?? '').slice(0, 120)}`
  }).join('\n')

  return `AGENT: ${agentName} | STATUS: ${paused ? 'PAUSED' : state}
WATCHLIST: ${watchlist.join(', ') || 'none'}
DAILY PnL: $${Number(pnl).toFixed(2)} | DAILY TRADES: ${trades}

OPEN POSITIONS (${positions.length}):
${positionLines}

RECENT DECISIONS:
${decisionLines || '  None'}`
}

export function startChatListener(
  firestoreAgentId: string,
  apiKey: string,
  tbAgentId: string,
  agentName: string,
  openaiApiKey?: string,
): void {
  const ai = openaiApiKey ? makeAIClient(openaiApiKey) : null
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

        const msgData = change.doc.data()
        if (msgData.direction !== 'inbound') {
          processedIds.add(change.doc.id)
          continue
        }

        const text: string = (msgData.content ?? '').trim()
        if (!text) {
          processedIds.add(change.doc.id)
          continue
        }

        // Atomically claim this message — prevents double-processing when two
        // Cloud Run instances are briefly running during rolling deploy
        let claimed = false
        try {
          await db.runTransaction(async (tx) => {
            const snap = await tx.get(change.doc.ref)
            if (snap.data()?.chat_processed === true) {
              throw Object.assign(new Error('already_processed'), { skip: true })
            }
            tx.update(change.doc.ref, { chat_processed: true })
          })
          claimed = true
        } catch (claimErr: any) {
          if (claimErr?.skip) {
            console.log(`[chat:${firestoreAgentId}] skipping already-claimed msg ${change.doc.id}`)
            processedIds.add(change.doc.id)
            continue
          }
          // Unexpected transaction error — still attempt to process to avoid silent drops
          claimed = true
        }
        if (!claimed) continue
        processedIds.add(change.doc.id)

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
          if (text.startsWith('/override ')) {
            const instruction = text.slice('/override '.length).trim()
            if (!instruction) {
              await writeReply(firestoreAgentId, 'Usage: /override <instruction>')
              continue
            }
            await overrideAgent(apiKey, tbAgentId, instruction)
            await writeReply(firestoreAgentId, `🎯 Override sent: "${instruction}"`)
            continue
          }
          if (text === '/agents') {
            await handleAgents(firestoreAgentId)
            continue
          }
          if (text === '/status') {
            await handleStatus(firestoreAgentId, agentName, apiKey, tbAgentId)
            continue
          }
          if (text === '/positions') {
            await handlePositions(firestoreAgentId, apiKey, tbAgentId)
            continue
          }
          if (text === '/decisions' || text === '/review') {
            await handleDecisions(firestoreAgentId)
            continue
          }
          if (text === '/pnl') {
            await handlePnl(firestoreAgentId, agentName, apiKey, tbAgentId)
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
          if (text === '/analyze-slug001') {
            await handleAnalyzeSlug001(firestoreAgentId, agentName, ai)
            continue
          }

          // ── Trade confirmation check ──────────────────────────────────────
          const pending = pendingTrades.get(firestoreAgentId)
          if (pending) {
            if (Date.now() > pending.expiresAt) {
              pendingTrades.delete(firestoreAgentId)
            } else if (/^(yes|confirm|go|execute|do it|ok|sure|yep|yeah)/i.test(text)) {
              try {
                await overrideAgent(apiKey, tbAgentId, pending.instruction)
                pendingTrades.delete(firestoreAgentId)
                await writeReply(firestoreAgentId, `✅ Trade sent to ${agentName}: ${pending.type} ${pending.token} $${pending.size}\nThe agent will execute when conditions are met.`)
              } catch (e: any) {
                await writeReply(firestoreAgentId, `❌ Trade failed: ${e.message}`)
              }
              continue
            } else if (/^(no|cancel|stop|nevermind|nope|abort)/i.test(text)) {
              pendingTrades.delete(firestoreAgentId)
              await writeReply(firestoreAgentId, '↩️ Trade cancelled.')
              continue
            }
          }

          // ── Free-form AI subagent ─────────────────────────────────────────
          if (!ai) {
            await writeReply(firestoreAgentId, `Use /help to see available commands.`)
            continue
          }

          // Fetch live context (positions, decisions, state)
          const liveContext = await buildLiveContext(firestoreAgentId, agentName, apiKey, tbAgentId)

          // Load recent conversation history
          const historySnap = await db
            .collection('agents').doc(firestoreAgentId).collection('messages')
            .orderBy('created_at', 'desc').limit(20).get()
          const history = historySnap.docs
            .map((d) => d.data())
            .reverse()
            .filter((m) => m.content && m.content !== text)
            .slice(-14)

          const system = `You are ${agentName}, a fully autonomous crypto trading agent on Cabal Ventures. You have full visibility into your live trading state and can execute trades on behalf of the user.

LIVE STATE:
${liveContext}

CAPABILITIES:
You can answer any question about your positions, decisions, market conditions, and strategy using the live data above.
You can also take actions — when appropriate, append a JSON action block to your response:

To propose a trade (always ask user to confirm first):
TRADE_ACTION:{"type":"BUY","token":"SOL","size":250}
or: TRADE_ACTION:{"type":"SELL","token":"SOL","size":250}

To pause yourself: AGENT_ACTION:{"action":"pause"}
To resume yourself: AGENT_ACTION:{"action":"resume"}
To send yourself an instruction: AGENT_ACTION:{"action":"override","instruction":"focus on BTC and ETH only"}

Rules:
- Always confirm trade details with the user before appending TRADE_ACTION
- Be concise and data-driven. Plain text only. Never fabricate prices or data.
- If asked about a position or token not in your data, say so honestly.
- Remember the conversation history above.`

          const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
            { role: 'system', content: system },
            ...history.map((m) => ({
              role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
              content: m.content as string,
            })),
            { role: 'user', content: text },
          ]

          let completion: any
          try {
            completion = await ai.client.chat.completions.create(
              { model: ai.model, messages, max_tokens: 500 },
              { timeout: 30_000 },
            )
          } catch (firstErr: any) {
            if (firstErr?.status === 429 || firstErr?.message?.includes('429')) {
              console.warn(`[chat:${firestoreAgentId}] 429 rate limit, retrying in 15s...`)
              await new Promise((r) => setTimeout(r, 15_000))
              completion = await ai.client.chat.completions.create(
                { model: ai.model, messages, max_tokens: 500 },
                { timeout: 30_000 },
              )
            } else {
              throw firstErr
            }
          }

          const rawReply: string = completion.choices[0]?.message?.content ?? 'No response.'

          // ── Parse and execute action blocks ───────────────────────────────
          const tradeMatch = rawReply.match(/TRADE_ACTION:\{[^}]+\}/)
          const agentMatch = rawReply.match(/AGENT_ACTION:\{[^}]+\}/)

          if (tradeMatch) {
            try {
              const tradeData = JSON.parse(tradeMatch[0].replace('TRADE_ACTION:', ''))
              const cleanReply = rawReply.replace(tradeMatch[0], '').trim()
              const instruction = `${tradeData.type} ${tradeData.token} SIZE_USD:${tradeData.size} SOURCE:user_chat`
              pendingTrades.set(firestoreAgentId, {
                token: tradeData.token,
                type: tradeData.type,
                size: tradeData.size,
                instruction,
                expiresAt: Date.now() + 2 * 60 * 1000, // 2-min window to confirm
              })
              await writeReply(firestoreAgentId, `${cleanReply}\n\nReply "confirm" to execute or "cancel" to abort.`)
            } catch {
              await writeReply(firestoreAgentId, rawReply)
            }
          } else if (agentMatch) {
            try {
              const actionData = JSON.parse(agentMatch[0].replace('AGENT_ACTION:', ''))
              const cleanReply = rawReply.replace(agentMatch[0], '').trim()
              if (actionData.action === 'pause') {
                await pauseAgent(apiKey, tbAgentId)
                await writeReply(firestoreAgentId, cleanReply || `⏸️ ${agentName} paused.`)
              } else if (actionData.action === 'resume') {
                await resumeAgent(apiKey, tbAgentId)
                await writeReply(firestoreAgentId, cleanReply || `▶️ ${agentName} resumed.`)
              } else if (actionData.action === 'override') {
                await overrideAgent(apiKey, tbAgentId, actionData.instruction)
                await writeReply(firestoreAgentId, cleanReply || `🎯 Instruction sent: "${actionData.instruction}"`)
              } else {
                await writeReply(firestoreAgentId, rawReply)
              }
            } catch {
              await writeReply(firestoreAgentId, rawReply)
            }
          } else {
            await writeReply(firestoreAgentId, rawReply)
          }
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
