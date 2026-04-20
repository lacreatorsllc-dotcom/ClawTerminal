import { db, FieldValue } from './firebase'

const NEWS_COL = db.collection('market_news')
const NEWS_API = 'https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest'

// Maps CryptoCompare category tags → coin symbols we care about
const CATEGORY_COINS: Record<string, string[]> = {
  BTC: ['BTC'], ETH: ['ETH'], SOL: ['SOL'], BNB: ['BNB'], XRP: ['XRP'],
  DOGE: ['DOGE'], ADA: ['ADA'], AVAX: ['AVAX'], MATIC: ['MATIC'], DOT: ['DOT'],
  LINK: ['LINK'], UNI: ['UNI'], LTC: ['LTC'], BCH: ['BCH'], ATOM: ['ATOM'],
  Trading: ['BTC', 'ETH'], Altcoin: ['ETH', 'SOL', 'BNB'], Market: ['BTC', 'ETH'],
  DeFi: ['ETH', 'UNI', 'LINK'], NFT: ['ETH', 'SOL'], Regulation: ['BTC', 'ETH'],
  Exchange: ['BTC', 'ETH'], Mining: ['BTC'], Stablecoin: ['BTC', 'ETH'],
}

const BEARISH_WORDS = ['crash', 'drop', 'fall', 'decline', 'plunge', 'sell', 'bear', 'loss', 'ban', 'hack', 'scam', 'fraud', 'fear', 'risk', 'warning', 'concern', 'collapse', 'dump']
const BULLISH_WORDS = ['surge', 'rise', 'rally', 'gain', 'bull', 'buy', 'adopt', 'approve', 'launch', 'milestone', 'record', 'high', 'growth', 'fund', 'invest', 'partner', 'upgrade', 'support']

function detectSentiment(headline: string): 'bullish' | 'bearish' | 'neutral' {
  const lower = headline.toLowerCase()
  const bullScore = BULLISH_WORDS.filter(w => lower.includes(w)).length
  const bearScore = BEARISH_WORDS.filter(w => lower.includes(w)).length
  if (bullScore > bearScore) return 'bullish'
  if (bearScore > bullScore) return 'bearish'
  return 'neutral'
}

function extractMarkets(categories: string, tags: string): string[] {
  const coins = new Set<string>()
  const parts = [...categories.split('|'), ...tags.split('|')].map(s => s.trim())
  for (const part of parts) {
    const mapped = CATEGORY_COINS[part]
    if (mapped) mapped.forEach(c => coins.add(c))
  }
  return Array.from(coins).slice(0, 6)
}

let lastFetchedIds = new Set<number>()

export async function runNewsPoller() {
  try {
    const res = await fetch(NEWS_API)
    if (!res.ok) return
    const json = await res.json() as any
    const articles: any[] = json.Data ?? []

    for (const article of articles.slice(0, 20)) {
      const storyId = String(article.id)
      if (lastFetchedIds.has(article.id)) continue

      // Dedup check against Firestore
      const existing = await NEWS_COL.doc(storyId).get()
      if (existing.exists) { lastFetchedIds.add(article.id); continue }

      const markets = extractMarkets(article.categories ?? '', article.tags ?? '')
      if (markets.length === 0) continue // skip if no recognizable market

      const sentiment = detectSentiment(article.title ?? '')
      const publishedAt = new Date((article.published_on ?? Date.now() / 1000) * 1000)

      await NEWS_COL.doc(storyId).set({
        headline: article.title,
        summary: article.body ? article.body.slice(0, 280) : null,
        sentiment,
        markets,
        source: article.source_info?.name ?? article.source ?? 'Crypto News',
        url: article.url ?? null,
        created_at: publishedAt.toISOString(),
        fetched_at: FieldValue.serverTimestamp(),
      })

      lastFetchedIds.add(article.id)
      console.log(`[news] ${sentiment} · ${markets.join(',')} · ${article.title?.slice(0, 60)}`)
    }

    // Keep the in-memory set from growing unbounded
    if (lastFetchedIds.size > 500) lastFetchedIds = new Set(Array.from(lastFetchedIds).slice(-200))
  } catch (err) {
    console.error('[news poller error]', err)
  }
}
