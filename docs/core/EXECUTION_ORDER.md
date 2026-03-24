# Execution Order

No downstream agent begins major work until upstream inputs are confirmed ready.
All phases route through thalassa (Orchestrator).

---

## Phase 1 — Product Definition ✅
**Agent:** portia (Product Strategist)
**Goal:** Define MVP, target user, core flows, out-of-scope
**Deliverables:** MVP spec, prioritized feature list, user flows, scope constraints
**Status:** Complete → docs/core/MVP_STRATEGY.md

## Phase 2 — System Definition ✅
**Agent:** miranda (Technical Architect)
**Gate:** Phase 1 approved
**Goal:** Technical approach for approved MVP, stack, constraints, v1 realism
**Deliverables:** Architecture plan, system constraints, implementation approach, technical risks
**Status:** Complete → docs/core/ARCHITECTURE.md, ARCHITECTURE_VERDICT.md

## Phase 3 — UX / Interaction Design ✅
**Agent:** despina (UI/UX Designer)
**Gate:** Phase 1 + Phase 2 approved
**Goal:** Interface and interaction system using product requirements + technical constraints
**Deliverables:** Screen flows, interaction model, node behavior spec, Stitch prompts
**Status:** Complete → docs/core/UX_FLOWS.md

## Phase 4 — Build Planning ✅
**Agents:** cordelia (Frontend), jupiter (Backend)
**Gate:** Phase 3 approved
**Goal:** Translate approved UX + architecture into implementation plans
**Frontend deliverables:** Component structure, state plan, screen implementation order
**Backend deliverables:** APIs, database plan, real-time plan, agent connection model
**Status:** Complete → docs/dynamic/BUILD_PLAN.md, FRONTEND_PLAN.md, BACKEND_PLAN.md

## Phase 5 — Implementation 🔄
**Agents:** cordelia (Frontend), jupiter (Backend)
**Gate:** Phase 4 approved
**Goal:** Build MVP in smallest working form — core loop first
**Deliverables:** Working product slices
**Status:** In progress — scaffold built, all 8 screens written, awaiting Supabase env setup

## Phase 6 — Review / Validation ⏳
**Agent:** haumea (QA Debugger)
**Gate:** Phase 5 core loop working
**Goal:** Test flows, find issues, identify unclear UX, broken states, edge cases
**Deliverables:** Prioritized issue list, suggested fixes
**Status:** Not started

## Phase 7 — Polish ⏳
**Agent:** juliet (Refinement Agent)
**Gate:** Phase 6 issue list reviewed by thalassa
**Goal:** Improve clarity, onboarding, visual polish, friction — no architecture changes
**Deliverables:** Targeted refinements only
**Status:** Not started

---

## Notes
- cressida (Growth & Launch) activates after Phase 6 or in parallel with Phase 7
- Node graph view is deferred to v1.1 — not part of this execution cycle
- All phase transitions are decided by thalassa
