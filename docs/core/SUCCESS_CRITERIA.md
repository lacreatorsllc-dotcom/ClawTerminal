# Success Criteria

## MVP is successful if:

### Connection
- [ ] A user can connect an existing agent in under 5 minutes with no prior ClawTerminal knowledge
- [ ] The setup command / snippet is clear and copy-pasteable from within the app
- [ ] The connected agent appears in the app reliably within seconds of running the command

### Communication
- [ ] Messages sent from the app reach the agent and responses return without manual refresh
- [ ] Chat UX feels clearly better than using Telegram, Slack, or a terminal for the same task
- [ ] Message delivery is reliable — no silent failures

### Visibility
- [ ] Users can see agent status (active, idle, busy, error) at a glance
- [ ] Agent status card (status, last_seen, activity feed) is informative without node graph
- [ ] Activity is visible without needing to ask the agent what it's doing

### Marketplace
- [ ] Users can browse skills and understand what each one does without external docs
- [ ] Skill assignment completes in 2 taps from the skill detail screen
- [ ] Users receive clear confirmation that the skill was assigned

### Design bar
- [ ] The app feels premium — testers use the word "clean", "slick", or "polished" unprompted
- [ ] Dark mode only, no visual regressions in light environments
- [ ] No placeholder UI ships in v1 (no lorem ipsum, no "coming soon" screens)

## Out-of-scope for v1 success (deferred to v1.1)
- Visual node-based agent graph view
- Multi-agent orchestration working
- Marketplace skill publishing
- Android support
- Offline mode
