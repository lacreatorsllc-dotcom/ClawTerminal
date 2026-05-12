import { useState } from 'react'
import { motion } from 'framer-motion'
import { PROFILES } from '../lib/users.js'

function InitialAvatar({ name, color, size = 48 }) {
  const initial = name?.[0]?.toUpperCase() || '?'
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${color}33, ${color}11)`,
        border: `2px solid ${color}55`,
        boxShadow: `0 0 20px ${color}33`,
        color,
        fontSize: size * 0.38,
      }}
    >
      {initial}
    </div>
  )
}

function AgentCard({ agent, index }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 + index * 0.1, duration: 0.5, ease: 'easeOut' }}
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* Agent header */}
      <div className="p-4 flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-mono text-xs font-bold"
          style={{ background: `${agent.color}22`, color: agent.color, border: `1px solid ${agent.color}44` }}
        >
          {agent.slug[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold text-white text-sm">{agent.fullSlug}</span>
            <span
              className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
              style={{ background: '#34d39922', color: '#34d399', border: '1px solid #34d39944' }}
            >
              live
            </span>
          </div>
          <p className="text-xs text-white/50 leading-relaxed">{agent.description}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className={`text-sm font-bold font-mono ${agent.positive ? 'text-green-400' : 'text-red-400'}`}>
            {agent.pnlPct}
          </div>
          <div className="text-[10px] text-white/40">{agent.pnl}</div>
        </div>
      </div>

      {/* Stats row */}
      <div
        className="grid grid-cols-3 divide-x"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)', divideColor: 'rgba(255,255,255,0.05)' }}
      >
        {[
          { label: 'Win Rate', value: agent.winRate },
          { label: 'Trades',   value: agent.trades },
          { label: 'Avg Hold', value: agent.avgHold },
        ].map((s) => (
          <div key={s.label} className="py-3 text-center" style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="text-sm font-semibold text-white">{s.value}</div>
            <div className="text-[10px] text-white/40">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Strategy + chain tags + toggle */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: `${agent.color}15`, color: agent.color, border: `1px solid ${agent.color}30` }}
          >
            {agent.strategy}
          </span>
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {agent.chain}
          </span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[11px] text-white/40 hover:text-white/70 transition-colors"
        >
          {expanded ? 'Hide trades ↑' : 'Recent trades ↓'}
        </button>
      </div>

      {/* Recent trades (expandable) */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {agent.recentTrades.map((t, i) => (
            <div
              key={i}
              className="px-4 py-2.5 flex items-center gap-3"
              style={{ borderBottom: i < agent.recentTrades.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
            >
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                style={{
                  background: t.action === 'buy' ? '#34d39922' : '#f8717122',
                  color: t.action === 'buy' ? '#34d399' : '#f87171',
                }}
              >
                {t.action === 'buy' ? '↑' : '↓'}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-white">{t.token}</span>
                <span className="text-xs text-white/40 ml-2">{t.amount}</span>
              </div>
              <div className="text-right">
                <div className={`text-xs font-mono font-semibold ${t.positive ? 'text-green-400' : 'text-red-400'}`}>
                  {t.pnl}
                </div>
                <div className="text-[10px] text-white/30">{t.time}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  )
}

export default function ProfilePage({ username }) {
  const key = username?.replace('@', '').toLowerCase()
  const profile = PROFILES[key]

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">404</div>
          <p className="text-white/50">Profile not found</p>
          <a href="/" className="mt-4 inline-block text-sm text-amber-400 hover:underline">← Back to slugs.run</a>
        </div>
      </div>
    )
  }

  const totalPnl = profile.agents.reduce((sum, a) => {
    const val = parseFloat(a.pnl.replace(/[^0-9.-]/g, '')) * (a.positive ? 1 : -1)
    return sum + val
  }, 0)

  return (
    <div className="min-h-screen" style={{ background: '#141413' }}>
      {/* Ambient glow */}
      <div
        className="fixed top-0 left-1/4 w-[600px] h-[400px] pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at center, ${profile.color}08 0%, transparent 70%)`,
          filter: 'blur(60px)',
        }}
      />

      {/* Nav */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b"
        style={{ backgroundColor: 'rgba(20,20,19,0.85)', borderColor: 'rgba(255,255,255,0.07)' }}
      >
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href="/">
            <img src="/slugs-logo.png" alt="SLUGS" className="h-6 w-auto" style={{ imageRendering: 'pixelated' }} />
          </a>
          <a
            href="https://app.slugs.run"
            className="text-sm font-semibold px-4 py-1.5 rounded-lg text-black"
            style={{ background: '#d4683c' }}
          >
            Open App
          </a>
        </div>
      </nav>

      <div className="relative z-10 max-w-2xl mx-auto px-4 pt-24 pb-16">

        {/* Profile header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="mb-8"
        >
          <div className="flex items-start gap-4 mb-5">
            <InitialAvatar name={profile.displayName} color={profile.color} size={72} />
            <div className="flex-1 min-w-0 pt-1">
              <h1 className="text-2xl font-bold text-white leading-tight">{profile.displayName}</h1>
              <div className="text-sm text-white/50 mb-2">{profile.handle}</div>
              <p className="text-sm text-white/70 leading-relaxed">{profile.bio}</p>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-6 text-sm mb-5">
            <div>
              <span className="font-semibold text-white">{profile.following}</span>
              <span className="text-white/40 ml-1">following</span>
            </div>
            <div>
              <span className="font-semibold text-white">{profile.followers}</span>
              <span className="text-white/40 ml-1">followers</span>
            </div>
            <div>
              <span className="font-semibold text-white">{profile.joined}</span>
              <span className="text-white/40 ml-1">joined</span>
            </div>
          </div>

          {/* Total P&L banner */}
          <div
            className="rounded-xl px-4 py-3 flex items-center justify-between"
            style={{ background: `${profile.color}0f`, border: `1px solid ${profile.color}25` }}
          >
            <div>
              <div className="text-xs text-white/50 mb-0.5">Total agent P&L (all time)</div>
              <div className="text-xl font-bold font-mono" style={{ color: profile.color }}>
                +${totalPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-white/50 mb-0.5">Active agents</div>
              <div className="text-xl font-bold text-white">{profile.agents.length}</div>
            </div>
          </div>
        </motion.div>

        {/* Agents */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Agents</h2>
            <span className="text-xs text-white/30">{profile.agents.length} deployed</span>
          </div>
          <div className="space-y-4">
            {profile.agents.map((agent, i) => (
              <AgentCard key={agent.slug} agent={agent} index={i} />
            ))}
          </div>
        </motion.div>

        {/* Follow CTA */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mt-10 text-center"
        >
          <p className="text-sm text-white/40 mb-3">Follow Gabe to see live agent updates in your feed</p>
          <a
            href="https://app.slugs.run"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-black transition-opacity hover:opacity-90"
            style={{ background: '#d4683c' }}
          >
            Follow on SLUGS
            <span>→</span>
          </a>
        </motion.div>

      </div>
    </div>
  )
}
