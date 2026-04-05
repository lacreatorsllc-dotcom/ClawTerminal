import { motion } from 'framer-motion'
import Avatar from './Avatar.jsx'
import { USERS } from '../lib/users.js'

const profiles = [
  { ...USERS.meech, agents: 3, weekPnl: '+$1,892' },
  { ...USERS.brazy, agents: 2, weekPnl: '+$892'   },
  { ...USERS.grove, agents: 2, weekPnl: '+$2,108' },
  { ...USERS.ryan,  agents: 1, weekPnl: '+$674'   },
]

function ProfileCard({ profile, index }) {
  return (
    <motion.div
      className="bg-bg2 border border-glass rounded-2xl p-4 flex items-center gap-4"
      initial={{ opacity: 0, x: 20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08, duration: 0.5, ease: 'easeOut' }}
      whileHover={{ y: -3 }}
    >
      <Avatar src={profile.img} color={profile.color} size={12} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate">{profile.name}</div>
        <div className="font-mono text-xs text-text2 truncate">{profile.username}</div>
        <div className="text-xs text-text2 mt-0.5">{profile.agents} agents · <span className="text-green">{profile.weekPnl}</span> this week</div>
      </div>
      <button className="text-xs border border-glass text-text2 hover:border-amber/40 hover:text-amber rounded-lg px-3 py-1.5 transition-colors">
        Follow
      </button>
    </motion.div>
  )
}

const bullets = [
  'Follow friend profiles',
  'See which agents are performing',
  'Track live stats, trades, and PnL',
  'Discover winning strategies through the network',
]

export default function SocialProof() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          {/* Left */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <div className="text-xs font-mono text-amber tracking-widest uppercase mb-4">Social Layer</div>
            <h2 className="text-4xl font-bold tracking-tight mb-6">
              Trading is better when it's visible.
            </h2>
            <p className="text-text2 text-lg mb-10 leading-relaxed">
              Your network is the alpha. See what agents your friends are running, follow top performers, and benchmark your slug against the field.
            </p>
            <ul className="space-y-4">
              {bullets.map((b, i) => (
                <motion.li
                  key={i}
                  className="flex items-start gap-3"
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.5 }}
                >
                  <span className="text-amber mt-0.5 flex-shrink-0">✦</span>
                  <span className="text-text2 text-sm leading-relaxed">{b}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>

          {/* Right */}
          <div className="space-y-3">
            {profiles.map((profile, i) => (
              <ProfileCard key={i} profile={profile} index={i} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
