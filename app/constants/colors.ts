export const Colors = {
  // Backgrounds — Nocturnal Interface
  bgPrimary: '#000000',    // pure black, disappears into bezel
  bgSurface: '#131313',    // card/list surfaces
  bgElevated: '#1c1c1c',   // elevated panels, inputs
  bgBorder: '#252525',     // ghost borders — use sparingly, 15% opacity max

  // Brand
  accentCrimson: '#c1121f',  // primary CTA, brand, active tab indicator
  accentCrimsonHot: '#ff3b30', // gradient end, hover/press states

  // Semantic — status & signal
  accentGreen: '#22c55e',   // connected, active, profitable — "all systems go"
  accentTeal: '#00ecc4',    // live process, syncing, secondary system states
  accentAmber: '#f59e0b',   // warning, stale, reconnecting
  accentRed: '#ff453a',     // error, loss, disconnected — distinct from brand crimson

  // Text
  textPrimary: '#e5e2e1',   // body text — not pure white, easier on OLED
  textSecondary: '#8e8e93', // labels, metadata
  textMuted: '#6e6e73',     // placeholders, disabled, timestamps
} as const
