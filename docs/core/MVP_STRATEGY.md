# MVP Strategy

## v1 Scope (ship this)
- Auth / onboarding
- Agent connection (setup command)
- Connected agents list
- Agent detail screen with status & activity
- Chat / messaging with agents (real-time)
- Skills marketplace (5-10 curated skills, not "catalog")
- Skill assignment to agent
- Basic activity feed / visibility

## Cut from v1
- Visual node-based agent view (defer to v1.1 with usage data)
- Open skill publishing
- Multi-agent automation builder
- Team collaboration
- Web version as primary
- Broad provider integrations beyond MVP connector

## 3 Jobs to Nail
- Connect fast, connect reliably — setup command must work first try; nothing else matters if this fails
- Ambient awareness — passive visibility (status, activity feed) is the core mobile value proposition
- Real-time chat — communication loop must feel live and faster than Slack, or users bounce

## Riskiest Assumption
Users already have a running agent ready to connect at download time. If early adopters are mostly curious builders without an existing agent, the connection flow becomes a dead end post-onboarding.

## Missing Before Build
- Error recovery & debug path for failed agent connections (silent churn trigger)
- Real-time mechanism decision (WebSocket, polling, APNs) for chat competitiveness
- Agent compatibility spec (which agent types are supported? kills conversion if undefined)
