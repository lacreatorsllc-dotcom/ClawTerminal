// Each theme: letter color, ring color, bg tint — all distinct for variety
const THEMES = [
  { letter: '#d4683c', ring: '#2dd4bf', bg: 'rgba(45,212,191,0.10)'  },  // amber on teal ring
  { letter: '#2dd4bf', ring: '#2dd4bf', bg: 'rgba(45,212,191,0.08)'  },  // teal on teal ring
  { letter: '#60a5fa', ring: '#4b5563', bg: 'rgba(15,23,42,0.80)'    },  // blue on grey ring
  { letter: '#a78bfa', ring: '#60a5fa', bg: 'rgba(96,165,250,0.08)'  },  // purple on blue ring
  { letter: '#34d399', ring: '#d4683c', bg: 'rgba(245,158,11,0.08)'  },  // green on amber ring
  { letter: '#f87171', ring: '#a78bfa', bg: 'rgba(167,139,250,0.08)' },  // red on purple ring
  { letter: '#d4683c', ring: '#a78bfa', bg: 'rgba(167,139,250,0.08)' },  // amber on purple ring
  { letter: '#60a5fa', ring: '#34d399', bg: 'rgba(52,211,153,0.08)'  },  // blue on green ring
]

function hashIndex(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  return Math.abs(h) % THEMES.length
}

// Returns { letter, ring, bg } for an agent slug like "@username/agentname" or "@username"
export function agentTheme(slug = '') {
  const handle = slug.replace('@', '').toLowerCase()
  return THEMES[hashIndex(handle)]
}

// Simple single color for profile ring (used in Avatar component)
export function agentColor(slug = '') {
  return agentTheme(slug).ring
}
