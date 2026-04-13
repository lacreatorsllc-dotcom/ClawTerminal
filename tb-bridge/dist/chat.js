"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startChatListener = startChatListener;
const openai_1 = __importDefault(require("openai"));
const firebase_1 = require("./firebase");
const api_1 = require("./api");
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
async function writeReply(firestoreAgentId, content) {
    await firebase_1.db.collection('agents').doc(firestoreAgentId).collection('messages').add({
        direction: 'outbound',
        content,
        agent_id: firestoreAgentId,
        user_id: firestoreAgentId,
        created_at: firebase_1.FieldValue.serverTimestamp(),
    });
}
function startChatListener(firestoreAgentId, apiKey, tbAgentId, agentName) {
    // Track IDs we've already processed (or that pre-existed at startup)
    const processedIds = new Set();
    let initialized = false;
    const messagesRef = firebase_1.db.collection('agents').doc(firestoreAgentId).collection('messages');
    // Simple orderBy — only needs auto-created single-field index, no composite required
    const q = messagesRef.orderBy('created_at', 'asc');
    console.log(`[chat:${firestoreAgentId}] listener starting for ${agentName}`);
    q.onSnapshot(async (snap) => {
        if (!initialized) {
            // First snapshot: mark all pre-existing messages as already seen
            for (const doc of snap.docs) {
                processedIds.add(doc.id);
            }
            initialized = true;
            console.log(`[chat:${firestoreAgentId}] initialized, skipped ${processedIds.size} existing messages`);
            return;
        }
        for (const change of snap.docChanges()) {
            if (change.type !== 'added')
                continue;
            if (processedIds.has(change.doc.id))
                continue;
            processedIds.add(change.doc.id);
            const msgData = change.doc.data();
            // Only respond to inbound messages
            if (msgData.direction !== 'inbound')
                continue;
            const text = (msgData.content ?? '').trim();
            if (!text)
                continue;
            try {
                // Control commands
                if (text === '/pause') {
                    await (0, api_1.pauseAgent)(apiKey, tbAgentId);
                    await writeReply(firestoreAgentId, 'Agent paused.');
                    continue;
                }
                if (text === '/resume') {
                    await (0, api_1.resumeAgent)(apiKey, tbAgentId);
                    await writeReply(firestoreAgentId, 'Agent resumed.');
                    continue;
                }
                // Fetch live context
                const agentDoc = await firebase_1.db.collection('agents').doc(firestoreAgentId).get();
                const agentData = agentDoc.data() ?? {};
                const liveState = agentData.live_state ?? {};
                const decisionsSnap = await firebase_1.db
                    .collection('agents')
                    .doc(firestoreAgentId)
                    .collection('decisions')
                    .orderBy('eventTime', 'desc')
                    .limit(10)
                    .get();
                const decisions = decisionsSnap.docs.map((d) => d.data());
                const systemPrompt = `You are ${agentName}, a fully autonomous crypto trading agent on the Cabal Ventures platform.

CURRENT STATE:
${JSON.stringify(liveState, null, 2)}

RECENT DECISIONS (last 10):
${decisions.map((d) => `[${d.eventTime}] ${d.tokenSymbol} ${d.actionType} (${d.confidence}%): ${d.details}`).join('\n')}

Behavior:
- Answer questions about your state, decisions, and reasoning
- Be concise and data-driven
- For /pause and /resume commands, confirm execution
- Never fabricate trade data not in your context`;
                const completion = await openai.chat.completions.create({
                    model: 'gpt-4o',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: text },
                    ],
                });
                const reply = completion.choices[0]?.message?.content ?? 'No response.';
                await writeReply(firestoreAgentId, reply);
            }
            catch (err) {
                console.error(`[chat:${firestoreAgentId}] error processing message:`, err?.message ?? err);
                await writeReply(firestoreAgentId, 'Error processing your message. Please try again.').catch(() => { });
            }
        }
    }, (err) => {
        console.error(`[chat:${firestoreAgentId}] snapshot error:`, err?.message ?? err);
    });
}
