"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCoinGeckoTools = listCoinGeckoTools;
exports.fetchSimplePrices = fetchSimplePrices;
exports.fetchTrendingCoins = fetchTrendingCoins;
const mcpClient_1 = require("./mcpClient");
const coinGeckoMcp = new mcpClient_1.StreamableHttpMcpClient({
    name: 'slugs-coingecko',
    baseUrl: 'https://mcp.api.coingecko.com/mcp',
});
async function executeCoinGeckoJson(code, intent) {
    const text = await coinGeckoMcp.callToolText('execute', { code, intent });
    const parsed = JSON.parse(text);
    return parsed.result;
}
async function listCoinGeckoTools() {
    return coinGeckoMcp.listTools();
}
async function fetchSimplePrices(symbols) {
    const normalized = symbols
        .map((symbol) => String(symbol ?? '').trim().toLowerCase())
        .filter(Boolean);
    if (normalized.length === 0)
        return {};
    const quotedSymbols = normalized.map((symbol) => `'${symbol}'`).join(', ');
    return executeCoinGeckoJson(`async function run(client) {
      return await client.simple.price.get({
        symbols: [${quotedSymbols}].join(','),
        vs_currencies: 'usd',
        include_24hr_change: true,
        include_market_cap: true,
        include_24hr_vol: true,
      })
    }`, `Fetch simple CoinGecko price data for ${normalized.join(', ')}`);
}
async function fetchTrendingCoins(limit = 5) {
    const result = await executeCoinGeckoJson(`async function run(client) {
      return await client.search.trending.get()
    }`, 'Fetch CoinGecko trending coins');
    return (result.coins ?? [])
        .map((entry) => entry.item)
        .filter((item) => Boolean(item?.id))
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
    }));
}
//# sourceMappingURL=coingecko.js.map