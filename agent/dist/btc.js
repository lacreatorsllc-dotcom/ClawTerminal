"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBtcPrice = getBtcPrice;
// Fetch BTC/USDT price from CoinGecko (no key needed, no geo-restrictions)
async function getBtcPrice() {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true');
    if (!res.ok)
        throw new Error(`CoinGecko API error: ${res.status}`);
    const data = await res.json();
    return {
        price: data.bitcoin.usd,
        change24h: data.bitcoin.usd_24h_change,
    };
}
