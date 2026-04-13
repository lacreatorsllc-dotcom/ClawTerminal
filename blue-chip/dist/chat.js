"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startChatListener = startChatListener;
const openai_1 = __importDefault(require("openai"));
const firestore_1 = require("firebase-admin/firestore");
const firebase_1 = require("./firebase");
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
const SYSTEM_PROMPT = `You are Blue Chip, a premium crypto trading intelligence agent built on the Cabal Ventures platform.

## Identity
- Sharp, confident, data-first. You think in setups, not narratives.
- You track market structure, liquidity zones, and macro flows.
- You never hype. You give edge.

## Slash Commands
When a user sends a slash command, respond in this exact style:

/status → Report your operational status. Include: uptime, market regime (risk-on / risk-off / neutral), any active alerts or themes you are tracking.
/positions → List current tracked positions in a clean table: Asset | Direction | Entry | Current | PnL% | Thesis (1 line). If no live positions, state that clearly.
/pnl → Session P&L summary. Total return, win rate, avg winner vs avg loser, best trade, worst trade.
/summary → Daily market briefing. BTC dominance, major movers, key macro events today, 1-2 trade ideas with setups.
/agents → List connected agents in the Cabal network and their current focus.
/help → Show all available commands with a one-line description each.

## Behavior Rules
- Keep replies concise and structured. Use tables when showing data.
- Lead with the number or the signal — never with 'Great question!'
- If you don't have live data for a command, say so and give your best analysis based on current market context.
- For general questions about markets, crypto, or trading — answer as a professional trader would.
- Never use: 'game-changing', 'to the moon', 'DYOR', 'NFA'.
- Platform: cabal.ventures | Powered by Cabal intelligence stack.`;
async function writeReply(agentId, content) {
    await firebase_1.db.collection('agents').doc(agentId).collection('messages').add({
        agent_id: agentId,
        user_id: agentId,
        direction: 'outbound',
        content,
        created_at: firebase_1.FieldValue.serverTimestamp(),
    });
}
function startChatListener(agentId) {
    console.log(`[blue-chip] starting listener for agent: ${agentId}`);
    const startTimestamp = firestore_1.Timestamp.now();
    const processed = new Set();
    const MESSAGES_COL = firebase_1.db.collection('agents').doc(agentId).collection('messages');
    MESSAGES_COL
        .where('direction', '==', 'inbound')
        .where('created_at', '>=', startTimestamp)
        .onSnapshot(async (snap) => {
        const added = snap.docChanges().filter(c => c.type === 'added');
        console.log(`[blue-chip:${agentId}] snapshot: ${added.length} new messages`);
        for (const change of added) {
            if (processed.has(change.doc.id))
                continue;
            processed.add(change.doc.id);
            const msg = change.doc.data();
            const userText = msg.content;
            if (!userText?.trim())
                continue;
            console.log(`[blue-chip:${agentId}] user: ${userText}`);
            try {
                const response = await openai.chat.completions.create({
                    model: 'gpt-4o',
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        { role: 'user', content: userText },
                    ],
                });
                const reply = response.choices[0]?.message?.content;
                if (reply?.trim()) {
                    console.log(`[blue-chip:${agentId}] reply: ${reply.slice(0, 80)}...`);
                    await writeReply(agentId, reply.trim());
                }
            }
            catch (err) {
                console.error(`[blue-chip:${agentId}] error:`, err);
                await writeReply(agentId, 'Error processing your message. Try again.');
            }
        }
    }, (err) => console.error(`[blue-chip:${agentId}] snapshot error:`, err));
}
