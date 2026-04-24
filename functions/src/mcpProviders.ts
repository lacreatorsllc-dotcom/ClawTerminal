import { listCoinGeckoTools } from './coingecko'
import { listLunarCrushTools } from './lunarCrush'

export type McpProviderId = 'coingecko' | 'lunarcrush'

export type McpProviderDefinition = {
  id: McpProviderId
  label: string
  capability: string
  listTools: () => Promise<Array<{ name?: string; description?: string }>>
}

export const MCP_PROVIDERS: McpProviderDefinition[] = [
  {
    id: 'coingecko',
    label: 'CoinGecko',
    capability: 'Crypto prices, market data, trending assets, and metadata',
    listTools: listCoinGeckoTools,
  },
  {
    id: 'lunarcrush',
    label: 'LunarCrush',
    capability: 'Market, sentiment, and topic-post intelligence',
    listTools: listLunarCrushTools,
  },
]
