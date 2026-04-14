"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentPrices = getCurrentPrices;
exports.calcUnrealized = calcUnrealized;
const node_fetch_1 = __importDefault(require("node-fetch"));
// Symbol → CoinGecko ID
const CG_IDS = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana',
    XRP: 'ripple',
    SUI: 'sui',
    HYPE: 'hyperliquid',
    JUP: 'jupiter-exchange-solana',
    JTO: 'jito-governance-token',
    PYTH: 'pyth-network',
    BONK: 'bonk',
    WIF: 'dogwifcoin',
    DOGE: 'dogecoin',
    AVAX: 'avalanche-2',
    MATIC: 'matic-network',
    LINK: 'chainlink',
    DOT: 'polkadot',
    ADA: 'cardano',
    ATOM: 'cosmos',
    LTC: 'litecoin',
    BCH: 'bitcoin-cash',
    NEAR: 'near',
    APT: 'aptos',
    ARB: 'arbitrum',
    OP: 'optimism',
    INJ: 'injective-protocol',
    TIA: 'celestia',
    SEI: 'sei-network',
    RENDER: 'render-token',
    FET: 'fetch-ai',
    TAO: 'bittensor',
};
const cache = new Map();
const CACHE_TTL = 30000; // 30s
let backoffUntil = 0;
const BACKOFF_MS = 60000; // 1 min on 429
async function getCurrentPrices(symbols) {
    const result = new Map();
    const toFetch = [];
    for (const sym of symbols) {
        const upper = sym.toUpperCase();
        const hit = cache.get(upper);
        if (hit && Date.now() - hit.fetchedAt < CACHE_TTL) {
            result.set(upper, hit.price);
        }
        else if (CG_IDS[upper]) {
            toFetch.push(upper);
        }
    }
    if (toFetch.length === 0 || Date.now() < backoffUntil)
        return result;
    const ids = toFetch.map(s => CG_IDS[s]).join(',');
    try {
        const res = await (0, node_fetch_1.default)(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`, { headers: { Accept: 'application/json' } });
        if (res.status === 429) {
            backoffUntil = Date.now() + BACKOFF_MS;
            // Return whatever is cached
            return result;
        }
        if (res.ok) {
            const data = await res.json();
            for (const sym of toFetch) {
                const id = CG_IDS[sym];
                const price = data[id]?.usd;
                if (price) {
                    result.set(sym, price);
                    cache.set(sym, { price, fetchedAt: Date.now() });
                }
            }
        }
    }
    catch {
        // Network error — return what we have
    }
    return result;
}
// Compute unrealized PnL for a position using a live price map
function calcUnrealized(p, prices) {
    // Try explicit fields first
    for (const key of ['unrealizedPnl', 'unrealizedPnlUsd', 'unrealized_pnl', 'unrealized', 'floatingPnl']) {
        if (p[key] !== undefined && p[key] !== null)
            return Number(p[key]);
    }
    // Compute from entry price + live price
    const sym = (p.symbol ?? p.tokenSymbol ?? p.token ?? '').toUpperCase();
    const entry = Number(p.entryPrice ?? 0);
    const size = Number(p.sizeUsd ?? p.positionSize ?? p.size ?? 0);
    const dir = (p.direction ?? p.side ?? 'LONG').toUpperCase();
    const current = prices.get(sym) ?? 0;
    if (!entry || !size || !current)
        return 0;
    const mult = dir === 'SHORT' ? -1 : 1;
    return mult * ((current - entry) / entry) * size;
}
