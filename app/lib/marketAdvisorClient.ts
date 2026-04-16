/**
 * Client-side Market Advisor reply pipeline (works without tb-bridge).
 * Uses the same chat_processed claim as the bridge to avoid duplicate replies.
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import { db, getProfile } from './firebase'

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function logMarketAdvisorTiming(step: string, startedAt: number, extra?: Record<string, unknown>) {
  const elapsedMs = Math.round(nowMs() - startedAt)
  console.log('[marketAdvisorTiming]', step, { elapsedMs, ...(extra ?? {}) })
}

async function callLlm(apiKey: string, messages: { role: 'system' | 'user' | 'assistant'; content: string }[]): Promise<string> {
  const key = apiKey.trim()
  if (key.startsWith('sk-') && !key.startsWith('sk-ant-')) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 600,
      }),
    })
    if (!res.ok) {
      const t = await res.text()
      throw new Error(`OpenAI ${res.status}: ${t.slice(0, 200)}`)
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    return data.choices?.[0]?.message?.content ?? 'No response.'
  }

  if (key.startsWith('AIza')) {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gemini-1.5-flash',
          messages,
          max_tokens: 600,
        }),
      },
    )
    if (!res.ok) {
      const t = await res.text()
      throw new Error(`Gemini ${res.status}: ${t.slice(0, 200)}`)
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    return data.choices?.[0]?.message?.content ?? 'No response.'
  }

  throw new Error('Unsupported key type. Use a Gemini key (AIza…) or OpenAI key (sk-…).')
}

async function buildPortfolioContext(userId: string): Promise<string> {
  const q = query(collection(db, 'agents'), where('user_id', '==', userId))
  const snap = await getDocs(q)
  if (snap.empty) return 'No agents yet.'
  return snap.docs
    .map((d) => {
      const x = d.data()
      return `- ${x.name ?? d.id} (${x.agent_type ?? 'agent'}): ${x.status ?? '?'}`
    })
    .join('\n')
}

export async function processMarketAdvisorInbound(params: {
  agentId: string
  userId: string
  messageDocId: string
  userText: string
  agentName: string
}): Promise<void> {
  const { agentId, userId, messageDocId, userText, agentName } = params
  const msgRef = doc(db, 'agents', agentId, 'messages', messageDocId)
  const startedAt = nowMs()

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(msgRef)
      const d = snap.data()
      if (!d || d.direction !== 'inbound') {
        throw new Error('SKIP')
      }
      if (d.chat_processed === true) {
        throw new Error('SKIP')
      }
      tx.update(msgRef, { chat_processed: true })
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'SKIP') return
    console.warn('[marketAdvisorClient] claim:', msg)
    return
  }
  logMarketAdvisorTiming('claim-complete', startedAt, { agentId })

  const writeOut = async (content: string) => {
    await addDoc(collection(db, 'agents', agentId, 'messages'), {
      direction: 'outbound' as const,
      content,
      agent_id: agentId,
      user_id: userId,
      created_at: serverTimestamp(),
    })
    logMarketAdvisorTiming('outbound-written', startedAt, { agentId, contentLength: content.length })
  }

  try {
    const profile = await getProfile(userId)
    logMarketAdvisorTiming('profile-loaded', startedAt, { hasProfile: !!profile })
    const apiKey = ((profile?.ai_api_key as string) ?? '').trim()

    if (!apiKey) {
      await writeOut(
        'I need an AI key to respond. Go to Settings → AI Provider and add your Gemini or OpenAI key.',
      )
      return
    }

    const portfolioContext = await buildPortfolioContext(userId)
    logMarketAdvisorTiming('portfolio-context-built', startedAt)
    let marketContext = ''
    try {
      const slugSnap = await getDoc(doc(db, 'agents', 'slug-001'))
      const s = slugSnap.data()
      if (s) {
        marketContext =
          `BTC Price: $${Math.round((s.btc_price as number) ?? 0).toLocaleString()}\n` +
          `Market Regime: ${(s.regime as string) ?? 'unknown'}\n` +
          `24h Change: ${Number(s.price_change_24h_pct ?? 0).toFixed(2)}%`
      }
    } catch {
      /* optional */
    }

    const histSnap = await getDocs(
      query(
        collection(db, 'agents', agentId, 'messages'),
        orderBy('created_at', 'desc'),
        limit(20),
      ),
    )
    logMarketAdvisorTiming('history-loaded', startedAt, { historyCount: histSnap.size })
    const history = histSnap.docs
      .map((x) => x.data())
      .reverse()
      .filter((m) => m.content && String(m.content) !== userText)
      .slice(-14)

    const system =
      `You are ${agentName}, a crypto market intelligence advisor.\n\n` +
      `LIVE MARKET:\n${marketContext || 'Market data loading...'}\n\n` +
      `USER AGENTS:\n${portfolioContext}\n\n` +
      `ROLE: Advise on portfolio and risk. No trade execution. Be concise (3–5 sentences). Plain text only.`

    const msgs: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: system },
      ...history.map((m) => ({
        role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: String(m.content ?? ''),
      })),
      { role: 'user', content: userText },
    ]

    const llmStartedAt = nowMs()
    const reply = await callLlm(apiKey, msgs)
    console.log('[marketAdvisorTiming]', 'llm-complete', {
      elapsedMs: Math.round(nowMs() - llmStartedAt),
      provider: apiKey.startsWith('AIza') ? 'gemini' : 'openai',
      promptMessages: msgs.length,
    })
    await writeOut(reply)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[marketAdvisorClient]', msg)
    await writeOut('Something went wrong. Check your AI key in Settings and try again.').catch(() => {})
  }
}
