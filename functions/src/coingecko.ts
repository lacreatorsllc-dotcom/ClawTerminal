import { StreamableHttpMcpClient } from './mcpClient'

type CoinGeckoExecuteEnvelope<T> = {
  result?: T
  logs?: string[]
}

export type CoinGeckoSimplePrice = {
  usd: number
  usd_24h_change?: number
  usd_market_cap?: number
  usd_24h_vol?: number
}

export type CoinGeckoTrendingCoin = {
  id: string
  name: string
  symbol: string
  marketCapRank: number | null
  priceUsd: number | null
  change24h: number | null
  score: number | null
}

const coinGeckoMcp = new StreamableHttpMcpClient({
  name: 'slugs-coingecko',
  baseUrl: 'https://mcp.api.coingecko.com/mcp',
})

async function executeCoinGeckoJson<T>(code: string, intent: string): Promise<T> {
  const text = await coinGeckoMcp.callToolText('execute', { code, intent })
  const parsed = JSON.parse(text) as CoinGeckoExecuteEnvelope<T>
  return parsed.result as T
}

export async function listCoinGeckoTools() {
  return coinGeckoMcp.listTools()
}

export async function fetchSimplePrices(symbols: string[]): Promise<Record<string, CoinGeckoSimplePrice>> {
  const normalized = symbols
    .map((symbol) => String(symbol ?? '').trim().toLowerCase())
    .filter(Boolean)

  if (normalized.length === 0) return {}

  const quotedSymbols = normalized.map((symbol) => `'${symbol}'`).join(', ')
  return executeCoinGeckoJson<Record<string, CoinGeckoSimplePrice>>(
    `async function run(client) {
      return await client.simple.price.get({
        symbols: [${quotedSymbols}].join(','),
        vs_currencies: 'usd',
        include_24hr_change: true,
        include_market_cap: true,
        include_24hr_vol: true,
      })
    }`,
    `Fetch simple CoinGecko price data for ${normalized.join(', ')}`,
  )
}

export async function fetchTrendingCoins(limit = 5): Promise<CoinGeckoTrendingCoin[]> {
  const result = await executeCoinGeckoJson<{
    coins?: Array<{
      item?: {
        id?: string
        name?: string
        symbol?: string
        market_cap_rank?: number
        score?: number
        data?: {
          price?: number
          price_change_percentage_24h?: {
            usd?: number
          }
        }
      }
    }>
  }>(
    `async function run(client) {
      return await client.search.trending.get()
    }`,
    'Fetch CoinGecko trending coins',
  )

  return (result.coins ?? [])
    .map((entry) => entry.item)
    .filter((item): item is NonNullable<typeof item> => Boolean(item?.id))
    .slice(0, Math.max(1, Math.min(limit, 10)))
    .map((item) => ({
      id: String(item.id),
      name: String(item.name ?? item.symbol ?? item.id),
      symbol: String(item.symbol ?? '').toUpperCase(),
      marketCapRank: typeof item.market_cap_rank === 'number' ? item.market_cap_rank : null,
      priceUsd: typeof item.data?.price === 'number' ? item.data.price : null,
      change24h: typeof item.data?.price_change_percentage_24h?.usd === 'number'
        ? item.data.price_change_percentage_24h.usd
        : null,
      score: typeof item.score === 'number' ? item.score : null,
    }))
}
