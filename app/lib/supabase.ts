// ClawTerminal — Supabase Client
// Dependency: npm install @supabase/supabase-js
// Set env vars in .env (never commit):
//   EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
//   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>

import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

// ─────────────────────────────────────────────
// Auth helpers
// ─────────────────────────────────────────────

export const signUp = (email: string, password: string) =>
  supabase.auth.signUp({ email, password })

export const signIn = (email: string, password: string) =>
  supabase.auth.signInWithPassword({ email, password })

export const signOut = () => supabase.auth.signOut()

export const getSession = () => supabase.auth.getSession()

// ─────────────────────────────────────────────
// Agent channel — broadcast-based real-time chat
// Call on Agent Detail open, unsubscribe on close
// ─────────────────────────────────────────────

export function subscribeToAgent(
  agentId: string,
  handlers: {
    onMessage?: (payload: { direction: string; content: string; ts: number; id?: string }) => void
  }
) {
  const channel = supabase
    .channel(`agent:${agentId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `agent_id=eq.${agentId}` },
      (event) => {
        const row = event.new as { id: string; direction: string; content: string; created_at: string }
        if (handlers.onMessage) {
          handlers.onMessage({
            id: row.id,
            direction: row.direction,
            content: row.content,
            ts: new Date(row.created_at).getTime(),
          })
        }
      }
    )

  channel.subscribe()
  return channel
}

// ─────────────────────────────────────────────
// Skill helpers
// ─────────────────────────────────────────────

export async function getOrCreateSkill(params: {
  name: string
  description: string
  category: string
  version: string
}): Promise<string | null> {
  // Try to find existing skill by name
  const { data: existing } = await supabase
    .from('skills')
    .select('id')
    .eq('name', params.name)
    .maybeSingle()

  if (existing) return existing.id

  // Insert new skill
  const { data: created, error: insertError } = await supabase
    .from('skills')
    .insert({ ...params, config_schema: { fields: [] } })
    .select('id')
    .single()

  if (created) return created.id

  // Insert failed (e.g. unique conflict from race) — try select again
  console.warn('[getOrCreateSkill] insert failed:', insertError?.message)
  const { data: retry } = await supabase
    .from('skills')
    .select('id')
    .eq('name', params.name)
    .maybeSingle()

  return retry?.id ?? null
}

// ─────────────────────────────────────────────
// Send message (app → agent)
// Broadcasts for real-time delivery AND persists for history
// ─────────────────────────────────────────────

export async function sendMessage(
  _channel: ReturnType<typeof supabase.channel> | null,
  agentId: string,
  userId: string,
  content: string,
  metadata?: { attachments?: string[] }
) {
  return supabase.from('messages').insert({
    agent_id: agentId,
    user_id: userId,
    direction: 'inbound' as const,
    content,
    ...(metadata ? { metadata } : {}),
  })
}
