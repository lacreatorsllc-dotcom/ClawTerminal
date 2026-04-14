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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http = __importStar(require("http"));
const openai_1 = __importDefault(require("openai"));
const firebase_1 = require("./firebase");
const api_1 = require("./api");
const poller_1 = require("./poller");
const chat_1 = require("./chat");
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
process.on('uncaughtException', (err) => {
    console.error('[tb-bridge] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[tb-bridge] unhandledRejection:', reason);
});
// Track running agents to avoid duplicate listeners
const runningAgents = new Set();
function activateAgent(firestoreId, apiKey, tbAgentId, tbTraderId, agentName, openaiKey) {
    if (runningAgents.has(firestoreId))
        return;
    runningAgents.add(firestoreId);
    (0, poller_1.startPoller)(firestoreId, apiKey, tbAgentId, tbTraderId, openaiKey);
    (0, chat_1.startChatListener)(firestoreId, apiKey, tbAgentId, agentName, openaiKey);
    console.log(`[tb-bridge] activated agent ${firestoreId} (${agentName}) openai=${openaiKey ? 'yes' : 'no'}`);
}
function parseBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
            try {
                const raw = Buffer.concat(chunks).toString();
                resolve(raw ? JSON.parse(raw) : {});
            }
            catch (e) {
                reject(new Error('Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}
function send(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(payload);
}
const server = http.createServer(async (req, res) => {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';
    // Health check
    if (method === 'GET' && (url === '/' || url === '/health')) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('tb-bridge running');
        return;
    }
    // OpenAI connectivity test
    if (method === 'GET' && url === '/test-openai') {
        try {
            const result = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: 'Reply with just: OK' }],
                max_tokens: 5,
            }, { timeout: 15000 });
            const reply = result.choices[0]?.message?.content ?? '?';
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(`OpenAI OK: ${reply}`);
        }
        catch (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(`OpenAI error: ${err?.message} | code: ${err?.code} | type: ${err?.type}`);
        }
        return;
    }
    // Connect endpoint
    if (method === 'POST' && url === '/connect') {
        try {
            const body = await parseBody(req);
            const { userId, apiKey, openaiKey } = body;
            if (!userId || typeof userId !== 'string') {
                return send(res, 400, { error: 'userId is required' });
            }
            if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('tb_')) {
                return send(res, 400, { error: 'apiKey must start with tb_' });
            }
            // Discover agents from trading-boy API
            const tbAgents = await (0, api_1.listAgents)(apiKey);
            const connectedAgents = [];
            for (const agent of tbAgents) {
                // Check if a Firestore doc already exists for this agent + user
                const existing = await firebase_1.db
                    .collection('agents')
                    .where('tb_agent_id', '==', agent.id)
                    .where('user_id', '==', userId)
                    .limit(1)
                    .get();
                let firestoreId;
                if (existing.empty) {
                    // Create new doc
                    const docRef = await firebase_1.db.collection('agents').add({
                        user_id: userId,
                        name: agent.name,
                        agent_type: 'cabal_trading_boy',
                        tb_agent_id: agent.id,
                        tb_trader_id: agent.traderId,
                        tb_api_key: apiKey,
                        openai_api_key: openaiKey ?? null,
                        status: 'connected',
                        autonomy_level: agent.autonomyLevel,
                        watchlist: agent.watchlist,
                        tick_count: agent.tickCount,
                        last_tick_at: agent.lastTickAt,
                        next_scan_at: agent.nextScanAt,
                        live_state: null,
                        live_admin: null,
                        last_synced: null,
                        created_at: firebase_1.FieldValue.serverTimestamp(),
                    });
                    firestoreId = docRef.id;
                }
                else {
                    // Update existing doc
                    const docRef = existing.docs[0].ref;
                    firestoreId = docRef.id;
                    await docRef.update({
                        name: agent.name,
                        tb_api_key: apiKey,
                        ...(openaiKey ? { openai_api_key: openaiKey } : {}),
                        status: 'connected',
                        autonomy_level: agent.autonomyLevel,
                        watchlist: agent.watchlist,
                        tick_count: agent.tickCount,
                        last_tick_at: agent.lastTickAt,
                        next_scan_at: agent.nextScanAt,
                    });
                }
                // Activate poller + chat listener
                // If re-connecting an already-running agent with a new key, update its listener
                const currentOpenaiKey = openaiKey ?? (existing.empty ? undefined : existing.docs[0].data().openai_api_key);
                activateAgent(firestoreId, apiKey, agent.id, agent.traderId, agent.name, currentOpenaiKey);
                connectedAgents.push({ id: firestoreId, name: agent.name, tbAgentId: agent.id });
            }
            return send(res, 200, { agents: connectedAgents });
        }
        catch (err) {
            console.error('[tb-bridge] /connect error:', err?.message ?? err);
            return send(res, 400, { error: err?.message ?? 'Connect failed' });
        }
    }
    // 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
});
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
async function startup() {
    // Load all existing cabal_trading_boy agents from Firestore
    const snap = await firebase_1.db.collection('agents').where('agent_type', '==', 'cabal_trading_boy').get();
    let count = 0;
    for (const doc of snap.docs) {
        const data = doc.data();
        if (data.tb_agent_id && data.tb_trader_id && data.tb_api_key) {
            activateAgent(doc.id, data.tb_api_key, data.tb_agent_id, data.tb_trader_id, data.name ?? 'Agent', data.openai_api_key ?? undefined);
            count++;
        }
    }
    console.log(`[tb-bridge] started — watching ${count} existing agents`);
    // Watch for new agents added after startup
    firebase_1.db.collection('agents')
        .where('agent_type', '==', 'cabal_trading_boy')
        .onSnapshot((snap) => {
        for (const change of snap.docChanges()) {
            if (change.type !== 'added')
                continue;
            const data = change.doc.data();
            if (data.tb_agent_id && data.tb_trader_id && data.tb_api_key && !runningAgents.has(change.doc.id)) {
                activateAgent(change.doc.id, data.tb_api_key, data.tb_agent_id, data.tb_trader_id, data.name ?? 'Agent', data.openai_api_key ?? undefined);
            }
        }
    });
    server.listen(PORT, () => {
        console.log(`[tb-bridge] HTTP server listening on port ${PORT}`);
    });
}
startup().catch((err) => {
    console.error('[tb-bridge] startup failed:', err);
    process.exit(1);
});
