"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAgentMemoryContext = buildAgentMemoryContext;
const firebase_1 = require("./firebase");
function clip(value, max = 160) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
async function buildAgentMemoryContext(agentId) {
    const [tradesSnap, decisionsSnap, feedSnap] = await Promise.all([
        firebase_1.db.collection(`agents/${agentId}/trades`)
            .orderBy('created_at', 'desc')
            .limit(5)
            .get()
            .catch(() => null),
        firebase_1.db.collection(`agents/${agentId}/decisions`)
            .orderBy('created_at', 'desc')
            .limit(5)
            .get()
            .catch(() => null),
        firebase_1.db.collection('feed_events')
            .where('agent_id', '==', agentId)
            .orderBy('created_at', 'desc')
            .limit(5)
            .get()
            .catch(() => null),
    ]);
    const memoryLines = [];
    if (tradesSnap && !tradesSnap.empty) {
        memoryLines.push('RECENT TRADES:');
        for (const doc of tradesSnap.docs) {
            const trade = doc.data();
            const side = String(trade.side ?? '?').toUpperCase();
            const symbol = String(trade.symbol ?? '?').toUpperCase();
            const qty = Number(trade.qty ?? 0);
            const fillPrice = Number(trade.fillPrice ?? 0);
            const mode = String(trade.execution_mode ?? 'paper').toUpperCase();
            const pnl = trade.realized_pnl != null ? Number(trade.realized_pnl) : null;
            memoryLines.push(`- ${side} ${qty} ${symbol} @ $${fillPrice.toFixed(2)} (${mode})${pnl != null ? ` | pnl ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}` : ''} | ${clip(trade.reason, 110)}`);
        }
    }
    if (decisionsSnap && !decisionsSnap.empty) {
        memoryLines.push('RECENT DECISIONS:');
        for (const doc of decisionsSnap.docs) {
            const decision = doc.data();
            memoryLines.push(`- ${String(decision.actionType ?? decision.action ?? 'DECISION').toUpperCase()} ${String(decision.tokenSymbol ?? decision.symbol ?? '').toUpperCase()} | ${clip(decision.details ?? decision.reason, 130)}`);
        }
    }
    if (feedSnap && !feedSnap.empty) {
        memoryLines.push('RECENT PUBLIC UPDATES:');
        for (const doc of feedSnap.docs) {
            const event = doc.data();
            memoryLines.push(`- ${String(event.type ?? 'update').toUpperCase()}: ${clip(event.content, 130)}`);
        }
    }
    if (memoryLines.length === 0) {
        return 'No prior agent memory yet. This is the start of the agent history.';
    }
    return memoryLines.join('\n');
}
//# sourceMappingURL=agentMemory.js.map