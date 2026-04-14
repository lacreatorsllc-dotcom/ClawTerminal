import fetch from 'node-fetch'

// Symbol → CoinGecko ID
const CG_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  XRP: 'ripple',
  SUI: 'sui',
  HYPE: 'hyperliquid',
  JUP: 'jupiter-exchange-solana',
  JTO: 'jito-governance-token',
  PYTH: 'pyth-network',
  BONK: 'bonk',
  WIF: 'dogwifcoin',
  DOGE: 'dogecoin',
  AVAX: 'avalanche-2',
  MATIC: 'matic-network',
  LINK: 'chainlink',
  DOT: 'polkadot',
  ADA: 'cardano',
  ATOM: 'cosmos',
  LTC: 'litecoin',
  BCH: 'bitcoin-cash',
  NEAR: 'near',
  APT: 'aptos',
  ARB: 'arbitrum',
  OP: 'optimism',
  INJ: 'injective-protocol',
  TIA: 'celestia',
  SEI: 'sei-network',
  RENDER: 'render-token',
  FET: 'fetch-ai',
  TAO: 'bittensor',
}

interface PriceCacheEntry { price: number; fetchedAt: number }
const cache = new Map<string, PriceCacheEntry>()
const CACHE_TTL = 30_000   // 30s
let backoffUntil = 0
const BACKOFF_MS  = 60_000  // 1 min on 429

export async function getCurrentPrices(symbols: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  const toFetch: string[] = []

  for (const sym of symbols) {
    const upper = sym.toUpperCase()
    const hit = cache.get(upper)
    if (hit && Date.now() - hit.fetchedAt < CACHE_TTL) {
      result.set(upper, hit.price)
    } else if (CG_IDS[upper]) {
      toFetch.push(upper)
    }
  }

  if (toFetch.length === 0 || Date.now() < backoffUntil) return result

  const ids = toFetch.map(s => CG_IDS[s]).join(',')
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      { headers: { Accept: 'application/json' } },
    )
    if (res.status === 429) {
      backoffUntil = Date.now() + BACKOFF_MS
      // Return whatever is cached
      return result
    }
    if (res.ok) {
      const data = await res.json() as Record<string, { usd: number }>
      for (const sym of toFetch) {
        const id = CG_IDS[sym]
        const price = data[id]?.usd
        if (price) {
          result.set(sym, price)
          cache.set(sym, { price, fetchedAt: Date.now() })
        }
      }
    }
  } catch {
    // Network error — return what we have
  }
  return result
}

// Compute unrealized PnL for a position using a live price map
export function calcUnrealized(p: any, prices: Map<string, number>): number {
  // Try explicit fields first
  for (const key of ['unrealizedPnl', 'unrealizedPnlUsd', 'unrealized_pnl', 'unrealized', 'floatingPnl']) {
    if (p[key] !== undefined && p[key] !== null) return Number(p[key])
  }
  // Compute from entry price + live price
  const sym = (p.symbol ?? p.tokenSymbol ?? p.token ?? '').toUpperCase()
  const entry   = Number(p.entryPrice ?? 0)
  const size    = Number(p.sizeUsd ?? p.positionSize ?? p.size ?? 0)
  const dir     = (p.direction ?? p.side ?? 'LONG').toUpperCase()
  const current = prices.get(sym) ?? 0

  if (!entry || !size || !current) return 0
  const mult = dir === 'SHORT' ? -1 : 1
  return mult * ((current - entry) / entry) * size
}
