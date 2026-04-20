"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runChatReply = runChatReply;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const firebase_1 = require("./firebase");
const tools_1 = require("./tools");
const CHAT_SYSTEM_PROMPTS = {
    'Grid Trader': 'You are a grid trading agent. Answer questions about your grid strategy, current positions, and market conditions concisely.',
    'Momentum': 'You are a momentum trading agent. Answer questions about price trends, your positions, and momentum signals.',
    'DCA': 'You are a DCA agent. Answer questions about your dollar-cost averaging approach and current cost basis.',
    'Breakout': 'You are a breakout trading agent. Answer questions about support/resistance levels and your positions.',
    'Custom': 'You are a custom trading agent. Answer questions based on your configured strategy.',
    'News Sentiment': 'You are a news sentiment agent. Answer questions about recent market news, sentiment trends, and which markets you are tracking.',
};
async function runChatReply(agentId, messageId, userMessage) {
    const agentRef = firebase_1.db.doc(`agents/${agentId}`);
    const agentSnap = await agentRef.get();
    if (!agentSnap.exists)
        return;
    const agent = agentSnap.data();
    if (agent.status === 'disabled')
        return;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey)
        return;
    // Fetch recent chat history (last 20 messages for context)
    const historySnap = await firebase_1.db
        .collection(`agents/${agentId}/messages`)
        .orderBy('created_at', 'desc')
        .limit(20)
        .get();
    const history = historySnap.docs
        .map(d => d.data())
        .reverse()
        .filter(m => m.id !== messageId);
    const strategy = agent.strategy ?? agent.metadata?.strategy ?? 'Grid Trader';
    const coin = agent.coin ?? agent.metadata?.coin ?? 'BTC';
    const agentName = agent.name ?? 'Agent';
    const basePrompt = CHAT_SYSTEM_PROMPTS[strategy] ?? CHAT_SYSTEM_PROMPTS['Grid Trader'];
    const systemPrompt = `You are "${agentName}", an autonomous crypto agent on the SLUGS platform.
Strategy: ${strategy} | Asset: ${coin}
${basePrompt}

Keep replies concise (under 200 chars when possible). Be direct and personable.
You have access to tools — use get_price or get_portfolio if the user asks about current data.
Current time: ${new Date().toISOString()}`;
    const messages = [];
    // Add history as alternating user/assistant turns
    for (const msg of history) {
        if (msg.direction === 'inbound') {
            messages.push({ role: 'user', content: msg.content });
        }
        else if (msg.direction === 'outbound') {
            messages.push({ role: 'assistant', content: msg.content });
        }
    }
    // Add the new user message
    messages.push({ role: 'user', content: userMessage });
    const client = new sdk_1.default({ apiKey });
    try {
        let replyText = '';
        let iterations = 0;
        const MAX_ITERATIONS = 3;
        while (iterations < MAX_ITERATIONS) {
            iterations++;
            const response = await client.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 512,
                system: systemPrompt,
                tools: tools_1.AGENT_TOOLS,
                messages,
            });
            messages.push({ role: 'assistant', content: response.content });
            if (response.stop_reason === 'end_turn') {
                const textBlock = response.content.find(b => b.type === 'text');
                replyText = textBlock ? textBlock.text : '';
                break;
            }
            if (response.stop_reason === 'tool_use') {
                const toolResults = [];
                for (const block of response.content) {
                    if (block.type === 'tool_use') {
                        const toolResult = await (0, tools_1.executeTool)(block.name, block.input, agentId, agentName, agentSnap);
                        toolResults.push({ ...toolResult, tool_use_id: block.id });
                    }
                }
                if (toolResults.length > 0) {
                    messages.push({ role: 'user', content: toolResults });
                }
                // After tool use, get the final text response
                const finalResponse = await client.messages.create({
                    model: 'claude-haiku-4-5-20251001',
                    max_tokens: 512,
                    system: systemPrompt,
                    tools: tools_1.AGENT_TOOLS,
                    messages,
                });
                const textBlock = finalResponse.content.find(b => b.type === 'text');
                replyText = textBlock ? textBlock.text : '';
                break;
            }
            else {
                break;
            }
        }
        if (!replyText)
            return;
        // Write the reply as an outbound message
        await firebase_1.db.collection(`agents/${agentId}/messages`).add({
            agent_id: agentId,
            user_id: agent.user_id ?? '',
            direction: 'outbound',
            content: replyText,
            created_at: firebase_1.FieldValue.serverTimestamp(),
        });
        console.log(`[chat] ${agentName} replied to ${messageId}`);
    }
    catch (err) {
        console.error(`[chat] ${agentName} error:`, err?.message ?? err);
    }
}
//# sourceMappingURL=chatLoop.js.map