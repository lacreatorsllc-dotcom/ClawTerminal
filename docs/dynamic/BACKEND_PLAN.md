# Backend Plan

## Supabase Setup Steps
1. Create Supabase project (Auth + Postgres + Realtime enabled)
2. Enable email provider in Auth settings
3. Copy JWT secret to env
4. Create tables in order: users, agents, messages, skills, agent_skills
5. Enable RLS on all tables; write user_id-scoped policies
6. Enable Realtime for agents + messages tables (broadcast mode)
7. Create Realtime channels: `agent:{agent_id}` for presence and messages
8. Test connector auth handshake via Supabase REST API

## Schema (v1)
- **users**: id (uuid), email (text), created_at (timestamp)
- **agents**: id (uuid), user_id (uuid), name (text), status (text), last_seen (timestamp), metadata (jsonb)
- **messages**: id (uuid), agent_id (uuid), user_id (uuid), direction (enum: inbound|outbound), content (text), created_at (timestamp)
- **skills**: id (uuid), name (text), description (text), category (text), version (text), config_schema (jsonb)
- **agent_skills**: id (uuid), agent_id (uuid), skill_id (uuid), assigned_at (timestamp), status (text)

## Realtime Channel Design
- `agent:{agent_id}:presence` — connector heartbeat every 30s, drives connection state
- `agent:{agent_id}:messages` — inbound/outbound messages, direction field indicates flow
- Broadcast mode; no private channels in v1
- App subscribes on agent open; connector publishes via Supabase Realtime client

## Auth Config
- Email + magic link (no OAuth in v1)
- JWT issued by Supabase Auth, stored in app secure storage
- Connector receives user-scoped token (issued in app, 90-day TTL) for agent registration
- RLS: all tables filtered by `auth.uid() = user_id`

## Mocks Acceptable in v1
- Activity feed: hardcoded JSON, 5–10 sample entries per agent
- Skills catalog: 8–10 curated static entries, no live fetch
- Agent status metrics: synthetic values for dev/demo
- Connector heartbeat: simulated presence updates for local dev

## Risks
- Realtime broadcast scalability at high agent count — monitor latency post-launch
- Connector token revocation: no mid-session invalidation; rely on TTL
- RLS performance on large user base — ensure user_id columns are indexed
