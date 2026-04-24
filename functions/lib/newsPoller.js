"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMarketNewsPoller = runMarketNewsPoller;
const crypto_1 = require("crypto");
const firebase_1 = require("./firebase");
const lunarCrush_1 = require("./lunarCrush");
const TRACKED_MARKETS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'];
const BEARISH_WORDS = [
    'crash', 'drop', 'fall', 'decline', 'plunge', 'sell', 'bear', 'loss', 'ban',
    'hack', 'scam', 'fraud', 'fear', 'risk', 'warning', 'concern', 'collapse', 'dump',
];
const BULLISH_WORDS = [
    'surge', 'rise', 'rally', 'gain', 'bull', 'buy', 'adopt', 'approve', 'launch',
    'milestone', 'record', 'high', 'growth', 'fund', 'invest', 'partner', 'upgrade', 'support',
];
function detectSentiment(headline) {
    const lower = headline.toLowerCase();
    const bullScore = BULLISH_WORDS.filter((word) => lower.includes(word)).length;
    const bearScore = BEARISH_WORDS.filter((word) => lower.includes(word)).length;
    if (bullScore > bearScore)
        return 'bullish';
    if (bearScore > bullScore)
        return 'bearish';
    return 'neutral';
}
function storyId(market, url, headline) {
    const seed = `${market}|${url ?? ''}|${headline}`;
    return (0, crypto_1.createHash)('sha1').update(seed).digest('hex');
}
async function runMarketNewsPoller() {
    try {
        let inserted = 0;
        for (const market of TRACKED_MARKETS) {
            const posts = await (0, lunarCrush_1.fetchTopicPosts)(market, 8);
            for (const post of posts) {
                const headline = String(post.headline ?? '').trim();
                if (!headline)
                    continue;
                const id = storyId(market, post.url, headline);
                const existing = await firebase_1.NEWS_COL.doc(id).get();
                if (existing.exists)
                    continue;
                await firebase_1.NEWS_COL.doc(id).set({
                    headline,
                    summary: headline.slice(0, 280),
                    body: post.rawText,
                    image_url: null,
                    sentiment: detectSentiment(headline),
                    markets: [market],
                    source: `lunarcrush_${post.network ?? 'social'}`,
                    url: post.url,
                    created_at: post.createdAt ?? new Date().toISOString(),
                    fetched_at: firebase_1.FieldValue.serverTimestamp(),
                });
                inserted++;
                console.log(`[news] ${market} · ${headline.slice(0, 80)}`);
            }
        }
        console.log(`[news] LunarCrush poll complete, inserted=${inserted}`);
    }
    catch (err) {
        console.error('[news] poller error:', err?.message ?? err);
    }
}
//# sourceMappingURL=newsPoller.js.map