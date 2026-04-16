import { motion } from 'framer-motion'

const steps = [
  {
    number: '01',
    title: 'Deploy your slug',
    description: 'Pick a name, connect your wallet, and spin up your first agent in minutes.',
    icon: '⬡',
    snippet: (
      <div className="mt-3 bg-bg rounded-lg p-3 border border-glass space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-amber/10 border border-amber/20 flex items-center justify-center text-[10px] font-bold text-amber">⬡</div>
          <div>
            <div className="text-[10px] font-semibold text-white font-mono">koda</div>
            <div className="text-[9px] text-text2">Agent created · wallet connected</div>
          </div>
          <div className="ml-auto w-2 h-2 rounded-full bg-green pulse-dot" />
        </div>
      </div>
    ),
  },
  {
    number: '02',
    title: 'It learns your style',
    description: 'The agent reads your history — your entries, exits, risk limits — and tunes itself to trade the way you would.',
    icon: '⚡',
    snippet: (
      <div className="mt-3 bg-bg rounded-lg p-2 border border-glass space-y-1.5">
        {[
          { label: 'Risk tolerance', val: 'Medium', color: '#d4683c' },
          { label: 'Avg hold time', val: '4.2h',   color: '#2dd4bf' },
          { label: 'Win rate',       val: '61%',    color: '#34d399' },
        ].map((r, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="text-text2 font-mono">{r.label}</span>
            <span className="font-mono font-semibold" style={{ color: r.color }}>{r.val}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    number: '03',
    title: 'Track live',
    description: 'Watch trades, PnL, and agent activity in real time from your dashboard.',
    icon: '◎',
    snippet: (
      <div className="mt-3 bg-bg rounded-lg p-2 border border-glass flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-green pulse-dot" />
        <div>
          <div className="text-xs font-mono text-green">+$124.50</div>
          <div className="text-xs text-text2">today</div>
        </div>
        <div className="ml-auto">
          <svg viewBox="0 0 60 20" className="w-16 h-5">
            <polyline points="0,18 10,14 20,12 30,13 40,8 50,5 60,3" fill="none" stroke="#d4683c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    ),
  },
  {
    number: '04',
    title: 'Track whales & friends',
    description: 'Point an agent at any wallet to mirror their moves. Follow friends to see exactly how their agents are performing.',
    icon: '◈',
    snippet: (
      <div className="mt-3 bg-bg rounded-lg p-2 border border-glass space-y-1.5">
        {[
          { slug: '@brazylord/quant', pct: '+31.2%', whale: false },
          { slug: '7xK9…whale',       pct: '+44.1%', whale: true  },
          { slug: '@bagcalls/dca',    pct: '+18.3%', whale: false },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div className="w-5 h-5 rounded-full bg-bg3 border border-glass flex items-center justify-center text-xs text-purple font-mono">
              {item.whale ? '◉' : item.slug.charAt(1).toUpperCase()}
            </div>
            <span className="font-mono text-text2 truncate">{item.slug}</span>
            <span className="ml-auto text-green font-mono flex-shrink-0">{item.pct}</span>
          </div>
        ))}
      </div>
    ),
  },
]

export default function HowItWorks() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="text-xs font-mono text-purple tracking-widest uppercase mb-4">Process</div>
          <h2 className="text-4xl font-bold tracking-tight">How it works.</h2>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, i) => (
            <motion.div
              key={i}
              className="bg-bg2 border border-glass rounded-2xl p-6"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.6, ease: 'easeOut' }}
              whileHover={{ y: -3 }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-amber/10 border border-amber/20 flex items-center justify-center">
                  <span className="text-xs font-mono font-bold text-amber">{step.number}</span>
                </div>
                <span className="text-lg">{step.icon}</span>
              </div>
              <h3 className="font-semibold text-white mb-2">{step.title}</h3>
              <p className="text-sm text-text2 leading-relaxed">{step.description}</p>
              {step.snippet}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
