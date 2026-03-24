# Task Board

_Last updated: 2026-03-22_

## In Progress
_Nothing started yet._

## Backlog — MVP (ordered)

### Phase 1: Scaffold
- [ ] `SCAFFOLD-1` Init Expo project with TypeScript + Expo Router
- [ ] `SCAFFOLD-2` Install and configure NativeWind
- [ ] `SCAFFOLD-3` Set up Supabase project + env vars
- [ ] `SCAFFOLD-4` Set up Zustand stores (auth, agents, messages)
- [ ] `SCAFFOLD-5` Define shared TypeScript types (Agent, Message, Skill, AgentSkill)
- [ ] `SCAFFOLD-6` Implement design system constants (colors, spacing, typography)

### Phase 2: Auth + Onboarding
- [ ] `AUTH-1` Supabase Auth setup (email/password + magic link)
- [ ] `AUTH-2` Sign up screen
- [ ] `AUTH-3` Log in screen
- [ ] `AUTH-4` Onboarding flow (connect your first agent prompt)

### Phase 3: Agent Connection
- [ ] `CONNECT-1` Generate user-scoped connection token
- [ ] `CONNECT-2` Connect Agent screen — display setup command
- [ ] `CONNECT-3` Polling / realtime listener for new agent registration
- [ ] `CONNECT-4` Agent appears in list on successful connection

### Phase 4: Core Screens
- [ ] `SCREEN-1` Agents list screen (cards + status)
- [ ] `SCREEN-2` Agent detail screen (header + status + tabs)
- [ ] `SCREEN-3` Chat tab — message list + input
- [ ] `SCREEN-4` Activity tab — recent agent events
- [ ] `SCREEN-5` Node view screen — Skia canvas, draggable nodes

### Phase 5: Messaging
- [ ] `MSG-1` Send message to agent via Supabase Realtime
- [ ] `MSG-2` Receive inbound agent response in real time
- [ ] `MSG-3` Message bubble UI (outbound / inbound)
- [ ] `MSG-4` Scroll to latest, optimistic send

### Phase 6: Marketplace
- [ ] `MKT-1` Skills data model + seed curated skills
- [ ] `MKT-2` Marketplace screen — skill cards by category
- [ ] `MKT-3` Skill detail screen — description + assign button
- [ ] `MKT-4` Assign skill to agent (agent_skills insert)
- [ ] `MKT-5` Assignment confirmation screen / toast

### Phase 7: Polish + Launch
- [ ] `POLISH-1` Empty states for all screens
- [ ] `POLISH-2` Error states and retry flows
- [ ] `POLISH-3` Loading skeletons
- [ ] `POLISH-4` Node view animations (entrance, active glow)
- [ ] `POLISH-5` App icon + splash screen
- [ ] `POLISH-6` EAS build + TestFlight submission

## Done
_Nothing completed yet._
