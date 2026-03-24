# Connector Protocol v1.0

This document defines the contract the `claw-connector` package must implement. It is the authoritative spec for connector developers. Do not deviate without updating this doc and bumping `protocol_version`.

## Overview

The connector is a sidecar process that runs alongside an agent. It bridges the agent environment to ClawTerminal via Supabase Realtime.

```
Agent process → claw-connector → Supabase Realtime channel → iOS app
```

## Authentication

The connector authenticates using the **user's Supabase Auth JWT**. The user generates this token in the app and pastes it into the setup command.

```bash
npx claw-connector connect --token <supabase_jwt>
```

The JWT is used as the `Authorization: Bearer` header in all Supabase REST API calls. Because it is a scoped user token, all RLS policies apply — the connector can only access data belonging to that user.

**Token handling rules:**
- Store the token securely (env var, not in code)
- Token expires with Supabase session (default 1 hour) — connector must handle 401 and prompt user to re-run setup
- Post-v1: support refresh token flow so connector can stay alive without re-auth

## Registration

On startup, the connector registers the agent with Supabase:

```
POST https://<project>.supabase.co/rest/v1/agents
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "name": "<agent_name>",
  "status": "connecting",
  "metadata": {
    "protocol_version": "1.0",
    "connector_version": "<package_version>",
    "env": "node | python",
    "platform": "darwin | linux | win32"
  }
}
```

Response: `{ "id": "<agent_id>" }` (Supabase returns the inserted row)

Store `agent_id` in memory — used for all subsequent operations.

After registration, immediately update status to `connected`:

```
PATCH https://<project>.supabase.co/rest/v1/agents?id=eq.<agent_id>
{ "status": "connected", "last_seen": "<iso8601>" }
```

## Realtime Channel

Subscribe to channel `agent:{agent_id}` using `@supabase/realtime-js`:

```typescript
const channel = supabase.channel(`agent:${agentId}`)

// Track presence (heartbeat)
await channel.track({
  agent_id: agentId,
  connector_version: CONNECTOR_VERSION,
  ts: Date.now()
})

// Listen for outbound messages (app → agent)
channel.on('broadcast', { event: 'message' }, ({ payload }) => {
  if (payload.direction === 'outbound') {
    routeToAgent(payload.content)
  }
})

// Listen for skill assignments
channel.on('broadcast', { event: 'skill_assigned' }, ({ payload }) => {
  handleSkillAssignment(payload.skill_id, payload.config)
})

channel.subscribe()
```

## Heartbeat

Update presence every **30 seconds** while running:

```typescript
setInterval(async () => {
  await channel.track({ agent_id: agentId, ts: Date.now() })
  // Also update last_seen in DB
  await supabase.from('agents').update({ last_seen: new Date().toISOString() }).eq('id', agentId)
}, 30_000)
```

Status computation (client-side in app, based on last_seen):
- `0–60s` → `connected`
- `60s–5min` → `stale`
- `>5min` → `disconnected`

## Sending Agent Output (inbound messages)

When the agent produces output, the connector publishes it:

```typescript
// Broadcast to channel (low latency)
await channel.send({
  type: 'broadcast',
  event: 'message',
  payload: { direction: 'inbound', content: agentOutput, ts: Date.now() }
})

// Persist to messages table
await supabase.from('messages').insert({
  agent_id: agentId,
  user_id: userId,         // from JWT claim
  direction: 'inbound',
  content: agentOutput
})
```

Both steps are required: broadcast for real-time delivery, insert for persistence and history.

## Receiving Messages from App (outbound)

Messages from the app arrive via the `broadcast` listener above. Route `payload.content` to the agent's stdin or API handler.

Acknowledge by updating agent status if needed (no explicit ACK protocol in v1).

## Graceful Disconnect

On `SIGTERM` or `SIGINT`:

```typescript
process.on('SIGTERM', async () => {
  await supabase.from('agents').update({ status: 'disconnected' }).eq('id', agentId)
  await channel.unsubscribe()
  process.exit(0)
})
```

## Error Handling

| Scenario | Connector action |
|---|---|
| Registration 401 | Log error, exit with message asking user to re-run setup |
| Registration 5xx | Retry 3x with exponential backoff, then exit |
| Realtime disconnect | Auto-reconnect (handled by `@supabase/realtime-js`); update `agents.status = 'stale'` while reconnecting |
| Agent process crash | Set `agents.status = 'error'`, log error to stderr |
| JWT expired | Set `agents.status = 'error'`, prompt user to re-run setup |

## Protocol Versioning

Always include `protocol_version: "1.0"` in the registration `metadata` field. When breaking changes are introduced, bump to `"2.0"`. The app can inspect this field to show compatibility warnings.

## Summary Checklist

- [ ] Registration: POST to agents, store agent_id
- [ ] Set status to `connected` after registration
- [ ] Subscribe to `agent:{agent_id}` channel
- [ ] Track presence every 30s (heartbeat)
- [ ] Update `agents.last_seen` every 30s
- [ ] Route `direction:outbound` broadcasts to agent process
- [ ] Publish agent output as `direction:inbound` broadcast + DB insert
- [ ] Handle `SIGTERM` → set `disconnected`, unsubscribe
- [ ] Include `protocol_version` in metadata
