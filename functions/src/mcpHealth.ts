import { fetchSimplePrices, listCoinGeckoTools } from './coingecko'
import { fetchTopicSnapshot, listLunarCrushTools } from './lunarCrush'

type McpProviderHealth = {
  id: 'coingecko' | 'lunarcrush'
  label: string
  ok: boolean
  latencyMs: number
  checkedAt: string
  authConfigured: boolean
  toolsCount: number | null
  details: Record<string, unknown>
  error: string | null
}

export type McpHealthReport = {
  ok: boolean
  checkedAt: string
  providers: McpProviderHealth[]
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    }),
  ])
}

async function checkCoinGecko(): Promise<McpProviderHealth> {
  const startedAt = Date.now()

  try {
    const [tools, prices] = await Promise.all([
      withTimeout(listCoinGeckoTools(), 10000, 'CoinGecko tools/list'),
      withTimeout(fetchSimplePrices(['BTC']), 10000, 'CoinGecko price check'),
    ])

    const btc = prices.btc ?? null
    return {
      id: 'coingecko',
      label: 'CoinGecko',
      ok: Boolean(btc?.usd),
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
      authConfigured: false,
      toolsCount: tools.length,
      details: {
        sampleSymbol: 'BTC',
        samplePriceUsd: btc?.usd ?? null,
        sampleChange24h: btc?.usd_24h_change ?? null,
      },
      error: btc?.usd ? null : 'CoinGecko returned no BTC/USD price.',
    }
  } catch (error) {
    return {
      id: 'coingecko',
      label: 'CoinGecko',
      ok: false,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
      authConfigured: false,
      toolsCount: null,
      details: {},
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function checkLunarCrush(): Promise<McpProviderHealth> {
  const startedAt = Date.now()
  const authConfigured = Boolean(String(process.env.LUNARCRUSH_API_KEY ?? '').trim())

  try {
    const [tools, snapshot] = await Promise.all([
      withTimeout(listLunarCrushTools(), 10000, 'LunarCrush tools/list'),
      withTimeout(fetchTopicSnapshot('BTC'), 10000, 'LunarCrush topic check'),
    ])

    return {
      id: 'lunarcrush',
      label: 'LunarCrush',
      ok: snapshot.price != null || snapshot.sentimentPct != null || Boolean(snapshot.name),
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
      authConfigured,
      toolsCount: tools.length,
      details: {
        sampleTopic: snapshot.topic,
        sampleSymbol: snapshot.symbol,
        samplePriceUsd: snapshot.price,
        sampleSentimentPct: snapshot.sentimentPct,
      },
      error: null,
    }
  } catch (error) {
    return {
      id: 'lunarcrush',
      label: 'LunarCrush',
      ok: false,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
      authConfigured,
      toolsCount: null,
      details: {},
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function getMcpHealthReport(): Promise<McpHealthReport> {
  const providers = await Promise.all([checkCoinGecko(), checkLunarCrush()])
  return {
    ok: providers.every((provider) => provider.ok),
    checkedAt: new Date().toISOString(),
    providers,
  }
}
