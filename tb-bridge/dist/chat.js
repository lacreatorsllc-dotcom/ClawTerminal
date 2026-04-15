"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startChatListener = startChatListener;
exports.startRangeFarmerChatListener = startRangeFarmerChatListener;
exports.startMarketAdvisorChatListener = startMarketAdvisorChatListener;
const openai_1 = __importDefault(require("openai"));
const firebase_1 = require("./firebase");
const api_1 = require("./api");
const cache_1 = require("./cache");
const prices_1 = require("./prices");
function makeAIClient(apiKey) {
    if (apiKey.startsWith('sk-') && !apiKey.startsWith('sk-ant-')) {
        // OpenAI key (sk-... or sk-proj-...)
        return { type: 'openai', client: new openai_1.default({ apiKey }), model: 'gpt-4o' };
    }
    if (apiKey.startsWith('AIza')) {
        // Classic Google AI Studio key — works with OpenAI-compatible shim
        return {
            type: 'openai',
            client: new openai_1.default({
                apiKey,
                baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
            }),
            model: 'gemini-1.5-flash',
        };
    }
    // OAuth-style Google key (AQ...) — must use native Gemini REST API
    return { type: 'gemini-native', apiKey, model: 'gemini-1.5-flash' };
}
async function callAI(ai, messages, maxTokens = 500) {
    if (ai.type === 'openai') {
        const completion = await ai.client.chat.completions.create({ model: ai.model, messages, max_tokens: maxTokens }, { timeout: 30000 });
        return completion.choices[0]?.message?.content ?? 'No response.';
    }
    // Native Gemini REST — convert messages to Gemini format
    const system = messages.find((m) => m.role === 'system')?.content ?? '';
    const contents = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
    }));
    const body = {
        contents,
        generationConfig: { maxOutputTokens: maxTokens },
    };
    if (system)
        body.systemInstruction = { parts: [{ text: system }] };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${ai.model}:generateContent`;
    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ai.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`Gemini ${resp.status}: ${errText.slice(0, 200)}`);
    }
    const data = await resp.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response.';
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
    const fmt = (n) => {
        const sign = n >= 0 ? '+' : '-';
        const color = n >= 0 ? '🟢' : '🔴';
        return `${color} ${sign}$${Math.abs(n).toFixed(2)}`;
    };
    const lines = ['🤖 Active Agents\n'];
    for (const doc of snap.docs) {
        const d = doc.data();
        const live = d.live_state ?? {};
        const state = live.state ?? 'UNKNOWN';
        const watchlist = d.watchlist ?? [];
        const positions = live.openPositions ?? [];
        const pnl = live.dailyPnlUsd ?? 0;
        const unrealized = live.unrealizedPnlUsd ?? 0;
        const paused = d.live_admin?.paused === true;
        lines.push(`${stateEmoji(paused ? 'PAUSED' : state)} ${d.name ?? 'Agent'}` +
            (paused ? ' (paused)' : '') +
            `\n  State: ${paused ? 'PAUSED' : state}` +
            `\n  Watchlist: ${watchlist.length} tokens` +
            `\n  Open: ${positions.length} positions` +
            `\n  Daily PnL: ${fmt(Number(pnl))}` +
            `\n  Unrealized: ${fmt(unrealized)}`);
    }
    await writeReply(firestoreAgentId, lines.join('\n\n'));
}
async function handleStatus(firestoreAgentId, agentName, apiKey, tbAgentId) {
    let live = {};
    let admin = {};
    let watchlist = [];
    let freshData = false;
    // Fetch fresh data directly from API for accurate unrealized PnL
    try {
        const fresh = await (0, api_1.fetchAgentStatus)(apiKey, tbAgentId);
        live = fresh.live?.state ?? {};
        admin = fresh.live?.admin ?? {};
        watchlist = fresh.agent?.watchlist ?? [];
        freshData = true;
    }
    catch {
        const cached = (0, cache_1.getCached)(firestoreAgentId);
        live = cached?.liveState ?? (await firebase_1.db.collection('agents').doc(firestoreAgentId).get()).data()?.live_state ?? {};
        admin = cached?.liveAdmin ?? {};
        watchlist = cached?.watchlist ?? [];
    }
    const state = live.state ?? 'UNKNOWN';
    const paused = admin.paused === true;
    const positions = (await (0, api_1.fetchAgentPositions)(apiKey, tbAgentId)) ?? live.openPositions ?? [];
    // Fetch live prices for all position tokens
    const symbols = positions.map((p) => (p.symbol ?? p.tokenSymbol ?? p.token ?? '').toUpperCase()).filter(Boolean);
    const prices = await (0, prices_1.getCurrentPrices)(symbols);
    const pnl = live.dailyPnlUsd ?? 0;
    const trades = live.dailyTradeCount ?? 0;
    const setups = live.activeConditionalSetups ?? 0;
    const lastSync = freshData ? 'just now' : ((0, cache_1.getCached)(firestoreAgentId) ? new Date((0, cache_1.getCached)(firestoreAgentId).updatedAt ?? Date.now()).toLocaleTimeString() : 'unknown');
    const unrealized = positions.reduce((sum, p) => sum + (0, prices_1.calcUnrealized)(p, prices), 0);
    const fmt = (n) => {
        const sign = n >= 0 ? '+' : '-';
        const color = n >= 0 ? '🟢' : '🔴';
        return `${color} ${sign}$${Math.abs(n).toFixed(2)}`;
    };
    const reply = `${stateEmoji(paused ? 'PAUSED' : state)} ${agentName} — ${paused ? 'PAUSED' : state}\n\n` +
        `📋 Watchlist: ${watchlist.length} tokens\n` +
        `📊 Open positions: ${positions.length}\n` +
        `📈 Daily PnL: ${fmt(Number(pnl))}\n` +
        `💸 Unrealized PnL: ${fmt(unrealized)}\n` +
        `🔢 Daily trades: ${trades}\n` +
        `🎯 Active setups: ${setups}\n` +
        `🕐 Last sync: ${lastSync}`;
    await writeReply(firestoreAgentId, reply);
}
async function handlePositions(firestoreAgentId, apiKey, tbAgentId) {
    let positions = [];
    try {
        const fresh = await (0, api_1.fetchAgentStatus)(apiKey, tbAgentId);
        positions = fresh.live?.state?.openPositions ?? [];
    }
    catch {
        const cached = (0, cache_1.getCached)(firestoreAgentId);
        const live = cached?.liveState ?? (await firebase_1.db.collection('agents').doc(firestoreAgentId).get()).data()?.live_state ?? {};
        positions = live.openPositions ?? [];
    }
    if (positions.length === 0) {
        await writeReply(firestoreAgentId, '📊 No open positions.');
        return;
    }
    const syms = positions.map((p) => (p.symbol ?? p.tokenSymbol ?? '').toUpperCase()).filter(Boolean);
    const prices = await (0, prices_1.getCurrentPrices)(syms);
    const lines = ['📊 Open Positions\n'];
    for (const p of positions) {
        const sym = (p.symbol ?? p.tokenSymbol ?? p.token ?? '?').toUpperCase();
        const currentPrice = prices.get(sym);
        const pnl = (0, prices_1.calcUnrealized)(p, prices);
        const sign = pnl >= 0 ? '+' : '';
        lines.push(`${sym} ${p.direction ?? p.side ?? ''}\n` +
            `  Entry: $${p.entryPrice ?? '—'} · Current: $${currentPrice?.toFixed(4) ?? '—'}\n` +
            `  Size: $${p.sizeUsd ?? '—'} · Unrealized: ${sign}$${Number(pnl).toFixed(2)}`);
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
async function handlePnl(firestoreAgentId, agentName, apiKey, tbAgentId) {
    let live = {};
    try {
        const fresh = await (0, api_1.fetchAgentStatus)(apiKey, tbAgentId);
        live = fresh.live?.state ?? {};
    }
    catch {
        const cached = (0, cache_1.getCached)(firestoreAgentId);
        live = cached?.liveState ?? (await firebase_1.db.collection('agents').doc(firestoreAgentId).get()).data()?.live_state ?? {};
    }
    const pnl = live.dailyPnlUsd ?? 0;
    const trades = live.dailyTradeCount ?? 0;
    const positions = (await (0, api_1.fetchAgentPositions)(apiKey, tbAgentId)) ?? live.openPositions ?? [];
    const syms = positions.map((p) => (p.symbol ?? p.tokenSymbol ?? '').toUpperCase()).filter(Boolean);
    const prices = await (0, prices_1.getCurrentPrices)(syms);
    const unrealized = positions.reduce((sum, p) => sum + (0, prices_1.calcUnrealized)(p, prices), 0);
    const fmt = (n) => {
        const sign = n >= 0 ? '+' : '-';
        const color = n >= 0 ? '🟢' : '🔴';
        return `${color} ${sign}$${Math.abs(n).toFixed(2)}`;
    };
    const reply = `💰 ${agentName} PnL\n\n` +
        `Daily realized: ${fmt(Number(pnl))}\n` +
        `Unrealized: ${fmt(unrealized)}\n` +
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
        const reply = await callAI(ai, [{ role: 'user', content: prompt }], 700);
        await writeReply(firestoreAgentId, `🔬 Slug #001 Analysis\n\n${reply}`);
    }
    catch (err) {
        console.error(`[chat:${firestoreAgentId}] analyze error:`, err?.message ?? err);
        await writeReply(firestoreAgentId, 'Analysis failed. Try again.');
    }
}
const pendingTrades = new Map();
// ── Build full portfolio context from ALL user agents ─────────────────────────
async function buildAllAgentsContext(userId, excludeAgentId) {
    const snap = await firebase_1.db.collection('agents').where('user_id', '==', userId).get();
    const sections = [];
    for (const docSnap of snap.docs) {
        if (excludeAgentId && docSnap.id === excludeAgentId)
            continue;
        const d = docSnap.data();
        if (d.agent_type === 'market_advisor')
            continue; // skip advisory agents
        const name = d.name ?? 'Agent';
        const unrealized = d.live_state?.unrealizedPnlUsd ?? 0;
        const daily = d.live_state?.dailyPnlUsd ?? 0;
        const positions = d.live_state?.openPositions ?? [];
        const state = d.live_state?.state ?? d.status ?? 'unknown';
        // Recent decisions
        const decisionsSnap = await firebase_1.db
            .collection('agents').doc(docSnap.id).collection('decisions')
            .orderBy('eventTime', 'desc').limit(5).get();
        const decLines = decisionsSnap.docs.map((dd) => {
            const dec = dd.data();
            const ts = dec.eventTime ? new Date(dec.eventTime).toLocaleDateString() : '?';
            return `  [${ts}] ${dec.actionType ?? dec.decisionType ?? '?'} ${dec.tokenSymbol ?? ''} (${dec.confidence ?? 0}% conf): ${(dec.details ?? '').slice(0, 100)}`;
        }).join('\n');
        const posLines = positions.map((p) => `  ${p.direction ?? 'LONG'} ${(p.symbol ?? p.tokenSymbol ?? '?').toUpperCase()} entry $${p.entryPrice ?? '?'} size $${p.sizeUsd ?? '?'}`).join('\n');
        sections.push(`AGENT: ${name} (${state.toUpperCase()})\n` +
            `Daily PnL: $${Number(daily).toFixed(2)} | Unrealized: ${unrealized >= 0 ? '+' : ''}$${Number(unrealized).toFixed(2)}\n` +
            `Open positions (${positions.length}):${posLines ? '\n' + posLines : ' none'}\n` +
            `Recent decisions:${decLines ? '\n' + decLines : ' none'}`);
    }
    // Also include Slug #001 if accessible
    try {
        const slug001 = (await firebase_1.db.collection('agents').doc('slug-001').get()).data();
        if (slug001) {
            const sPositions = slug001.positions ?? [];
            sections.push(`AGENT: Slug #001 — Range Farmer (PAPER)\n` +
                `BTC: $${Math.round(slug001.btc_price ?? 0).toLocaleString()} | Regime: ${slug001.regime ?? 'unknown'}\n` +
                `Session PnL: ${(slug001.session_pnl ?? 0) >= 0 ? '+' : ''}$${Number(slug001.session_pnl ?? 0).toFixed(2)} | Fills: ${slug001.total_fills ?? 0}\n` +
                `Open positions: ${sPositions.length}`);
        }
    }
    catch { /* non-fatal */ }
    return sections.length > 0 ? sections.join('\n\n---\n\n') : 'No active agents with data yet.';
}
// ── Build live agent context for AI system prompt ─────────────────────────────
async function buildLiveContext(firestoreAgentId, agentName, apiKey, tbAgentId) {
    let live = {};
    let admin = {};
    let watchlist = [];
    try {
        const fresh = await (0, api_1.fetchAgentStatus)(apiKey, tbAgentId);
        live = fresh.live?.state ?? {};
        admin = fresh.live?.admin ?? {};
        watchlist = fresh.agent?.watchlist ?? [];
    }
    catch {
        const cached = (0, cache_1.getCached)(firestoreAgentId);
        live = cached?.liveState ?? {};
        admin = cached?.liveAdmin ?? {};
        watchlist = cached?.watchlist ?? [];
    }
    const state = live.state ?? 'UNKNOWN';
    const paused = admin.paused === true;
    let positions = live.openPositions ?? [];
    try {
        const fetched = await (0, api_1.fetchAgentPositions)(apiKey, tbAgentId);
        if (Array.isArray(fetched))
            positions = fetched;
    }
    catch { /* use cached fallback from live state */ }
    const pnl = live.dailyPnlUsd ?? 0;
    const trades = live.dailyTradeCount ?? 0;
    const syms = positions.map((p) => (p.symbol ?? p.tokenSymbol ?? '').toUpperCase()).filter(Boolean);
    const prices = await (0, prices_1.getCurrentPrices)(syms);
    const positionLines = positions.length > 0
        ? positions.map((p) => {
            const sym = (p.symbol ?? p.tokenSymbol ?? p.token ?? '?').toUpperCase();
            const currentPrice = prices.get(sym);
            const upnl = (0, prices_1.calcUnrealized)(p, prices);
            const sign = upnl >= 0 ? '+' : '';
            return `  ${p.direction ?? 'LONG'} ${sym} | Entry: $${p.entryPrice ?? '?'} | Current: $${currentPrice?.toFixed(4) ?? '?'} | Size: $${p.sizeUsd ?? '?'} | Unrealized: ${sign}$${upnl.toFixed(2)} | SL: $${p.stopLoss ?? '?'} | TP: $${p.takeProfit ?? '?'}`;
        }).join('\n')
        : '  None';
    const decisionsSnap = await firebase_1.db
        .collection('agents').doc(firestoreAgentId).collection('decisions')
        .orderBy('eventTime', 'desc').limit(6).get();
    const decisionLines = decisionsSnap.docs.map((d) => {
        const dec = d.data();
        const ts = dec.eventTime ? new Date(dec.eventTime).toLocaleString() : '?';
        return `  [${ts}] ${dec.actionType ?? dec.decisionType} ${dec.tokenSymbol ?? ''} (${dec.confidence ?? 0}%): ${(dec.details ?? '').slice(0, 120)}`;
    }).join('\n');
    return `AGENT: ${agentName} | STATUS: ${paused ? 'PAUSED' : state}
WATCHLIST: ${watchlist.join(', ') || 'none'}
DAILY PnL: $${Number(pnl).toFixed(2)} | DAILY TRADES: ${trades}

OPEN POSITIONS (${positions.length}):
${positionLines}

RECENT DECISIONS:
${decisionLines || '  None'}`;
}
function startChatListener(firestoreAgentId, apiKey, tbAgentId, agentName, openaiApiKey) {
    // ai is used as static fallback only; per-message we prefer the user's profile key
    const fallbackAi = openaiApiKey ? makeAIClient(openaiApiKey) : null;
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
            const msgData = change.doc.data();
            if (msgData.direction !== 'inbound') {
                processedIds.add(change.doc.id);
                continue;
            }
            const text = (msgData.content ?? '').trim();
            if (!text) {
                processedIds.add(change.doc.id);
                continue;
            }
            // Atomically claim this message — prevents double-processing when two
            // Cloud Run instances are briefly running during rolling deploy
            let claimed = false;
            try {
                await firebase_1.db.runTransaction(async (tx) => {
                    const snap = await tx.get(change.doc.ref);
                    if (snap.data()?.chat_processed === true) {
                        throw Object.assign(new Error('already_processed'), { skip: true });
                    }
                    tx.update(change.doc.ref, { chat_processed: true });
                });
                claimed = true;
            }
            catch (claimErr) {
                if (claimErr?.skip) {
                    console.log(`[chat:${firestoreAgentId}] skipping already-claimed msg ${change.doc.id}`);
                    processedIds.add(change.doc.id);
                    continue;
                }
                // Transaction failed — do NOT fall through, skip to avoid duplicate error messages
                console.error(`[chat:${firestoreAgentId}] claim transaction failed, skipping: ${claimErr?.message ?? claimErr}`);
                processedIds.add(change.doc.id);
                continue;
            }
            if (!claimed)
                continue;
            processedIds.add(change.doc.id);
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
                    await handleStatus(firestoreAgentId, agentName, apiKey, tbAgentId);
                    continue;
                }
                if (text === '/positions') {
                    await handlePositions(firestoreAgentId, apiKey, tbAgentId);
                    continue;
                }
                if (text === '/decisions' || text === '/review') {
                    await handleDecisions(firestoreAgentId);
                    continue;
                }
                if (text === '/pnl') {
                    await handlePnl(firestoreAgentId, agentName, apiKey, tbAgentId);
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
                    await handleAnalyzeSlug001(firestoreAgentId, agentName, fallbackAi);
                    continue;
                }
                // ── Trade confirmation check ──────────────────────────────────────
                const pending = pendingTrades.get(firestoreAgentId);
                if (pending) {
                    if (Date.now() > pending.expiresAt) {
                        pendingTrades.delete(firestoreAgentId);
                    }
                    else if (/^(yes|confirm|go|execute|do it|ok|sure|yep|yeah)/i.test(text)) {
                        try {
                            await (0, api_1.overrideAgent)(apiKey, tbAgentId, pending.instruction);
                            pendingTrades.delete(firestoreAgentId);
                            await writeReply(firestoreAgentId, `✅ Trade sent to ${agentName}: ${pending.type} ${pending.token} $${pending.size}\nThe agent will execute when conditions are met.`);
                        }
                        catch (e) {
                            await writeReply(firestoreAgentId, `❌ Trade failed: ${e.message}`);
                        }
                        continue;
                    }
                    else if (/^(no|cancel|stop|nevermind|nope|abort)/i.test(text)) {
                        pendingTrades.delete(firestoreAgentId);
                        await writeReply(firestoreAgentId, '↩️ Trade cancelled.');
                        continue;
                    }
                }
                // ── Free-form AI subagent ─────────────────────────────────────────
                // Resolve AI key: prefer user's profile key (set in Settings), fall back to agent key
                const thisDoc = await firebase_1.db.collection('agents').doc(firestoreAgentId).get();
                const userId = thisDoc.data()?.user_id;
                const profileKey = userId ? await getUserAiKey(userId) : null;
                const ai = profileKey ? makeAIClient(profileKey) : fallbackAi;
                if (!ai) {
                    await writeReply(firestoreAgentId, `I need an AI key to respond. Go to Settings → add your Gemini or OpenAI key — it's free at aistudio.google.com.`);
                    continue;
                }
                // Fetch live context (positions, decisions, state)
                const liveContext = await buildLiveContext(firestoreAgentId, agentName, apiKey, tbAgentId);
                const portfolioContext = userId
                    ? await buildAllAgentsContext(userId, firestoreAgentId)
                    : 'Portfolio data unavailable.';
                // Load recent conversation history
                const historySnap = await firebase_1.db
                    .collection('agents').doc(firestoreAgentId).collection('messages')
                    .orderBy('created_at', 'desc').limit(20).get();
                const history = historySnap.docs
                    .map((d) => d.data())
                    .reverse()
                    .filter((m) => m.content && m.content !== text)
                    .slice(-14);
                const system = `You are ${agentName}, a fully autonomous crypto trading agent on Cabal Ventures. You have full visibility into your own live trading state AND the user's entire portfolio across all agents.

YOUR LIVE STATE:
${liveContext}

OTHER AGENTS IN PORTFOLIO:
${portfolioContext}

CAPABILITIES:
You can answer any question about your positions, decisions, market conditions, and strategy using the live data above.
You can also take actions — when appropriate, append a JSON action block to your response:

To propose a trade (always ask user to confirm first):
TRADE_ACTION:{"type":"BUY","token":"SOL","size":250}
or: TRADE_ACTION:{"type":"SELL","token":"SOL","size":250}

To pause yourself: AGENT_ACTION:{"action":"pause"}
To resume yourself: AGENT_ACTION:{"action":"resume"}
To send yourself an instruction: AGENT_ACTION:{"action":"override","instruction":"focus on BTC and ETH only"}

Rules:
- Always confirm trade details with the user before appending TRADE_ACTION
- Be concise and data-driven. Plain text only. Never fabricate prices or data.
- If asked about a position or token not in your data, say so honestly.
- Remember the conversation history above.`;
                const messages = [
                    { role: 'system', content: system },
                    ...history.map((m) => ({
                        role: (m.direction === 'inbound' ? 'user' : 'assistant'),
                        content: m.content,
                    })),
                    { role: 'user', content: text },
                ];
                console.log(`[chat:${firestoreAgentId}] calling AI (type=${ai.type} model=${ai.model})`);
                await firebase_1.db.collection('agents').doc(firestoreAgentId).update({ is_typing: true }).catch(() => { });
                let rawReply;
                try {
                    rawReply = await callAI(ai, messages, 500);
                    console.log(`[chat:${firestoreAgentId}] AI replied ok`);
                }
                catch (firstErr) {
                    const firstMsg = firstErr?.message ?? String(firstErr);
                    console.error(`[chat:${firestoreAgentId}] AI error: ${firstMsg}`);
                    if (firstErr?.status === 429 || firstMsg.includes('429')) {
                        console.warn(`[chat:${firestoreAgentId}] 429 rate limit, retrying in 15s...`);
                        await new Promise((r) => setTimeout(r, 15000));
                        rawReply = await callAI(ai, messages, 500);
                    }
                    else {
                        throw firstErr;
                    }
                }
                // ── Parse and execute action blocks ───────────────────────────────
                const tradeMatch = rawReply.match(/TRADE_ACTION:\{[^}]+\}/);
                const agentMatch = rawReply.match(/AGENT_ACTION:\{[^}]+\}/);
                if (tradeMatch) {
                    try {
                        const tradeData = JSON.parse(tradeMatch[0].replace('TRADE_ACTION:', ''));
                        const cleanReply = rawReply.replace(tradeMatch[0], '').trim();
                        const instruction = `${tradeData.type} ${tradeData.token} SIZE_USD:${tradeData.size} SOURCE:user_chat`;
                        pendingTrades.set(firestoreAgentId, {
                            token: tradeData.token,
                            type: tradeData.type,
                            size: tradeData.size,
                            instruction,
                            expiresAt: Date.now() + 2 * 60 * 1000, // 2-min window to confirm
                        });
                        await writeReply(firestoreAgentId, `${cleanReply}\n\nReply "confirm" to execute or "cancel" to abort.`);
                    }
                    catch {
                        await writeReply(firestoreAgentId, rawReply);
                    }
                }
                else if (agentMatch) {
                    try {
                        const actionData = JSON.parse(agentMatch[0].replace('AGENT_ACTION:', ''));
                        const cleanReply = rawReply.replace(agentMatch[0], '').trim();
                        if (actionData.action === 'pause') {
                            await (0, api_1.pauseAgent)(apiKey, tbAgentId);
                            await writeReply(firestoreAgentId, cleanReply || `⏸️ ${agentName} paused.`);
                        }
                        else if (actionData.action === 'resume') {
                            await (0, api_1.resumeAgent)(apiKey, tbAgentId);
                            await writeReply(firestoreAgentId, cleanReply || `▶️ ${agentName} resumed.`);
                        }
                        else if (actionData.action === 'override') {
                            await (0, api_1.overrideAgent)(apiKey, tbAgentId, actionData.instruction);
                            await writeReply(firestoreAgentId, cleanReply || `🎯 Instruction sent: "${actionData.instruction}"`);
                        }
                        else {
                            await writeReply(firestoreAgentId, rawReply);
                        }
                    }
                    catch {
                        await writeReply(firestoreAgentId, rawReply);
                    }
                }
                else {
                    await writeReply(firestoreAgentId, rawReply);
                }
                await firebase_1.db.collection('agents').doc(firestoreAgentId).update({ is_typing: false }).catch(() => { });
            }
            catch (err) {
                const msg = err?.message ?? String(err);
                console.error(`[chat:${firestoreAgentId}] error processing message: ${msg}`);
                await firebase_1.db.collection('agents').doc(firestoreAgentId).update({ is_typing: false }).catch(() => { });
                await writeReply(firestoreAgentId, 'Error processing your message. Please try again.').catch(() => { });
            }
        }
    }, (err) => {
        console.error(`[chat:${firestoreAgentId}] snapshot error:`, err?.message ?? err);
    });
}
// ── Range Farmer chat listener ────────────────────────────────────────────────
// Handles per-user range_farmer agents AND slug-001 (shared).
// Looks up the user's ai_api_key from their profile on each message.
async function getUserAiKey(userId) {
    try {
        const userDoc = await firebase_1.db.collection('users').doc(userId).get();
        return userDoc.data()?.ai_api_key || null;
    }
    catch {
        return null;
    }
}
function startRangeFarmerChatListener(firestoreAgentId, agentName, coin = 'BTC') {
    const processedIds = new Set();
    let initialized = false;
    const q = firebase_1.db
        .collection('agents').doc(firestoreAgentId).collection('messages')
        .orderBy('created_at', 'asc');
    console.log(`[ranger:${firestoreAgentId}] starting range farmer listener for ${agentName}`);
    q.onSnapshot(async (snap) => {
        if (!initialized) {
            for (const doc of snap.docs)
                processedIds.add(doc.id);
            initialized = true;
            console.log(`[ranger:${firestoreAgentId}] initialized, skipped ${processedIds.size} existing messages`);
            return;
        }
        for (const change of snap.docChanges()) {
            if (change.type !== 'added')
                continue;
            if (processedIds.has(change.doc.id))
                continue;
            const msgData = change.doc.data();
            if (msgData.direction !== 'inbound') {
                processedIds.add(change.doc.id);
                continue;
            }
            const text = (msgData.content ?? '').trim();
            if (!text) {
                processedIds.add(change.doc.id);
                continue;
            }
            // Claim message atomically
            try {
                await firebase_1.db.runTransaction(async (tx) => {
                    const s = await tx.get(change.doc.ref);
                    if (s.data()?.chat_processed === true) {
                        throw Object.assign(new Error('already_processed'), { skip: true });
                    }
                    tx.update(change.doc.ref, { chat_processed: true });
                });
            }
            catch (e) {
                if (e?.skip) {
                    processedIds.add(change.doc.id);
                    continue;
                }
                // Transaction error — skip rather than risk duplicate reply
                console.error(`[ranger:${firestoreAgentId}] claim failed, skipping: ${e?.message ?? e}`);
                processedIds.add(change.doc.id);
                continue;
            }
            processedIds.add(change.doc.id);
            console.log(`[ranger:${firestoreAgentId}] received: ${text}`);
            try {
                // Get AI key from the message sender's profile
                const userId = msgData.user_id;
                const apiKey = userId ? await getUserAiKey(userId) : null;
                if (!apiKey) {
                    await writeReply(firestoreAgentId, `I need an AI key to respond. Go to Settings → AI Provider and add your Gemini or OpenAI key — it's free at aistudio.google.com.`);
                    continue;
                }
                const ai = makeAIClient(apiKey);
                // Build context from slug-001 (source of truth for range farmer state)
                let rangerContext = `Coin: ${coin}`;
                try {
                    const slug001 = (await firebase_1.db.collection('agents').doc('slug-001').get()).data();
                    if (slug001) {
                        const positions = slug001.positions ?? [];
                        rangerContext =
                            `Coin: ${coin} | BTC Price: $${Math.round(slug001.btc_price ?? 0).toLocaleString()}\n` +
                                `Market Regime: ${slug001.regime ?? 'unknown'} | 24h Change: ${(slug001.price_change_24h_pct ?? 0).toFixed(2)}%\n` +
                                `Grid: ${slug001.grid_levels ?? '?'} levels × ${slug001.grid_spacing_pct ?? '?'}% spacing around $${Math.round(slug001.grid_center ?? 0).toLocaleString()}\n` +
                                `Session PnL: ${(slug001.session_pnl ?? 0) >= 0 ? '+' : ''}$${Number(slug001.session_pnl ?? 0).toFixed(2)} | Fills: ${slug001.total_fills ?? 0}\n` +
                                `Open positions: ${positions.length}`;
                    }
                }
                catch { /* non-fatal */ }
                // Recent history
                const historySnap = await firebase_1.db
                    .collection('agents').doc(firestoreAgentId).collection('messages')
                    .orderBy('created_at', 'desc').limit(16).get();
                const history = historySnap.docs
                    .map((d) => d.data()).reverse()
                    .filter((m) => m.content && m.content !== text).slice(-12);
                const system = `You are ${agentName}, a paper trading range farmer agent running a grid strategy on ${coin}.\n\n` +
                    `LIVE STATE:\n${rangerContext}\n\n` +
                    `YOUR ROLE:\n` +
                    `- Answer questions about the grid strategy, current positions, and performance\n` +
                    `- Explain what you're doing and why in plain language\n` +
                    `- Give trading perspective on market conditions for ${coin}\n` +
                    `- This is paper trading — no real money at risk\n\n` +
                    `Keep responses concise (2-4 sentences). Plain text only. Never fabricate numbers not in the data above.`;
                const messages = [
                    { role: 'system', content: system },
                    ...history.map((m) => ({
                        role: (m.direction === 'inbound' ? 'user' : 'assistant'),
                        content: m.content,
                    })),
                    { role: 'user', content: text },
                ];
                console.log(`[ranger:${firestoreAgentId}] calling AI (type=${ai.type} model=${ai.model})`);
                await firebase_1.db.collection('agents').doc(firestoreAgentId).update({ is_typing: true }).catch(() => { });
                let reply;
                try {
                    reply = await callAI(ai, messages, 400);
                    console.log(`[ranger:${firestoreAgentId}] AI replied ok`);
                }
                catch (firstErr) {
                    const firstMsg = firstErr?.message ?? String(firstErr);
                    console.error(`[ranger:${firestoreAgentId}] AI error: ${firstMsg}`);
                    if (firstMsg.includes('429')) {
                        await new Promise((r) => setTimeout(r, 15000));
                        reply = await callAI(ai, messages, 400);
                    }
                    else
                        throw firstErr;
                }
                await writeReply(firestoreAgentId, reply);
                await firebase_1.db.collection('agents').doc(firestoreAgentId).update({ is_typing: false }).catch(() => { });
            }
            catch (err) {
                const msg = err?.message ?? String(err);
                console.error(`[ranger:${firestoreAgentId}] error: ${msg}`);
                await firebase_1.db.collection('agents').doc(firestoreAgentId).update({ is_typing: false }).catch(() => { });
                await writeReply(firestoreAgentId, 'Something went wrong. Try again.').catch(() => { });
            }
        }
    }, (err) => {
        console.error(`[ranger:${firestoreAgentId}] snapshot error:`, err?.message ?? err);
    });
}
// ── Market Advisor chat listener ──────────────────────────────────────────────
// Pure advisory agent — reads ALL user agents, guides user, no trade execution
function startMarketAdvisorChatListener(firestoreAgentId, userId, agentName, geminiApiKey) {
    // geminiApiKey is the key stored on the agent doc at deploy time.
    // On each message, also check the user's profile for an updated key (profile wins).
    const fallbackKey = geminiApiKey;
    const ai = makeAIClient(fallbackKey);
    const processedIds = new Set();
    let initialized = false;
    const q = firebase_1.db
        .collection('agents').doc(firestoreAgentId).collection('messages')
        .orderBy('created_at', 'asc');
    console.log(`[advisor:${firestoreAgentId}] starting market advisor listener for ${agentName}`);
    q.onSnapshot(async (snap) => {
        if (!initialized) {
            for (const doc of snap.docs)
                processedIds.add(doc.id);
            initialized = true;
            console.log(`[advisor:${firestoreAgentId}] initialized, skipped ${processedIds.size} existing messages`);
            return;
        }
        for (const change of snap.docChanges()) {
            if (change.type !== 'added')
                continue;
            if (processedIds.has(change.doc.id))
                continue;
            const msgData = change.doc.data();
            if (msgData.direction !== 'inbound') {
                processedIds.add(change.doc.id);
                continue;
            }
            const text = (msgData.content ?? '').trim();
            if (!text) {
                processedIds.add(change.doc.id);
                continue;
            }
            // Claim message
            try {
                await firebase_1.db.runTransaction(async (tx) => {
                    const s = await tx.get(change.doc.ref);
                    if (s.data()?.chat_processed === true) {
                        throw Object.assign(new Error('already_processed'), { skip: true });
                    }
                    tx.update(change.doc.ref, { chat_processed: true });
                });
            }
            catch (e) {
                if (e?.skip) {
                    processedIds.add(change.doc.id);
                    continue;
                }
                console.error(`[advisor:${firestoreAgentId}] claim failed, skipping: ${e?.message ?? e}`);
                processedIds.add(change.doc.id);
                continue;
            }
            processedIds.add(change.doc.id);
            console.log(`[advisor:${firestoreAgentId}] received: ${text}`);
            try {
                // Use profile key if present (user may have updated it since deploy)
                const profileKey = await getUserAiKey(userId);
                const activeAi = profileKey && profileKey !== fallbackKey ? makeAIClient(profileKey) : ai;
                if (!profileKey && !fallbackKey) {
                    await writeReply(firestoreAgentId, `I need an AI key to respond. Go to Settings → AI Provider and add your Gemini or OpenAI key.`);
                    continue;
                }
                // Full portfolio context across all agents
                const portfolioContext = await buildAllAgentsContext(userId);
                // BTC + market context from Slug #001
                let marketContext = '';
                try {
                    const slug001 = (await firebase_1.db.collection('agents').doc('slug-001').get()).data();
                    if (slug001) {
                        marketContext =
                            `BTC Price: $${Math.round(slug001.btc_price ?? 0).toLocaleString()}\n` +
                                `Market Regime: ${slug001.regime ?? 'unknown'}\n` +
                                `24h Change: ${(slug001.price_change_24h_pct ?? 0).toFixed(2)}%\n` +
                                `24h High: $${Math.round(slug001.high_24h ?? 0).toLocaleString()} | Low: $${Math.round(slug001.low_24h ?? 0).toLocaleString()}`;
                    }
                }
                catch { /* non-fatal */ }
                // Conversation history
                const historySnap = await firebase_1.db
                    .collection('agents').doc(firestoreAgentId).collection('messages')
                    .orderBy('created_at', 'desc').limit(20).get();
                const history = historySnap.docs
                    .map((d) => d.data()).reverse()
                    .filter((m) => m.content && m.content !== text).slice(-14);
                const system = `You are ${agentName}, a crypto market intelligence advisor with full visibility into the user's trading portfolio.\n\n` +
                    `LIVE MARKET:\n${marketContext || 'Market data loading...'}\n\n` +
                    `FULL PORTFOLIO:\n${portfolioContext}\n\n` +
                    `YOUR ROLE:\n` +
                    `- Analyze the user's current positions and recent agent decisions\n` +
                    `- Give clear, actionable guidance on what they should do next\n` +
                    `- Explain what their agents are doing and whether it makes sense\n` +
                    `- Flag risks, opportunities, and anything worth watching\n` +
                    `- Be honest about uncertainty — don't fabricate prices or data\n\n` +
                    `RULES:\n` +
                    `- You don't execute trades — you advise, the user acts\n` +
                    `- Keep responses concise (3-5 sentences) unless deep analysis is requested\n` +
                    `- Reference actual numbers from the portfolio data above\n` +
                    `- Plain text only, no markdown`;
                const messages = [
                    { role: 'system', content: system },
                    ...history.map((m) => ({
                        role: (m.direction === 'inbound' ? 'user' : 'assistant'),
                        content: m.content,
                    })),
                    { role: 'user', content: text },
                ];
                let reply;
                try {
                    reply = await callAI(activeAi, messages, 600);
                }
                catch (firstErr) {
                    if (firstErr?.status === 429 || firstErr?.message?.includes('429')) {
                        await new Promise((r) => setTimeout(r, 15000));
                        reply = await callAI(activeAi, messages, 600);
                    }
                    else
                        throw firstErr;
                }
                await writeReply(firestoreAgentId, reply);
            }
            catch (err) {
                const msg = err?.message ?? String(err);
                console.error(`[advisor:${firestoreAgentId}] error: ${msg}`);
                await writeReply(firestoreAgentId, 'Something went wrong. Try again.').catch(() => { });
            }
        }
    }, (err) => {
        console.error(`[advisor:${firestoreAgentId}] snapshot error:`, err?.message ?? err);
    });
}
