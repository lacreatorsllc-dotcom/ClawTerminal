import { agentTheme } from '../lib/agentColor.js'

export default function AgentCard({ name = '@you/koda', strategy = 'Momentum', pnlToday = '+$124.50', totalReturn = '+18.3%', trades = 47, isLive = true, isPositive = true, isNegative = false }) {
  const pnlColor = isNegative ? 'text-red' : 'text-green'
  const sparkPoints = isNegative
    ? '0,5 15,8 30,12 45,10 60,18 75,22 85,24 100,27'
    : '0,28 15,22 30,18 45,20 60,12 75,8 85,5 100,3'
  const sparkColor = isNegative ? '#f87171' : '#d4683c'
  const theme = agentTheme(name)
  const initial = name.replace('@', '').charAt(0).toUpperCase()

  return (
    <div className="bg-bg2 border border-glass rounded-2xl p-4 w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {/* Letter avatar with colored ring */}
          <div
            className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold"
            style={{
              background: theme.bg,
              border: `1.5px solid ${theme.ring}80`,
              color: theme.letter,
              boxShadow: `0 0 8px ${theme.ring}30`,
            }}
          >
            {initial}
          </div>
          <div>
            <div className="text-sm font-medium text-white font-mono">{name}</div>
            <div className="text-xs text-text2">Strategy: {strategy}</div>
          </div>
        </div>
        {isLive && (
          <div className="flex items-center gap-1.5 bg-green/10 border border-green/20 rounded-full px-2.5 py-1 glow-green">
            <div className="w-1.5 h-1.5 rounded-full bg-green pulse-dot" />
            <span className="text-xs font-medium text-green">LIVE</span>
          </div>
        )}
      </div>

      <div className="border-t border-glass mb-3" />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div>
          <div className="text-xs text-text2 mb-1">PnL Today</div>
          <div className={`text-sm font-semibold font-mono ${pnlColor}`}>{pnlToday}</div>
        </div>
        <div>
          <div className="text-xs text-text2 mb-1">Total Return</div>
          <div className="text-sm font-semibold font-mono text-white">{totalReturn}</div>
        </div>
        <div>
          <div className="text-xs text-text2 mb-1">Trades</div>
          <div className="text-sm font-semibold font-mono text-white">{trades}</div>
        </div>
      </div>

      <div className="border-t border-glass mb-3" />

      {/* Sparkline */}
      <svg viewBox="0 0 100 30" className="w-full h-8" preserveAspectRatio="none">
        <polyline
          points={sparkPoints}
          fill="none"
          stroke={sparkColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}
