# Architecture Verdict

## Confirmed Stack

| Layer | Choice |
|-------|--------|
| Framework | Expo SDK 51+ (React Native) |
| Language | TypeScript |
| Navigation | Expo Router (file-based) |
| State | Zustand |
| Styling | NativeWind |
| Animations | Reanimated 3 (Skia deferred to v1.1) |

## Confirmed Backend
- **BaaS**: Supabase (Auth + Postgres + Realtime)
- **Realtime**: Supabase Realtime exclusively — Postgres-backed channels, sub-500ms
- **Connector**: CLI sidecar (npm/pip), authenticates with user-scoped token

## Agent Connection
App subscribes via Supabase Realtime channels; connector publishes heartbeat presence + bidirectional messages.

## Fastest Path to Running App
1. Initialize Expo project with TypeScript template
2. Configure Supabase Auth (email + social)
3. Build Auth screens (onboarding, login, signup)
4. Create Agents list + Agent Detail screens with Zustand store
5. Implement Supabase Realtime subscription + message relay

## Risks
- Supabase Realtime latency at scale — post-v1 relay server option documented
- Connector reliability depends on user's agent environment — mitigated by 5-state connection model
- Agent Detail status card must be compelling enough without node graph (deferred to v1.1)
