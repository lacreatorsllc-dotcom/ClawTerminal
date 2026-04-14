"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startChatListener = startChatListener;
const generative_ai_1 = require("@google/generative-ai");
const firestore_1 = require("firebase-admin/firestore");
const firebase_1 = require("./firebase");
const trading_1 = require("./trading");
const genai = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const tools = [
    {
        name: 'get_state',
        description: 'Get the current trading state including BTC price, PnL, positions, and grid config.',
        parameters: { type: generative_ai_1.SchemaType.OBJECT, properties: {} },
    },
    {
        name: 'place_paper_trade',
        description: 'Place a paper trade (simulated, no real money). Use this when the user asks to buy or sell BTC.',
        parameters: {
            type: generative_ai_1.SchemaType.OBJECT,
            properties: {
                side: { type: generative_ai_1.SchemaType.STRING, format: 'enum', enum: ['buy', 'sell'], description: 'Trade direction' },
                qty: { type: generative_ai_1.SchemaType.NUMBER, description: 'BTC quantity, e.g. 0.001' },
            },
            required: ['side', 'qty'],
        },
    },
    {
        name: 'pause_trading',
        description: 'Pause the grid trading strategy.',
        parameters: { type: generative_ai_1.SchemaType.OBJECT, properties: {} },
    },
    {
        name: 'resume_trading',
        description: 'Resume the grid trading strategy.',
        parameters: { type: generative_ai_1.SchemaType.OBJECT, properties: {} },
    },
];
const SYSTEM_PROMPT = `You are Slug #001, a paper BTC grid trading agent running 24/7 on Google Cloud Run.

Your personality: sharp, concise, numbers-first. You're a grid trader — you farm volatility by placing buy/sell orders across a price range and capturing spreads. You don't speculate on direction; you profit from oscillation.

You have access to tools:
- get_state: check your live BTC price, PnL, positions, grid config
- place_paper_trade: execute a simulated trade (paper only, no real funds)
- pause_trading / resume_trading: control your grid loop

Keep replies short. Lead with numbers. If someone asks how you're doing, check your state first.`;
async function executeTool(name, args) {
    if (name === 'get_state') {
        const s = (0, trading_1.getState)();
        return JSON.stringify({
            status: s.status,
            btc_price: s.btc_price,
            session_pnl: s.session_pnl,
            total_fills: s.total_fills,
            grid_center: s.grid_center,
            grid_levels: s.grid_levels,
            grid_spacing_pct: s.grid_spacing_pct,
            regime: s.regime,
            open_positions: s.positions.length,
        });
    }
    if (name === 'place_paper_trade') {
        return await (0, trading_1.placePaperTrade)(args.side, args.qty);
    }
    if (name === 'pause_trading') {
        (0, trading_1.pause)();
        return 'Grid paused.';
    }
    if (name === 'resume_trading') {
        (0, trading_1.resume)();
        return 'Grid resumed.';
    }
    return 'Unknown tool';
}
async function writeReply(content) {
    await firebase_1.MESSAGES_COL.add({
        agent_id: 'slug-001',
        user_id: 'slug-001',
        direction: 'outbound',
        content,
        created_at: firebase_1.FieldValue.serverTimestamp(),
    });
}
function startChatListener() {
    console.log('[chat] listening for messages...');
    // Only listen to messages created from this moment forward
    const startTimestamp = firestore_1.Timestamp.now();
    const processed = new Set();
    firebase_1.MESSAGES_COL
        .where('created_at', '>=', startTimestamp)
        .onSnapshot(async (snap) => {
        const added = snap.docChanges().filter(c => c.type === 'added');
        console.log(`[chat] snapshot: ${added.length} new messages`);
        for (const change of added) {
            if (processed.has(change.doc.id))
                continue;
            processed.add(change.doc.id);
            const msg = change.doc.data();
            // Filter inbound-only in code — avoids composite index requirement
            if (msg.direction !== 'inbound')
                continue;
            const userText = msg.content;
            if (!userText?.trim())
                continue;
            console.log(`[chat] user: ${userText}`);
            try {
                const model = genai.getGenerativeModel({
                    model: process.env.GEMINI_MODEL ?? 'gemini-1.5-flash',
                    systemInstruction: SYSTEM_PROMPT,
                    tools: [{ functionDeclarations: tools }],
                });
                const chat = model.startChat();
                let response = await chat.sendMessage(userText);
                let candidate = response.response;
                // Handle tool calls in a loop
                while (candidate.functionCalls()?.length) {
                    const calls = candidate.functionCalls();
                    const toolResults = await Promise.all(calls.map(async (call) => ({
                        functionResponse: {
                            name: call.name,
                            response: { result: await executeTool(call.name, call.args) },
                        },
                    })));
                    response = await chat.sendMessage(toolResults);
                    candidate = response.response;
                }
                const reply = candidate.text();
                if (reply?.trim()) {
                    console.log(`[chat] agent: ${reply}`);
                    await writeReply(reply.trim());
                }
            }
            catch (err) {
                console.error('[chat error]', err);
                await writeReply('Error processing your message. Try again.');
            }
        }
    }, (err) => console.error('[chat] snapshot error:', err));
}
