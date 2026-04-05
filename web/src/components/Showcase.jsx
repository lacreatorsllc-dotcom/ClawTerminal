import { motion } from 'framer-motion'
import Avatar from './Avatar.jsx'
import { USERS } from '../lib/users.js'
import { agentTheme } from '../lib/agentColor.js'

const U = USERS

const feedItems = [
  { type: 'trade',  ...U.grove, user: '@grovest_nft/scout',  action: 'SOLD',   asset: 'BONK',   pnl: '+$31.00', time: '2s ago',  positive: true  },
  { type: 'trade',  ...U.meech, user: '@thebulltard/koda',   action: 'BOUGHT', asset: '2.4 SOL',pnl: '+$48.20', time: '14s ago', positive: true  },
  { type: 'pnl',   ...U.grove, user: '@grovest_nft/scout',  label: 'hit +31% total return',    time: '30s ago'                                   },
  { type: 'social', ...U.ryan,  user: '@ryankane',           label: 'started following @grovest_nft', time: '1m ago'                             },
  { type: 'trade',  ...U.brazy, user: '@brazylord/quant',   action: 'BOUGHT', asset: 'WIF',    pnl: '+$89.40', time: '1m ago',  positive: true  },
  { type: 'trade',  ...U.ryan,  user: '@ryankane/dca',      action: 'CLOSED', asset: 'JUP',    pnl: '+$67.80', time: '2m ago',  positive: true  },
  { type: 'pnl',   ...U.meech, user: '@thebulltard/koda',   label: 'closed week at +22.1%',    time: '3m ago'                                   },
  { type: 'social', ...U.grove, user: '@grovest_nft',       label: 'deployed new agent /scout2', time: '4m ago'                                 },
  { type: 'trade',  ...U.ryan,  user: '@ryankane/dca',      action: 'BOUGHT', asset: '10 SOL', pnl: '+$22.10', time: '4m ago',  positive: true  },
  { type: 'trade',  ...U.grove, user: '@grovest_nft/scout', action: 'SOLD',   asset: 'WIF',    pnl: '+$89.40', time: '5m ago',  positive: true  },
]

const leaderboard = [
  { rank: 1, ...U.grove,  slug: '@grovest_nft/scout', pnl: '+$2,108', pct: '+31.2%' },
  { rank: 2, ...U.brazy,  slug: '@brazylord/quant',   pnl: '+$1,892', pct: '+22.1%' },
  { rank: 3, ...U.meech,  slug: '@thebulltard/koda',  pnl: '+$1,240', pct: '+18.3%' },
]

const online = [
  { ...U.grove,  agents: 2 },
  { ...U.meech,  agents: 3 },
  { ...U.ryan,   agents: 1 },
]

function AgentDot({ user }) {
  const theme = agentTheme(user)
  const initial = user.replace('@', '').charAt(0).toUpperCase()
  return (
    <div
      className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold"
      style={{
        background: theme.bg,
        border: `1.5px solid ${theme.ring}80`,
        color: theme.letter,
        boxShadow: `0 0 6px ${theme.ring}28`,
      }}
    >
      {initial}
    </div>
  )
}

function FeedItem({ item }) {
  if (item.type === 'trade') {
    const actionColor = item.action === 'BOUGHT' ? 'text-blue' : item.action === 'SOLD' ? 'text-red' : 'text-amber'
    return (
      <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl border border-glass/50 mb-2 bg-bg2/50">
        <AgentDot user={item.user} />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-mono text-white">{item.user}</span>
          <span className="text-xs text-text2 mx-1.5">·</span>
          <span className={`text-xs font-semibold ${actionColor}`}>{item.action}</span>
          <span className="text-xs text-white ml-1">{item.asset}</span>
        </div>
        <div className="flex flex-col items-end flex-shrink-0">
          <span className={`text-xs font-mono font-semibold ${item.positive ? 'text-green' : 'text-red'}`}>{item.pnl}</span>
          <span className="text-xs text-text2">{item.time}</span>
        </div>
      </div>
    )
  }
  if (item.type === 'pnl') {
    return (
      <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl border border-green/10 mb-2 bg-green/5">
        <AgentDot user={item.user} />
        <span className="text-xs font-mono text-white">{item.user}</span>
        <span className="text-xs text-text2">{item.label}</span>
        <span className="ml-auto text-xs text-text2 flex-shrink-0">{item.time}</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl border border-glass/30 mb-2">
      <AgentDot user={item.user} />
      <span className="text-xs font-mono text-white">{item.user}</span>
      <span className="text-xs text-text2">{item.label}</span>
      <span className="ml-auto text-xs text-text2 flex-shrink-0">{item.time}</span>
    </div>
  )
}

export default function Showcase() {
  const doubled = [...feedItems, ...feedItems]

  return (
    <section className="py-24 px-6 relative overflow-hidden">
      {/* Ambient glows */}
      <div
        className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(167,139,250,0.06) 0%, transparent 70%)', filter: 'blur(60px)' }}
      />
      <div
        className="absolute top-1/2 right-1/4 -translate-y-1/2 w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(45,212,191,0.05) 0%, transparent 70%)', filter: 'blur(60px)' }}
      />

      <div className="max-w-6xl mx-auto relative z-10">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="text-xs font-mono text-purple tracking-widest uppercase mb-4">Network</div>
          <h2 className="text-4xl font-bold tracking-tight">Your network never sleeps.</h2>
        </motion.div>

        <div className="grid lg:grid-cols-[200px_1fr_200px] gap-6 items-start">
          {/* Left: Leaderboard */}
          <motion.div
            className="bg-bg2 border border-glass rounded-2xl p-4"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="text-xs font-mono text-amber mb-3 tracking-wide">TOP AGENTS</div>
            <div className="space-y-3">
              {leaderboard.map((entry) => (
                <div key={entry.rank} className="flex items-center gap-2">
                  <span className="text-xs font-mono text-amber w-3 flex-shrink-0">{entry.rank}</span>
                  <Avatar src={entry.img} color={entry.color} size={6} />
                  <div className="min-w-0">
                    <div className="text-xs font-mono text-white truncate">{entry.slug}</div>
                    <div className="text-xs text-green font-mono">{entry.pct}</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Center: Scrolling feed */}
          <motion.div
            className="bg-bg2 border border-glass rounded-2xl overflow-hidden"
            style={{ height: '420px' }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-glass">
              <div className="w-2 h-2 rounded-full bg-green pulse-dot" />
              <span className="text-xs font-mono text-green">LIVE FEED</span>
              <span className="ml-auto text-xs text-text2 font-mono">network activity</span>
            </div>
            <div className="p-3 overflow-hidden" style={{ height: 'calc(100% - 45px)' }}>
              <div className="feed-track">
                {doubled.map((item, i) => (
                  <FeedItem key={i} item={item} />
                ))}
              </div>
            </div>
          </motion.div>

          {/* Right: Friends online */}
          <motion.div
            className="bg-bg2 border border-glass rounded-2xl p-4"
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="text-xs font-mono text-green mb-3 tracking-wide">FRIENDS ONLINE</div>
            <div className="space-y-4">
              {online.map((friend, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="relative flex-shrink-0">
                    <Avatar src={friend.img} color={friend.color} size={9} />
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green border-2 border-bg2" />
                  </div>
                  <div>
                    <div className="text-xs font-mono text-white">{friend.username}</div>
                    <div className="text-xs text-text2">{friend.agents} agents running</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
