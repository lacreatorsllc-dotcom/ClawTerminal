# Handoff: SLUGS Landing Page — 2026-04-05

## What was built
Full landing page for SLUGS at **slugs.run**, deployed on Vercel.

## Stack
- Vite + React 18 + Tailwind CSS 3 + Framer Motion 11
- Working dir: `web/`
- Deploy: `vercel --prod` from `web/`

## Firebase Waitlist (DONE)
- Firebase project: `slugs-run`
- Firestore collection: `waitlist` (email, joinedAt, source)
- Config: `web/src/lib/firebase.js` — uses `VITE_` env vars
- Rules versioned at: `web/firestore.rules`
- `.env` is gitignored — add `VITE_FIREBASE_*` vars to Vercel environment settings if redeploying
- Both `Hero.jsx` and `EarlyAccess.jsx` call `joinWaitlist()` from firebase.js

## Vercel env vars needed
Go to Vercel dashboard → slugs-run project → Settings → Environment Variables and add all keys from `web/.env.example`.

## Key components
- `src/lib/users.js` — central user config (meech, grove, brazy, ryan + kelvin, bagcalls, edgar)
- `src/lib/agentColor.js` — 8 agent avatar color themes
- `src/components/Hero.jsx` — hero + email form
- `src/components/Showcase.jsx` — scrolling live feed + leaderboard + friends online
- `src/components/SocialProof.jsx` — profile follow cards
- `src/components/ProductPreview.jsx` — 3-panel product demo
- `src/components/EarlyAccess.jsx` — bottom CTA + email form

## Design decisions
- Grove St is primary profile everywhere (first in leaderboard, profile panel, feed)
- amber = `#d4683c` (matches logo orange, not yellow)
- Platforms: iOS + Seeker Mobile only (no Android)
- Logo: `public/slugs-logo.png`, no CSS filter

## Competitor research
- **Cabal (cabal.ventures):** Paper trading, solo, discipline-focused, no social layer
- **SLUGS differentiators:** Real trading, social network, network alpha, whale tracking, agents that learn your style

## Next tasks
- [ ] Add Vercel env vars for Firebase (required after env var migration)
- [ ] Mailchimp integration for email marketing
- [ ] Update site copy to emphasize social/network angle vs Cabal
- [ ] Add whale wallet tracking section to site
