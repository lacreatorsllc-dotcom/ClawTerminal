"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startChatListener = startChatListener;
const openai_1 = __importDefault(require("openai"));
const firebase_1 = require("./firebase");
const api_1 = require("./api");
const cache_1 = require("./cache");
function makeAIClient(apiKey) {
    if (apiKey.startsWith('AIza')) {
        // Google Gemini — uses OpenAI-compatible endpoint
        return {
            client: new openai_1.default({
                apiKey,
                baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
            }),
            model: 'gemini-2.0-flash',
        };
    }
    if (apiKey.startsWith('sk-ant-')) {
        // Anthropic Claude via their OpenAI-compatible layer (if available)
        return { client: new openai_1.default({ apiKey }), model: 'gpt-4o' };
    }
    // Default: OpenAI
    return { client: new openai_1.default({ apiKey }), model: 'gpt-4o' };
}
async function writeReply(firestoreAgentId, content) {
    await firebase_1.db.collection('agents').doc(firestoreAgentId).collection('messages').add({
        direction: 'outbound',
        content,
        agent_id: firestoreAgentId,
        user_id: firestoreAgentId,
        created_at: firebase_1.FieldValue.serverTimestamp(),
    });
}
function stateEmoji(state) {
    if (!state)
        return '❓';
    const s = state.toUpperCase();
    if (s === 'IDLE')
        return '💤';
    if (s === 'ACTIVE' || s === 'SCANNING')
        return '🔍';
    if (s === 'TRADING')
        return '⚡';
    if (s === 'PAUSED')
        return '⏸️';
    return '🤖';
}
async function handleAgents(firestoreAgentId) {
    // Get user_id from this agent doc
    const thisDoc = await firebase_1.db.collection('agents').doc(firestoreAgentId).get();
    const userId = thisDoc.data()?.user_id;
    if (!userId) {
        await writeReply(firestoreAgentId, 'Could not find your agents.');
        return;
    }
    // Query all trading boy agents for this user
    const snap = await firebase_1.db
        .collection('agents')
        .where('user_id', '==', userId)
        .where('agent_type', '==', 'cabal_trading_boy')
        .get();
    if (snap.empty) {
        await writeReply(firestoreAgentId, 'No active agents found.');
        return;
    }
    const lines = ['🤖 Active Agents\n'];
    for (const doc of snap.docs) {
        const d = doc.data();
        const live = d.live_state ?? {};
        const state = live.state ?? 'UNKNOWN';
        const watchlist = d.watchlist ?? [];
        const positions = live.openPositions ?? [];
        const pnl = live.dailyPnlUsd ?? 0;
        const paused = d.live_admin?.paused === true;
        lines.push(`${stateEmoji(paused ? 'PAUSED' : state)} ${d.name ?? 'Agent'}` +
            (paused ? ' (paused)' : '') +
            `\n  State: ${paused ? 'PAUSED' : state}` +
            `\n  Watchlist: ${watchlist.length} tokens` +
            `\n  Open: ${positions.length} positions` +
            `\n  Daily PnL: $${Number(pnl).toFixed(2)}`);
    }
    await writeReply(firestoreAgentId, lines.join('\n\n'));
}
async function handleStatus(firestoreAgentId, agentName) {
    const cached = (0, cache_1.getCached)(firestoreAgentId);
    const live = cached?.liveState ?? (await firebase_1.db.collection('agents').doc(firestoreAgentId).get()).data()?.live_state ?? {};
    const admin = cached?.liveAdmin ?? {};
    const state = live.state ?? 'UNKNOWN';
    const paused = admin.paused === true;
    const positions = live.openPositions ?? [];
    const pnl = live.dailyPnlUsd ?? 0;
    const trades = live.dailyTradeCount ?? 0;
    const setups = live.activeConditionalSetups ?? 0;
    const watchlist = cached?.watchlist ?? [];
    const lastSync = cached ? new Date(cached.updatedAt ?? Date.now()).toLocaleTimeString() : 'unknown';
    let unrealized = 0;
    for (const p of positions) {
        unrealized += Number(p.unrealizedPnl ?? p.pnl ?? 0);
    }
    const sign = (n) => (n >= 0 ? '+' : '');
    const reply = `${stateEmoji(paused ? 'PAUSED' : state)} ${agentName} — ${paused ? 'PAUSED' : state}\n\n` +
        `📋 Watchlist: ${watchlist.length} tokens\n` +
        `📊 Open positions: ${positions.length}\n` +
        `📈 Daily PnL: ${sign(Number(pnl))}$${Number(pnl).toFixed(2)}\n` +
        `💸 Unrealized PnL: ${sign(unrealized)}$${unrealized.toFixed(2)}\n` +
        `🔢 Daily trades: ${trades}\n` +
        `🎯 Active setups: ${setups}\n` +
        `🕐 Last sync: ${lastSync}`;
    await writeReply(firestoreAgentId, reply);
}
async function handlePositions(firestoreAgentId) {
    const cached = (0, cache_1.getCached)(firestoreAgentId);
    const live = cached?.liveState ?? (await firebase_1.db.collection('agents').doc(firestoreAgentId).get()).data()?.live_state ?? {};
    const positions = live.openPositions ?? [];
    if (positions.length === 0) {
        await writeReply(firestoreAgentId, '📊 No open positions.');
        return;
    }
    const lines = ['📊 Open Positions\n'];
    for (const p of positions) {
        const pnl = p.unrealizedPnl ?? p.pnl ?? 0;
        const sign = pnl >= 0 ? '+' : '';
        lines.push(`${p.symbol ?? p.token} ${p.direction ?? ''}\n` +
            `  Entry: $${p.entryPrice ?? '—'}\n` +
            `  Current: $${p.currentPrice ?? p.markPrice ?? '—'}\n` +
            `  PnL: ${sign}$${Number(pnl).toFixed(2)}`);
    }
    await writeReply(firestoreAgentId, lines.join('\n\n'));
}
async function handleDecisions(firestoreAgentId, limit = 5) {
    const snap = await firebase_1.db
        .collection('agents').doc(firestoreAgentId).collection('decisions')
        .orderBy('eventTime', 'desc')
        .limit(limit)
        .get();
    if (snap.empty) {
        await writeReply(firestoreAgentId, '📝 No recent decisions.');
        return;
    }
    const lines = [`📝 Last ${snap.size} Decisions\n`];
    for (const doc of snap.docs) {
        const d = doc.data();
        const action = d.actionType ?? d.decisionType ?? '?';
        const tag = d.emotionalTag ? ` [${d.emotionalTag}]` : '';
        lines.push(`${action} ${d.tokenSymbol ?? ''}${tag}\n` +
            `  ${d.details ?? ''}\n` +
            `  Confidence: ${d.confidence ?? '?'}% · ${d.eventTime ? new Date(d.eventTime).toLocaleDateString() : ''}`);
    }
    await writeReply(firestoreAgentId, lines.join('\n\n'));
}
async function handlePnl(firestoreAgentId, agentName) {
    const cached = (0, cache_1.getCached)(firestoreAgentId);
    const live = cached?.liveState ?? (await firebase_1.db.collection('agents').doc(firestoreAgentId).get()).data()?.live_state ?? {};
    const pnl = live.dailyPnlUsd ?? 0;
    const trades = live.dailyTradeCount ?? 0;
    const positions = live.openPositions ?? [];
    let unrealized = 0;
    for (const p of positions) {
        unrealized += Number(p.unrealizedPnl ?? p.pnl ?? 0);
    }
    const sign = (n) => (n >= 0 ? '+' : '');
    const reply = `💰 ${agentName} PnL\n\n` +
        `Daily realized: ${sign(pnl)}$${Number(pnl).toFixed(2)}\n` +
        `Unrealized: ${sign(unrealized)}$${unrealized.toFixed(2)}\n` +
        `Daily trades: ${trades}\n` +
        `Open positions: ${positions.length}`;
    await writeReply(firestoreAgentId, reply);
}
async function handleSummary(firestoreAgentId, agentName) {
    const cached = (0, cache_1.getCached)(firestoreAgentId);
    const live = cached?.liveState ?? (await firebase_1.db.collection('agents').doc(firestoreAgentId).get()).data()?.live_state ?? {};
    const admin = cached?.liveAdmin ?? {};
    const state = live.state ?? 'UNKNOWN';
    const pnl = live.dailyPnlUsd ?? 0;
    const trades = live.dailyTradeCount ?? 0;
    const setups = live.activeConditionalSetups ?? 0;
    const positions = live.openPositions ?? [];
    const watchlist = cached?.watchlist ?? [];
    const paused = admin.paused === true;
    const decisionsSnap = await firebase_1.db
        .collection('agents').doc(firestoreAgentId).collection('decisions')
        .orderBy('eventTime', 'desc').limit(3).get();
    const latestDecisions = decisionsSnap.docs.map((dd) => {
        const dec = dd.data();
        return `  · ${dec.actionType ?? '?'} ${dec.tokenSymbol ?? ''} (${dec.confidence ?? '?'}%)`;
    });
    const lines = [
        `📋 ${agentName} Daily Summary`,
        ``,
        `State: ${paused ? 'PAUSED' : state}`,
        `Watchlist: ${watchlist.length} tokens`,
        `Trades today: ${trades}`,
        `Daily PnL: $${Number(pnl).toFixed(2)}`,
        `Open positions: ${positions.length}`,
        `Active setups: ${setups}`,
    ];
    if (latestDecisions.length > 0) {
        lines.push(`\nRecent decisions:`);
        lines.push(...latestDecisions);
    }
    await writeReply(firestoreAgentId, lines.join('\n'));
}
function handleHelp(firestoreAgentId, agentName) {
    const msg = `🤖 ${agentName} Commands\n\n` +
        `/status — Agent status & health\n` +
        `/agents — All your active agents\n` +
        `/positions — Open positions\n` +
        `/decisions — Recent trade decisions\n` +
        `/pnl — Daily profit & loss\n` +
        `/summary — Daily activity summary\n` +
        `/analyze-slug001 — AI analysis of the Range Farmer\n` +
        `/pause — Pause this agent\n` +
        `/resume — Resume this agent\n` +
        `/override <text> — Send instruction to agent`;
    return writeReply(firestoreAgentId, msg);
}
async function handleAnalyzeSlug001(firestoreAgentId, agentName, ai) {
    if (!ai) {
        await writeReply(firestoreAgentId, 'AI key required to run analysis. Add a Gemini or OpenAI key in Deploy settings.');
        return;
    }
    const slugDoc = await firebase_1.db.collection('agents').doc('slug-001').get();
    const s = slugDoc.data();
    if (!s) {
        await writeReply(firestoreAgentId, '⚠️ Could not fetch Slug #001 data.');
        return;
    }
    const tradesSnap = await firebase_1.db
        .collection('agents').doc('slug-001').collection('trades')
        .orderBy('created_at', 'desc').limit(10).get();
    const tradeLines = tradesSnap.docs.map((d) => {
        const t = d.data();
        return `  ${(t.side ?? '?').toUpperCase()} ${t.qty} BTC @ $${Math.round(t.fillPrice ?? 0).toLocaleString()} · PnL ${t.pnl != null ? (t.pnl >= 0 ? '+' : '') + '$' + Number(t.pnl).toFixed(2) : 'n/a'}`;
    });
    const positions = s.positions ?? [];
    const sessionPnl = s.session_pnl ?? 0;
    const totalFills = s.total_fills ?? 0;
    const regime = s.regime ?? 'unknown';
    const btcPrice = s.btc_price ?? 0;
    const gridCenter = s.grid_center ?? 0;
    const context = `SLUG #001 — RANGE FARMER (Paper BTC Grid)\n` +
        `Status: ${(s.status ?? 'unknown').toUpperCase()} | Regime: ${regime.toUpperCase()}\n` +
        `BTC: $${Math.round(btcPrice).toLocaleString()} | Grid center: $${Math.round(gridCenter).toLocaleString()}\n` +
        `Grid: ${s.grid_levels ?? '?'} levels × ${s.grid_spacing_pct ?? '?'}% spacing\n` +
        `Session PnL: ${sessionPnl >= 0 ? '+' : ''}$${Number(sessionPnl).toFixed(2)} | Fills: ${totalFills}\n` +
        `Open positions: ${positions.length}\n\n` +
        `RECENT TRADES:\n${tradeLines.length > 0 ? tradeLines.join('\n') : '  None yet.'}\n\n` +
        `OPEN POSITIONS:\n${positions.length > 0
            ? positions.map((p) => {
                const pnl = (p.currentPrice - p.fillPrice) * p.qty * (p.side === 'sell' ? -1 : 1);
                return `  ${(p.side ?? '?').toUpperCase()} ${p.qty} BTC @ $${Math.round(p.fillPrice).toLocaleString()} · Unrealized ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`;
            }).join('\n')
            : '  None.'}`;
    const prompt = `You are ${agentName}, a professional crypto trading agent analyzing a sister bot called Slug #001 that runs a BTC grid (range farming) strategy.\n\n` +
        `Current state:\n${context}\n\n` +
        `Provide a concise analysis covering:\n` +
        `1. Performance — is the grid generating healthy PnL for a range farmer?\n` +
        `2. Market fit — does the current regime suit this strategy?\n` +
        `3. Grid config — is the center/spacing appropriate for current BTC price?\n` +
        `4. Position risk — any concerns with open positions?\n` +
        `5. Verdict — one concrete recommendation.\n\n` +
        `Be direct, data-first. 2-4 sentences per section.`;
    try {
        const completion = await ai.client.chat.completions.create({ model: ai.model, messages: [{ role: 'user', content: prompt }], max_tokens: 700 }, { timeout: 40000 });
        const reply = completion.choices[0]?.message?.content ?? 'No response.';
        await writeReply(firestoreAgentId, `🔬 Slug #001 Analysis\n\n${reply}`);
    }
    catch (err) {
        console.error(`[chat:${firestoreAgentId}] analyze error:`, err?.message ?? err);
        await writeReply(firestoreAgentId, 'Analysis failed. Try again.');
    }
}
function startChatListener(firestoreAgentId, apiKey, tbAgentId, agentName, openaiApiKey) {
    const ai = openaiApiKey ? makeAIClient(openaiApiKey) : null;
    const processedIds = new Set();
    let initialized = false;
    const messagesRef = firebase_1.db.collection('agents').doc(firestoreAgentId).collection('messages');
    const q = messagesRef.orderBy('created_at', 'asc');
    console.log(`[chat:${firestoreAgentId}] listener starting for ${agentName}`);
    q.onSnapshot(async (snap) => {
        if (!initialized) {
            for (const doc of snap.docs)
                processedIds.add(doc.id);
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
            if (msgData.direction !== 'inbound')
                continue;
            const text = (msgData.content ?? '').trim();
            if (!text)
                continue;
            console.log(`[chat:${firestoreAgentId}] received: ${text}`);
            try {
                // Hard-coded slash commands (no LLM needed)
                if (text === '/pause') {
                    await (0, api_1.pauseAgent)(apiKey, tbAgentId);
                    await writeReply(firestoreAgentId, `⏸️ ${agentName} paused.`);
                    continue;
                }
                if (text === '/resume') {
                    await (0, api_1.resumeAgent)(apiKey, tbAgentId);
                    await writeReply(firestoreAgentId, `▶️ ${agentName} resumed.`);
                    continue;
                }
                if (text.startsWith('/override ')) {
                    const instruction = text.slice('/override '.length).trim();
                    if (!instruction) {
                        await writeReply(firestoreAgentId, 'Usage: /override <instruction>');
                        continue;
                    }
                    await (0, api_1.overrideAgent)(apiKey, tbAgentId, instruction);
                    await writeReply(firestoreAgentId, `🎯 Override sent: "${instruction}"`);
                    continue;
                }
                if (text === '/agents') {
                    await handleAgents(firestoreAgentId);
                    continue;
                }
                if (text === '/status') {
                    await handleStatus(firestoreAgentId, agentName);
                    continue;
                }
                if (text === '/positions') {
                    await handlePositions(firestoreAgentId);
                    continue;
                }
                if (text === '/decisions' || text === '/review') {
                    await handleDecisions(firestoreAgentId);
                    continue;
                }
                if (text === '/pnl') {
                    await handlePnl(firestoreAgentId, agentName);
                    continue;
                }
                if (text === '/summary') {
                    await handleSummary(firestoreAgentId, agentName);
                    continue;
                }
                if (text === '/help') {
                    await handleHelp(firestoreAgentId, agentName);
                    continue;
                }
                if (text === '/analyze-slug001') {
                    await handleAnalyzeSlug001(firestoreAgentId, agentName, ai);
                    continue;
                }
                // Free-form text — use LLM if key available
                if (!ai) {
                    await writeReply(firestoreAgentId, `Use /help to see available commands.`);
                    continue;
                }
                const cached = (0, cache_1.getCached)(firestoreAgentId);
                const live = cached?.liveState ?? (await firebase_1.db.collection('agents').doc(firestoreAgentId).get()).data()?.live_state ?? {};
                const agentState = live.state ?? 'UNKNOWN';
                const positions = live.openPositions ?? [];
                const pnl = live.dailyPnlUsd ?? 0;
                const trades = live.dailyTradeCount ?? 0;
                const decisionsSnap = await firebase_1.db
                    .collection('agents').doc(firestoreAgentId).collection('decisions')
                    .orderBy('eventTime', 'desc').limit(10).get();
                const decisions = decisionsSnap.docs.map((d) => d.data());
                // Load recent conversation history for memory
                const historySnap = await firebase_1.db
                    .collection('agents').doc(firestoreAgentId).collection('messages')
                    .orderBy('created_at', 'desc').limit(20).get();
                const history = historySnap.docs
                    .map((d) => d.data())
                    .reverse() // oldest first
                    .filter((m) => m.content && m.content !== text) // exclude current message
                    .slice(-14); // last 14 messages (7 exchanges)
                const system = `You are ${agentName}, a fully autonomous crypto trading agent on Cabal Ventures.

STATE: ${agentState} | Positions: ${positions.length} | Daily PnL: $${Number(pnl).toFixed(2)} | Trades: ${trades}

RECENT DECISIONS:
${decisions.length > 0 ? decisions.map((d) => `[${d.eventTime}] ${d.tokenSymbol} ${d.actionType} (${d.confidence}%): ${d.details}`).join('\n') : 'None.'}

Be concise and data-driven. Plain text only. Never fabricate data. Remember prior conversation context.`;
                // Build messages array with conversation history
                const messages = [
                    { role: 'system', content: system },
                    ...history.map((m) => ({
                        role: (m.direction === 'inbound' ? 'user' : 'assistant'),
                        content: m.content,
                    })),
                    { role: 'user', content: text },
                ];
                // Attempt with one retry on 429
                let completion;
                try {
                    completion = await ai.client.chat.completions.create({ model: ai.model, messages, max_tokens: 400 }, { timeout: 30000 });
                }
                catch (firstErr) {
                    if (firstErr?.status === 429 || firstErr?.message?.includes('429')) {
                        console.warn(`[chat:${firestoreAgentId}] 429 rate limit, retrying in 15s...`);
                        await new Promise((r) => setTimeout(r, 15000));
                        completion = await ai.client.chat.completions.create({ model: ai.model, messages, max_tokens: 400 }, { timeout: 30000 });
                    }
                    else {
                        throw firstErr;
                    }
                }
                await writeReply(firestoreAgentId, completion.choices[0]?.message?.content ?? 'No response.');
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
