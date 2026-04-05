import { useState } from 'react'
import { motion } from 'framer-motion'
import { joinWaitlist } from '../lib/firebase.js'

export default function EarlyAccess() {
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

  return (
    <section id="waitlist" className="py-32 px-6 relative overflow-hidden">
      {/* Ambient teal glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse, rgba(45,212,191,0.08) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />

      <div className="max-w-2xl mx-auto relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="text-xs font-mono text-teal tracking-widest uppercase mb-6">Early Access</div>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">
            Get early access to SLUGS.
          </h2>
          <p className="text-lg text-text2 mb-10 leading-relaxed">
            Be first to deploy agents, follow top traders, and track performance across the network.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto mb-6">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="flex-1 bg-bg2 border border-glass rounded-xl px-4 py-3 text-white placeholder-text2 focus:outline-none focus:border-teal/40 transition-colors text-sm"
              required
            />
            <motion.button
              type="submit"
              className={`px-6 py-3 rounded-xl text-sm font-semibold transition-all ${
                submitted
                  ? 'bg-green text-black'
                  : 'bg-amber text-black hover:bg-amber/90'
              }`}
              whileHover={submitted ? {} : { scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {submitted ? "You're on the list ✓" : loading ? 'Joining...' : 'Get Early Access'}
            </motion.button>
          </form>

          <div className="flex items-center justify-center gap-2 flex-wrap mb-10">
            {['Private beta', 'Limited early access', 'Be first to claim your profile'].map((item, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-text2" />
                <span className="text-xs text-text2">{item}</span>
                {i < 2 && <span className="text-text2 ml-1">·</span>}
              </span>
            ))}
          </div>

          {/* Platform badges */}
          <div className="flex items-center justify-center gap-3 flex-wrap mt-2">
            <div className="flex items-center gap-2 bg-bg2 border border-glass rounded-xl px-4 py-2.5 opacity-60">
              <svg className="w-4 h-4 text-text2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              <div>
                <div className="text-[9px] text-text2 leading-none mb-0.5">Coming soon to</div>
                <div className="text-xs font-semibold text-text leading-none">iOS</div>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-bg2 border border-glass rounded-xl px-4 py-2.5 opacity-60">
              <svg className="w-4 h-4 text-text2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.523 15.341c-.51 0-.93-.419-.93-.93s.42-.93.93-.93.929.419.929.93-.419.93-.929.93m-11.046 0c-.511 0-.93-.419-.93-.93s.419-.93.93-.93.929.419.929.93-.418.93-.929.93m11.4-6.142l1.86-3.22a.387.387 0 0 0-.141-.529.386.386 0 0 0-.529.141l-1.884 3.262A11.447 11.447 0 0 0 12 8.018c-1.661 0-3.238.348-4.665.961L5.45 5.717a.386.386 0 0 0-.528-.141.386.386 0 0 0-.142.529l1.861 3.22C3.93 10.63 2.18 13.163 2 16.104h20c-.18-2.941-1.929-5.474-4.123-6.905"/>
              </svg>
              <div>
                <div className="text-[9px] text-text2 leading-none mb-0.5">Coming soon to</div>
                <div className="text-xs font-semibold text-text leading-none">Android</div>
              </div>
            </div>
            <div
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5"
              style={{
                background: 'linear-gradient(135deg, rgba(153,69,255,0.12) 0%, rgba(45,212,191,0.08) 100%)',
                border: '1px solid rgba(153,69,255,0.25)',
              }}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                <defs>
                  <linearGradient id="sol-ea2" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#9945ff"/>
                    <stop offset="100%" stopColor="#2dd4bf"/>
                  </linearGradient>
                </defs>
                <path d="M4 17h13.5l2.5-2H6.5L4 17z" fill="url(#sol-ea2)"/>
                <path d="M4 12h13.5l2.5-2H6.5L4 12z" fill="url(#sol-ea2)"/>
                <path d="M4 7h13.5l2.5-2H6.5L4 7z" fill="url(#sol-ea2)"/>
              </svg>
              <div>
                <div className="text-[9px] leading-none mb-0.5" style={{ background: 'linear-gradient(90deg, #9945ff, #2dd4bf)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Also on</div>
                <div className="text-xs font-semibold leading-none" style={{ background: 'linear-gradient(90deg, #9945ff, #2dd4bf)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Seeker · Solana's mobile browser</div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
