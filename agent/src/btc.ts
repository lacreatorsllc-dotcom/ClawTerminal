// Fetch BTC/USDT price from CoinGecko with in-memory cache + 429 backoff

let cached: { price: number; change24h: number; fetchedAt: number } | null = null
let backoffUntil = 0
const CACHE_TTL_MS = 25_000   // don't hit CoinGecko more than once per 25s
const BACKOFF_MS   = 90_000   // on 429, wait 90s before retrying

export async function getBtcPrice(): Promise<{ price: number; change24h: number }> {
  const now = Date.now()

  // Return cached value if still fresh
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return { price: cached.price, change24h: cached.change24h }
  }

  // Back off on 429 — return last known price rather than crashing the loop
  if (now < backoffUntil) {
    if (cached) {
      console.warn(`[btc] rate-limited, using cached $${Math.round(cached.price)}`)
      return { price: cached.price, change24h: cached.change24h }
    }
    throw new Error('CoinGecko rate-limited and no cached price available')
  }

  const res = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true'
  )

  if (res.status === 429) {
    backoffUntil = now + BACKOFF_MS
    console.warn(`[btc] 429 rate limit — backing off for ${BACKOFF_MS / 1000}s`)
    if (cached) return { price: cached.price, change24h: cached.change24h }
    throw new Error('CoinGecko rate-limited and no cached price available')
  }

  if (!res.ok) throw new Error(`CoinGecko API error: ${res.status}`)

  const data = await res.json() as { bitcoin: { usd: number; usd_24h_change: number } }
  cached = { price: data.bitcoin.usd, change24h: data.bitcoin.usd_24h_change, fetchedAt: now }
  return { price: cached.price, change24h: cached.change24h }
}
