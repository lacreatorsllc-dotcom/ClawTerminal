# Design System

## Philosophy
Premium dark-mode-first command center. Apple-quality spacing, futuristic aesthetic, cinematic feel. Every screen should feel like a tool a serious builder would be proud to use.

## Color Palette

### Base
| Token | Hex | Usage |
|-------|-----|-------|
| `bg-primary` | `#080A0E` | App background |
| `bg-surface` | `#0F1117` | Cards, panels |
| `bg-elevated` | `#161B24` | Modals, drawers, inputs |
| `bg-border` | `#1E2533` | Dividers, subtle borders |

### Accent
| Token | Hex | Usage |
|-------|-----|-------|
| `accent-cyan` | `#00E5FF` | Primary CTA, active agent, glow |
| `accent-violet` | `#7C3AED` | Secondary accent, skill badges |
| `accent-green` | `#10F07A` | Online/active status |
| `accent-amber` | `#F59E0B` | Warning, busy status |
| `accent-red` | `#EF4444` | Error, disconnected |

### Text
| Token | Hex | Usage |
|-------|-----|-------|
| `text-primary` | `#F1F5F9` | Primary labels |
| `text-secondary` | `#64748B` | Supporting text, timestamps |
| `text-muted` | `#334155` | Placeholders, disabled |

## Typography

**Primary font:** SF Pro (system default on iOS — no custom font needed for v1)

| Scale | Size | Weight | Usage |
|-------|------|--------|-------|
| `title-xl` | 28pt | 700 | Screen titles |
| `title-lg` | 22pt | 600 | Section headers |
| `body` | 16pt | 400 | Chat messages, body text |
| `body-sm` | 14pt | 400 | Secondary content |
| `label` | 12pt | 500 | Tags, badges, caps |
| `mono` | 13pt | 400 | Code snippets, agent IDs, setup commands |

Monospace font: `JetBrains Mono` or `Fira Code` for all code/command display.

## Spacing
4pt base grid. Use multiples: 4, 8, 12, 16, 24, 32, 48.

## Border Radius
| Context | Radius |
|---------|--------|
| Cards | 16pt |
| Buttons | 12pt |
| Chips / badges | 8pt |
| Inputs | 12pt |
| Node circles | 50% |

## Elevation / Glow
- Active agent nodes: `0 0 12px #00E5FF40` (cyan glow, 25% opacity)
- Primary CTA buttons: `0 0 8px #00E5FF30`
- No heavy shadows — prefer glow over drop shadow

## Agent Status Colors
| Status | Color |
|--------|-------|
| Active | `accent-green` |
| Busy | `accent-amber` |
| Idle | `text-secondary` |
| Error | `accent-red` |
| Disconnected | `bg-border` |

## Component Patterns

### Agent Card
- Dark surface card (`bg-surface`)
- Agent name in `text-primary`, status dot color-coded
- Last message preview in `text-secondary`
- Subtle cyan border-left on active agents

### Chat Bubbles
- Outbound (user): `accent-violet` background, right-aligned
- Inbound (agent): `bg-elevated`, left-aligned
- Mono font for any code blocks within messages

### Node View
- Nodes: circles with agent avatar/initial, glow on active
- Edges: thin lines (`bg-border` to `accent-cyan` gradient based on activity)
- Background: `bg-primary` with subtle grid or particle texture

### Skill Cards
- `bg-surface` card, 16pt radius
- Category badge in `accent-violet`
- Clear "Assign" CTA button in `accent-cyan`

### Buttons
| Type | Background | Text |
|------|-----------|------|
| Primary | `accent-cyan` | `#080A0E` |
| Secondary | `bg-elevated` | `text-primary` |
| Destructive | `accent-red` | `#F1F5F9` |
| Ghost | Transparent | `accent-cyan` |

## Motion
- Screen transitions: slide (Expo Router default) + subtle fade
- Node entrance: scale from 0.8 + fade, spring physics
- Message arrival: slide up + fade
- Status change: color crossfade, 200ms
- No gratuitous animation — motion should communicate state, not entertain

## Icons
Use `@expo/vector-icons` (Ionicons or Feather) for v1. Consistent 24pt size, `text-secondary` default, `text-primary` on active state.

## Dark Mode
Dark mode only in v1. Do not implement light mode. System appearance setting is ignored.
