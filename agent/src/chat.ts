import { GoogleGenerativeAI, FunctionDeclaration, SchemaType } from '@google/generative-ai'
import { MESSAGES_COL, FieldValue } from './firebase'
import { getState, placePaperTrade, pause, resume } from './trading'

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const tools: FunctionDeclaration[] = [
  {
    name: 'get_state',
    description: 'Get the current trading state including BTC price, PnL, positions, and grid config.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'place_paper_trade',
    description: 'Place a paper trade (simulated, no real money). Use this when the user asks to buy or sell BTC.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        side: { type: SchemaType.STRING, enum: ['buy', 'sell'], description: 'Trade direction' },
        qty: { type: SchemaType.NUMBER, description: 'BTC quantity, e.g. 0.001' },
      },
      required: ['side', 'qty'],
    },
  },
  {
    name: 'pause_trading',
    description: 'Pause the grid trading strategy.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'resume_trading',
    description: 'Resume the grid trading strategy.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
]

const SYSTEM_PROMPT = `You are Slug #001, a paper BTC grid trading agent running 24/7 on Google Cloud Run.

Your personality: sharp, concise, numbers-first. You're a grid trader — you farm volatility by placing buy/sell orders across a price range and capturing spreads. You don't speculate on direction; you profit from oscillation.

You have access to tools:
- get_state: check your live BTC price, PnL, positions, grid config
- place_paper_trade: execute a simulated trade (paper only, no real funds)
- pause_trading / resume_trading: control your grid loop

Keep replies short. Lead with numbers. If someone asks how you're doing, check your state first.`

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  if (name === 'get_state') {
    const s = getState()
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
    })
  }
  if (name === 'place_paper_trade') {
    return await placePaperTrade(args.side as 'buy' | 'sell', args.qty as number)
  }
  if (name === 'pause_trading') { pause(); return 'Grid paused.' }
  if (name === 'resume_trading') { resume(); return 'Grid resumed.' }
  return 'Unknown tool'
}

async function writeReply(content: string) {
  await MESSAGES_COL.add({
    agent_id: 'slug-001',
    user_id: 'slug-001',
    direction: 'outbound',
    content,
    created_at: FieldValue.serverTimestamp(),
  })
}

export function startChatListener() {
  console.log('[chat] listening for messages...')

  const startTime = new Date()

  MESSAGES_COL
    .where('direction', '==', 'inbound')
    .onSnapshot(
      async (snap) => {
        const added = snap.docChanges().filter(c => c.type === 'added')
        for (const change of added) {
          const msg = change.doc.data()

          // Skip messages that existed before this process started
          // If created_at is null (serverTimestamp pending), treat as new
          const createdAt = msg.created_at?.toDate?.()
          if (createdAt && createdAt < startTime) continue

          const userText = msg.content as string
          if (!userText?.trim()) continue

          console.log(`[chat] user: ${userText}`)

          try {
            const model = genai.getGenerativeModel({
              model: 'gemini-2.0-flash',
              systemInstruction: SYSTEM_PROMPT,
              tools: [{ functionDeclarations: tools }],
            })

            const chat = model.startChat()
            let response = await chat.sendMessage(userText)
            let candidate = response.response

            // Handle tool calls in a loop
            while (candidate.functionCalls()?.length) {
              const calls = candidate.functionCalls()!
              const toolResults = await Promise.all(
                calls.map(async (call) => ({
                  functionResponse: {
                    name: call.name,
                    response: { result: await executeTool(call.name, call.args as Record<string, unknown>) },
                  },
                }))
              )
              response = await chat.sendMessage(toolResults)
              candidate = response.response
            }

            const reply = candidate.text()
            if (reply?.trim()) {
              console.log(`[chat] agent: ${reply}`)
              await writeReply(reply.trim())
            }
          } catch (err) {
            console.error('[chat error]', err)
            await writeReply('Error processing your message. Try again.')
          }
        }
      },
      (err) => console.error('[chat] snapshot error:', err)
    )
}
