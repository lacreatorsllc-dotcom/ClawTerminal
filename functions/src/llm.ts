import Anthropic from '@anthropic-ai/sdk'
import type { Tool as AnthropicTool } from '@anthropic-ai/sdk/resources'
import { db } from './firebase'

export type Provider = 'anthropic' | 'openai' | 'gemini'

export type OpenAiStyleMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string; tool_calls?: any[] }
  | { role: 'tool'; content: string; tool_call_id: string }

export interface OpenAiToolCall {
  id: string
  name: string
  input: Record<string, any>
}

export function detectProvider(apiKey: string): Provider | null {
  const key = apiKey.trim()
  if (!key) return null
  if (key.startsWith('AIza')) return 'gemini'
  if (key.startsWith('sk-') && !key.startsWith('sk-ant-')) return 'openai'
  if (key.startsWith('sk-ant-')) return 'anthropic'
  return null
}

export async function resolveAgentProvider(
  agent: Record<string, any>,
  platformAnthropicKey?: string,
  platformGeminiKey?: string,
): Promise<{ provider: Provider; apiKey: string } | null> {
  const userId = String(agent.user_id ?? '')
  const profileKey = userId
    ? String((await db.doc(`users/${userId}`).get()).data()?.ai_api_key ?? '').trim()
    : ''
  const directGeminiKey = String(agent.gemini_api_key ?? '').trim()
  const candidate = profileKey || directGeminiKey

  if (candidate) {
    const provider = detectProvider(candidate)
    if (provider) return { provider, apiKey: candidate }
  }

  const geminiFallback = String(platformGeminiKey ?? '').trim()
  if (geminiFallback) return { provider: 'gemini', apiKey: geminiFallback }

  const anthropicFallback = String(platformAnthropicKey ?? '').trim()
  if (anthropicFallback) return { provider: 'anthropic', apiKey: anthropicFallback }
  return null
}

export function anthropicToolsToOpenAi(tools: AnthropicTool[]) {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }))
}

function endpointForProvider(provider: Provider) {
  if (provider === 'gemini') {
    return 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
  }
  return 'https://api.openai.com/v1/chat/completions'
}

function modelForProvider(provider: Provider) {
  if (provider === 'gemini') return 'gemini-2.5-flash'
  if (provider === 'openai') return 'gpt-4o-mini'
  return 'claude-haiku-4-5-20251001'
}

export async function createOpenAiCompatibleResponse(params: {
  provider: 'openai' | 'gemini'
  apiKey: string
  messages: OpenAiStyleMessage[]
  tools?: ReturnType<typeof anthropicToolsToOpenAi>
  maxTokens: number
}) {
  const { provider, apiKey, messages, tools, maxTokens } = params
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
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${provider} ${res.status}: ${text.slice(0, 400)}`)
  }

  const data = await res.json() as any
  const message = data?.choices?.[0]?.message ?? {}
  const text = typeof message?.content === 'string'
    ? message.content
    : Array.isArray(message?.content)
      ? message.content
        .map((part: any) => typeof part?.text === 'string' ? part.text : typeof part === 'string' ? part : '')
        .join('\n')
        .trim()
      : ''

  const toolCalls: OpenAiToolCall[] = Array.isArray(message?.tool_calls)
    ? message.tool_calls
      .map((call: any) => {
        const rawArgs = String(call?.function?.arguments ?? '{}')
        let input: Record<string, any> = {}
        try {
          input = JSON.parse(rawArgs)
        } catch {
          input = {}
        }
        return {
          id: String(call?.id ?? `tool_${Date.now()}`),
          name: String(call?.function?.name ?? ''),
          input,
        }
      })
      .filter((call: OpenAiToolCall) => call.name.length > 0)
    : []

  return {
    text,
    toolCalls,
    assistantMessage: {
      role: 'assistant' as const,
      content: text || '',
      tool_calls: message?.tool_calls ?? undefined,
    },
  }
}

export function createAnthropicClient(apiKey: string) {
  return new Anthropic({ apiKey })
}

export function anthropicModel() {
  return modelForProvider('anthropic')
}
