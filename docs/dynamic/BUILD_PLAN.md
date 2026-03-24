# Build Plan

## Build Order
1. Expo project init + Supabase config (sequential)
2. Auth screens + Supabase Auth (sequential after 1)
3. Onboarding flow (sequential after 2)
4. Zustand stores scaffolding (parallel with 3)
5. Agents List + Agent Detail screens (sequential after 3+4)
6. Connect Agent modal + Realtime subscription (sequential after 5)
7. Skills Browser + Skill Detail (parallel with 6)
8. Settings screen (parallel with 6+7)

## Frontend Workstreams

| Phase | Screens/Tasks |
|-------|--------------|
| 2–3 | Auth (login, signup), Onboarding |
| 4–5 | Agents List, Agent Detail (Chat/Status/Activity tabs) |
| 6 | Connect Agent modal, Realtime channel UI |
| 7–8 | Skills Browser, Skill Detail, Settings |

## Backend Workstreams

| Phase | Tasks |
|-------|-------|
| 1 | Supabase project init, schema design |
| 2 | Auth providers (email + social) |
| 6 | Realtime channels, connector token model |
| 7 | Skills metadata table |

## What Can Be Mocked in v1
- Agent activity feed (static entries)
- Skills catalog (hardcoded JSON, 5–10 entries)
- Connector heartbeat presence (simulated in dev)
- Agent status metrics (fake values for demo)

## Blockers
- Supabase project credentials must exist before any auth work
- Connector token schema must be defined before Realtime subscription work begins
- NativeWind + Expo Router compatibility confirmed for SDK 51+

## First Engineering Task
Initialize Expo TypeScript project, install and configure Supabase client, validate Auth email login end-to-end.
