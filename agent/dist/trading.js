"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getState = getState;
exports.pause = pause;
exports.resume = resume;
exports.placePaperTrade = placePaperTrade;
exports.runTradingLoop = runTradingLoop;
const firebase_1 = require("./firebase");
const btc_1 = require("./btc");
// In-memory grid state (synced to Firestore)
let state = {
    status: 'active',
    strategy: 'Dynamic Grid',
    regime: 'ranging',
    grid_center: 0,
    grid_levels: 10,
    grid_spacing_pct: 0.8,
    btc_price: 0,
    price_change_24h_pct: 0,
    session_pnl: 0,
    total_fills: 0,
    pnl_history: [],
    positions: [],
};
function getState() { return { ...state }; }
function pause() { state.status = 'paused'; }
function resume() { state.status = 'active'; }
// ── Daily summary tracking ───────────────────────────────────────────────────
let lastSummaryDate = new Date().toUTCString().slice(0, 16); // "Day, DD Mon YYYY"
let fillsSinceSummary = 0;
let pnlAtLastSummary = 0;
async function maybeWriteDailySummary() {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
    if (today === lastSummaryDate)
        return;
    lastSummaryDate = today;
    const pnlDelta = parseFloat((state.session_pnl - pnlAtLastSummary).toFixed(2));
    const sign = pnlDelta >= 0 ? '+' : '';
    const content = `📊 Daily summary · ${fillsSinceSummary} fills · ${sign}$${pnlDelta.toFixed(2)} PnL · ${state.positions.length} open positions`;
    try {
        await firebase_1.FEED_COL.add({
            agent_id: 'slug-001',
            user_id: 'slug-001',
            type: 'daily_pnl',
            content,
            payload: {
                pnl: pnlDelta,
                fills: fillsSinceSummary,
                session_pnl: state.session_pnl,
                total_fills: state.total_fills,
                open_positions: state.positions.length,
                btc_price: state.btc_price,
            },
            is_public: true,
            created_at: firebase_1.FieldValue.serverTimestamp(),
        });
        console.log(`[daily] ${content}`);
    }
    catch (err) {
        console.error('[daily summary error]', err);
    }
    fillsSinceSummary = 0;
    pnlAtLastSummary = state.session_pnl;
}
// ── Paper trade (manual via chat) ───────────────────────────────────────────
async function placePaperTrade(side, qty) {
    if (state.btc_price === 0)
        return 'No price data yet';
    const fillPrice = state.btc_price * (side === 'buy' ? 0.9995 : 1.0005);
    state.positions.push({ side, fillPrice, currentPrice: state.btc_price, qty });
    state.total_fills++;
    fillsSinceSummary++;
    const msg = `Paper ${side.toUpperCase()} ${qty} BTC @ $${Math.round(fillPrice).toLocaleString()}`;
    await writeTrade({ side, qty, fillPrice, pnl: null, type: 'manual' });
    await syncToFirestore();
    return msg;
}
// ── Trade writer — goes to subcollection, NOT feed_events ───────────────────
async function writeTrade(trade) {
    await firebase_1.TRADES_COL.add({
        agent_id: 'slug-001',
        ...trade,
        session_pnl: state.session_pnl,
        btc_price: state.btc_price,
        created_at: firebase_1.FieldValue.serverTimestamp(),
    });
}
async function syncToFirestore() {
    await firebase_1.AGENT_DOC.set({ ...state, last_updated: firebase_1.FieldValue.serverTimestamp() }, { merge: true });
}
// ── Main trading loop ─────────────────────────────────────────────────────────
async function runTradingLoop() {
    try {
        const { price, change24h } = await (0, btc_1.getBtcPrice)();
        state.btc_price = price;
        state.price_change_24h_pct = change24h;
        if (state.grid_center === 0)
            state.grid_center = price;
        // Detect regime
        const deviation = Math.abs(price - state.grid_center) / state.grid_center;
        if (deviation > 0.03) {
            state.regime = 'trending';
            state.status = 'cooldown';
        }
        else {
            state.regime = 'ranging';
            if (state.status === 'cooldown')
                state.status = 'active';
        }
        // Recenter grid if price drifted > 2%
        if (deviation > 0.02) {
            const old = state.grid_center;
            state.grid_center = price;
            console.log(`[grid] recentered $${Math.round(old)} → $${Math.round(price)}`);
        }
        // Update unrealized PnL on open positions
        for (const p of state.positions) {
            p.currentPrice = price;
        }
        // Simulate grid fills when active (~15% chance per tick)
        if (state.status === 'active') {
            if (Math.random() < 0.15) {
                const side = price < state.grid_center ? 'buy' : 'sell';
                const qty = parseFloat((0.0001 + Math.random() * 0.0004).toFixed(4));
                const fillPrice = price * (side === 'buy' ? (1 - Math.random() * 0.002) : (1 + Math.random() * 0.002));
                const pnl = parseFloat((side === 'sell'
                    ? (fillPrice - state.grid_center) * qty
                    : (state.grid_center - fillPrice) * qty).toFixed(4));
                state.session_pnl = parseFloat((state.session_pnl + pnl).toFixed(4));
                state.total_fills++;
                fillsSinceSummary++;
                state.pnl_history = [...state.pnl_history.slice(-49), state.session_pnl];
                const content = `Grid fill: ${side.toUpperCase()} ${qty} BTC @ $${Math.round(fillPrice).toLocaleString()} · PnL ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`;
                console.log(`[trade] ${content}`);
                // Write to trades subcollection — NOT feed_events
                await writeTrade({ side, qty, fillPrice, pnl, type: 'grid_fill' });
            }
        }
        await syncToFirestore();
        // Write daily summary when day rolls over
        await maybeWriteDailySummary();
        console.log(`[loop] BTC $${Math.round(price).toLocaleString()} | PnL $${state.session_pnl.toFixed(2)} | fills ${state.total_fills} | ${state.status}`);
    }
    catch (err) {
        console.error('[trading loop error]', err);
    }
}
