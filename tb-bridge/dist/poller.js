"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPoller = startPoller;
const firebase_1 = require("./firebase");
const api_1 = require("./api");
function startPoller(firestoreAgentId, apiKey, tbAgentId, tbTraderId) {
    async function poll() {
        try {
            // Fetch live agent status
            const { agent, live } = await (0, api_1.fetchAgentStatus)(apiKey, tbAgentId);
            await firebase_1.db.collection('agents').doc(firestoreAgentId).update({
                name: agent.name,
                status: agent.status === 'active' ? 'connected' : 'disconnected',
                autonomy_level: agent.autonomyLevel,
                watchlist: agent.watchlist,
                tick_count: agent.tickCount,
                last_tick_at: agent.lastTickAt,
                next_scan_at: agent.nextScanAt,
                live_state: live.state,
                live_admin: live.admin,
                last_synced: firebase_1.FieldValue.serverTimestamp(),
            });
            // Fetch and upsert decisions
            const decisions = await (0, api_1.fetchDecisions)(apiKey, tbTraderId);
            const batch = firebase_1.db.batch();
            for (const decision of decisions) {
                const ref = firebase_1.db
                    .collection('agents')
                    .doc(firestoreAgentId)
                    .collection('decisions')
                    .doc(decision.id);
                batch.set(ref, {
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
                    synced_at: firebase_1.FieldValue.serverTimestamp(),
                }, { merge: true });
            }
            await batch.commit();
            console.log(`[poller:${firestoreAgentId}] synced`);
        }
        catch (err) {
            console.error(`[poller:${firestoreAgentId}] error:`, err?.message ?? err);
        }
    }
    // Poll immediately then on interval
    poll();
    setInterval(poll, 30000);
}
