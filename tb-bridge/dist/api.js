"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAgents = listAgents;
exports.fetchAgentStatus = fetchAgentStatus;
exports.fetchDecisions = fetchDecisions;
exports.pauseAgent = pauseAgent;
exports.resumeAgent = resumeAgent;
const node_fetch_1 = __importDefault(require("node-fetch"));
const BASE = 'https://api.cabal.ventures';
function headers(apiKey) {
    return {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
    };
}
async function checkResponse(res, label) {
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`${label} failed: ${res.status} ${res.statusText} — ${body}`);
    }
}
async function listAgents(apiKey) {
    const res = await (0, node_fetch_1.default)(`${BASE}/api/v1/agents`, { headers: headers(apiKey) });
    await checkResponse(res, 'listAgents');
    const data = await res.json();
    return data.agents;
}
async function fetchAgentStatus(apiKey, agentId) {
    const res = await (0, node_fetch_1.default)(`${BASE}/api/v1/agents/${agentId}`, { headers: headers(apiKey) });
    await checkResponse(res, 'fetchAgentStatus');
    return res.json();
}
async function fetchDecisions(apiKey, traderId, limit = 20) {
    const url = `${BASE}/api/v1/decisions?traderId=${encodeURIComponent(traderId)}&limit=${limit}`;
    const res = await (0, node_fetch_1.default)(url, { headers: headers(apiKey) });
    await checkResponse(res, 'fetchDecisions');
    const data = await res.json();
    return data.decisions;
}
async function pauseAgent(apiKey, agentId) {
    const res = await (0, node_fetch_1.default)(`${BASE}/api/v1/agents/${agentId}/pause`, {
        method: 'POST',
        headers: headers(apiKey),
    });
    await checkResponse(res, 'pauseAgent');
}
async function resumeAgent(apiKey, agentId) {
    const res = await (0, node_fetch_1.default)(`${BASE}/api/v1/agents/${agentId}/resume`, {
        method: 'POST',
        headers: headers(apiKey),
    });
    await checkResponse(res, 'resumeAgent');
}
