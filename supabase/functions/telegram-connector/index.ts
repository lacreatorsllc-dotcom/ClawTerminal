// Supabase Edge Function: telegram-connector
// Two modes:
//   POST with action=register  — validate token, set webhook, store connector row
//   POST without action        — handle inbound Telegram webhook, broadcast to Realtime

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TELEGRAM_API = 'https://api.telegram.org/bot'

// The public URL of this edge function — set as TELEGRAM_WEBHOOK_URL env var in Supabase dashboard
const WEBHOOK_URL = Deno.env.get('TELEGRAM_WEBHOOK_URL')!

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  // ── Registration mode ─────────────────────────────────────────────────────
  if (body.action === 'register') {
    const { token, userId } = body
    if (!token || !userId) {
      return new Response(JSON.stringify({ error: 'token and userId required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    // 1. Validate token via Telegram getMe
    const getMeRes = await fetch(`${TELEGRAM_API}${token}/getMe`)
    const getMe = await getMeRes.json()
    if (!getMe.ok) {
      return new Response(JSON.stringify({ error: 'Invalid token', telegram: getMe }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    const botUsername = getMe.result.username as string
    const botName = getMe.result.first_name as string

    // 2. Set webhook
    const webhookRes = await fetch(`${TELEGRAM_API}${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: WEBHOOK_URL, secret_token: userId }),
    })
    const webhook = await webhookRes.json()
    if (!webhook.ok) {
      return new Response(JSON.stringify({ error: 'Webhook setup failed', telegram: webhook }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }

    // 3. Create agent row
    const { data: agent, error: agentErr } = await supabase
      .from('agents')
      .insert({ user_id: userId, name: botName, status: 'connected', metadata: { type: 'telegram', bot_username: botUsername } })
      .select('id')
      .single()

    if (agentErr) {
      return new Response(JSON.stringify({ error: 'Failed to create agent', detail: agentErr.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }

    // 4. Store connector row (token stored here, never returned to client)
    const { error: connErr } = await supabase.from('connectors').insert({
      user_id: userId,
      agent_id: agent.id,
      type: 'telegram',
      token,
      bot_username: botUsername,
      bot_name: botName,
      webhook_registered: true,
    })

    if (connErr) {
      return new Response(JSON.stringify({ error: 'Failed to store connector', detail: connErr.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ agentId: agent.id, botUsername, botName }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── Webhook mode (inbound Telegram message) ───────────────────────────────
  const update = body
  const message = update.message || update.channel_post
  if (!message?.text) {
    // Not a text message — ignore
    return new Response('ok', { status: 200 })
  }

  const chatId = String(message.chat.id)
  const text = message.text as string

  // Identify which user this bot belongs to via X-Telegram-Bot-Api-Secret-Token header
  const userId = req.headers.get('x-telegram-bot-api-secret-token')
  if (!userId) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Look up connector by user_id and chat_id (or update chat_id on first message)
  const { data: connectors } = await supabase
    .from('connectors')
    .select('id, agent_id, telegram_chat_id')
    .eq('user_id', userId)
    .eq('type', 'telegram')
    .limit(1)

  if (!connectors?.length) {
    return new Response('Connector not found', { status: 404 })
  }

  const connector = connectors[0]

  // Store chat_id if this is the first message
  if (!connector.telegram_chat_id) {
    await supabase.from('connectors').update({ telegram_chat_id: chatId }).eq('id', connector.id)
  }

  const agentId = connector.agent_id

  // Persist message to DB
  await supabase.from('messages').insert({
    agent_id: agentId,
    user_id: userId,
    direction: 'inbound',
    content: text,
  })

  // Broadcast to Realtime via HTTP API (works from Edge Functions without a persistent WS connection)
  await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify({
      messages: [{
        topic: `agent:${agentId}`,
        event: 'message',
        payload: { direction: 'inbound', content: text, ts: Date.now() },
      }],
    }),
  })

  return new Response('ok', { status: 200 })
})
