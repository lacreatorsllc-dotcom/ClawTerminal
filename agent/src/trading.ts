import { db, AGENT_DOC, FEED_COL, FieldValue } from './firebase'
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

export async function placePaperTrade(side: 'buy' | 'sell', qty: number): Promise<string> {
  if (state.btc_price === 0) return 'No price data yet'
  const fillPrice = state.btc_price * (side === 'buy' ? 0.9995 : 1.0005) // simulate slippage
  state.positions.push({ side, fillPrice, currentPrice: state.btc_price, qty })
  state.total_fills++
  const msg = `Paper ${side.toUpperCase()} ${qty} BTC @ $${Math.round(fillPrice).toLocaleString()}`
  await writeFeedEvent('trade', msg, { side, qty, fillPrice })
  await syncToFirestore()
  return msg
}

async function writeFeedEvent(type: string, content: string, payload?: Record<string, unknown>) {
  await FEED_COL.add({
    agent_id: 'slug-001',
    user_id: 'slug-001',
    type,
    content,
    payload: payload ?? {},
    created_at: FieldValue.serverTimestamp(),
  })
}

async function syncToFirestore() {
  await AGENT_DOC.set({ ...state, last_updated: FieldValue.serverTimestamp() }, { merge: true })
}

// ── Main trading loop ─────────────────────────────────────────────────────────

export async function runTradingLoop() {
  try {
    const { price, change24h } = await getBtcPrice()
    state.btc_price = price
    state.price_change_24h_pct = change24h

    // Init grid center on first run
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

    // Simulate grid fills when active
    if (state.status === 'active') {
      const spacing = state.grid_center * (state.grid_spacing_pct / 100)
      const rand = Math.random()

      if (rand < 0.15) { // ~15% chance of a fill each tick
        const side = price < state.grid_center ? 'buy' : 'sell'
        const qty = parseFloat((0.0001 + Math.random() * 0.0004).toFixed(4))
        const fillPrice = price * (side === 'buy' ? (1 - Math.random() * 0.002) : (1 + Math.random() * 0.002))
        const pnl = side === 'sell'
          ? (fillPrice - state.grid_center) * qty
          : (state.grid_center - fillPrice) * qty

        state.session_pnl = parseFloat((state.session_pnl + pnl).toFixed(4))
        state.total_fills++
        state.pnl_history = [...state.pnl_history.slice(-49), state.session_pnl]

        const content = `Grid fill: ${side.toUpperCase()} ${qty} BTC @ $${Math.round(fillPrice).toLocaleString()} · PnL ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`
        console.log(`[trade] ${content}`)
        await writeFeedEvent('pnl', content, { side, qty, fillPrice, pnl })
      }
    }

    await syncToFirestore()
    console.log(`[loop] BTC $${Math.round(price).toLocaleString()} | PnL $${state.session_pnl.toFixed(2)} | fills ${state.total_fills} | ${state.status}`)
  } catch (err) {
    console.error('[trading loop error]', err)
  }
}
