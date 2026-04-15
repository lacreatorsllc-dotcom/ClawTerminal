import { db, FieldValue } from './firebase'
import { fetchAgentStatus, fetchDecisions } from './api'
import { setCached } from './cache'
import { getCurrentPrices, calcUnrealized } from './prices'
import type { TbDecision } from './types'

// ── Shared decisions cache ────────────────────────────────────────────────────
// fetchDecisions is account-level — all agents on the same apiKey share one fetch.
// Without this, 3 agents × 2 calls/30s = 17,280 API calls/day.
// With this + 2-min interval: ~2,400 calls/day.

const DECISIONS_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface DecisionsCache {
  data: TbDecision[]
  fetchedAt: number
}

const decisionsCache = new Map<string, DecisionsCache>()

async function getDecisions(apiKey: string): Promise<TbDecision[]> {
  const cached = decisionsCache.get(apiKey)
  if (cached && Date.now() - cached.fetchedAt < DECISIONS_TTL_MS) {
    return cached.data
  }
  const data = await fetchDecisions(apiKey, 50)
  decisionsCache.set(apiKey, { data, fetchedAt: Date.now() })
  return data
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitize(obj: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, v === undefined ? null : v])
  )
}

const ALERT_TYPES = new Set(['TRADE_ALERT', 'ENTRY', 'EXIT', 'STOP_HIT', 'TAKE_PROFIT'])

function formatAlert(d: TbDecision): string {
  const action = d.actionType ?? d.decisionType ?? '?'

  let title = action
  if (action.includes('LONG')) title = `ENTRY: LONG ${d.tokenSymbol}`
  else if (action.includes('SHORT')) title = `ENTRY: SHORT ${d.tokenSymbol}`
  else if (action.includes('EXIT') || action.includes('CLOSE')) title = `EXIT: ${d.tokenSymbol}`
  else if (action.includes('STOP')) title = `STOP HIT: ${d.tokenSymbol}`
  else if (action.includes('PROFIT') || action.includes('TP')) title = `TAKE PROFIT: ${d.tokenSymbol}`

  if (d.entryPrice) title += ` @ $${d.entryPrice}`

  const lines: string[] = [`🔔 ${title}`]

  const params: string[] = []
  if (d.direction) params.push(d.direction)
  if (d.tokenSymbol) params.push(d.tokenSymbol)
  if (d.entryPrice) params.push(`@ $${d.entryPrice}`)
  if (d.confidence) params.push(`Confidence: ${d.confidence}%`)
  if (params.length > 0) lines.push(params.join(' | '))

  if (d.details) lines.push(`\n${d.details}`)

  const ts = d.eventTime ? new Date(d.eventTime).toLocaleString() : ''
  lines.push(`\n${d.decisionType} · ${ts}`)

  return lines.join('\n')
}

// ── Poller ────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2 * 60 * 1000 // 2 minutes — agent status doesn't need sub-minute freshness

export function startPoller(
  firestoreAgentId: string,
  apiKey: string,
  tbAgentId: string,
  tbTraderId: string,
  openaiApiKey?: string,
): void {
  const seenIds = new Set<string>()
  let firstPoll = true

  async function poll(): Promise<void> {
    try {
      // 1 API call per agent per poll
      const { agent, live } = await fetchAgentStatus(apiKey, tbAgentId)

      // Enrich positions with live unrealized PnL from CoinGecko
      const positions: any[] = live.state?.openPositions ?? []
      let enrichedUnrealizedPnl = 0
      if (positions.length > 0) {
        const symbols = positions.map((p: any) => (p.symbol ?? p.tokenSymbol ?? '').toUpperCase()).filter(Boolean)
        const prices = await getCurrentPrices(symbols)
        enrichedUnrealizedPnl = positions.reduce((sum: number, p: any) => sum + calcUnrealized(p, prices), 0)
      }

      const enrichedLiveState = {
        ...live.state,
        unrealizedPnlUsd: enrichedUnrealizedPnl,
      }

      await db.collection('agents').doc(firestoreAgentId).update({
        name: agent.name,
        status: agent.status === 'active' ? 'connected' : 'disconnected',
        autonomy_level: agent.autonomyLevel,
        watchlist: agent.watchlist,
        tick_count: agent.tickCount,
        last_tick_at: agent.lastTickAt,
        next_scan_at: agent.nextScanAt,
        live_state: enrichedLiveState,
        live_admin: live.admin,
        last_synced: FieldValue.serverTimestamp(),
      })

      setCached(firestoreAgentId, {
        name: agent.name,
        liveState: live.state,
        liveAdmin: live.admin,
        watchlist: agent.watchlist ?? [],
        openaiApiKey,
      })

      // Shared fetch — all agents on the same apiKey reuse cached result for 5 min
      const allDecisions = await getDecisions(apiKey)
      const decisions = allDecisions.filter((d) => d.traderId === tbTraderId)

      const batch = db.batch()
      for (const decision of decisions) {
        const ref = db
          .collection('agents')
          .doc(firestoreAgentId)
          .collection('decisions')
          .doc(decision.id)
        batch.set(
          ref,
          sanitize({
            id: decision.id,
            traderId: decision.traderId,
            eventTime: decision.eventTime,
            decisionType: decision.decisionType,
            actor: decision.actor,
            tokenSymbol: decision.tokenSymbol,
            actionType: decision.actionType,
            details: decision.details,
            confidence: decision.confidence,
            direction: decision.direction,
            entryPrice: decision.entryPrice,
            exitPrice: decision.exitPrice,
            emotionalTag: decision.emotionalTag,
            thesisAccuracy: decision.thesisAccuracy,
            synced_at: FieldValue.serverTimestamp(),
          }),
          { merge: true },
        )
      }
      await batch.commit()

      if (firstPoll) {
        for (const d of decisions) seenIds.add(d.id)
        firstPoll = false
      } else {
        for (const d of decisions) {
          if (seenIds.has(d.id)) continue
          seenIds.add(d.id)

          const isAlert = ALERT_TYPES.has(d.decisionType) ||
            (d.actionType && (d.actionType.includes('ENTRY') || d.actionType.includes('EXIT') ||
             d.actionType.includes('STOP') || d.actionType.includes('PROFIT')))

          if (!isAlert) continue

          console.log(`[poller:${firestoreAgentId}] posting alert: ${d.decisionType} ${d.actionType} ${d.tokenSymbol}`)
          await db.collection('agents').doc(firestoreAgentId).collection('messages').add({
            direction: 'outbound',
            content: formatAlert(d),
            agent_id: firestoreAgentId,
            user_id: firestoreAgentId,
            alert: true,
            decision_id: d.id,
            created_at: FieldValue.serverTimestamp(),
          })
        }
      }

      console.log(`[poller:${firestoreAgentId}] synced`)
    } catch (err: any) {
      console.error(`[poller:${firestoreAgentId}] error:`, err?.message ?? err)
    }
  }

  // Sequential loop — next poll only starts after current one fully completes.
  // Prevents overlapping Firestore writes and double-alerts when poll() takes > 2 min.
  async function runPollerLoop(): Promise<void> {
    while (true) {
      await poll()
      await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  }
  runPollerLoop()
}
