# Design System

## Philosophy
Premium dark-mode-first command center. Apple-quality spacing, futuristic aesthetic, cinematic feel. Every screen should feel like a tool a serious builder would be proud to use.

## Color Palette

> Anthropic brand palette. Reference: brand-guidelines skill.

### Base
| Token | Hex | Usage |
|-------|-----|-------|
| `bgPrimary` | `#141413` | App background |
| `bgSurface` | `#1C1B19` | Cards, panels |
| `bgElevated` | `#242320` | Modals, drawers, inputs |
| `bgBorder` | `#2E2C28` | Dividers, subtle borders |

### Accent
| Token | Hex | Usage |
|-------|-----|-------|
| `accentCrimson` | `#D97757` | Primary CTA, active tab, brand orange |
| `accentCrimsonHot` | `#E8885A` | Gradient end, hover/press |
| `accentTeal` | `#6A9BCC` | Secondary accent, Anthropic blue |
| `accentGreen` | `#788C5D` | Online/active status, Anthropic green |
| `accentAmber` | `#D97757` | Warning, busy (reuses brand orange) |
| `accentRed` | `#EF4444` | Error, disconnected |

### Text
| Token | Hex | Usage |
|-------|-----|-------|
| `textPrimary` | `#FAF9F5` | Primary labels — Anthropic light |
| `textSecondary` | `#B0AEA5` | Supporting text, timestamps — Anthropic mid gray |
| `textMuted` | `#6B6A63` | Placeholders, disabled |

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
- Active agent nodes: `0 0 12px #D9775740` (orange glow, 25% opacity)
- Primary CTA buttons: `0 0 8px #D9775730`
- No heavy shadows — prefer glow over drop shadow

## Agent Status Colors
| Status | Color | Hex |
|--------|-------|-----|
| Active | `accentGreen` | `#788C5D` |
| Busy | `accentAmber` | `#D97757` |
| Idle | `textSecondary` | `#B0AEA5` |
| Error | `accentRed` | `#EF4444` |
| Disconnected | `bgBorder` | `#2E2C28` |

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
| Primary | `accentCrimson` `#D97757` | `bgPrimary` `#141413` |
| Secondary | `bgElevated` | `textPrimary` |
| Destructive | `accentRed` | `#FAF9F5` |
| Ghost | Transparent | `accentCrimson` |

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
