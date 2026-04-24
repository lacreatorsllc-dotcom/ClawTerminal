"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectProvider = detectProvider;
exports.resolveAgentProvider = resolveAgentProvider;
exports.anthropicToolsToOpenAi = anthropicToolsToOpenAi;
exports.createOpenAiCompatibleResponse = createOpenAiCompatibleResponse;
exports.createAnthropicClient = createAnthropicClient;
exports.anthropicModel = anthropicModel;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const firebase_1 = require("./firebase");
function detectProvider(apiKey) {
    const key = apiKey.trim();
    if (!key)
        return null;
    if (key.startsWith('AIza'))
        return 'gemini';
    if (key.startsWith('sk-') && !key.startsWith('sk-ant-'))
        return 'openai';
    if (key.startsWith('sk-ant-'))
        return 'anthropic';
    return null;
}
async function resolveAgentProvider(agent, platformAnthropicKey, platformGeminiKey) {
    const userId = String(agent.user_id ?? '');
    const profileKey = userId
        ? String((await firebase_1.db.doc(`users/${userId}`).get()).data()?.ai_api_key ?? '').trim()
        : '';
    const directGeminiKey = String(agent.gemini_api_key ?? '').trim();
    const candidate = profileKey || directGeminiKey;
    if (candidate) {
        const provider = detectProvider(candidate);
        if (provider)
            return { provider, apiKey: candidate };
    }
    const geminiFallback = String(platformGeminiKey ?? '').trim();
    if (geminiFallback)
        return { provider: 'gemini', apiKey: geminiFallback };
    const anthropicFallback = String(platformAnthropicKey ?? '').trim();
    if (anthropicFallback)
        return { provider: 'anthropic', apiKey: anthropicFallback };
    return null;
}
function anthropicToolsToOpenAi(tools) {
    return tools.map((tool) => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema,
        },
    }));
}
function endpointForProvider(provider) {
    if (provider === 'gemini') {
        return 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
    }
    return 'https://api.openai.com/v1/chat/completions';
}
function modelForProvider(provider) {
    if (provider === 'gemini')
        return 'gemini-2.5-flash';
    if (provider === 'openai')
        return 'gpt-4o-mini';
    return 'claude-haiku-4-5-20251001';
}
async function createOpenAiCompatibleResponse(params) {
    const { provider, apiKey, messages, tools, maxTokens } = params;
    const res = await fetch(endpointForProvider(provider), {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: modelForProvider(provider),
            messages,
            tools,
            tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
            max_tokens: maxTokens,
        }),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`${provider} ${res.status}: ${text.slice(0, 400)}`);
    }
    const data = await res.json();
    const message = data?.choices?.[0]?.message ?? {};
    const text = typeof message?.content === 'string'
        ? message.content
        : Array.isArray(message?.content)
            ? message.content
                .map((part) => typeof part?.text === 'string' ? part.text : typeof part === 'string' ? part : '')
                .join('\n')
                .trim()
            : '';
    const toolCalls = Array.isArray(message?.tool_calls)
        ? message.tool_calls
            .map((call) => {
            const rawArgs = String(call?.function?.arguments ?? '{}');
            let input = {};
            try {
                input = JSON.parse(rawArgs);
            }
            catch {
                input = {};
            }
            return {
                id: String(call?.id ?? `tool_${Date.now()}`),
                name: String(call?.function?.name ?? ''),
                input,
            };
        })
            .filter((call) => call.name.length > 0)
        : [];
    return {
        text,
        toolCalls,
        assistantMessage: {
            role: 'assistant',
            content: text || '',
            tool_calls: message?.tool_calls ?? undefined,
        },
    };
}
function createAnthropicClient(apiKey) {
    return new sdk_1.default({ apiKey });
}
function anthropicModel() {
    return modelForProvider('anthropic');
}
//# sourceMappingURL=llm.js.map