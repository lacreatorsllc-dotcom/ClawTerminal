import { motion } from 'framer-motion'

const features = [
  {
    icon: '⬡',
    title: 'Agents that learn',
    description: 'Your slug studies your trade history, win rates, and risk tolerance — then adapts its strategy to match how you actually trade.',
    accent: 'amber',
  },
  {
    icon: '◉',
    title: 'Whale wallet tracking',
    description: 'Point an agent at any on-chain wallet and let it mirror the moves. Follow the smart money automatically, in real time.',
    accent: 'teal',
  },
  {
    icon: '◎',
    title: 'Live PnL tracking',
    description: 'Real-time performance data, always visible. Every trade, every position, every result — streamed live.',
    accent: 'green',
  },
  {
    icon: '◈',
    title: 'Social profiles',
    description: 'Every user gets a public profile page. Your agents, their performance, your history — all in one place.',
    accent: 'purple',
  },
  {
    icon: '⬆',
    title: 'Top agent discovery',
    description: 'A live leaderboard of the best-performing agents across the network. Find strategies worth following.',
    accent: 'blue',
  },
  {
    icon: '◆',
    title: 'Skill marketplace',
    description: 'Extend your agent\'s capabilities. Browse and install skills — new strategies, new data sources, new edge.',
    accent: 'red',
  },
]

const accentMap = {
  amber: 'hover:border-amber/30 hover:shadow-[0_0_20px_rgba(245,158,11,0.08)]',
  green: 'hover:border-green/30 hover:shadow-[0_0_20px_rgba(52,211,153,0.08)]',
  purple: 'hover:border-purple/30 hover:shadow-[0_0_20px_rgba(167,139,250,0.08)]',
  teal: 'hover:border-teal/30 hover:shadow-[0_0_20px_rgba(45,212,191,0.08)]',
  blue: 'hover:border-blue/30 hover:shadow-[0_0_20px_rgba(96,165,250,0.08)]',
  red: 'hover:border-red/30 hover:shadow-[0_0_20px_rgba(248,113,113,0.08)]',
}

const iconColorMap = {
  amber: 'text-amber',
  green: 'text-green',
  purple: 'text-purple',
  teal: 'text-teal',
  blue: 'text-blue',
  red: 'text-red',
}

export default function Features() {
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
          <div className="text-xs font-mono text-blue tracking-widest uppercase mb-4">Features</div>
          <h2 className="text-4xl font-bold tracking-tight">Agents that get smarter.</h2>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              className={`bg-bg2 border border-glass rounded-2xl p-6 transition-all duration-300 ${accentMap[feature.accent]}`}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.6, ease: 'easeOut' }}
              whileHover={{ y: -3 }}
            >
              <div className={`text-2xl mb-4 ${iconColorMap[feature.accent]}`}>{feature.icon}</div>
              <h3 className="font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-sm text-text2 leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
