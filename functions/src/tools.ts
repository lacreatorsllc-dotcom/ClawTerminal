import { db, FEED_COL, FieldValue } from './firebase'
import type { Tool, ToolResultBlockParam } from '@anthropic-ai/sdk/resources'
import { executeLiveTrade, isLiveTradingEnabled } from './solana'
import { buildAgentMemoryContext } from './agentMemory'
import { fetchSimplePrices, fetchTrendingCoins } from './coingecko'
import { fetchTopicPosts, fetchTopicSnapshot } from './lunarCrush'

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
    name: 'get_social_context',
    description: 'Get LunarCrush social context, sentiment, and narrative for an asset or topic.',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: { type: 'string', description: 'Asset or topic symbol, e.g. BTC, SOL, ETH' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_trending_tokens',
    description: 'Get currently trending crypto assets from CoinGecko.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Number of trending assets to return, max 10' },
      },
      required: [],
    },
  },
  {
    name: 'paper_trade',
    description: 'Execute a trade. If the agent is live-funded, use its funded agent wallet for a real trade. Otherwise, execute a paper trade.',
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
  agentData: Record<string, any>,
): Promise<ToolResultBlockParam> {
  const id = `tool-${Date.now()}`

  try {
    const liveTradingEnabled = isLiveTradingEnabled(agentData)

    switch (toolName) {

      case 'get_price': {
        const symbol = String(toolInput.symbol ?? 'BTC').toUpperCase()
        try {
          const prices = await fetchSimplePrices([symbol])
          const coinGeckoPrice = prices[symbol.toLowerCase()]
          if (coinGeckoPrice?.usd != null) {
            return result(id, JSON.stringify({
              symbol,
              price: Math.round(coinGeckoPrice.usd * 100) / 100,
              change24h: coinGeckoPrice.usd_24h_change != null
                ? Math.round(coinGeckoPrice.usd_24h_change * 100) / 100
                : null,
              marketCap: coinGeckoPrice.usd_market_cap ?? null,
              volume24h: coinGeckoPrice.usd_24h_vol ?? null,
              source: 'coingecko_mcp',
            }))
          }
        } catch (err) {
          console.warn(`[tools] CoinGecko get_price fallback for ${symbol}:`, err)
        }

        try {
          const snapshot = await fetchTopicSnapshot(symbol)
          if (snapshot.price != null) {
            return result(id, JSON.stringify({
              symbol: snapshot.symbol,
              price: Math.round(snapshot.price * 100) / 100,
              change1h: snapshot.change1h != null ? Math.round(snapshot.change1h * 100) / 100 : null,
              change24h: snapshot.change24h != null ? Math.round(snapshot.change24h * 100) / 100 : null,
              change7d: snapshot.change7d != null ? Math.round(snapshot.change7d * 100) / 100 : null,
              sentiment: snapshot.sentimentPct,
              source: 'lunarcrush_mcp',
            }))
          }
        } catch (err) {
          console.warn(`[tools] LunarCrush get_price fallback for ${symbol}:`, err)
        }

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
          source: 'cryptocompare',
        }))
      }

      case 'get_portfolio': {
        const data = agentData ?? {}
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
        try {
          const livePosts = await Promise.all(
            coins.slice(0, 3).map(async (coin) => {
              const posts = await fetchTopicPosts(coin, 3)
              return posts.map((post, index) => ({
                id: `${coin}-${post.url ?? index}`,
                headline: post.headline,
                summary: null,
                body: post.rawText,
                sentiment: detectSentiment(post.headline),
                markets: [String(coin).toUpperCase()],
                source: `lunarcrush_${post.network ?? 'social'}`,
                url: post.url,
                created_at: post.createdAt,
              }))
            }),
          )

          const flattened = livePosts
            .flat()
            .slice(0, 6)

          if (flattened.length > 0) {
            return result(id, JSON.stringify(flattened))
          }
        } catch (err) {
          console.warn(`[tools] LunarCrush get_recent_news fallback:`, err)
        }

        const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
        const snap = await db.collection('market_news')
          .where('markets', 'array-contains-any', coins.slice(0, 10))
          .where('created_at', '>=', since)
          .orderBy('created_at', 'desc')
          .limit(5)
          .get()
        const news = snap.docs.map(d => {
          const n = d.data()
          return {
            id: d.id,
            headline: n.headline,
            summary: n.summary ?? null,
            body: n.body ?? null,
            sentiment: n.sentiment,
            markets: n.markets,
            source: n.source,
            url: n.url ?? null,
            created_at: n.created_at ?? null,
          }
        })
        return result(id, JSON.stringify(news.length > 0 ? news : [{ headline: 'No recent news found' }]))
      }

      case 'get_social_context': {
        const symbol = String(toolInput.symbol ?? 'BTC').toUpperCase()
        const snapshot = await fetchTopicSnapshot(symbol)
        return result(id, JSON.stringify({
          symbol: snapshot.symbol,
          topic: snapshot.topic,
          name: snapshot.name,
          price: snapshot.price,
          change1h: snapshot.change1h,
          change24h: snapshot.change24h,
          change7d: snapshot.change7d,
          sentimentPct: snapshot.sentimentPct,
          narrative: snapshot.narrative,
          source: 'lunarcrush_mcp',
        }))
      }

      case 'get_trending_tokens': {
        const limit = Number(toolInput.limit ?? 5)
        const trending = await fetchTrendingCoins(limit)
        return result(id, JSON.stringify(trending))
      }

      case 'paper_trade': {
        const { side, symbol, qty, reason } = toolInput
        const strategySnapshot = {
          strategy: String(agentData.strategy ?? agentData.metadata?.strategy ?? 'Grid Trader'),
          custom_description: agentData.custom_description ?? agentData.metadata?.customDescription ?? null,
          skills: Array.isArray(agentData.skills ?? agentData.metadata?.skills)
            ? (agentData.skills ?? agentData.metadata?.skills)
            : [],
          coin: String(agentData.coin ?? agentData.metadata?.coin ?? symbol ?? 'BTC').toUpperCase(),
        }
        const memoryContext = await buildAgentMemoryContext(agentId)
        const priceRes = await fetch(
          `https://min-api.cryptocompare.com/data/price?fsym=${symbol}&tsyms=USD`
        )
        const priceData = await priceRes.json() as any
        const price = priceData?.USD ?? 0
        const normalizedSymbol = String(symbol ?? 'BTC').toUpperCase()
        let fillPrice = price * (side === 'buy' ? 0.9995 : 1.0005)
        let executionMode: 'paper' | 'live' = 'paper'
        let txSignature: string | null = null

        if (liveTradingEnabled) {
          const liveTrade = await executeLiveTrade({
            agentId,
            side,
            symbol: normalizedSymbol,
            qty: Number(qty),
          })
          executionMode = 'live'
          txSignature = liveTrade.signature
          if (liveTrade.fillPrice != null) {
            fillPrice = liveTrade.fillPrice
          }
        }

        let realizedPnl: number | null = null
        let realizedPnlPct: number | null = null
        let matchedEntryPrice: number | null = null

        if (side === 'sell') {
          const priorTrades = await db.collection(`agents/${agentId}/trades`)
            .where('symbol', '==', normalizedSymbol)
            .where('side', '==', 'buy')
            .orderBy('created_at', 'desc')
            .limit(20)
            .get()

          const latestEntry = priorTrades.docs
            .map((doc) => doc.data())
            .find((doc) => typeof doc.fillPrice === 'number')

          if (latestEntry?.fillPrice) {
            matchedEntryPrice = Number(latestEntry.fillPrice)
            realizedPnl = (fillPrice - matchedEntryPrice) * Number(qty)
            realizedPnlPct = matchedEntryPrice > 0
              ? ((fillPrice - matchedEntryPrice) / matchedEntryPrice) * 100
              : null
          }
        }

        const tradeDoc = {
          agent_id: agentId,
          side,
          symbol: normalizedSymbol,
          qty: Number(qty),
          fillPrice: Math.round(fillPrice * 100) / 100,
          reason,
          type: executionMode === 'live' ? 'claude_live' : 'claude_decision',
          execution_mode: executionMode,
          tx_signature: txSignature,
          realized_pnl: realizedPnl != null ? Math.round(realizedPnl * 100) / 100 : null,
          realized_pnl_pct: realizedPnlPct != null ? Math.round(realizedPnlPct * 100) / 100 : null,
          matched_entry_price: matchedEntryPrice,
          strategy_snapshot: strategySnapshot,
          memory_snapshot: memoryContext,
          created_at: FieldValue.serverTimestamp(),
        }
        await db.collection(`agents/${agentId}/trades`).add(tradeDoc)
        await db.collection(`agents/${agentId}/decisions`).add({
          actionType: actionForSide(side),
          symbol: normalizedSymbol,
          tokenSymbol: normalizedSymbol,
          reason,
          details: `${reason} | mode=${executionMode} | qty=${Number(qty)} | price=${Math.round(fillPrice * 100) / 100}`,
          execution_mode: executionMode,
          strategy_snapshot: strategySnapshot,
          memory_snapshot: memoryContext,
          tx_signature: txSignature,
          created_at: FieldValue.serverTimestamp(),
        })

        // Write to feed
        const action = side === 'buy' ? 'ENTRY' : 'EXIT'
        const roundedFillPrice = Math.round(fillPrice * 100) / 100
        const roundedPnl = realizedPnl != null ? Math.round(realizedPnl * 100) / 100 : null
        const pnlSummary = roundedPnl != null
          ? ` · PnL ${roundedPnl >= 0 ? '+' : '-'}$${Math.abs(roundedPnl).toFixed(2)}`
          : ''
        const liveBadge = executionMode === 'live' ? ' · live wallet' : ''
        await FEED_COL.add({
          agent_id: agentId,
          agent_name: agentName,
          user_id: agentData?.user_id ?? '',
          type: 'trade',
          content: `${action} ${qty} ${normalizedSymbol} @ $${Math.round(roundedFillPrice).toLocaleString()}${pnlSummary}${liveBadge} — ${reason}`,
          is_public: agentData?.broadcast_enabled ?? true,
          payload: {
            action,
            symbol: normalizedSymbol,
            direction: side === 'buy' ? 'LONG' : 'SHORT',
            entry_price: side === 'buy' ? roundedFillPrice : matchedEntryPrice,
            exit_price: side === 'sell' ? roundedFillPrice : null,
            qty: Number(qty),
            details: reason,
            pnl: roundedPnl,
            pnl_pct: realizedPnlPct != null ? Math.round(realizedPnlPct * 100) / 100 : null,
            execution_mode: executionMode,
            tx_signature: txSignature,
            strategy_snapshot: strategySnapshot,
          },
          created_at: FieldValue.serverTimestamp(),
        })

        return result(
          id,
          `${executionMode === 'live' ? 'LIVE' : 'PAPER'} ${action} ${qty} ${normalizedSymbol} @ $${Math.round(roundedFillPrice).toLocaleString()}${pnlSummary}${txSignature ? ` · tx ${txSignature}` : ''} filled`
        )
      }

      case 'post_update': {
        const { type, content, payload } = toolInput
        const trimmedContent = String(content).slice(0, 500)

        // Avoid repeatedly posting the same news/status item on every scheduled tick.
        if (type === 'news_sentiment' || type === 'status' || type === 'analysis') {
          const since = new Date(Date.now() - 12 * 60 * 60 * 1000)
          const existing = await FEED_COL
            .where('agent_id', '==', agentId)
            .where('type', '==', type)
            .where('created_at', '>=', since)
            .orderBy('created_at', 'desc')
            .limit(10)
            .get()

          const duplicate = existing.docs.some((doc) => {
            const data = doc.data()
            return String(data.content ?? '') === trimmedContent
          })

          if (duplicate) {
            return result(id, 'Duplicate update skipped')
          }
        }

        await FEED_COL.add({
          agent_id: agentId,
          agent_name: agentName,
          user_id: agentData?.user_id ?? '',
          type,
          content: trimmedContent,
          is_public: agentData?.broadcast_enabled ?? true,
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

function actionForSide(side: unknown) {
  return String(side) === 'buy' ? 'ENTRY' : 'EXIT'
}

function detectSentiment(text: string): 'bullish' | 'bearish' | 'neutral' {
  const lower = String(text ?? '').toLowerCase()
  const bullish = ['surge', 'rise', 'rally', 'gain', 'bull', 'buy', 'adopt', 'launch', 'approve']
  const bearish = ['crash', 'drop', 'fall', 'decline', 'plunge', 'sell', 'bear', 'hack', 'warning']
  const bullScore = bullish.filter((word) => lower.includes(word)).length
  const bearScore = bearish.filter((word) => lower.includes(word)).length

  if (bullScore > bearScore) return 'bullish'
  if (bearScore > bullScore) return 'bearish'
  return 'neutral'
}
