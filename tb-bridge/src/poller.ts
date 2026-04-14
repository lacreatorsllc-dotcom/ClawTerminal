import { db, FieldValue } from './firebase'
import { fetchAgentStatus, fetchDecisions } from './api'

// Strip undefined values — Firestore rejects them (null is fine)
function sanitize(obj: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, v === undefined ? null : v])
  )
}

export function startPoller(
  firestoreAgentId: string,
  apiKey: string,
  tbAgentId: string,
  tbTraderId: string,
): void {
  async function poll(): Promise<void> {
    try {
      // Fetch live agent status
      const { agent, live } = await fetchAgentStatus(apiKey, tbAgentId)

      await db.collection('agents').doc(firestoreAgentId).update({
        name: agent.name,
        status: agent.status === 'active' ? 'connected' : 'disconnected',
        autonomy_level: agent.autonomyLevel,
        watchlist: agent.watchlist,
        tick_count: agent.tickCount,
        last_tick_at: agent.lastTickAt,
        next_scan_at: agent.nextScanAt,
        live_state: live.state,
        live_admin: live.admin,
        last_synced: FieldValue.serverTimestamp(),
      })

      // Fetch all decisions for account, filter to this trader
      const allDecisions = await fetchDecisions(apiKey, 50)
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

      console.log(`[poller:${firestoreAgentId}] synced`)
    } catch (err: any) {
      console.error(`[poller:${firestoreAgentId}] error:`, err?.message ?? err)
    }
  }

  // Poll immediately then on interval
  poll()
  setInterval(poll, 30_000)
}
