import { useEffect, useState, useCallback } from 'react'
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, Platform } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAgentsStore } from '../../stores/agentsStore'
import { useAuthStore } from '../../stores/authStore'
import { Colors } from '../../constants/colors'
import type { Agent } from '../../lib/types'

// ── Types ─────────────────────────────────────────────────────────────────────

type CardType = 'pnl' | 'research' | 'update' | 'system'

interface FeedItem {
  id: string
  agent_id: string
  content: string
  created_at: string
  cardType: CardType
  pnl?: PnLData | null
}

interface PnLData {
  symbol?: string
  pnl: number       // dollar amount
  pct: number       // percentage
  side?: string     // long / short
  entry?: number
  exit?: number
}

// ── Classify ──────────────────────────────────────────────────────────────────

const PNL_PATTERN = /([+-]?\$?[\d,]+\.?\d*)\s*(%|pct|percent)|([+-]?\d+\.?\d*%)/i
const PNL_KEYWORDS = ['pnl', 'p&l', 'profit', 'loss', 'trade closed', 'position', 'entry', 'exit', 'long', 'short', 'buy', 'sell', 'filled', 'executed', 'return', 'gain', 'down', 'up']
const RESEARCH_KEYWORDS = ['research', 'found', 'analysis', 'report', 'summary', 'insight', 'discovered', 'update', 'news', 'data', 'study', 'result', 'trend']

function classifyMessage(content: string): CardType {
  const lower = content.toLowerCase()
  if (PNL_KEYWORDS.some((k) => lower.includes(k)) && PNL_PATTERN.test(content)) return 'pnl'
  if (RESEARCH_KEYWORDS.some((k) => lower.includes(k))) return 'research'
  if (lower.startsWith('skill installed') || lower.startsWith('connected') || lower.startsWith('disconnected')) return 'system'
  return 'update'
}

function parsePnL(content: string): PnLData | null {
  // Look for patterns like "+$240.50 (12.3%)" or "-15.2%" or "PnL: +$1,200"
  const pctMatch = content.match(/([+-]?\d+\.?\d*)\s*%/)
  const dollarMatch = content.match(/([+-]?\$[\d,]+\.?\d*)/)
  const symbolMatch = content.match(/\b([A-Z]{2,5}\/[A-Z]{2,5}|[A-Z]{2,5}USDT?|BTC|ETH|SOL|[A-Z]{1,5})\b/)
  const sideMatch = content.match(/\b(long|short|buy|sell)\b/i)

  if (!pctMatch && !dollarMatch) return null

  const pct = pctMatch ? parseFloat(pctMatch[1]) : 0
  const pnl = dollarMatch ? parseFloat(dollarMatch[1].replace(/[$,]/g, '')) : 0

  return {
    pnl,
    pct,
    symbol: symbolMatch?.[1],
    side: sideMatch?.[1]?.toLowerCase(),
  }
}

// ── Cards ──────────────────────────────────────────────────────────────────────

function PnLCard({ item, agent }: { item: FeedItem; agent?: Agent }) {
  const data = item.pnl
  const isPositive = data ? (data.pnl >= 0 || data.pct >= 0) : false
  const color = isPositive ? Colors.accentGreen : Colors.accentRed

  return (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/agent/${item.agent_id}`)} activeOpacity={0.8}>
      <View style={styles.cardTopRow}>
        <View style={styles.agentRow}>
          <View style={[styles.agentDot, { backgroundColor: Colors.accentGreen }]} />
          <Text style={styles.agentName}>{agent?.name ?? 'Agent'}</Text>
          {data?.symbol && <View style={styles.symbolBadge}><Text style={styles.symbolText}>{data.symbol}</Text></View>}
          {data?.side && <View style={[styles.sideBadge, { backgroundColor: data.side === 'long' || data.side === 'buy' ? 'rgba(0,200,150,0.12)' : 'rgba(255,69,58,0.12)' }]}>
            <Text style={[styles.sideText, { color: data.side === 'long' || data.side === 'buy' ? Colors.accentGreen : Colors.accentRed }]}>{data.side.toUpperCase()}</Text>
          </View>}
        </View>
        <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>
      </View>

      {data && (
        <View style={styles.pnlRow}>
          {data.pnl !== 0 && (
            <Text style={[styles.pnlDollar, { color }]}>
              {isPositive ? '+' : ''}{data.pnl >= 0 ? '$' : '-$'}{Math.abs(data.pnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
    </TouchableOpacity>
  )
}

function ResearchCard({ item, agent }: { item: FeedItem; agent?: Agent }) {
  return (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/agent/${item.agent_id}`)} activeOpacity={0.8}>
      <View style={styles.cardTopRow}>
        <View style={styles.agentRow}>
          <View style={[styles.agentDot, { backgroundColor: Colors.accentTeal }]} />
          <Text style={styles.agentName}>{agent?.name ?? 'Agent'}</Text>
        </View>
        <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>
      </View>
      <Text style={styles.cardContent} numberOfLines={5}>{item.content}</Text>
      <View style={styles.cardTypeTag}>
        <Text style={[styles.cardTypeText, { color: Colors.accentTeal }]}>◆ Research</Text>
      </View>
    </TouchableOpacity>
  )
}

function UpdateCard({ item, agent }: { item: FeedItem; agent?: Agent }) {
  return (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/agent/${item.agent_id}`)} activeOpacity={0.8}>
      <View style={styles.cardTopRow}>
        <View style={styles.agentRow}>
          <View style={[styles.agentDot, { backgroundColor: Colors.textMuted }]} />
          <Text style={styles.agentName}>{agent?.name ?? 'Agent'}</Text>
        </View>
        <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>
      </View>
      <Text style={styles.cardContent} numberOfLines={4}>{item.content}</Text>
    </TouchableOpacity>
  )
}

function SystemCard({ item, agent }: { item: FeedItem; agent?: Agent }) {
  return (
    <View style={styles.systemCard}>
      <View style={[styles.agentDot, { backgroundColor: Colors.accentAmber }]} />
      <Text style={styles.systemText} numberOfLines={2}>
        <Text style={styles.systemAgentName}>{agent?.name ?? 'Agent'} </Text>
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

    const [{ data: messages }, { data: skillInstalls }] = await Promise.all([
      supabase
        .from('messages')
        .select('id, agent_id, content, created_at')
        .in('agent_id', agentIds)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(60),
      supabase
        .from('agent_skills')
        .select('id, agent_id, skill_slug, config, created_at')
        .in('agent_id', agentIds)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    const msgItems: FeedItem[] = (messages ?? []).map((m) => {
      const cardType = classifyMessage(m.content)
      return { ...m, cardType, pnl: cardType === 'pnl' ? parsePnL(m.content) : null }
    })

    const skillItems: FeedItem[] = (skillInstalls ?? []).map((s) => ({
      id: `skill:${s.id}`,
      agent_id: s.agent_id,
      content: `Skill installed: ${s.config?.displayName ?? s.skill_slug}${s.config?.version ? ` v${s.config.version}` : ''}`,
      created_at: s.created_at,
      cardType: 'system' as CardType,
    }))

    const merged = [...msgItems, ...skillItems].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ).slice(0, 60)

    setItems(merged)
    setLoading(false)
  }, [user, agents])

  useEffect(() => { loadFeed() }, [loadFeed])

  // Realtime: push new inbound messages and skill installs to top of feed
  useEffect(() => {
    if (!user || agents.length === 0) return
    const agentIds = agents.map((a) => a.id)

    const channel = supabase
      .channel('feed:live')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, (payload) => {
        const row = payload.new as any
        if (!agentIds.includes(row.agent_id)) return
        if (row.direction !== 'inbound') return
        const cardType = classifyMessage(row.content)
        const newItem: FeedItem = {
          id: row.id,
          agent_id: row.agent_id,
          content: row.content,
          created_at: row.created_at,
          cardType,
          pnl: cardType === 'pnl' ? parsePnL(row.content) : null,
        }
        setItems((prev) => [newItem, ...prev.slice(0, 59)])
      })
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

  const renderItem = ({ item }: { item: FeedItem }) => {
    const agent = agentMap[item.agent_id]
    if (item.cardType === 'pnl') return <PnLCard item={item} agent={agent} />
    if (item.cardType === 'research') return <ResearchCard item={item} agent={agent} />
    if (item.cardType === 'system') return <SystemCard item={item} agent={agent} />
    return <UpdateCard item={item} agent={agent} />
  }

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

      {!loading && items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>◉</Text>
          <Text style={styles.emptyTitle}>No updates yet</Text>
          <Text style={styles.emptySubtitle}>Agent activity will appear here as they work</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accentCrimson} />
          }
        />
      )}
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

  // PnL + Research + Update cards
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

  // System card (compact)
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

  // Empty state
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, color: Colors.textMuted },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: Colors.textPrimary },
  emptySubtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
})
