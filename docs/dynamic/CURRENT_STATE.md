# Current State

_Last updated: 2026-03-22_

## Status
**Phase:** Phases 1–4 complete. Full scaffold built. TypeScript compiles clean. Waiting on Supabase env setup to run app.

## What exists
- Full Expo Router project structure with dark theme
- 3-tab navigation: Agents / Skills / Settings
- Auth screen (email + password, sign in / sign up)
- Agents list screen with status indicators and empty state
- Connect Agent modal with CLI command + realtime polling
- Agent Detail screen with Chat / Status / Activity tabs + Supabase Realtime
- Skills browser with category filter
- Skill Detail screen with 2-tap assign flow
- Settings screen with sign-out
- 5 Zustand stores: auth, agents, chat, skills, ui
- constants/colors.ts with full design system tokens
- lib/supabase.ts — typed client, auth helpers, channel subscription, sendMessage
- lib/types.ts — TypeScript types for all entities
- supabase/migrations/001_schema.sql — full schema
- supabase/migrations/002_rls.sql — RLS policies
- supabase/seed/skills.sql — 10 curated skills
- docs/dynamic/BUILD_PLAN.md, FRONTEND_PLAN.md, BACKEND_PLAN.md
- docs/core/MVP_STRATEGY.md, ARCHITECTURE.md, ARCHITECTURE_VERDICT.md, UX_FLOWS.md

## What's decided
- Stack: Expo SDK 55 / React Native 0.83 + TypeScript + Supabase + Zustand
- iOS first, dark mode only
- Supabase Realtime exclusively (no raw WebSocket relay)
- Bottom nav: 3 tabs (Agents, Skills, Settings)
- Node graph: deferred to v1.1
- Agent naming: connector auto-assigns, optional rename
- Offline skill assignment: optimistic + pending status

## Active blockers
- None confirmed. Supabase env vars are set in `app/.env`.

## Next step
1. Confirm migrations have been run: paste `supabase/migrations/001_schema.sql` then `002_rls.sql` in Supabase SQL editor
2. Run seed: paste `supabase/seed/skills.sql`
3. `cd app && bun start`
