# UX Flows

## Screen Map

- **Splash / Auth** — Email + magic link sign-in, brand entry point
- **Onboarding** — Single-screen CLI setup instructions shown once after first sign-in
- **Agents List** — Home screen; all connected agents with status, last message preview
- **Connect Agent** — Step-by-step modal showing the CLI install command and connection status polling
- **Agent Detail** — Tabbed screen: Chat / Status / Activity log for a single agent
- **Skills Browser** — Scrollable catalog of available skills, filterable by category
- **Skill Detail** — Full skill description, capability list, agent assignment picker
- **Settings** — Account, notifications, API keys, sign-out

---

## First-Time User Flow

1. **Splash / Auth** — User enters email → taps "Send Magic Link" → email sent confirmation shown
2. **Splash / Auth** — User opens magic link → auto-redirected into app, session established
3. **Onboarding** — One-screen modal displays CLI install command in mono font → user copies command → taps "I ran it"
4. **Connect Agent** — Screen polls for incoming agent connection → animated waiting indicator
5. **Connect Agent** — Agent handshake detected → success state with agent name confirmed → tap "Open Agent"
6. **Agents List** — Agent appears in list with green Active status → user taps agent card
7. **Agent Detail (Chat tab)** — Chat input focused → user sends first message → agent responds
8. **Agent Detail (Status tab)** — User swipes to Status tab → views uptime, environment, version info
9. **Agents List** — User taps back → taps bottom nav "Skills"
10. **Skills Browser** — User browses skill cards → taps one
11. **Skill Detail** — User reads description → taps "Assign to Agent" → selects agent from picker
12. **Skill Detail** — Confirmation toast appears → skill badge now visible on agent card

---

## Key Interaction Patterns

- **Bottom tab nav** (4 tabs: Agents, Skills, Activity, Settings) — persistent, no hamburger menus, always reachable with thumb
- **Connect Agent as modal sheet** — slides up over Agents List so context is preserved; dismissible once an agent is confirmed
- **Agent Detail uses swipeable tabs** — Chat, Status, Activity accessed by horizontal swipe, not tap-only, to encourage exploration
- **Empty states are actionable** — Agents List with no agents shows inline "Connect your first agent" CTA, not just a message
- **Destructive actions require confirmation** — disconnect agent and skill removal use bottom sheet confirmation, never inline tap

---

## Design Risks

- **CLI onboarding drop-off** — The terminal command step is the highest friction point for non-technical users; the command display must be copy-one-tap, with a visible success state that reduces perceived waiting
- **Agent Detail information density** — Balancing real-time chat with status and log data on a small screen risks visual noise; tab separation must feel clean and the active tab must be unambiguous
- **Skill assignment clarity** — Users may not understand what assigning a skill does; Skill Detail must lead with a plain-language outcome statement before any technical detail, and the post-assignment confirmation must reinforce value
