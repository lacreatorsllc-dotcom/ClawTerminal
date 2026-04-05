import { motion } from 'framer-motion'
import AgentCard from './AgentCard.jsx'
import TradeRow from './TradeRow.jsx'
import Avatar from './Avatar.jsx'
import { USERS } from '../lib/users.js'

const trades = [
  { username: '@grovest_nft',  agentname: 'scout', action: 'SOLD',   asset: 'BONK',    pnl: '+$31.00', time: '2m ago',  isPositive: true  },
  { username: '@thebulltard',  agentname: 'koda',  action: 'BOUGHT', asset: '2.4 SOL', pnl: '+$48.20', time: '5m ago',  isPositive: true  },
  { username: '@ryankane',     agentname: 'dca',   action: 'CLOSED', asset: 'JUP',     pnl: '+$67.80', time: '8m ago',  isPositive: true  },
  { username: '@brazylord',    agentname: 'quant', action: 'BOUGHT', asset: 'WIF',     pnl: '+$89.40', time: '11m ago', isPositive: true  },
  { username: '@ryankane',     agentname: 'dca',   action: 'BOUGHT', asset: '5.0 SOL', pnl: '+$22.10', time: '14m ago', isPositive: true  },
  { username: '@grovest_nft',  agentname: 'scout', action: 'SOLD',   asset: 'ETH',     pnl: '-$12.40', time: '17m ago', isPositive: false },
]

function Panel({ children, caption, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.12, duration: 0.6, ease: 'easeOut' }}
      whileHover={{ y: -3 }}
      className="flex flex-col"
    >
      <div className="bg-bg2 border border-glass rounded-2xl overflow-hidden">
        {/* Window chrome */}
        <div className="flex items-center gap-1.5 px-4 py-3 border-b border-glass bg-bg3">
          <div className="w-2.5 h-2.5 rounded-full bg-red/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-green/50" />
          <div className="ml-4 text-xs font-mono text-text2">{caption}</div>
        </div>
        <div className="p-4">
          {children}
        </div>
      </div>
      <p className="text-center text-sm text-text2 mt-3">{caption}</p>
    </motion.div>
  )
}

export default function ProductPreview() {
  return (
    <section className="py-24 px-6 bg-bg2/30">
      <div className="max-w-6xl mx-auto">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="text-xs font-mono text-teal tracking-widest uppercase mb-4">Product</div>
          <h2 className="text-4xl font-bold tracking-tight">See SLUGS in action.</h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Panel 1: Agent Dashboard */}
          <Panel caption="Agent Dashboard" index={0}>
            <div className="space-y-3">
              <AgentCard
                name="@thebulltard/koda"
                strategy="Momentum"
                pnlToday="+$124.50"
                totalReturn="+18.3%"
                trades={47}
                isLive={true}
                isPositive={true}
              />
              <AgentCard
                name="@grovest_nft/scout"
                strategy="DCA"
                pnlToday="+$38.20"
                totalReturn="+9.1%"
                trades={23}
                isLive={true}
                isPositive={true}
              />
            </div>
          </Panel>

          {/* Panel 2: Live Trade Feed */}
          <Panel caption="Live Trade Feed" index={1}>
            <div className="space-y-1">
              {trades.map((trade, i) => (
                <TradeRow key={i} {...trade} />
              ))}
            </div>
          </Panel>

          {/* Panel 3: Profile Page */}
          <Panel caption="Profile Page" index={2}>
            {/* Profile header */}
            <div className="flex items-center gap-4 mb-4 pb-4 border-b border-glass">
              <Avatar src={USERS.grove.img} color={USERS.grove.color} size={14} />
              <div>
                <div className="font-semibold text-white">Grove St</div>
                <div className="font-mono text-xs text-text2">@grovest_nft</div>
                <div className="text-xs text-text2 mt-0.5">2 agents · <span className="text-green">+$2,108</span> this week</div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs text-text2">142 followers</span>
                  <span className="text-text2">·</span>
                  <span className="text-xs text-text2">58 following</span>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <AgentCard
                name="@grovest_nft/scout"
                strategy="Trend Follow"
                pnlToday="+$89.40"
                totalReturn="+22.1%"
                trades={61}
                isLive={true}
                isPositive={true}
              />
            </div>
          </Panel>
        </div>
      </div>
    </section>
  )
}
