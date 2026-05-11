import { useState } from 'react'
import { motion } from 'framer-motion'
import Avatar from './Avatar.jsx'
import { USERS } from '../lib/users.js'
import { joinWaitlist } from '../lib/firebase.js'

const tickerItems = [
  { user: '@grovest_nft/scout',  action: 'closed BONK',    pnl: '+8.1%',  positive: true },
  { user: '@thebulltard/koda',   action: 'bought 2.4 SOL', pnl: '+12.3%', positive: true },
  { user: '@brazylord/quant',    action: 'bought WIF',     pnl: '+19.4%', positive: true },
  { user: '@ryankane/dca',       action: 'bought RAY',     pnl: '+6.8%',  positive: true },
  { user: '@grovest_nft/scout',  action: 'sold ETH',       pnl: '-2.1%',  positive: false },
  { user: '@thebulltard/koda',   action: 'closed JUP',     pnl: '+5.7%',  positive: true },
  { user: '@ryankane/dca',       action: 'bought SOL',     pnl: '+11.2%', positive: true },
  { user: '@brazylord/quant',    action: 'sold PYTH',      pnl: '+9.4%',  positive: true },
]

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
}

const feedItems = [
  { ...USERS.grove, slug: '@grovest_nft/scout', action: 'closed BONK',    pnl: '+$81.20',  positive: true,  time: '2s ago' },
  { ...USERS.meech, slug: '@thebulltard/koda',  action: 'bought 2.4 SOL', pnl: '+$124.50', positive: true,  time: '14s ago' },
  { ...USERS.brazy, slug: '@brazylord/quant',   action: 'bought WIF',     pnl: '+$194.00', positive: true,  time: '31s ago' },
  { ...USERS.ryan,  slug: '@ryankane/dca',      action: 'bought SOL',     pnl: '+$68.00',  positive: true,  time: '1m ago' },
  { ...USERS.grove, slug: '@grovest_nft/scout', action: 'sold ETH',       pnl: '-$21.00',  positive: false, time: '2m ago' },
]

function PhoneMockup() {
  return (
    <div
      className="relative mx-auto"
      style={{ width: 260, height: 530 }}
    >
      {/* Phone frame */}
      <div
        className="absolute inset-0 rounded-[40px] border-2 border-white/10"
        style={{
          background: 'linear-gradient(145deg, #2a2a28 0%, #1a1a18 100%)',
          boxShadow: '0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      />

      {/* Dynamic island */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-full bg-black z-20"
        style={{ top: 14, width: 90, height: 28 }}
      />

      {/* Screen */}
      <div
        className="absolute overflow-hidden rounded-[32px]"
        style={{ inset: 4, background: '#141413' }}
      >
        {/* Status bar */}
        <div className="flex items-center justify-between px-5 pt-12 pb-2">
          <span className="text-[10px] font-semibold text-white/60">9:41</span>
          <div className="flex items-center gap-1">
            <div className="w-3 h-2 border border-white/40 rounded-sm relative">
              <div className="absolute inset-0.5 right-1 bg-white/60 rounded-sm" />
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-1 bg-white/40 rounded-r-sm" style={{right: -2}} />
            </div>
          </div>
        </div>

        {/* App header */}
        <div className="px-4 pb-3 flex items-center justify-between">
          <span className="text-sm font-bold tracking-wider text-white">SLUGS</span>
          <div className="w-7 h-7 rounded-full bg-amber/20 flex items-center justify-center">
            <span className="text-[10px] font-bold text-amber">Y</span>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-white/5 px-4 mb-3">
          {['Feed', 'Agents', 'Discover'].map((tab, i) => (
            <div key={tab} className={`text-[11px] font-medium pb-2 mr-4 ${i === 0 ? 'text-amber border-b border-amber' : 'text-white/30'}`}>
              {tab}
            </div>
          ))}
        </div>

        {/* Feed items */}
        <div className="px-3 space-y-2">
          {feedItems.map((item, i) => (
            <motion.div
              key={i}
              className="rounded-xl p-2.5 flex items-center gap-2"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8 + i * 0.12, duration: 0.4, ease: 'easeOut' }}
            >
              <Avatar src={item.img} color={item.color} size={7} />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold text-white/80 truncate">{item.slug}</div>
                <div className="text-[9px] text-white/40 truncate">{item.action}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className={`text-[10px] font-bold font-mono ${item.positive ? 'text-green' : 'text-red'}`}>{item.pnl}</div>
                <div className="text-[9px] text-white/30">{item.time}</div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom nav */}
        <div
          className="absolute bottom-0 left-0 right-0 flex items-center justify-around px-4 py-3 border-t border-white/5"
          style={{ background: 'rgba(20,20,19,0.95)', backdropFilter: 'blur(10px)' }}
        >
          {[
            { icon: '⬡', label: 'Feed', active: true },
            { icon: '◈', label: 'Agents', active: false },
            { icon: '⊕', label: 'Skills', active: false },
            { icon: '◉', label: 'Profile', active: false },
          ].map((item) => (
            <div key={item.label} className="flex flex-col items-center gap-0.5">
              <span className={`text-sm ${item.active ? 'text-amber' : 'text-white/25'}`}>{item.icon}</span>
              <span className={`text-[8px] ${item.active ? 'text-amber' : 'text-white/25'}`}>{item.label}</span>
            </div>
          ))}
        </div>

        {/* Side button highlights */}
      </div>

      {/* Side buttons */}
      <div
        className="absolute rounded-r-sm"
        style={{ right: -3, top: 100, width: 3, height: 40, background: 'rgba(255,255,255,0.06)' }}
      />
      <div
        className="absolute rounded-l-sm"
        style={{ left: -3, top: 90, width: 3, height: 28, background: 'rgba(255,255,255,0.06)' }}
      />
      <div
        className="absolute rounded-l-sm"
        style={{ left: -3, top: 130, width: 3, height: 50, background: 'rgba(255,255,255,0.06)' }}
      />
      <div
        className="absolute rounded-l-sm"
        style={{ left: -3, top: 192, width: 3, height: 50, background: 'rgba(255,255,255,0.06)' }}
      />
    </div>
  )
}

export default function Hero() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || loading) return
    setLoading(true)
    try {
      await joinWaitlist(email)
      setSubmitted(true)
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  const doubled = [...tickerItems, ...tickerItems]

  return (
    <section className="relative min-h-screen flex flex-col overflow-hidden pt-20">
      {/* Ambient glow */}
      <div
        className="absolute top-1/3 left-1/3 w-[500px] h-[400px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(245,158,11,0.07) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      <div
        className="absolute top-1/2 right-1/4 w-[300px] h-[300px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(45,212,191,0.04) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />

      {/* Main content: two columns on lg+ */}
      <div className="relative z-10 flex-1 flex items-center">
        <div className="w-full max-w-3xl mx-auto px-6 py-16 flex flex-col items-center text-center">

          {/* Left: text + form */}
          <motion.div
            className="flex flex-col items-center"
            variants={containerVariants}
            initial="hidden"
            animate="show"
          >
            {/* Badge */}
            <motion.div
              variants={itemVariants}
              className="flex items-center gap-2 border border-amber/20 bg-amber/5 rounded-full px-4 py-1.5 mb-8"
            >
              <div className="w-2 h-2 rounded-full bg-amber pulse-dot" />
              <span className="text-xs font-medium text-amber tracking-wide">Private Beta · Limited Spots</span>
            </motion.div>

            {/* H1 */}
            <motion.h1 variants={itemVariants} className="text-5xl sm:text-6xl font-bold tracking-tight leading-none mb-3">
              Deploy Your Slug.
            </motion.h1>
            <motion.h1 variants={itemVariants} className="text-5xl sm:text-6xl font-bold tracking-tight leading-none mb-8 text-text2">
              Follow the Agents.
            </motion.h1>

            {/* Subheadline */}
            <motion.p variants={itemVariants} className="text-lg text-text2 max-w-lg leading-relaxed mb-10">
              A social trading app where autonomous agents trade on your behalf, profiles track performance, and you follow friends to see how their agents are doing in real time.
            </motion.p>

            {/* Email form */}
            <motion.form
              variants={itemVariants}
              onSubmit={handleSubmit}
              className="flex flex-col sm:flex-row gap-3 w-full max-w-md mb-4"
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 bg-bg2 border border-glass rounded-xl px-4 py-3 text-white placeholder-text2 focus:outline-none focus:border-amber/40 transition-colors text-sm"
                required
              />
              <button
                type="submit"
                disabled={loading || submitted}
                className={`px-6 py-3 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                  submitted ? 'bg-green text-black' : 'bg-amber text-black hover:bg-amber/90'
                }`}
              >
                {submitted ? "You're on the list ✓" : loading ? 'Joining...' : 'Get Early Access'}
              </button>
            </motion.form>

            <motion.p variants={itemVariants} className="text-xs text-text2 mb-4">
              No spam. Just a ping when we launch.
            </motion.p>

            <motion.a
              variants={itemVariants}
              href="https://app.slugs.run"
              className="flex items-center gap-2 text-sm text-text2 hover:text-white transition-colors mb-6 group"
            >
              <span>Already have an account?</span>
              <span className="text-amber font-semibold group-hover:underline">Open the app →</span>
            </motion.a>

            {/* Platform badges */}
            <motion.div variants={itemVariants} className="flex items-center gap-3 flex-wrap justify-center">
              {/* Seeker */}
              <div
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5"
                style={{
                  background: 'linear-gradient(135deg, rgba(153,69,255,0.12) 0%, rgba(45,212,191,0.08) 100%)',
                  border: '1px solid rgba(153,69,255,0.25)',
                }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <defs>
                    <linearGradient id="sol-hero" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#9945ff"/>
                      <stop offset="100%" stopColor="#2dd4bf"/>
                    </linearGradient>
                  </defs>
                  <path d="M4 17h13.5l2.5-2H6.5L4 17z" fill="url(#sol-hero)"/>
                  <path d="M4 12h13.5l2.5-2H6.5L4 12z" fill="url(#sol-hero)"/>
                  <path d="M4 7h13.5l2.5-2H6.5L4 7z" fill="url(#sol-hero)"/>
                </svg>
                <div>
                  <div className="text-[9px] leading-none mb-0.5" style={{ background: 'linear-gradient(90deg, #9945ff, #2dd4bf)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Coming soon to</div>
                  <div className="text-xs font-semibold leading-none" style={{ background: 'linear-gradient(90deg, #9945ff, #2dd4bf)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Seeker</div>
                </div>
              </div>
            </motion.div>
          </motion.div>


        </div>
      </div>

      {/* Ticker strip */}
      <motion.div
        className="relative z-10 w-full overflow-hidden border-t border-b border-glass py-3"
        style={{ backgroundColor: 'rgba(28,28,26,0.6)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.6 }}
      >
        <div className="ticker-track">
          {doubled.map((item, i) => (
            <div key={i} className="flex items-center gap-2 px-6 flex-shrink-0">
              <span className="font-mono text-xs text-text2">{item.user}</span>
              <span className="text-xs text-text2">·</span>
              <span className="text-xs text-white">{item.action}</span>
              <span className="text-xs text-text2">·</span>
              <span className={`text-xs font-mono font-semibold ${item.positive ? 'text-green' : 'text-red'}`}>
                {item.pnl}
              </span>
              <span className="text-text2 mx-4">|</span>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  )
}
