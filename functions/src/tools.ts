import { db, FEED_COL, FieldValue } from './firebase'
import type { Tool, ToolResultBlockParam } from '@anthropic-ai/sdk/resources'

export const AGENT_TOOLS: Tool[] = [
  {
    name: 'get_price',
    description: 'Get the current price and 24h change for a crypto asset.',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: { type: 'string', description: 'Coin symbol e.g. BTC, ETH, SOL' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_portfolio',
    description: 'Get current open positions and session PnL for this agent.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_recent_news',
    description: 'Get recent market news affecting specified coins.',
    input_schema: {
      type: 'object' as const,
      properties: {
        coins: { type: 'array', items: { type: 'string' }, description: 'List of coin symbols' },
      },
      required: ['coins'],
    },
  },
  {
    name: 'paper_trade',
    description: 'Execute a paper trade (simulated, no real funds). Use for entries and exits.',
    input_schema: {
      type: 'object' as const,
      properties: {
        side: { type: 'string', enum: ['buy', 'sell'], description: 'Trade direction' },
        symbol: { type: 'string', description: 'Coin symbol e.g. BTC' },
        qty: { type: 'number', description: 'Quantity to trade' },
        reason: { type: 'string', description: 'Brief reasoning for this trade' },
      },
      required: ['side', 'symbol', 'qty', 'reason'],
    },
  },
  {
    name: 'post_update',
    description: 'Post a public update to the agent feed. Use for analysis, news summaries, or status updates.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['analysis', 'news_sentiment', 'status', 'trade'],
          description: 'Type of update',
        },
        content: { type: 'string', description: 'The update text (max 500 chars)' },
        payload: { type: 'object', description: 'Optional structured data (sentiment, markets, etc.)' },
      },
      required: ['type', 'content'],
    },
  },
]

// ── Tool execution ─────────────────────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  toolInput: Record<string, any>,
  agentId: string,
  agentName: string,
  agentDoc: FirebaseFirestore.DocumentSnapshot,
): Promise<ToolResultBlockParam> {
  const id = `tool-${Date.now()}`

  try {
    switch (toolName) {

      case 'get_price': {
        const symbol = String(toolInput.symbol ?? 'BTC').toUpperCase()
        const res = await fetch(
          `https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${symbol}&tsyms=USD`
        )
        const data = await res.json() as any
        const raw = data?.RAW?.[symbol]?.USD
        if (!raw) return result(id, `No price data for ${symbol}`)
        return result(id, JSON.stringify({
          symbol,
          price: Math.round(raw.PRICE * 100) / 100,
          change24h: Math.round(raw.CHANGEPCT24HOUR * 100) / 100,
          high24h: Math.round(raw.HIGH24HOUR * 100) / 100,
          low24h: Math.round(raw.LOW24HOUR * 100) / 100,
          volume24h: Math.round(raw.VOLUME24HOURTO),
        }))
      }

      case 'get_portfolio': {
        const data = agentDoc.data() ?? {}
        const liveState = data.live_state ?? {}
        return result(id, JSON.stringify({
          session_pnl: liveState.session_pnl ?? liveState.unrealizedPnlUsd ?? 0,
          open_positions: liveState.positions ?? liveState.openPositions ?? [],
          total_fills: liveState.total_fills ?? 0,
          status: data.status ?? 'active',
        }))
      }

      case 'get_recent_news': {
        const coins: string[] = toolInput.coins ?? ['BTC']
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const snap = await db.collection('market_news')
          .where('markets', 'array-contains-any', coins.slice(0, 10))
          .where('created_at', '>=', since)
          .orderBy('created_at', 'desc')
          .limit(5)
          .get()
        const news = snap.docs.map(d => {
          const n = d.data()
          return { headline: n.headline, sentiment: n.sentiment, markets: n.markets, source: n.source }
        })
        return result(id, JSON.stringify(news.length > 0 ? news : [{ headline: 'No recent news found' }]))
      }

      case 'paper_trade': {
        const { side, symbol, qty, reason } = toolInput
        const priceRes = await fetch(
          `https://min-api.cryptocompare.com/data/price?fsym=${symbol}&tsyms=USD`
        )
        const priceData = await priceRes.json() as any
        const price = priceData?.USD ?? 0
        const fillPrice = price * (side === 'buy' ? 0.9995 : 1.0005)

        const tradeDoc = {
          agent_id: agentId,
          side,
          symbol: symbol.toUpperCase(),
          qty: Number(qty),
          fillPrice: Math.round(fillPrice * 100) / 100,
          reason,
          type: 'claude_decision',
          created_at: FieldValue.serverTimestamp(),
        }
        await db.collection(`agents/${agentId}/trades`).add(tradeDoc)

        // Write to feed
        const action = side === 'buy' ? 'ENTRY' : 'EXIT'
        await FEED_COL.add({
          agent_id: agentId,
          agent_name: agentName,
          user_id: agentDoc.data()?.user_id ?? '',
          type: 'trade',
          content: `${action} ${qty} ${symbol.toUpperCase()} @ $${Math.round(fillPrice).toLocaleString()} — ${reason}`,
          is_public: agentDoc.data()?.broadcast_enabled ?? true,
          payload: {
            action,
            symbol: symbol.toUpperCase(),
            direction: side === 'buy' ? 'LONG' : 'SHORT',
            entry_price: side === 'buy' ? Math.round(fillPrice) : null,
            exit_price: side === 'sell' ? Math.round(fillPrice) : null,
            qty: Number(qty),
            details: reason,
          },
          created_at: FieldValue.serverTimestamp(),
        })

        return result(id, `${action} ${qty} ${symbol} @ $${Math.round(fillPrice).toLocaleString()} filled`)
      }

      case 'post_update': {
        const { type, content, payload } = toolInput
        await FEED_COL.add({
          agent_id: agentId,
          agent_name: agentName,
          user_id: agentDoc.data()?.user_id ?? '',
          type,
          content: String(content).slice(0, 500),
          is_public: agentDoc.data()?.broadcast_enabled ?? true,
          payload: payload ?? null,
          created_at: FieldValue.serverTimestamp(),
        })
        return result(id, 'Update posted')
      }

      default:
        return result(id, `Unknown tool: ${toolName}`)
    }
  } catch (err: any) {
    return result(id, `Tool error: ${err?.message ?? 'unknown'}`)
  }
}

function result(id: string, content: string): ToolResultBlockParam {
  return { type: 'tool_result', tool_use_id: id, content }
}
