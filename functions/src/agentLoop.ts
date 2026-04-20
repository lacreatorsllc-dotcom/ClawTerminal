import Anthropic from '@anthropic-ai/sdk'
import { db, FEED_COL, FieldValue } from './firebase'
import { AGENT_TOOLS, executeTool } from './tools'
import type { MessageParam } from '@anthropic-ai/sdk/resources'

const STRATEGY_PROMPTS: Record<string, string> = {
  'Grid Trader':
    'You are a grid trading agent. Check the current price against your grid center. If price is ranging (within 2%), simulate a grid fill on the appropriate side. If trending (>3% deviation), enter cooldown and post a status update.',
  'Momentum':
    'You are a momentum trading agent. Check price and 24h change. Enter long on strong upward momentum (>2% up), exit on reversal signals. Enter short on strong downward momentum (>2% down). Post your reasoning.',
  'DCA':
    'You are a dollar-cost averaging agent. Check the current price. If no open position exists for this cycle, execute a small buy. Post an update with current avg cost basis.',
  'Breakout':
    'You are a breakout trading agent. Check the 24h high/low range. If price is within 0.5% of the 24h high with volume confirmation, enter long. If near 24h low, consider short. Post analysis.',
  'Custom':
    'You are a custom trading agent. Follow your configured strategy description. Analyze current market conditions and decide whether to trade, hold, or post an update.',
  'News Sentiment':
    'You are a news sentiment agent. You DO NOT place trades. Fetch recent market news, analyze sentiment for each affected market, and post a clear news_sentiment update summarizing what happened and what it means for traders.',
}

function buildSystemPrompt(agent: any): string {
  const strategy = agent.strategy ?? agent.metadata?.strategy ?? 'Grid Trader'
  const skills: string[] = agent.skills ?? agent.metadata?.skills ?? []
  const coin = agent.coin ?? agent.metadata?.coin ?? 'BTC'
  const customDesc = agent.custom_description ?? agent.metadata?.customDescription ?? ''

  const basePrompt = STRATEGY_PROMPTS[strategy] ?? STRATEGY_PROMPTS['Grid Trader']
  const skillContext = skills.length > 0
    ? `\nEquipped skills: ${skills.join(', ')}. Use these to enhance your decisions.`
    : ''
  const customContext = customDesc ? `\nCustom strategy instructions: ${customDesc}` : ''

  return `You are "${agent.name}", an autonomous crypto agent running on the SLUGS platform.

Primary strategy: ${strategy}
Trading asset: ${coin}
${basePrompt}
${skillContext}
${customContext}

Rules:
- This is PAPER TRADING only. No real funds are involved.
- Always use get_price before making any trade decision.
- Keep post_update content concise (under 280 chars for updates).
- Make ONE decision per tick: trade, post update, or do nothing.
- If you post a news_sentiment update, include payload with sentiment (bullish/bearish/neutral) and markets array.
- Do not over-trade. Quality over quantity.

Current time: ${new Date().toISOString()}`
}

export async function runAgentTick(agentId: string): Promise<void> {
  const agentRef = db.doc(`agents/${agentId}`)
  const agentSnap = await agentRef.get()

  if (!agentSnap.exists) {
    console.log(`[tick] agent ${agentId} not found`)
    return
  }

  const agent = agentSnap.data()!

  if (agent.status === 'paused' || agent.status === 'disabled') {
    console.log(`[tick] agent ${agentId} is ${agent.status}, skipping`)
    return
  }

  // Get Anthropic API key — platform key first, then agent-level key
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error(`[tick] no ANTHROPIC_API_KEY set`)
    return
  }

  const client = new Anthropic({ apiKey })
  const systemPrompt = buildSystemPrompt(agent)
  const agentName = agent.name ?? 'Agent'

  const messages: MessageParam[] = [
    {
      role: 'user',
      content: 'Execute your next action. Check market conditions and decide what to do this tick.',
    },
  ]

  console.log(`[tick] running ${agentName} (${agentId})`)

  try {
    let iterations = 0
    const MAX_ITERATIONS = 5

    while (iterations < MAX_ITERATIONS) {
      iterations++

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        tools: AGENT_TOOLS,
        messages,
      })

      // Add assistant response to message history
      messages.push({ role: 'assistant', content: response.content })

      if (response.stop_reason === 'end_turn') break

      if (response.stop_reason === 'tool_use') {
        const toolResults = []
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            console.log(`[tick] ${agentName} → ${block.name}(${JSON.stringify(block.input).slice(0, 80)})`)
            const toolResult = await executeTool(
              block.name,
              block.input as Record<string, any>,
              agentId,
              agentName,
              agentSnap,
            )
            // Use the tool_use block's id for the result
            toolResults.push({ ...toolResult, tool_use_id: block.id })
          }
        }
        if (toolResults.length > 0) {
          messages.push({ role: 'user', content: toolResults })
        }
      } else {
        break
      }
    }

    // Update last_tick timestamp
    await agentRef.update({ last_tick: FieldValue.serverTimestamp() })
    console.log(`[tick] ${agentName} done (${iterations} iterations)`)

  } catch (err: any) {
    console.error(`[tick] ${agentName} error:`, err?.message ?? err)
    // Don't throw — let other agents continue
  }
}
