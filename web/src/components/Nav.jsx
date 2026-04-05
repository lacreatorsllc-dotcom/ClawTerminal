import { motion } from 'framer-motion'

export default function Nav() {
  const handleWaitlist = (e) => {
    e.preventDefault()
    document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <motion.nav
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b border-glass"
      style={{ backgroundColor: 'rgba(20, 20, 19, 0.85)' }}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <img src="/slugs-logo.png" alt="SLUGS" className="h-7 w-auto" style={{ imageRendering: 'pixelated' }} />

        {/* CTA */}
        <button
          onClick={handleWaitlist}
          className="bg-amber text-black text-sm font-semibold px-5 py-2 rounded-lg hover:bg-amber/90 transition-colors"
        >
          Get Early Access
        </button>
      </div>
    </motion.nav>
  )
}
