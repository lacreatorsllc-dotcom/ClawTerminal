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
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const firebase_1 = require("./firebase");
const agentSecrets_1 = require("./agentSecrets");
const api_1 = require("./api");
const poller_1 = require("./poller");
const chat_1 = require("./chat");
let _openai = null;
function getOpenAI() {
    if (!_openai)
        _openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
    return _openai;
}
const anthropic = new sdk_1.default({ apiKey: process.env.ANTHROPIC_API_KEY });
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
            const result = await getOpenAI().chat.completions.create({
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
                const secretsRef = (id) => id.collection(agentSecrets_1.AGENT_PRIVATE_COLLECTION).doc(agentSecrets_1.AGENT_SECRETS_DOC_ID);
                if (existing.empty) {
                    const docRef = firebase_1.db.collection('agents').doc();
                    const batch = firebase_1.db.batch();
                    batch.set(docRef, {
                        user_id: userId,
                        name: agent.name,
                        agent_type: 'cabal_trading_boy',
                        tb_agent_id: agent.id,
                        tb_trader_id: agent.traderId,
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
                    const secretFields = {
                        tb_api_key: apiKey,
                        updated_at: firebase_1.FieldValue.serverTimestamp(),
                    };
                    if (openaiKey)
                        secretFields.openai_api_key = openaiKey;
                    batch.set(secretsRef(docRef), secretFields);
                    await batch.commit();
                    firestoreId = docRef.id;
                }
                else {
                    const docRef = existing.docs[0].ref;
                    firestoreId = docRef.id;
                    const batch = firebase_1.db.batch();
                    batch.update(docRef, {
                        name: agent.name,
                        status: 'connected',
                        autonomy_level: agent.autonomyLevel,
                        watchlist: agent.watchlist,
                        tick_count: agent.tickCount,
                        last_tick_at: agent.lastTickAt,
                        next_scan_at: agent.nextScanAt,
                    });
                    const secretFields = {
                        tb_api_key: apiKey,
                        updated_at: firebase_1.FieldValue.serverTimestamp(),
                    };
                    if (openaiKey)
                        secretFields.openai_api_key = openaiKey;
                    batch.set(secretsRef(docRef), secretFields, { merge: true });
                    await batch.commit();
                }
                const docRef = firebase_1.db.collection('agents').doc(firestoreId);
                const secSnap = await secretsRef(docRef).get();
                const currentOpenaiKey = openaiKey ?? secSnap.data()?.openai_api_key ?? undefined;
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
    // Create Claude Managed Agent
    if (method === 'POST' && url === '/claude-agents/create') {
        try {
            const body = await parseBody(req);
            const { userId, name, strategy, skills } = body;
            if (!userId || typeof userId !== 'string') {
                return send(res, 400, { error: 'userId is required' });
            }
            if (!name || typeof name !== 'string') {
                return send(res, 400, { error: 'name is required' });
            }
            const skillsList = Array.isArray(skills) ? skills : [];
            const systemPrompt = [
                `You are ${name}, an AI trading agent built on Claude.`,
                `Strategy: ${strategy ?? 'Grid Trader'}.`,
                `Your active capabilities: ${skillsList.length > 0 ? skillsList.join(', ') : 'general market analysis'}.`,
                `You monitor markets, analyze opportunities, and provide trading insights.`,
                `Always be concise, data-driven, and risk-aware in your responses.`,
            ].join(' ');
            // Create environment (persistent sandbox for sessions)
            const env = await anthropic.beta.environments.create({
                name: `${name} Environment`,
            });
            // Create the persistent agent with the standard toolset
            const agent = await anthropic.beta.agents.create({
                name,
                model: 'claude-opus-4-7',
                system: systemPrompt,
                tools: [{ type: 'agent_toolset_20260401' }],
            });
            console.log(`[tb-bridge] created claude agent ${agent.id} env ${env.id} for user ${userId}`);
            return send(res, 200, { claudeAgentId: agent.id, claudeEnvId: env.id });
        }
        catch (err) {
            console.error('[tb-bridge] /claude-agents/create error:', err?.message ?? err);
            return send(res, 500, { error: err?.message ?? 'Agent creation failed' });
        }
    }
    // 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
});
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
async function startup() {
    let count = 0;
    // Load all existing cabal_trading_boy agents
    const tbSnap = await firebase_1.db.collection('agents').where('agent_type', '==', 'cabal_trading_boy').get();
    for (const doc of tbSnap.docs) {
        const data = await (0, agentSecrets_1.getAgentDataWithSecrets)(doc);
        if (data.tb_agent_id && data.tb_trader_id && data.tb_api_key) {
            activateAgent(doc.id, data.tb_api_key, data.tb_agent_id, data.tb_trader_id, data.name ?? 'Agent', data.openai_api_key ?? undefined);
            count++;
        }
    }
    // Load all existing market_advisor agents
    const advisorSnap = await firebase_1.db.collection('agents').where('agent_type', '==', 'market_advisor').get();
    for (const doc of advisorSnap.docs) {
        const data = await (0, agentSecrets_1.getAgentDataWithSecrets)(doc);
        if (data.user_id && !runningAgents.has(doc.id)) {
            runningAgents.add(doc.id);
            (0, chat_1.startMarketAdvisorChatListener)(doc.id, data.user_id, data.name ?? 'Market Advisor', data.gemini_api_key ?? '');
            count++;
        }
    }
    // Load all existing range_farmer agents (per-user instances)
    const rangerSnap = await firebase_1.db.collection('agents').where('agent_type', '==', 'range_farmer').get();
    for (const doc of rangerSnap.docs) {
        const data = doc.data();
        if (!runningAgents.has(doc.id)) {
            runningAgents.add(doc.id);
            (0, chat_1.startRangeFarmerChatListener)(doc.id, data.name ?? 'Range Farmer', data.coin ?? 'BTC');
            count++;
        }
    }
    // Always start slug-001 listener (shared paper agent used by all users)
    if (!runningAgents.has('slug-001')) {
        runningAgents.add('slug-001');
        (0, chat_1.startRangeFarmerChatListener)('slug-001', 'Slug #001', 'BTC');
        console.log(`[tb-bridge] activated slug-001 chat listener`);
    }
    console.log(`[tb-bridge] started — watching ${count} existing agents`);
    // Watch for new cabal_trading_boy agents
    firebase_1.db.collection('agents')
        .where('agent_type', '==', 'cabal_trading_boy')
        .onSnapshot((snap) => {
        void Promise.all(snap.docChanges().map(async (change) => {
            if (change.type !== 'added')
                return;
            const data = await (0, agentSecrets_1.getAgentDataWithSecrets)(change.doc);
            if (data.tb_agent_id &&
                data.tb_trader_id &&
                data.tb_api_key &&
                !runningAgents.has(change.doc.id)) {
                activateAgent(change.doc.id, data.tb_api_key, data.tb_agent_id, data.tb_trader_id, data.name ?? 'Agent', data.openai_api_key ?? undefined);
            }
        }));
    });
    // Watch for new market_advisor agents
    firebase_1.db.collection('agents')
        .where('agent_type', '==', 'market_advisor')
        .onSnapshot((snap) => {
        void Promise.all(snap.docChanges().map(async (change) => {
            if (change.type !== 'added')
                return;
            const data = await (0, agentSecrets_1.getAgentDataWithSecrets)(change.doc);
            if (data.user_id && !runningAgents.has(change.doc.id)) {
                runningAgents.add(change.doc.id);
                (0, chat_1.startMarketAdvisorChatListener)(change.doc.id, data.user_id, data.name ?? 'Market Advisor', data.gemini_api_key ?? '');
                console.log(`[tb-bridge] activated market advisor ${change.doc.id}`);
            }
        }));
    });
    // Watch for new range_farmer agents
    firebase_1.db.collection('agents')
        .where('agent_type', '==', 'range_farmer')
        .onSnapshot((snap) => {
        for (const change of snap.docChanges()) {
            if (change.type !== 'added')
                continue;
            const data = change.doc.data();
            if (!runningAgents.has(change.doc.id)) {
                runningAgents.add(change.doc.id);
                (0, chat_1.startRangeFarmerChatListener)(change.doc.id, data.name ?? 'Range Farmer', data.coin ?? 'BTC');
                console.log(`[tb-bridge] activated range farmer ${change.doc.id} (${data.coin ?? 'BTC'})`);
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
