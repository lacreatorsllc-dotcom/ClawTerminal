"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const http = __importStar(require("http"));
const trading_1 = require("./trading");
const chat_1 = require("./chat");
// Prevent any unhandled error from crashing the process
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
const PORT = process.env.PORT ?? 8080;
const TRADING_INTERVAL_MS = 30000; // 30 seconds
// Cloud Run requires an HTTP server
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200).end('ok');
    }
    else {
        res.writeHead(200).end('Slug #001 trading agent is running.');
    }
});
server.listen(PORT, () => {
    console.log(`[server] listening on :${PORT}`);
    // Start trading loop immediately, then every 30s
    (0, trading_1.runTradingLoop)();
    setInterval(trading_1.runTradingLoop, TRADING_INTERVAL_MS);
    // Start chat listener
    (0, chat_1.startChatListener)();
    console.log('[slug-001] agent started');
});
