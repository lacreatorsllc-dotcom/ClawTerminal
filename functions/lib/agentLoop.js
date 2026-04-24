"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAgentTick = runAgentTick;
const firebase_1 = require("./firebase");
const tools_1 = require("./tools");
const agentMemory_1 = require("./agentMemory");
const solana_1 = require("./solana");
const llm_1 = require("./llm");
const STRATEGY_PROMPTS = {
    'Grid Trader': 'You are a grid trading agent. Check the current price against your grid center. If price is ranging (within 2%), simulate a grid fill on the appropriate side. If trending (>3% deviation), enter cooldown and post a status update.',
    'Momentum': 'You are a momentum trading agent. Check price and 24h change. Enter long on strong upward momentum (>2% up), exit on reversal signals. Enter short on strong downward momentum (>2% down). Post your reasoning.',
    'DCA': 'You are a dollar-cost averaging agent. Check the current price. If no open position exists for this cycle, execute a small buy. Post an update with current avg cost basis.',
    'Breakout': 'You are a breakout trading agent. Check the 24h high/low range. If price is within 0.5% of the 24h high with volume confirmation, enter long. If near 24h low, consider short. Post analysis.',
    'Custom': 'You are a custom trading agent. Follow your configured strategy description. Analyze current market conditions and decide whether to trade, hold, or post an update.',
    'News Sentiment': 'You are a news sentiment agent. You DO NOT place trades. Fetch recent market news, analyze sentiment for each affected market, and post a clear news_sentiment update summarizing what happened and what it means for traders.',
};
function hasNewsSkill(agent) {
    const skills = agent.skills ?? agent.metadata?.skills ?? [];
    const strategy = agent.strategy ?? agent.metadata?.strategy ?? '';
    return skills.includes('news_sentiment') || strategy === 'News Sentiment';
}
function buildSystemPrompt(agent) {
    const strategy = agent.strategy ?? agent.metadata?.strategy ?? 'Grid Trader';
    const skills = agent.skills ?? agent.metadata?.skills ?? [];
    const coin = agent.coin ?? agent.metadata?.coin ?? 'BTC';
    const customDesc = agent.custom_description ?? agent.metadata?.customDescription ?? '';
    const liveTradingEnabled = (0, solana_1.isLiveTradingEnabled)(agent);
    const liveTradingArmed = (0, solana_1.isLiveTradingArmed)(agent);
    const fundingContext = liveTradingEnabled
        ? 'This agent is LIVE-FUNDED. Trades should use the funded agent wallet and execute for real when you call paper_trade.'
        : liveTradingArmed
            ? 'This agent is LIVE-READY. Stay simulated until funds arrive in the dedicated agent wallet, then use the agent wallet for real execution.'
            : 'This agent is in PAPER mode. Trades should stay simulated until the user asks you to go live and funds arrive in the dedicated agent wallet.';
    const newsContext = hasNewsSkill(agent)
        ? '\nNews workflow: on every tick, call get_recent_news for your tracked asset plus BTC/ETH/SOL when relevant. If there is meaningful new information, call post_update with type=news_sentiment so it appears in the public feed. Use the article headline as the main user-facing message and include payload fields for headline, summary, body, url, source, sentiment, and markets so people can tap through and read more in-app.'
        : '';
    const basePrompt = STRATEGY_PROMPTS[strategy] ?? STRATEGY_PROMPTS['Grid Trader'];
    const skillContext = skills.length > 0
        ? `\nEquipped skills: ${skills.join(', ')}. Use these to enhance your decisions.`
        : '';
    const customContext = customDesc ? `\nCustom strategy instructions: ${customDesc}` : '';
    return `You are "${agent.name}", an autonomous crypto agent running on the SLUGS platform.

Primary strategy: ${strategy}
Trading asset: ${coin}
${basePrompt}
${skillContext}
${customContext}
${newsContext}
${fundingContext}

Rules:
- Always use get_price before making any trade decision.
- Use get_social_context when social sentiment or market narrative could change the decision.
- Use get_trending_tokens when you need broader market context beyond a single asset.
- Keep post_update content concise (under 280 chars for updates).
- Make ONE decision per tick: trade, post update, or do nothing.
- If you post a news_sentiment update, include payload with headline, summary, body, url, source, sentiment (bullish/bearish/neutral), and markets array.
- News agents describe what happened in the market. They do not fabricate entry, exit, or position details unless a real trading agent actually made a paper trade.
- Do not over-trade. Quality over quantity.
- If you are equipped with the news_sentiment skill, prioritize posting major news updates over placing trades when the news is market-moving.

Current time: ${new Date().toISOString()}`;
}
async function runAgentTick(agentId) {
    const agentRef = firebase_1.db.doc(`agents/${agentId}`);
    const agentSnap = await agentRef.get();
    if (!agentSnap.exists) {
        console.log(`[tick] agent ${agentId} not found`);
        return;
    }
    const agent = await (0, solana_1.syncAgentFundingState)(agentId, agentSnap.data());
    if (agent.status === 'paused' || agent.status === 'disabled') {
        console.log(`[tick] agent ${agentId} is ${agent.status}, skipping`);
        return;
    }
    const providerConfig = await (0, llm_1.resolveAgentProvider)(agent, process.env.ANTHROPIC_API_KEY, process.env.GEMINI_API_KEY);
    if (!providerConfig) {
        console.error(`[tick] no API key available`);
        return;
    }
    const memoryContext = await (0, agentMemory_1.buildAgentMemoryContext)(agentId);
    const systemPrompt = `${buildSystemPrompt(agent)}

AGENT MEMORY:
${memoryContext}

Follow your own strategy and recent decision history. If live-funded, behave consistently with this agent's established trading style instead of improvising a new one.`;
    const agentName = agent.name ?? 'Agent';
    const messages = [
        {
            role: 'user',
            content: 'Execute your next action. Check market conditions and decide what to do this tick.',
        },
    ];
    console.log(`[tick] running ${agentName} (${agentId})`);
    try {
        let iterations = 0;
        const MAX_ITERATIONS = 5;
        if (providerConfig.provider === 'anthropic') {
            const client = (0, llm_1.createAnthropicClient)(providerConfig.apiKey);
            while (iterations < MAX_ITERATIONS) {
                iterations++;
                const response = await client.messages.create({
                    model: (0, llm_1.anthropicModel)(),
                    max_tokens: 1024,
                    system: systemPrompt,
                    tools: tools_1.AGENT_TOOLS,
                    messages,
                });
                messages.push({ role: 'assistant', content: response.content });
                if (response.stop_reason === 'end_turn')
                    break;
                if (response.stop_reason === 'tool_use') {
                    const toolResults = [];
                    for (const block of response.content) {
                        if (block.type === 'tool_use') {
                            console.log(`[tick] ${agentName} → ${block.name}(${JSON.stringify(block.input).slice(0, 80)})`);
                            const toolResult = await (0, tools_1.executeTool)(block.name, block.input, agentId, agentName, agent);
                            toolResults.push({ ...toolResult, tool_use_id: block.id });
                        }
                    }
                    if (toolResults.length > 0) {
                        messages.push({ role: 'user', content: toolResults });
                    }
                }
                else {
                    break;
                }
            }
        }
        else {
            const oaMessages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: 'Execute your next action. Check market conditions and decide what to do this tick.' },
            ];
            while (iterations < MAX_ITERATIONS) {
                iterations++;
                const response = await (0, llm_1.createOpenAiCompatibleResponse)({
                    provider: providerConfig.provider,
                    apiKey: providerConfig.apiKey,
                    messages: oaMessages,
                    tools: (0, llm_1.anthropicToolsToOpenAi)(tools_1.AGENT_TOOLS),
                    maxTokens: 1024,
                });
                oaMessages.push(response.assistantMessage);
                if (response.toolCalls.length === 0)
                    break;
                for (const call of response.toolCalls) {
                    console.log(`[tick] ${agentName} → ${call.name}(${JSON.stringify(call.input).slice(0, 80)})`);
                    const toolResult = await (0, tools_1.executeTool)(call.name, call.input, agentId, agentName, agentSnap);
                    oaMessages.push({
                        role: 'tool',
                        tool_call_id: call.id,
                        content: String(toolResult.content ?? ''),
                    });
                }
            }
        }
        // Update last_tick timestamp
        await agentRef.update({ last_tick: firebase_1.FieldValue.serverTimestamp() });
        console.log(`[tick] ${agentName} done (${iterations} iterations)`);
    }
    catch (err) {
        console.error(`[tick] ${agentName} error:`, err?.message ?? err);
        // Don't throw — let other agents continue
    }
}
//# sourceMappingURL=agentLoop.js.map