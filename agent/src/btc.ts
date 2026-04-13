// Fetch BTC/USDT price from Binance public API (no key needed)
export async function getBtcPrice(): Promise<{ price: number; change24h: number }> {
  const res = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT')
  if (!res.ok) throw new Error(`Binance API error: ${res.status}`)
  const data = await res.json() as { lastPrice: string; priceChangePercent: string }
  return {
    price: parseFloat(data.lastPrice),
    change24h: parseFloat(data.priceChangePercent),
  }
}
