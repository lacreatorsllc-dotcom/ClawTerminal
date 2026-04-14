"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPoller = startPoller;
const firebase_1 = require("./firebase");
const api_1 = require("./api");
const cache_1 = require("./cache");
// Strip undefined values — Firestore rejects them (null is fine)
function sanitize(obj) {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v === undefined ? null : v]));
}
function startPoller(firestoreAgentId, apiKey, tbAgentId, tbTraderId, openaiApiKey) {
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
            // Update in-memory cache so chat handler avoids redundant Firestore reads
            (0, cache_1.setCached)(firestoreAgentId, {
                name: agent.name,
                liveState: live.state,
                liveAdmin: live.admin,
                watchlist: agent.watchlist ?? [],
                openaiApiKey,
            });
            // Fetch all decisions for account, filter to this trader
            const allDecisions = await (0, api_1.fetchDecisions)(apiKey, 50);
            const decisions = allDecisions.filter((d) => d.traderId === tbTraderId);
            const batch = firebase_1.db.batch();
            for (const decision of decisions) {
                const ref = firebase_1.db
                    .collection('agents')
                    .doc(firestoreAgentId)
                    .collection('decisions')
                    .doc(decision.id);
                batch.set(ref, sanitize({
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
                }), { merge: true });
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
