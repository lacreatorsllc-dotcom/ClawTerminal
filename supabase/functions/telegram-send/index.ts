// Supabase Edge Function: telegram-send
// Called by the app when user sends a reply to a Telegram-connected agent.
// Retrieves the bot token and chat_id, then calls Telegram sendMessage.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TELEGRAM_API = 'https://api.telegram.org/bot'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const { agentId, userId, text } = body
  if (!agentId || !userId || !text) {
    return new Response(JSON.stringify({ error: 'agentId, userId, and text required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Look up connector for this agent
  const { data: connectors, error } = await supabase
    .from('connectors')
    .select('token, telegram_chat_id')
    .eq('agent_id', agentId)
    .eq('user_id', userId)
    .eq('type', 'telegram')
    .limit(1)

  if (error || !connectors?.length) {
    return new Response(JSON.stringify({ error: 'Connector not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    })
  }

  const { token, telegram_chat_id } = connectors[0]

  if (!telegram_chat_id) {
    // No chat yet — Telegram user hasn't messaged first
    return new Response(JSON.stringify({ error: 'No chat_id yet — user must message the bot first' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  // Send via Telegram API
  const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: telegram_chat_id, text }),
  })

  const result = await res.json()
  if (!result.ok) {
    return new Response(JSON.stringify({ error: 'Telegram sendMessage failed', telegram: result }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
})
