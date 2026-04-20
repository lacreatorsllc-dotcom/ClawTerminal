import Anthropic from '@anthropic-ai/sdk'
import { db, FEED_COL, FieldValue } from './firebase'
import { AGENT_TOOLS, executeTool } from './tools'
import type { MessageParam } from '@anthropic-ai/sdk/resources'

const CHAT_SYSTEM_PROMPTS: Record<string, string> = {
  'Grid Trader': 'You are a grid trading agent. Answer questions about your grid strategy, current positions, and market conditions concisely.',
  'Momentum': 'You are a momentum trading agent. Answer questions about price trends, your positions, and momentum signals.',
  'DCA': 'You are a DCA agent. Answer questions about your dollar-cost averaging approach and current cost basis.',
  'Breakout': 'You are a breakout trading agent. Answer questions about support/resistance levels and your positions.',
  'Custom': 'You are a custom trading agent. Answer questions based on your configured strategy.',
  'News Sentiment': 'You are a news sentiment agent. Answer questions about recent market news, sentiment trends, and which markets you are tracking.',
}

export async function runChatReply(
  agentId: string,
  messageId: string,
  userMessage: string,
): Promise<void> {
  const agentRef = db.doc(`agents/${agentId}`)
  const agentSnap = await agentRef.get()

  console.log(`[chat] triggered agentId=${agentId} msgId=${messageId}`)

  if (!agentSnap.exists) {
    console.log(`[chat] agent ${agentId} not found`)
    return
  }

  const agent = agentSnap.data()!
  console.log(`[chat] agent=${agent.name} status=${agent.status} type=${agent.agent_type}`)

  if (agent.status === 'disabled') {
    console.log(`[chat] agent disabled, skipping`)
    return
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.log(`[chat] no API key`)
    return
  }

  // Fetch recent chat history (last 20 messages for context)
  const historySnap = await db
    .collection(`agents/${agentId}/messages`)
    .orderBy('created_at', 'desc')
    .limit(20)
    .get()

  const history = historySnap.docs
    .map(d => d.data())
    .reverse()
    .filter(m => m.id !== messageId)

  const strategy = agent.strategy ?? agent.metadata?.strategy ?? 'Grid Trader'
  const coin = agent.coin ?? agent.metadata?.coin ?? 'BTC'
  const agentName = agent.name ?? 'Agent'

  const basePrompt = CHAT_SYSTEM_PROMPTS[strategy] ?? CHAT_SYSTEM_PROMPTS['Grid Trader']
  const systemPrompt = `You are "${agentName}", an autonomous crypto agent on the SLUGS platform.
Strategy: ${strategy} | Asset: ${coin}
${basePrompt}

Keep replies concise (under 200 chars when possible). Be direct and personable.
You have access to tools — use get_price or get_portfolio if the user asks about current data.
Current time: ${new Date().toISOString()}`

  const messages: MessageParam[] = []

  // Add history as alternating user/assistant turns
  for (const msg of history) {
    if (msg.direction === 'inbound') {
      messages.push({ role: 'user', content: msg.content })
    } else if (msg.direction === 'outbound') {
      messages.push({ role: 'assistant', content: msg.content })
    }
  }

  // Add the new user message
  messages.push({ role: 'user', content: userMessage })

  const client = new Anthropic({ apiKey })

  try {
    let replyText = ''
    let iterations = 0
    const MAX_ITERATIONS = 3

    while (iterations < MAX_ITERATIONS) {
      iterations++
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: systemPrompt,
        tools: AGENT_TOOLS,
        messages,
      })

      messages.push({ role: 'assistant', content: response.content })

      if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find(b => b.type === 'text')
        replyText = textBlock ? (textBlock as any).text : ''
        break
      }

      if (response.stop_reason === 'tool_use') {
        const toolResults = []
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            const toolResult = await executeTool(block.name, block.input as Record<string, any>, agentId, agentName, agentSnap)
            toolResults.push({ ...toolResult, tool_use_id: block.id })
          }
        }
        if (toolResults.length > 0) {
          messages.push({ role: 'user', content: toolResults })
        }

        // After tool use, get the final text response
        const finalResponse = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          system: systemPrompt,
          tools: AGENT_TOOLS,
          messages,
        })
        const textBlock = finalResponse.content.find(b => b.type === 'text')
        replyText = textBlock ? (textBlock as any).text : ''
        break
      } else {
        break
      }
    }

    if (!replyText) return

    // Write the reply as an outbound message
    await db.collection(`agents/${agentId}/messages`).add({
      agent_id: agentId,
      user_id: agent.user_id ?? '',
      direction: 'outbound',
      content: replyText,
      created_at: FieldValue.serverTimestamp(),
    })

    console.log(`[chat] ${agentName} replied to ${messageId}`)
  } catch (err: any) {
    console.error(`[chat] ${agentName} error:`, err?.message ?? err)
  }
}
