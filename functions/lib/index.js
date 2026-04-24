"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mcpStatus = exports.syncAgentWalletFunding = exports.pollMarketNews = exports.onChatMessage = exports.tickAgent = exports.clockAgents = exports.completeTwitterSignIn = exports.startTwitterSignIn = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const pubsub_1 = require("firebase-functions/v2/pubsub");
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const pubsub_2 = require("@google-cloud/pubsub");
const firebase_1 = require("./firebase");
const agentLoop_1 = require("./agentLoop");
const chatLoop_1 = require("./chatLoop");
const mcpHealth_1 = require("./mcpHealth");
const newsPoller_1 = require("./newsPoller");
const solana_1 = require("./solana");
var twitterAuth_1 = require("./twitterAuth");
Object.defineProperty(exports, "startTwitterSignIn", { enumerable: true, get: function () { return twitterAuth_1.startTwitterSignIn; } });
Object.defineProperty(exports, "completeTwitterSignIn", { enumerable: true, get: function () { return twitterAuth_1.completeTwitterSignIn; } });
const pubsub = new pubsub_2.PubSub();
const TOPIC = 'agent-tick';
// ── Every 5 minutes: fan out one Pub/Sub message per active agent ─────────────
exports.clockAgents = (0, scheduler_1.onSchedule)({ schedule: 'every 5 minutes', region: 'us-central1', timeoutSeconds: 60 }, async () => {
    const snap = await firebase_1.AGENTS_COL
        .where('agent_type', '==', 'claude_managed')
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
exports.tickAgent = (0, pubsub_1.onMessagePublished)({ topic: TOPIC, region: 'us-central1', timeoutSeconds: 120, memory: '512MiB', secrets: ['GEMINI_API_KEY'] }, async (event) => {
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
    secrets: ['GEMINI_API_KEY'],
}, async (event) => {
    const data = event.data?.data();
    console.log(`[onChatMessage] doc=${event.params.agentId}/${event.params.messageId} direction=${data?.direction} hasData=${!!data}`);
    if (!data)
        return;
    if (data.direction !== 'inbound')
        return;
    if (data.agent_reply === true)
        return;
    const { agentId, messageId } = event.params;
    await (0, chatLoop_1.runChatReply)(agentId, messageId, data.content);
});
// ── Every 15 minutes: ingest fresh market news into Firestore ────────────────
exports.pollMarketNews = (0, scheduler_1.onSchedule)({ schedule: 'every 15 minutes', region: 'us-central1', timeoutSeconds: 120, memory: '512MiB' }, async () => {
    await (0, newsPoller_1.runMarketNewsPoller)();
});
exports.syncAgentWalletFunding = (0, scheduler_1.onSchedule)({ schedule: 'every 5 minutes', region: 'us-central1', timeoutSeconds: 120, memory: '512MiB' }, async () => {
    const snap = await firebase_1.AGENTS_COL
        .where('wallet_ready', '==', true)
        .get();
    if (snap.empty) {
        console.log('[funding-sync] no wallet-ready agents found');
        return;
    }
    await Promise.all(snap.docs.map(async (doc) => {
        try {
            await (0, solana_1.syncAgentFundingState)(doc.id, doc.data());
        }
        catch (error) {
            console.error(`[funding-sync] failed for ${doc.id}:`, error);
        }
    }));
});
exports.mcpStatus = (0, https_1.onRequest)({
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
}, async (req, res) => {
    if (req.method !== 'GET') {
        res.set('Allow', 'GET');
        res.status(405).json({ ok: false, error: 'Method not allowed' });
        return;
    }
    const report = await (0, mcpHealth_1.getMcpHealthReport)();
    res.status(report.ok ? 200 : 503).json(report);
});
//# sourceMappingURL=index.js.map