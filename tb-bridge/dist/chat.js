"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startChatListener = startChatListener;
const firebase_1 = require("./firebase");
const api_1 = require("./api");
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
    const doc = await firebase_1.db.collection('agents').doc(firestoreAgentId).get();
    const d = doc.data() ?? {};
    const live = d.live_state ?? {};
    const admin = d.live_admin ?? {};
    const state = live.state ?? 'UNKNOWN';
    const paused = admin.paused === true;
    const positions = live.openPositions ?? [];
    const pnl = live.dailyPnlUsd ?? 0;
    const trades = live.dailyTradeCount ?? 0;
    const setups = live.activeConditionalSetups ?? 0;
    const watchlist = d.watchlist ?? [];
    const lastSync = d.last_synced?.toDate?.()?.toLocaleTimeString() ?? 'unknown';
    const reply = `${stateEmoji(paused ? 'PAUSED' : state)} ${agentName} — ${paused ? 'PAUSED' : state}\n\n` +
        `📋 Watchlist: ${watchlist.length} tokens\n` +
        `📊 Open positions: ${positions.length}\n` +
        `📈 Daily PnL: $${Number(pnl).toFixed(2)}\n` +
        `🔢 Daily trades: ${trades}\n` +
        `🎯 Active setups: ${setups}\n` +
        `🕐 Last sync: ${lastSync}`;
    await writeReply(firestoreAgentId, reply);
}
async function handlePositions(firestoreAgentId) {
    const doc = await firebase_1.db.collection('agents').doc(firestoreAgentId).get();
    const live = doc.data()?.live_state ?? {};
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
    const doc = await firebase_1.db.collection('agents').doc(firestoreAgentId).get();
    const d = doc.data() ?? {};
    const live = d.live_state ?? {};
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
    const doc = await firebase_1.db.collection('agents').doc(firestoreAgentId).get();
    const d = doc.data() ?? {};
    const live = d.live_state ?? {};
    const state = live.state ?? 'UNKNOWN';
    const pnl = live.dailyPnlUsd ?? 0;
    const trades = live.dailyTradeCount ?? 0;
    const setups = live.activeConditionalSetups ?? 0;
    const positions = live.openPositions ?? [];
    const watchlist = d.watchlist ?? [];
    const paused = d.live_admin?.paused === true;
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
        `/pause — Pause this agent\n` +
        `/resume — Resume this agent`;
    return writeReply(firestoreAgentId, msg);
}
function startChatListener(firestoreAgentId, apiKey, tbAgentId, agentName) {
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
                // Free-form text — no LLM configured yet
                await writeReply(firestoreAgentId, `Use /help to see available commands.`);
            }
            catch (err) {
                console.error(`[chat:${firestoreAgentId}] error:`, err?.message, '| code:', err?.code, '| status:', err?.status, '| type:', err?.type, '| cause:', err?.cause?.message);
                await writeReply(firestoreAgentId, 'Error processing your message. Please try again.').catch(() => { });
            }
        }
    }, (err) => {
        console.error(`[chat:${firestoreAgentId}] snapshot error:`, err?.message ?? err);
    });
}
