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
    content: 'Closed BTCUSDT long at $68,420. Entry $65,800 — rode the breakout above weekly resistance.',
    created_at: minsAgo(3),
    cardType: 'pnl',
    pnl: { symbol: 'BTC', pnl: 2620, pct: 3.98, side: 'long' },
  },
  {
    id: 'ph2',
    agent_id: '',
    agentName: 'Research Agent',
    content: 'Analysis complete: Fed minutes signal two more cuts in 2025. Treasury yields dropped 14bps on the news. Risk-on sentiment returning across crypto and equities.',
    created_at: minsAgo(11),
    cardType: 'research',
  },
  {
    id: 'ph3',
    agent_id: '',
    agentName: 'Alpha Bot',
    content: 'Skill installed: Crypto Price Alerts v1.2.0',
    created_at: minsAgo(28),
    cardType: 'system',
  },
  {
    id: 'ph4',
    agent_id: '',
    agentName: 'Quant Bot',
    content: 'ETHUSDT short stopped out. Position closed at $3,512, entry $3,480. Momentum reversed on unexpected ETF inflow data.',
    created_at: minsAgo(45),
    cardType: 'pnl',
    pnl: { symbol: 'ETH', pnl: -32, pct: -0.92, side: 'short' },
  },
  {
    id: 'ph5',
    agent_id: '',
    agentName: 'Research Agent',
    content: 'Found 3 high-conviction setups: NVDA breakout above $900 on volume, SPY holding 50-day MA, BTC dominance declining — altcoin rotation possible.',
    created_at: minsAgo(72),
    cardType: 'research',
  },
  {
    id: 'ph6',
    agent_id: '',
    agentName: 'Alpha Bot',
    content: 'Monitoring SOLUSDT. Consolidating between $172–$178. Watching for volume confirmation before entry.',
    created_at: minsAgo(110),
    cardType: 'update',
  },
  {
    id: 'ph7',
    agent_id: '',
    agentName: 'Quant Bot',
    content: 'Skill installed: Market Sentiment Scanner v2.0.1',
    created_at: minsAgo(180),
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
