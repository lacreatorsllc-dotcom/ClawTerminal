# Architecture

## Stack Decision

**Recommended: Expo (React Native) + TypeScript**

Rationale: Fastest path to a beautiful, production-quality iOS app with future Android support. Large ecosystem, OTA updates via EAS, and strong animation/gesture libraries. Native Swift would be faster runtime but significantly slower to build. Flutter is viable but TypeScript gives better AI tooling and hiring leverage.

**Assumption:** No existing codebase. Starting fresh.

## Frontend (iOS App)

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Expo SDK 51+ (React Native) | Fastest MVP, OTA updates, EAS build |
| Language | TypeScript | Type safety, better DX |
| Navigation | Expo Router (file-based) | Clean, scalable, deep link ready |
| State | Zustand | Lightweight, no boilerplate |
| Animations | Reanimated 3 + Skia | Smooth node view, gesture interactions |
| Node view | React Native Skia or D3 + RNSVG | Canvas-based agent graph |
| Styling | NativeWind (Tailwind for RN) | Rapid design system implementation |
| Real-time | WebSocket (native) | Agent communication channel |
| Auth | Supabase Auth | Fast setup, email + social, JWT |

## Backend / Infrastructure

| Layer | Choice | Why |
|-------|--------|-----|
| BaaS | Supabase | Auth + Postgres + Realtime out of the box |
| Realtime | Supabase Realtime or WebSocket relay | Agent ↔ app message relay |
| Agent connector | CLI package (npm/pip) | User runs in their agent environment |
| Hosting | Supabase (managed) | Zero infra to manage in v1 |

## Agent Connection Model

```
User's environment
  └── agent process
        └── claw-connector (npm/pip package)
              └── WebSocket → Supabase Realtime / relay server
                    └── iOS app (WebSocket client)
```

1. User installs `claw-connector` in their agent environment
2. Connector authenticates with a user-scoped token (generated in app)
3. Connector registers agent and opens persistent WebSocket
4. App subscribes to that agent's channel via Supabase Realtime
5. Messages flow bidirectionally in real time

**Assumption:** The connector CLI package is a separate repo/package. Architecture.md covers the protocol; the package itself is out of scope for initial app build.

## Data Model (Supabase / Postgres)

```
users
  id, email, created_at

agents
  id, user_id, name, status, last_seen, metadata (jsonb)

messages
  id, agent_id, user_id, direction (inbound|outbound), content, created_at

skills
  id, name, description, category, version, config_schema (jsonb)

agent_skills
  id, agent_id, skill_id, assigned_at, status
```

## Key Screens → Components

```
App
├── Auth (onboarding, login, signup)
├── Home (agents list + node view toggle)
├── Agent Detail (chat + status + activity)
├── Connect Agent (setup command flow)
├── Marketplace (skill browser)
├── Skill Detail (assign flow)
└── Settings
```

## Folder Structure

```
app/                    # Expo Router screens
components/             # Shared UI components
  ui/                   # Design system primitives
  agents/               # Agent-specific components
  marketplace/          # Marketplace components
hooks/                  # Custom React hooks
lib/
  supabase.ts           # Supabase client
  websocket.ts          # WS connection manager
  types.ts              # Shared TypeScript types
stores/                 # Zustand stores
constants/              # Colors, spacing, typography
```

## Scalability Notes (post-v1)
- Node graph can graduate from Skia to a dedicated graph library when agent count grows
- Supabase Realtime can be replaced with a dedicated relay server if latency becomes an issue
- Connector protocol should be versioned from day one to allow backward compat

## Resolved Architecture Decisions

### Real-time Transport
Use **Supabase Realtime exclusively**. The connector publishes to a Postgres-backed channel; the app subscribes via `@supabase/realtime-js`. This eliminates a standalone WebSocket relay server, keeps all traffic through one authenticated surface, and broadcast mode delivers sub-500ms — sufficient for interactive chat. Raw WebSocket deferred to post-v1 if latency becomes a bottleneck. Rename `lib/websocket.ts` → `lib/realtime.ts`.

### Connection States & Recovery
Five states driven by `agent.last_seen` delta, computed client-side — no polling endpoint needed:
- **`disconnected`** — never connected or idle >5min; show "Offline", surface setup command in Agent Detail
- **`connecting`** — authenticated, awaiting first heartbeat; pulsing indicator, timeout to `error` after 30s
- **`connected`** — heartbeat within last 60s; green dot, full chat enabled
- **`stale`** — last heartbeat 60s–5min ago; amber dot + "Reconnecting…"; auto-recovers or degrades to `disconnected`
- **`error`** — timed out or explicit error event; red badge, actionable message, one-tap Retry

Connector sends heartbeat every 30s via Supabase Realtime presence update.

### Agent Compatibility Spec
Any agent whose environment can run the `claw-connector` sidecar (npm or pip) is compatible. Connector must implement:
- **Auth handshake** — POST user-scoped token to register agent, receive `agent_id`
- **Heartbeat** — presence update every 30s while running
- **Inbound handler** — subscribe to channel for `direction: outbound` messages, route to agent process
- **Outbound emitter** — publish agent output as `direction: inbound` message events
- **Graceful disconnect** — publish `disconnected` status on SIGTERM before closing

Compatible out of the box (connector is a sidecar, not an SDK): Claude Code, LangChain, AutoGen, CrewAI, any Python/Node agent.

### Stack Trimming (from node view cut)
- **Remove `@shopify/react-native-skia`** — node graph is v1.1; Skia adds ~6MB and native build config, not justified without it
- **Retain Reanimated 3** — still needed for transitions, chat animations, status pulses, skeleton loaders
- **Node view screen** — deferred to v1.1; Agent Detail replaces it with status card, last_seen, assigned skills, activity feed
