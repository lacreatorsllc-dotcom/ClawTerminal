"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.topicFromSymbol = topicFromSymbol;
exports.fetchTopicSnapshot = fetchTopicSnapshot;
exports.fetchTopicPosts = fetchTopicPosts;
exports.listLunarCrushTools = listLunarCrushTools;
const mcpClient_1 = require("./mcpClient");
const lunarCrushMcp = new mcpClient_1.StreamableHttpMcpClient({
    name: 'slugs-lunarcrush',
    baseUrl: 'https://lunarcrush.ai/mcp',
    apiKeyEnvVar: 'LUNARCRUSH_API_KEY',
});
function numberFromMatch(pattern, text) {
    const raw = text.match(pattern)?.[1];
    if (!raw)
        return null;
    const parsed = Number(raw.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
}
function percentFromMatch(label, text) {
    return numberFromMatch(new RegExp(`${label}:\\s*([+-]?[0-9,.]+)%`), text);
}
function sentenceBetween(startPattern, endPattern, text) {
    const start = text.search(startPattern);
    const end = text.search(endPattern);
    if (start === -1 || end === -1 || end <= start)
        return null;
    const block = text.slice(start, end)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    return block[block.length - 1] ?? null;
}
function topicFromSymbol(input) {
    const trimmed = String(input ?? '').trim();
    if (!trimmed)
        return 'bitcoin';
    if (/^[A-Za-z0-9]{1,10}$/.test(trimmed)) {
        return `$${trimmed.toLowerCase()}`;
    }
    return trimmed.toLowerCase();
}
async function fetchTopicSnapshot(input) {
    const topic = topicFromSymbol(input);
    const text = await lunarCrushMcp.callToolText('Topic', { topic });
    const heading = text.match(/^#\s+(.+?)\s+\(([^)]+)\)/m);
    const narrative = sentenceBetween(/### Price:/, /(?:\n1-Hour:|\n24-Hour:|\n### AltRank:)/, text);
    return {
        symbol: heading?.[2] ?? String(input).toUpperCase(),
        topic,
        name: heading?.[1] ?? null,
        narrative,
        price: numberFromMatch(/### Price:\s*\$([0-9,.]+)/, text),
        change1h: percentFromMatch('1-Hour', text),
        change24h: percentFromMatch('24-Hour', text),
        change7d: percentFromMatch('7-Day', text),
        sentimentPct: numberFromMatch(/### Sentiment:\s*([0-9,.]+)%/, text),
        rawText: text,
    };
}
function parseTopicPosts(text) {
    return text
        .split(/\n{3,}/)
        .map((block) => block.trim())
        .filter((block) => block.startsWith('"'))
        .map((block) => ({
        headline: block.match(/^"([\s\S]+?)"\s{2,}$/m)?.[1]
            ?? block.match(/^"([\s\S]+?)"/)?.[1]
            ?? block.slice(0, 280),
        url: block.match(/\((https?:\/\/[^)]+)\)/)?.[1] ?? null,
        creator: block.match(/\[@([^\]]+)\]/)?.[1] ?? null,
        network: block.match(/\[([A-Za-z]+)\s+Link\]/)?.[1]?.toLowerCase() ?? null,
        createdAt: block.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z)/)?.[1] ?? null,
        rawText: block,
    }));
}
async function fetchTopicPosts(input, limit = 5) {
    const topic = topicFromSymbol(input);
    const text = await lunarCrushMcp.callToolText('Topic_Posts', { topic, limit });
    return parseTopicPosts(text);
}
async function listLunarCrushTools() {
    return lunarCrushMcp.listTools();
}
//# sourceMappingURL=lunarCrush.js.map