import { agentTheme } from '../lib/agentColor.js'

export default function TradeRow({ username = '@alex', agentname = 'scout', action = 'BOUGHT', asset = '2.4 SOL', pnl = '+$48.20', time = '2m ago', isPositive = true }) {
  const pnlColor = isPositive ? 'text-green' : 'text-red'
  const actionColor = action === 'BOUGHT' ? 'text-blue' : action === 'SOLD' ? 'text-red' : 'text-amber'
  const theme = agentTheme(username)
  const initial = username.replace('@', '').charAt(0).toUpperCase()

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-bg3 transition-colors">
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
        style={{
          background: theme.bg,
          border: `1.5px solid ${theme.ring}80`,
          color: theme.letter,
          boxShadow: `0 0 6px ${theme.ring}28`,
        }}
      >
        {initial}
      </div>

      {/* Two-line info */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-mono text-white truncate">
          {username}/{agentname}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`text-xs font-semibold ${actionColor}`}>{action}</span>
          <span className="text-xs text-text2">{asset}</span>
          <span className="text-xs text-text2">·</span>
          <span className="text-xs text-text2">{time}</span>
        </div>
      </div>

      {/* PnL */}
      <div className="flex-shrink-0 text-right">
        <span className={`text-sm font-mono font-semibold ${pnlColor}`}>{pnl}</span>
      </div>
    </div>
  )
}
