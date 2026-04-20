"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onChatMessage = exports.tickAgent = exports.clockAgents = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const pubsub_1 = require("firebase-functions/v2/pubsub");
const firestore_1 = require("firebase-functions/v2/firestore");
const params_1 = require("firebase-functions/params");
const pubsub_2 = require("@google-cloud/pubsub");
const firebase_1 = require("./firebase");
const agentLoop_1 = require("./agentLoop");
const chatLoop_1 = require("./chatLoop");
const anthropicKey = (0, params_1.defineSecret)('ANTHROPIC_API_KEY');
const pubsub = new pubsub_2.PubSub();
const TOPIC = 'agent-tick';
// ── Every 5 minutes: fan out one Pub/Sub message per active agent ─────────────
exports.clockAgents = (0, scheduler_1.onSchedule)({ schedule: 'every 5 minutes', region: 'us-central1', timeoutSeconds: 60 }, async () => {
    const snap = await firebase_1.AGENTS_COL
        .where('type', '==', 'claude_managed')
        .where('status', 'in', ['active', 'connected'])
        .get();
    if (snap.empty) {
        console.log('[clock] no active claude_managed agents');
        return;
    }
    console.log(`[clock] fanning out to ${snap.size} agents`);
    const topic = pubsub.topic(TOPIC);
    await Promise.all(snap.docs.map((doc) => topic.publishMessage({ json: { agentId: doc.id } })));
});
// ── One message per agent: run its Claude loop ────────────────────────────────
exports.tickAgent = (0, pubsub_1.onMessagePublished)({ topic: TOPIC, region: 'us-central1', timeoutSeconds: 120, memory: '512MiB', secrets: [anthropicKey] }, async (event) => {
    const { agentId } = event.data.message.json;
    if (!agentId)
        return;
    await (0, agentLoop_1.runAgentTick)(agentId);
});
// ── Instant chat reply: fires the moment a user sends a message ───────────────
exports.onChatMessage = (0, firestore_1.onDocumentCreated)({
    document: 'agents/{agentId}/messages/{messageId}',
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '512MiB',
    secrets: [anthropicKey],
}, async (event) => {
    const data = event.data?.data();
    if (!data)
        return;
    if (data.direction !== 'inbound')
        return; // only reply to user messages
    const { agentId, messageId } = event.params;
    await (0, chatLoop_1.runChatReply)(agentId, messageId, data.content);
});
//# sourceMappingURL=index.js.map