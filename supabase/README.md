# Supabase Backend — ClawTerminal

## Setup Order

1. Create a Supabase project at supabase.com
2. Run migrations in order via the SQL editor:
   - `migrations/001_schema.sql` — tables, indexes, auth trigger
   - `migrations/002_rls.sql` — row level security policies
3. Run seed data:
   - `seed/skills.sql` — 10 curated skills
4. Copy project URL and anon key into `app/lib/supabase.ts`
5. Enable Realtime on the following tables in Supabase Dashboard → Database → Replication:
   - `messages` (for message relay via Postgres Changes if needed)
   - `agents` (optional — presence covers status in v1)

## Environment Variables (app)

```
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

## Realtime Channel Design

Each connected agent uses a single channel scoped to its `agent_id`:

```
Channel name:  agent:{agent_id}
Broadcast:     messages (low-latency, connector → app and app → connector)
Presence:      heartbeat (connector updates every 30s; app reads to compute status)
```

### App subscribes on Agent Detail open:
```typescript
const channel = supabase.channel(`agent:${agentId}`)

// Receive inbound messages from agent
channel.on('broadcast', { event: 'message' }, ({ payload }) => {
  // payload: { direction: 'inbound', content, created_at }
})

// Track connector presence for status
channel.on('presence', { event: 'sync' }, () => {
  const state = channel.presenceState()
  // if connector key present and last seen < 60s → 'connected'
  // 60s–5min → 'stale'
  // absent → 'disconnected'
})

channel.subscribe()
```

### Connector subscribes on connect:
```typescript
const channel = supabase.channel(`agent:${agentId}`)

// Track presence (heartbeat)
channel.track({ agent_id: agentId, connector_version: '1.0.0', ts: Date.now() })

// Receive outbound messages from app
channel.on('broadcast', { event: 'message' }, ({ payload }) => {
  // payload: { direction: 'outbound', content }
  // route content to agent process
})

channel.subscribe()
```

### Send message (app → connector):
```typescript
await channel.send({
  type: 'broadcast',
  event: 'message',
  payload: { direction: 'outbound', content: userText }
})
// Also persist to messages table
await supabase.from('messages').insert({ agent_id, user_id, direction: 'outbound', content: userText })
```

## RLS Testing Checklist

Before going to production, verify with two separate user accounts:

- [ ] User A can select their own agents; User B cannot
- [ ] User A can select their own messages; User B cannot
- [ ] User A can select their own agent_skills; User B cannot
- [ ] Both users can select all skills (public read)
- [ ] User A cannot update or delete User B's agent
- [ ] Service role (connector) bypasses RLS — this is correct by design
