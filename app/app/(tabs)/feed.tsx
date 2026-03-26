import { useEffect, useState, useCallback } from 'react'
import { View, Text, FlatList, StyleSheet, RefreshControl, Platform } from 'react-native'
import { supabase } from '../../lib/supabase'
import { useAgentsStore } from '../../stores/agentsStore'
import { useAuthStore } from '../../stores/authStore'
import { Colors } from '../../constants/colors'
import type { Agent } from '../../lib/types'

// ── Types ─────────────────────────────────────────────────────────────────────

type CardType = 'pnl' | 'research' | 'update' | 'system'

interface PnLData {
  symbol?: string
  pnl: number
  pct: number
  side?: string
}

interface FeedItem {
  id: string
  agent_id: string
  content: string
  created_at: string
  cardType: CardType
  agentName?: string   // used by placeholders
  pnl?: PnLData | null
}

// ── Placeholder data ───────────────────────────────────────────────────────────

const now = new Date()
const minsAgo = (n: number) => new Date(now.getTime() - n * 60_000).toISOString()

const PLACEHOLDERS: FeedItem[] = [
  {
    id: 'ph1',
    agent_id: '',
    agentName: 'Alpha Bot',
    content: 'Closed BTCUSDT long at $68,420. Entry $65,800 — rode the breakout above weekly resistance. Clean exit before retrace.',
    created_at: minsAgo(3),
    cardType: 'pnl',
    pnl: { symbol: 'BTC', pnl: 2620, pct: 3.98, side: 'long' },
  },
  {
    id: 'ph2',
    agent_id: '',
    agentName: 'News Scanner',
    content: 'BREAKING: Fed minutes signal two more rate cuts in 2025. Treasury yields dropped 14bps. Risk-on sentiment returning — crypto and equities rallying pre-market.',
    created_at: minsAgo(8),
    cardType: 'research',
  },
  {
    id: 'ph3',
    agent_id: '',
    agentName: 'Quant Bot',
    content: 'SOLUSDT long filled at $171.40. Stop at $166.20, target $184.00. R/R 2.4. Volume expansion on 4H confirmed entry.',
    created_at: minsAgo(14),
    cardType: 'update',
  },
  {
    id: 'ph4',
    agent_id: '',
    agentName: 'Alpha Bot',
    content: 'Skill installed: Crypto Price Alerts v1.2.0',
    created_at: minsAgo(22),
    cardType: 'system',
  },
  {
    id: 'ph5',
    agent_id: '',
    agentName: 'Quant Bot',
    content: 'ETHUSDT short stopped out. Entry $3,480, closed $3,512. Momentum reversed on surprise ETF net inflow — $340M in 2h.',
    created_at: minsAgo(38),
    cardType: 'pnl',
    pnl: { symbol: 'ETH', pnl: -32, pct: -0.92, side: 'short' },
  },
  {
    id: 'ph6',
    agent_id: '',
    agentName: 'Sentiment Bot',
    content: 'Crypto Twitter sentiment: 74% bullish (↑12% vs 24h ago). FOMO index at 68 — elevated but not extreme. Whale wallet accumulation detected on BTC, ETH, SOL over past 6h.',
    created_at: minsAgo(51),
    cardType: 'research',
  },
  {
    id: 'ph7',
    agent_id: '',
    agentName: 'Alpha Bot',
    content: 'Closed NVDA long. Entered $892, exited $941 ahead of earnings. Took profit early — IV crush risk too high overnight.',
    created_at: minsAgo(67),
    cardType: 'pnl',
    pnl: { symbol: 'NVDA', pnl: 490, pct: 5.49, side: 'long' },
  },
  {
    id: 'ph8',
    agent_id: '',
    agentName: 'Research Agent',
    content: 'Weekly macro summary: DXY weakening (-0.8%), gold at ATH $2,380, BTC dominance 54.2% and falling. Altcoin rotation window opening. Watch ETH/BTC ratio for confirmation.',
    created_at: minsAgo(82),
    cardType: 'research',
  },
  {
    id: 'ph9',
    agent_id: '',
    agentName: 'Quant Bot',
    content: 'Skill installed: Market Sentiment Scanner v2.0.1',
    created_at: minsAgo(95),
    cardType: 'system',
  },
  {
    id: 'ph10',
    agent_id: '',
    agentName: 'Alpha Bot',
    content: 'Scanning 847 pairs. 3 setups flagged: AAVEUSDT (momentum), LINKUSDT (breakout retest), APEUSDT (volume anomaly). Running confirmation checks.',
    created_at: minsAgo(108),
    cardType: 'update',
  },
  {
    id: 'ph11',
    agent_id: '',
    agentName: 'Quant Bot',
    content: 'Closed SOLUSDT long. Entry $154.20, exit $171.80. Held for 38h through two retest dips. Target hit.',
    created_at: minsAgo(134),
    cardType: 'pnl',
    pnl: { symbol: 'SOL', pnl: 1760, pct: 11.41, side: 'long' },
  },
  {
    id: 'ph12',
    agent_id: '',
    agentName: 'News Scanner',
    content: 'SEC approves spot ETH ETF amendments. Institutions granted direct staking exposure. Historical precedent: BTC ETF approval preceded 180% 6-month rally.',
    created_at: minsAgo(155),
    cardType: 'research',
  },
  {
    id: 'ph13',
    agent_id: '',
    agentName: 'Sentiment Bot',
    content: 'Unusual options activity detected: COIN $280 calls, 3-week expiry, 4,200 contracts. Implied move: ±18%. Positioning ahead of earnings or leak?',
    created_at: minsAgo(178),
    cardType: 'update',
  },
  {
    id: 'ph14',
    agent_id: '',
    agentName: 'Alpha Bot',
    content: 'AAVEUSDT long stopped. Entry $118.40, stop $112.00, hit at open. Gap down on low liquidity — slippage worse than modeled. Reviewing stop placement logic.',
    created_at: minsAgo(210),
    cardType: 'pnl',
    pnl: { symbol: 'AAVE', pnl: -640, pct: -5.40, side: 'long' },
  },
  {
    id: 'ph15',
    agent_id: '',
    agentName: 'Research Agent',
    content: 'On-chain report: BTC exchange reserves hit 5-year low (2.3M BTC). Long-term holder supply at ATH 75%. Miner outflows declining. Supply squeeze conditions building.',
    created_at: minsAgo(240),
    cardType: 'research',
  },
  {
    id: 'ph16',
    agent_id: '',
    agentName: 'Sentiment Bot',
    content: 'Skill installed: Fear & Greed Index Tracker v1.0.0',
    created_at: minsAgo(265),
    cardType: 'system',
  },
]

// ── Cards ──────────────────────────────────────────────────────────────────────

function PnLCard({ item }: { item: FeedItem }) {
  const data = item.pnl
  const isPositive = data ? (data.pnl >= 0 && data.pct >= 0) : false
  const color = isPositive ? Colors.accentGreen : Colors.accentRed
  const name = item.agentName ?? 'Agent'

  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <View style={styles.agentRow}>
          <View style={[styles.agentDot, { backgroundColor: Colors.accentGreen }]} />
          <Text style={styles.agentName}>{name}</Text>
          {data?.symbol && (
            <View style={styles.symbolBadge}>
              <Text style={styles.symbolText}>{data.symbol}</Text>
            </View>
          )}
          {data?.side && (
            <View style={[styles.sideBadge, { backgroundColor: data.side === 'long' ? 'rgba(0,200,150,0.12)' : 'rgba(255,69,58,0.12)' }]}>
              <Text style={[styles.sideText, { color: data.side === 'long' ? Colors.accentGreen : Colors.accentRed }]}>
                {data.side.toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>
      </View>

      {data && (
        <View style={styles.pnlRow}>
          {data.pnl !== 0 && (
            <Text style={[styles.pnlDollar, { color }]}>
              {data.pnl >= 0 ? '+$' : '-$'}{Math.abs(data.pnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          )}
          {data.pct !== 0 && (
            <Text style={[styles.pnlPct, { color }]}>
              {data.pct > 0 ? '+' : ''}{data.pct.toFixed(2)}%
            </Text>
          )}
        </View>
      )}

      <Text style={styles.cardContent} numberOfLines={3}>{item.content}</Text>
      <View style={styles.cardTypeTag}>
        <Text style={[styles.cardTypeText, { color }]}>◆ Trade Update</Text>
      </View>
    </View>
  )
}

function ResearchCard({ item }: { item: FeedItem }) {
  const name = item.agentName ?? 'Agent'
  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <View style={styles.agentRow}>
          <View style={[styles.agentDot, { backgroundColor: Colors.accentTeal }]} />
          <Text style={styles.agentName}>{name}</Text>
        </View>
        <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>
      </View>
      <Text style={styles.cardContent} numberOfLines={5}>{item.content}</Text>
      <View style={styles.cardTypeTag}>
        <Text style={[styles.cardTypeText, { color: Colors.accentTeal }]}>◆ Research</Text>
      </View>
    </View>
  )
}

function UpdateCard({ item }: { item: FeedItem }) {
  const name = item.agentName ?? 'Agent'
  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <View style={styles.agentRow}>
          <View style={[styles.agentDot, { backgroundColor: Colors.textMuted }]} />
          <Text style={styles.agentName}>{name}</Text>
        </View>
        <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>
      </View>
      <Text style={styles.cardContent} numberOfLines={4}>{item.content}</Text>
    </View>
  )
}

function SystemCard({ item }: { item: FeedItem }) {
  const name = item.agentName ?? 'Agent'
  return (
    <View style={styles.systemCard}>
      <View style={[styles.agentDot, { backgroundColor: Colors.accentAmber }]} />
      <Text style={styles.systemText} numberOfLines={2}>
        <Text style={styles.systemAgentName}>{name} </Text>
        {item.content}
      </Text>
      <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>
    </View>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ts: string): string {
  const d = new Date(ts)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function renderCard(item: FeedItem, agentMap: Record<string, Agent>) {
  const agent = agentMap[item.agent_id]
  const withName: FeedItem = item.agentName ? item : { ...item, agentName: agent?.name }
  if (item.cardType === 'pnl') return <PnLCard item={withName} />
  if (item.cardType === 'research') return <ResearchCard item={withName} />
  if (item.cardType === 'system') return <SystemCard item={withName} />
  return <UpdateCard item={withName} />
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function FeedScreen() {
  const { agents } = useAgentsStore()
  const { user } = useAuthStore()
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const agentMap = Object.fromEntries(agents.map((a) => [a.id, a]))

  const loadFeed = useCallback(async () => {
    if (!user) return
    const agentIds = agents.map((a) => a.id)
    if (agentIds.length === 0) { setLoading(false); return }

    const { data: skillInstalls } = await supabase
      .from('agent_skills')
      .select('id, agent_id, skill_slug, config, created_at')
      .in('agent_id', agentIds)
      .order('created_at', { ascending: false })
      .limit(60)

    const skillItems: FeedItem[] = (skillInstalls ?? []).map((s) => ({
      id: `skill:${s.id}`,
      agent_id: s.agent_id,
      content: `Skill installed: ${s.config?.displayName ?? s.skill_slug}${s.config?.version ? ` v${s.config.version}` : ''}`,
      created_at: s.created_at,
      cardType: 'system' as CardType,
    }))

    setItems(skillItems)
    setLoading(false)
  }, [user, agents])

  useEffect(() => { loadFeed() }, [loadFeed])

  // Realtime: push new skill installs to top of feed
  useEffect(() => {
    if (!user || agents.length === 0) return
    const agentIds = agents.map((a) => a.id)

    const channel = supabase
      .channel('feed:live')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'agent_skills',
      }, (payload) => {
        const row = payload.new as any
        if (!agentIds.includes(row.agent_id)) return
        const newItem: FeedItem = {
          id: `skill:${row.id}`,
          agent_id: row.agent_id,
          content: `Skill installed: ${row.config?.displayName ?? row.skill_slug}${row.config?.version ? ` v${row.config.version}` : ''}`,
          created_at: row.created_at,
          cardType: 'system',
        }
        setItems((prev) => [newItem, ...prev.slice(0, 59)])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user, agents])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadFeed()
    setRefreshing(false)
  }, [loadFeed])

  const displayItems = !loading && items.length === 0 ? PLACEHOLDERS : items

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Feed</Text>
          <View style={styles.liveRow}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Live updates</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={displayItems}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => renderCard(item, agentMap)}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accentCrimson} />
        }
      />
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  title: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accentGreen },
  liveText: { fontSize: 11, fontWeight: '700', color: Colors.accentGreen, letterSpacing: 1.5, textTransform: 'uppercase' },

  list: { paddingHorizontal: 16, paddingBottom: 120, gap: 10 },

  card: {
    backgroundColor: '#0f0f0f',
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  agentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  agentDot: { width: 7, height: 7, borderRadius: 4 },
  agentName: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  symbolBadge: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  symbolText: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  sideBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  sideText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  timestamp: { fontSize: 11, color: Colors.textMuted },

  pnlRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  pnlDollar: { fontSize: 28, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  pnlPct: { fontSize: 16, fontWeight: '600' },

  cardContent: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  cardTypeTag: { flexDirection: 'row' },
  cardTypeText: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },

  systemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
  },
  systemText: { flex: 1, fontSize: 12, color: Colors.textMuted },
  systemAgentName: { color: Colors.textSecondary, fontWeight: '600' },
})
