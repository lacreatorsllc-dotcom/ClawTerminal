"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCP_PROVIDERS = void 0;
const coingecko_1 = require("./coingecko");
const lunarCrush_1 = require("./lunarCrush");
exports.MCP_PROVIDERS = [
    {
        id: 'coingecko',
        label: 'CoinGecko',
        capability: 'Crypto prices, market data, trending assets, and metadata',
        listTools: coingecko_1.listCoinGeckoTools,
    },
    {
        id: 'lunarcrush',
        label: 'LunarCrush',
        capability: 'Market, sentiment, and topic-post intelligence',
        listTools: lunarCrush_1.listLunarCrushTools,
    },
];
//# sourceMappingURL=mcpProviders.js.map