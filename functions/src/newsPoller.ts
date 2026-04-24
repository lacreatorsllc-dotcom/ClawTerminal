import { createHash } from 'crypto'
import { FieldValue, NEWS_COL } from './firebase'
import { fetchTopicPosts } from './lunarCrush'

const TRACKED_MARKETS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE']

const BEARISH_WORDS = [
  'crash', 'drop', 'fall', 'decline', 'plunge', 'sell', 'bear', 'loss', 'ban',
  'hack', 'scam', 'fraud', 'fear', 'risk', 'warning', 'concern', 'collapse', 'dump',
]

const BULLISH_WORDS = [
  'surge', 'rise', 'rally', 'gain', 'bull', 'buy', 'adopt', 'approve', 'launch',
  'milestone', 'record', 'high', 'growth', 'fund', 'invest', 'partner', 'upgrade', 'support',
]

function detectSentiment(headline: string): 'bullish' | 'bearish' | 'neutral' {
  const lower = headline.toLowerCase()
  const bullScore = BULLISH_WORDS.filter((word) => lower.includes(word)).length
  const bearScore = BEARISH_WORDS.filter((word) => lower.includes(word)).length

  if (bullScore > bearScore) return 'bullish'
  if (bearScore > bullScore) return 'bearish'
  return 'neutral'
}

function storyId(market: string, url: string | null, headline: string) {
  const seed = `${market}|${url ?? ''}|${headline}`
  return createHash('sha1').update(seed).digest('hex')
}

export async function runMarketNewsPoller(): Promise<void> {
  try {
    let inserted = 0

    for (const market of TRACKED_MARKETS) {
      const posts = await fetchTopicPosts(market, 8)

      for (const post of posts) {
        const headline = String(post.headline ?? '').trim()
        if (!headline) continue

        const id = storyId(market, post.url, headline)
        const existing = await NEWS_COL.doc(id).get()
        if (existing.exists) continue

        await NEWS_COL.doc(id).set({
          headline,
          summary: headline.slice(0, 280),
          body: post.rawText,
          image_url: null,
          sentiment: detectSentiment(headline),
          markets: [market],
          source: `lunarcrush_${post.network ?? 'social'}`,
          url: post.url,
          created_at: post.createdAt ?? new Date().toISOString(),
          fetched_at: FieldValue.serverTimestamp(),
        })

        inserted++
        console.log(`[news] ${market} · ${headline.slice(0, 80)}`)
      }
    }

    console.log(`[news] LunarCrush poll complete, inserted=${inserted}`)
  } catch (err: any) {
    console.error('[news] poller error:', err?.message ?? err)
  }
}
