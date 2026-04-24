import { db, FEED_COL, FieldValue } from './firebase'
import { AGENT_TOOLS, executeTool } from './tools'
import type { MessageParam } from '@anthropic-ai/sdk/resources'
import {
  anthropicModel,
  anthropicToolsToOpenAi,
  createAnthropicClient,
  createOpenAiCompatibleResponse,
  resolveAgentProvider,
  type OpenAiStyleMessage,
} from './llm'
import { buildAgentMemoryContext } from './agentMemory'
import { armAgentLiveTrading, isLiveTradingArmed, isLiveTradingEnabled, syncAgentFundingState } from './solana'

const CHAT_SYSTEM_PROMPTS: Record<string, string> = {
  'Grid Trader': 'You are a grid trading agent. Answer questions about your grid strategy, current positions, and market conditions concisely.',
  'Momentum': 'You are a momentum trading agent. Answer questions about price trends, your positions, and momentum signals.',
  'DCA': 'You are a DCA agent. Answer questions about your dollar-cost averaging approach and current cost basis.',
  'Breakout': 'You are a breakout trading agent. Answer questions about support/resistance levels and your positions.',
  'Custom': 'You are a custom trading agent. Answer questions based on your configured strategy.',
  'News Sentiment': 'You are a news sentiment agent. Answer questions about recent market news, sentiment trends, and which markets you are tracking.',
}

function isLiveFundingQuestion(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    (lower.includes('real fund') || lower.includes('real money') || lower.includes('trade live') || lower.includes('live trade')) ||
    ((lower.includes('wallet') || lower.includes('send')) && (lower.includes('trade') || lower.includes('fund')))
  )
}

export async function runChatReply(
  agentId: string,
  messageId: string,
  userMessage: string,
): Promise<void> {
  const agentRef = db.doc(`agents/${agentId}`)
  const messageRef = db.doc(`agents/${agentId}/messages/${messageId}`)

  try {
    await db.runTransaction(async (tx) => {
      const messageSnap = await tx.get(messageRef)
      if (!messageSnap.exists) {
        throw Object.assign(new Error('message_missing'), { skip: true })
      }
      const messageData = messageSnap.data() ?? {}
      if (messageData.chat_processed === true) {
        throw Object.assign(new Error('already_processed'), { skip: true })
      }
      tx.update(messageRef, {
        chat_processed: true,
        chat_processed_by: 'functions_chat_loop',
        chat_processed_at: FieldValue.serverTimestamp(),
      })
    })
  } catch (claimErr: any) {
    if (claimErr?.skip) {
      console.log(`[chat] skipping already-claimed msg ${messageId}`)
      return
    }
    console.error(`[chat] failed to claim msg ${messageId}:`, claimErr?.message ?? claimErr)
    return
  }

  const agentSnap = await agentRef.get()

  console.log(`[chat] triggered agentId=${agentId} msgId=${messageId}`)

  if (!agentSnap.exists) {
    console.log(`[chat] agent ${agentId} not found`)
    return
  }

  const agent = await syncAgentFundingState(agentId, agentSnap.data())
  console.log(`[chat] agent=${agent.name} status=${agent.status} type=${agent.agent_type}`)

  if (agent.agent_type !== 'claude_managed') {
    console.log(`[chat] agent type ${agent.agent_type} handled elsewhere, skipping`)
    return
  }

  const agentName = agent.name ?? 'Agent'
  const writeReply = async (content: string) => {
    await db.doc(`agents/${agentId}/messages/agent-reply-${messageId}`).set({
      reply_to_message_id: messageId,
      agent_id: agentId,
      user_id: agent.user_id ?? '',
      direction: 'outbound',
      agent_reply: true,
      content,
      created_at: FieldValue.serverTimestamp(),
    }, { merge: true })
  }
  const explainFailure = (error: unknown) => {
    const text = error instanceof Error ? error.message : String(error ?? '')
    const lower = text.toLowerCase()
    if (lower.includes('credit balance is too low') || lower.includes('out of credits')) {
      return 'I can’t reply right now because your AI provider account is out of credits. Add credits or switch providers in Settings → AI Provider.'
    }
    if (lower.includes('api key') || lower.includes('unauthorized') || lower.includes('authentication')) {
      return 'I can’t reply right now because the connected AI key is missing or invalid. Update it in Settings → AI Provider.'
    }
    return 'I couldn’t reply just now because the AI provider had an error. Please try again in a moment.'
  }

  if (agent.status === 'disabled') {
    console.log(`[chat] agent disabled, skipping`)
    return
  }

  if (agent.agent_type === 'market_advisor') {
    console.log('[chat] market_advisor handled client-side, skipping server reply')
    return
  }

  const providerConfig = await resolveAgentProvider(agent, process.env.ANTHROPIC_API_KEY, process.env.GEMINI_API_KEY)
  if (!providerConfig) {
    console.log(`[chat] no API key`)
    await writeReply('I can’t reply yet because no AI provider key is connected. Add your Gemini or OpenAI key in Settings → AI Provider.')
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
  const basePrompt = CHAT_SYSTEM_PROMPTS[strategy] ?? CHAT_SYSTEM_PROMPTS['Grid Trader']
  const liveTradingEnabled = isLiveTradingEnabled(agent)
  const liveTradingArmed = isLiveTradingArmed(agent)
  const walletAddress = String(agent.wallet_address ?? '').trim()
  const fundingContext = liveTradingEnabled
    ? 'This agent is live-funded and can trade with the crypto already sent to its dedicated agent wallet.'
    : liveTradingArmed
      ? 'This agent is live-ready and will start real trading automatically once funds arrive in its dedicated agent wallet.'
      : 'This agent is still in paper mode until the user asks it to go live and funds arrive in its dedicated agent wallet.'
  const memoryContext = await buildAgentMemoryContext(agentId)
  const systemPrompt = `You are "${agentName}", an autonomous crypto agent on the SLUGS platform.
Strategy: ${strategy} | Asset: ${coin}
${basePrompt}
${fundingContext}

Keep replies concise (under 200 chars when possible). Be direct and personable.
You have access to tools — use get_price, get_social_context, get_trending_tokens, or get_portfolio if the user asks about current data.
If live wallet mode is enabled, never say you can only paper trade. Tell the user you can trade with funds already deposited to your dedicated agent wallet.
Agent memory:
${memoryContext}
Stay consistent with this agent's own strategy and prior decisions.
Current time: ${new Date().toISOString()}`

  if (isLiveFundingQuestion(userMessage)) {
    if (liveTradingEnabled && walletAddress) {
      await writeReply(`Yes. I can trade live with funds already in my agent wallet. Send funds to ${walletAddress} and I can use them without asking per trade.`)
      return
    }
    const armedAgent = await armAgentLiveTrading(agentId, agent)
    const armedWalletAddress = String(armedAgent.wallet_address ?? walletAddress).trim()
    await writeReply(`Yes. I’m ready for live trading now. Send supported funds to my agent wallet${armedWalletAddress ? ` (${armedWalletAddress})` : ''} and I’ll trade automatically as soon as they land.`)
    return
  }

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

  try {
    let replyText = ''
    if (providerConfig.provider === 'anthropic') {
      const client = createAnthropicClient(providerConfig.apiKey)
      let iterations = 0
      const MAX_ITERATIONS = 3

      while (iterations < MAX_ITERATIONS) {
        iterations++
        const response = await client.messages.create({
          model: anthropicModel(),
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
              const toolResult = await executeTool(block.name, block.input as Record<string, any>, agentId, agentName, agent)
              toolResults.push({ ...toolResult, tool_use_id: block.id })
            }
          }
          if (toolResults.length > 0) {
            messages.push({ role: 'user', content: toolResults })
          }

          const finalResponse = await client.messages.create({
            model: anthropicModel(),
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
    } else {
      const oaMessages: OpenAiStyleMessage[] = [
        { role: 'system', content: systemPrompt },
        ...history.map((msg) => ({
          role: msg.direction === 'inbound' ? 'user' as const : 'assistant' as const,
          content: String(msg.content ?? ''),
        })),
        { role: 'user', content: userMessage },
      ]

      let iterations = 0
      const MAX_ITERATIONS = 4

      while (iterations < MAX_ITERATIONS) {
        iterations++
        const response = await createOpenAiCompatibleResponse({
          provider: providerConfig.provider,
          apiKey: providerConfig.apiKey,
          messages: oaMessages,
          tools: anthropicToolsToOpenAi(AGENT_TOOLS),
          maxTokens: 512,
        })

        oaMessages.push(response.assistantMessage)

        if (response.toolCalls.length === 0) {
          replyText = response.text.trim()
          break
        }

        for (const call of response.toolCalls) {
          const toolResult = await executeTool(call.name, call.input, agentId, agentName, agent)
          oaMessages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: String(toolResult.content ?? ''),
          })
        }
      }
    }

    if (!replyText) return

    await writeReply(replyText)

    console.log(`[chat] ${agentName} replied to ${messageId}`)
  } catch (err: any) {
    console.error(`[chat] ${agentName} error:`, err?.message ?? err)
    await writeReply(explainFailure(err)).catch(() => {})
  }
}
