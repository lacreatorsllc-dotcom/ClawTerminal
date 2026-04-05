export default function Footer() {
  return (
    <footer className="border-t border-glass py-8 px-6">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <img src="/slugs-logo.png" alt="SLUGS" className="h-5 w-auto" style={{ imageRendering: 'pixelated' }} />

        <div className="flex items-center gap-6">
          {[
            { label: 'Twitter/X', href: '#' },
            { label: 'Contact', href: '#' },
            { label: 'Terms', href: '#' },
            { label: 'Privacy', href: '#' },
          ].map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-xs text-text2 hover:text-white transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="text-xs text-text2">© 2026 SLUGS</div>
      </div>
    </footer>
  )
}
