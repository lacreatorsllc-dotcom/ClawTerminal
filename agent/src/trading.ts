import { db, AGENT_DOC, FEED_COL, TRADES_COL, FieldValue } from './firebase'
import { getBtcPrice } from './btc'

export interface GridState {
  status: 'active' | 'paused' | 'cooldown' | 'no-trade'
  strategy: string
  regime: string
  grid_center: number
  grid_levels: number
  grid_spacing_pct: number
  btc_price: number
  price_change_24h_pct: number
  session_pnl: number
  total_fills: number
  pnl_history: number[]
  positions: Position[]
  last_updated: FirebaseFirestore.FieldValue
}

interface Position {
  side: 'buy' | 'sell'
  fillPrice: number
  currentPrice: number
  qty: number
}

// In-memory grid state (synced to Firestore)
let state: Omit<GridState, 'last_updated'> = {
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
}

export function getState() { return { ...state } }
export function pause() { state.status = 'paused' }
export function resume() { state.status = 'active' }

// ── Daily summary tracking ───────────────────────────────────────────────────
let lastSummaryDate = new Date().toUTCString().slice(0, 16) // "Day, DD Mon YYYY"
let fillsSinceSummary = 0
let pnlAtLastSummary = 0

async function maybeWriteDailySummary() {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD UTC
  if (today === lastSummaryDate) return
  lastSummaryDate = today

  const pnlDelta = parseFloat((state.session_pnl - pnlAtLastSummary).toFixed(2))
  const sign = pnlDelta >= 0 ? '+' : ''
  const content = `📊 Daily summary · ${fillsSinceSummary} fills · ${sign}$${pnlDelta.toFixed(2)} PnL · ${state.positions.length} open positions`

  try {
    await FEED_COL.add({
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
      created_at: FieldValue.serverTimestamp(),
    })
    console.log(`[daily] ${content}`)
  } catch (err) {
    console.error('[daily summary error]', err)
  }

  fillsSinceSummary = 0
  pnlAtLastSummary = state.session_pnl
}

// ── Paper trade (manual via chat) ───────────────────────────────────────────
export async function placePaperTrade(side: 'buy' | 'sell', qty: number): Promise<string> {
  if (state.btc_price === 0) return 'No price data yet'
  const fillPrice = state.btc_price * (side === 'buy' ? 0.9995 : 1.0005)
  state.positions.push({ side, fillPrice, currentPrice: state.btc_price, qty })
  state.total_fills++
  fillsSinceSummary++
  const msg = `Paper ${side.toUpperCase()} ${qty} BTC @ $${Math.round(fillPrice).toLocaleString()}`
  await writeTrade({ side, qty, fillPrice, pnl: null, type: 'manual' })
  await syncToFirestore()
  return msg
}

// ── Trade writer — goes to subcollection, NOT feed_events ───────────────────
async function writeTrade(trade: {
  side: string
  qty: number
  fillPrice: number
  pnl: number | null
  type: 'grid_fill' | 'manual'
}) {
  await TRADES_COL.add({
    agent_id: 'slug-001',
    ...trade,
    session_pnl: state.session_pnl,
    btc_price: state.btc_price,
    created_at: FieldValue.serverTimestamp(),
  })
}

async function syncToFirestore() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log("⚠️ Skipping Firestore (no credentials)");
    return;
  }

  try {
    await AGENT_DOC.set(
      { ...state, last_updated: FieldValue.serverTimestamp() },
      { merge: true }
    );
  } catch (err) {
    console.error("Firestore sync error:", err);
  }
}
// ── Main trading loop ─────────────────────────────────────────────────────────

export async function runTradingLoop() {
  try {
    const { price, change24h } = await getBtcPrice()
    state.btc_price = price
    state.price_change_24h_pct = change24h

    if (state.grid_center === 0) state.grid_center = price

    // Detect regime
    const deviation = Math.abs(price - state.grid_center) / state.grid_center
    if (deviation > 0.03) {
      state.regime = 'trending'
      state.status = 'cooldown'
    } else {
      state.regime = 'ranging'
      if (state.status === 'cooldown') state.status = 'active'
    }

    // Recenter grid if price drifted > 2%
    if (deviation > 0.02) {
      const old = state.grid_center
      state.grid_center = price
      console.log(`[grid] recentered $${Math.round(old)} → $${Math.round(price)}`)
    }

    // Update unrealized PnL on open positions
    for (const p of state.positions) {
      p.currentPrice = price
    }

    // Simulate grid fills when active (~15% chance per tick)
    if (state.status === 'active') {
      if (Math.random() < 0.15) {
        const side = price < state.grid_center ? 'buy' : 'sell'
        const qty = parseFloat((0.0001 + Math.random() * 0.0004).toFixed(4))
        const fillPrice = price * (side === 'buy' ? (1 - Math.random() * 0.002) : (1 + Math.random() * 0.002))
        const pnl = parseFloat((side === 'sell'
          ? (fillPrice - state.grid_center) * qty
          : (state.grid_center - fillPrice) * qty).toFixed(4))

        state.session_pnl = parseFloat((state.session_pnl + pnl).toFixed(4))
        state.total_fills++
        fillsSinceSummary++
        state.pnl_history = [...state.pnl_history.slice(-49), state.session_pnl]

        const content = `Grid fill: ${side.toUpperCase()} ${qty} BTC @ $${Math.round(fillPrice).toLocaleString()} · PnL ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`
        console.log(`[trade] ${content}`)

        // Write to trades subcollection — NOT feed_events
        await writeTrade({ side, qty, fillPrice, pnl, type: 'grid_fill' })
      }
    }

    await syncToFirestore()

    // Write daily summary when day rolls over
    await maybeWriteDailySummary()

    console.log(`[loop] BTC $${Math.round(price).toLocaleString()} | PnL $${state.session_pnl.toFixed(2)} | fills ${state.total_fills} | ${state.status}`)
  } catch (err) {
    console.error('[trading loop error]', err)
  }
}
