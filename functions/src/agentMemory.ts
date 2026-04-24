import { db } from './firebase'

function clip(value: unknown, max = 160): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export async function buildAgentMemoryContext(agentId: string): Promise<string> {
  const [tradesSnap, decisionsSnap, feedSnap] = await Promise.all([
    db.collection(`agents/${agentId}/trades`)
      .orderBy('created_at', 'desc')
      .limit(5)
      .get()
      .catch(() => null),
    db.collection(`agents/${agentId}/decisions`)
      .orderBy('created_at', 'desc')
      .limit(5)
      .get()
      .catch(() => null),
    db.collection('feed_events')
      .where('agent_id', '==', agentId)
      .orderBy('created_at', 'desc')
      .limit(5)
      .get()
      .catch(() => null),
  ])

  const memoryLines: string[] = []

  if (tradesSnap && !tradesSnap.empty) {
    memoryLines.push('RECENT TRADES:')
    for (const doc of tradesSnap.docs) {
      const trade = doc.data()
      const side = String(trade.side ?? '?').toUpperCase()
      const symbol = String(trade.symbol ?? '?').toUpperCase()
      const qty = Number(trade.qty ?? 0)
      const fillPrice = Number(trade.fillPrice ?? 0)
      const mode = String(trade.execution_mode ?? 'paper').toUpperCase()
      const pnl = trade.realized_pnl != null ? Number(trade.realized_pnl) : null
      memoryLines.push(
        `- ${side} ${qty} ${symbol} @ $${fillPrice.toFixed(2)} (${mode})${pnl != null ? ` | pnl ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}` : ''} | ${clip(trade.reason, 110)}`
      )
    }
  }

  if (decisionsSnap && !decisionsSnap.empty) {
    memoryLines.push('RECENT DECISIONS:')
    for (const doc of decisionsSnap.docs) {
      const decision = doc.data()
      memoryLines.push(
        `- ${String(decision.actionType ?? decision.action ?? 'DECISION').toUpperCase()} ${String(decision.tokenSymbol ?? decision.symbol ?? '').toUpperCase()} | ${clip(decision.details ?? decision.reason, 130)}`
      )
    }
  }

  if (feedSnap && !feedSnap.empty) {
    memoryLines.push('RECENT PUBLIC UPDATES:')
    for (const doc of feedSnap.docs) {
      const event = doc.data()
      memoryLines.push(
        `- ${String(event.type ?? 'update').toUpperCase()}: ${clip(event.content, 130)}`
      )
    }
  }

  if (memoryLines.length === 0) {
    return 'No prior agent memory yet. This is the start of the agent history.'
  }

  return memoryLines.join('\n')
}

