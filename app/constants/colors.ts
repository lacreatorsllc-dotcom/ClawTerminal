export const Colors = {
  // Backgrounds — Anthropic Dark
  bgPrimary: '#141413',    // Anthropic dark base
  bgSurface: '#1c1b19',    // card/list surfaces
  bgElevated: '#242320',   // elevated panels, inputs
  bgBorder: '#2e2c28',     // warm dividers — use sparingly

  // Brand — Anthropic Orange
  accentCrimson: '#d97757',    // primary CTA, brand, active tab indicator
  accentCrimsonHot: '#e8885a', // gradient end, hover/press states

  // Semantic — status & signal
  accentGreen: '#788c5d',   // connected, active — Anthropic green
  accentTeal: '#6a9bcc',    // live process, syncing — Anthropic blue
  accentAmber: '#d97757',   // warning, stale, reconnecting — reuses brand orange
  accentRed: '#ef4444',     // error, disconnected

  // Text — Anthropic warm neutrals
  textPrimary: '#faf9f5',   // Anthropic light — warm off-white
  textSecondary: '#b0aea5', // Anthropic mid gray
  textMuted: '#6b6a63',     // placeholders, disabled, timestamps
} as const
