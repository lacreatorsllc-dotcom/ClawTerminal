// ClawTerminal — Supabase Client
// Dependency: npm install @supabase/supabase-js
// Set env vars in .env (never commit):
//   EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
//   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>

import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

// NOTE: Replace `any` with generated Database type once `supabase gen types` is run
// against the real project: `supabase gen types typescript --project-id <id> > lib/database.types.ts`
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
// Agent channel — call on Agent Detail open, unsubscribe on close
// ─────────────────────────────────────────────

export function subscribeToAgent(
  agentId: string,
  handlers: {
    onMessage?: (payload: { direction: string; content: string; ts: number }) => void
  }
) {
  const channel = supabase
    .channel(`agent:${agentId}:messages`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `agent_id=eq.${agentId}`,
    }, (payload) => {
      if (handlers.onMessage) {
        const row = payload.new as any
        handlers.onMessage({
          direction: row.direction,
          content: row.content,
          ts: new Date(row.created_at).getTime(),
        })
      }
    })

  channel.subscribe()
  return channel
}

// ─────────────────────────────────────────────
// Send outbound message (app → agent)
// Broadcasts for real-time delivery AND persists for history
// ─────────────────────────────────────────────

export async function sendMessage(
  _channel: unknown,
  agentId: string,
  userId: string,
  content: string
) {
  return supabase.from('messages').insert({
    agent_id: agentId,
    user_id: userId,
    direction: 'inbound' as const,
    content,
  })
}
