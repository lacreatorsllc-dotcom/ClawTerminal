// Fetch BTC/USDT price from CoinGecko (no key needed, no geo-restrictions)
export async function getBtcPrice(): Promise<{ price: number; change24h: number }> {
  const res = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true'
  )
  if (!res.ok) throw new Error(`CoinGecko API error: ${res.status}`)
  const data = await res.json() as { bitcoin: { usd: number; usd_24h_change: number } }
  return {
    price: data.bitcoin.usd,
    change24h: data.bitcoin.usd_24h_change,
  }
}
