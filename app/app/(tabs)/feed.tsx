import { useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, Platform, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { subscribeToMyFeed, subscribeToSlug001Feed } from '../../lib/firebase'
import { useAuthStore } from '../../stores/authStore'
import { Colors } from '../../constants/colors'

// ── Types ─────────────────────────────────────────────────────────────────────

type CardType = 'pnl' | 'update' | 'system'

interface PnLData {
  symbol?: string
  pnl: number
  pct: number
  side?: string
}

interface FeedItem {
  id: string
  agent_id: string
  agentName: string
  agentIsSlug001: boolean
  content: string
  created_at: string
  cardType: CardType
  pnl?: PnLData | null
  payload?: Record<string, any>
  rawType?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ts: string): string {
  const d = new Date(ts)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function toFeedItem(raw: any): FeedItem {
  const isSlug001 = raw.agent_id === 'slug-001'
  const cardType: CardType =
    raw.type === 'pnl' || raw.type === 'daily_pnl' ? 'pnl'
    : raw.type === 'system' ? 'system'
    : 'update'

  // daily_pnl uses payload.pnl directly; legacy pnl uses payload.pnl too
  const pnlVal = raw.payload?.pnl ?? null
  const pnl: PnLData | null =
    cardType === 'pnl' && pnlVal != null
      ? { pnl: Number(pnlVal), pct: raw.payload?.pct ?? 0, symbol: raw.payload?.symbol, side: raw.payload?.side }
      : null

  return {
    id: raw.id,
    agent_id: raw.agent_id,
    agentName: isSlug001 ? 'Slug #001' : (raw.agent_name ?? 'Agent'),
    agentIsSlug001: isSlug001,
    content: raw.content,
    created_at: raw.created_at,
    cardType,
    pnl,
    payload: raw.payload,
    rawType: raw.type,
  }
}

function mergeSorted(a: FeedItem[], b: FeedItem[]): FeedItem[] {
  const combined = [...a, ...b]
  combined.sort((x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime())
  // Deduplicate by id
  const seen = new Set<string>()
  return combined.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  }).slice(0, 80)
}

// ── Avatar ─────────────────────────────────────────────────────────────────────

function AgentAvatar({ item }: { item: FeedItem }) {
  if (item.agentIsSlug001) {
    return (
      <View style={styles.slug001Avatar}>
        <Text style={styles.slug001AvatarText}>⬡</Text>
      </View>
    )
  }
  return (
    <View style={styles.genericAvatar}>
      <Text style={styles.genericAvatarText}>{item.agentName[0]?.toUpperCase() ?? 'A'}</Text>
    </View>
  )
}

// ── Cards ──────────────────────────────────────────────────────────────────────

function cardDestination(item: FeedItem): string | null {
  if (item.agentIsSlug001) return '/agent/slug-001'
  if (item.agent_id) return `/agent/${item.agent_id}`
  return null
}

function CardWrapper({ item, children }: { item: FeedItem; children: React.ReactNode }) {
  const dest = cardDestination(item)
  if (!dest) return <>{children}</>
  return (
    <TouchableOpacity activeOpacity={0.75} onPress={() => router.push(dest as any)}>
      {children}
    </TouchableOpacity>
  )
}

function PnLCard({ item }: { item: FeedItem }) {
  const data = item.pnl
  const isPositive = !data || data.pnl >= 0
  const pnlColor = isPositive ? Colors.accentGreen : Colors.accentRed
  const accentColor = item.agentIsSlug001 ? Colors.accentAmber : Colors.accentGreen
  const isDaily = item.rawType === 'daily_pnl'

  return (
    <CardWrapper item={item}>
      <View style={[styles.card, item.agentIsSlug001 && styles.cardSlug001]}>
        <View style={styles.cardTopRow}>
          <View style={styles.agentRow}>
            <AgentAvatar item={item} />
            <View style={{ gap: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.agentName}>{item.agentName}</Text>
                {data?.symbol && (
                  <View style={styles.symbolBadge}>
                    <Text style={styles.symbolText}>{data.symbol}</Text>
                  </View>
                )}
                {data?.side && !isDaily && (
                  <View style={[styles.sideBadge, { backgroundColor: data.side === 'long' ? 'rgba(0,200,150,0.12)' : 'rgba(255,69,58,0.12)' }]}>
                    <Text style={[styles.sideText, { color: data.side === 'long' ? Colors.accentGreen : Colors.accentRed }]}>
                      {data.side.toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
              {item.agentIsSlug001 && <Text style={styles.agentHandle}>@slugs/range-farmer</Text>}
            </View>
          </View>
          <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>
        </View>

        {/* PnL — highlighted prominently */}
        {data && (
          <View style={styles.pnlRow}>
            <Text style={[styles.pnlDollar, { color: pnlColor }]}>
              {data.pnl >= 0 ? '+$' : '-$'}{Math.abs(data.pnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            {data.pct !== 0 && (
              <Text style={[styles.pnlPct, { color: pnlColor }]}>
                {data.pct > 0 ? '+' : ''}{data.pct.toFixed(2)}%
              </Text>
            )}
          </View>
        )}

        {/* Daily summary stats row */}
        {isDaily && item.payload && (
          <View style={styles.summaryRow}>
            {item.payload.fills != null && (
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{item.payload.fills}</Text>
                <Text style={styles.summaryLabel}>fills</Text>
              </View>
            )}
            {item.payload.open_positions != null && (
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{item.payload.open_positions}</Text>
                <Text style={styles.summaryLabel}>open</Text>
              </View>
            )}
            {item.payload.btc_price != null && (
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>${Math.round(item.payload.btc_price).toLocaleString()}</Text>
                <Text style={styles.summaryLabel}>btc</Text>
              </View>
            )}
          </View>
        )}

        {!isDaily && <Text style={styles.cardContent}>{item.content}</Text>}

        <View style={styles.cardTypeRow}>
          <Text style={[styles.cardTypeText, { color: accentColor }]}>
            ◆ {isDaily ? 'Daily Summary' : 'Trade Update'}
          </Text>
          {cardDestination(item) && (
            <Text style={styles.cardChevron}>›</Text>
          )}
        </View>
      </View>
    </CardWrapper>
  )
}

function UpdateCard({ item }: { item: FeedItem }) {
  const dotColor = item.agentIsSlug001 ? Colors.accentAmber : Colors.textMuted

  return (
    <CardWrapper item={item}>
      <View style={[styles.card, item.agentIsSlug001 && styles.cardSlug001]}>
        <View style={styles.cardTopRow}>
          <View style={styles.agentRow}>
            <AgentAvatar item={item} />
            <View style={{ gap: 1 }}>
              <Text style={styles.agentName}>{item.agentName}</Text>
              {item.agentIsSlug001 && <Text style={styles.agentHandle}>@slugs/range-farmer</Text>}
            </View>
          </View>
          <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>
        </View>
        <Text style={styles.cardContent}>{item.content}</Text>
        <View style={styles.cardTypeRow}>
          {item.agentIsSlug001 && (
            <Text style={[styles.cardTypeText, { color: dotColor }]}>◆ Grid Update</Text>
          )}
          {cardDestination(item) && (
            <Text style={styles.cardChevron}>›</Text>
          )}
        </View>
      </View>
    </CardWrapper>
  )
}

function SystemCard({ item }: { item: FeedItem }) {
  return (
    <View style={styles.systemCard}>
      <AgentAvatar item={item} />
      <Text style={styles.systemText} numberOfLines={2}>
        <Text style={styles.systemAgentName}>{item.agentName} </Text>
        {item.content}
      </Text>
      <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>
    </View>
  )
}

function renderCard(item: FeedItem) {
  if (item.cardType === 'pnl') return <PnLCard item={item} />
  if (item.cardType === 'system') return <SystemCard item={item} />
  return <UpdateCard item={item} />
}

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>◎</Text>
      <Text style={styles.emptyTitle}>Waiting for activity</Text>
      <Text style={styles.emptySubtitle}>Slug #001 will post updates here as it trades.</Text>
    </View>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function FeedScreen() {
  const { user } = useAuthStore()
  const [slug001Items, setSlug001Items] = useState<FeedItem[]>([])
  const [myItems, setMyItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)

  // Slug #001 feed — always visible
  useEffect(() => {
    const unsub = subscribeToSlug001Feed((events) => {
      setSlug001Items(events.map(toFeedItem))
      setLoading(false)
    })
    return unsub
  }, [])

  // User's own agents feed
  useEffect(() => {
    if (!user) return
    const unsub = subscribeToMyFeed(user.uid, (events) => {
      setMyItems(events.map(toFeedItem))
    })
    return unsub
  }, [user?.uid])

  const items = mergeSorted(slug001Items, myItems)
  const isLive = slug001Items.length > 0

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Feed</Text>
        <View style={styles.liveRow}>
          <View style={[styles.liveDot, { backgroundColor: isLive ? Colors.accentGreen : Colors.textMuted }]} />
          <Text style={[styles.liveText, { color: isLive ? Colors.accentGreen : Colors.textMuted }]}>
            {isLive ? 'Live' : 'Waiting'}
          </Text>
        </View>
      </View>

      {!loading && items.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          data={loading ? [] : items}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => renderCard(item)}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
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
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },

  list: { paddingHorizontal: 16, paddingBottom: 120, gap: 10 },

  // Cards
  card: { backgroundColor: '#0f0f0f', borderRadius: 16, padding: 16, gap: 10 },
  cardSlug001: { borderWidth: 1, borderColor: 'rgba(217,119,87,0.15)' },

  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  agentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  agentName: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  agentHandle: { fontSize: 10, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  timestamp: { fontSize: 11, color: Colors.textMuted },

  symbolBadge: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  symbolText: { fontSize: 10, fontWeight: '700', color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  sideBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  sideText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },

  pnlRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  pnlDollar: { fontSize: 28, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  pnlPct: { fontSize: 16, fontWeight: '600' },

  cardContent: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  cardTypeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTypeText: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  cardChevron: { fontSize: 18, color: Colors.textMuted, lineHeight: 20 },

  summaryRow: { flexDirection: 'row', gap: 20 },
  summaryItem: { gap: 2 },
  summaryValue: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  summaryLabel: { fontSize: 9, fontWeight: '600', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },

  systemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
  },
  systemText: { flex: 1, fontSize: 12, color: Colors.textMuted },
  systemAgentName: { color: Colors.textSecondary, fontWeight: '600' },

  // Avatars
  slug001Avatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(217,119,87,0.12)',
    borderWidth: 1.5, borderColor: Colors.accentAmber,
    justifyContent: 'center', alignItems: 'center',
  },
  slug001AvatarText: { fontSize: 16, color: Colors.accentAmber },
  genericAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center', alignItems: 'center',
  },
  genericAvatarText: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },

  // Empty
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingBottom: 80 },
  emptyIcon: { fontSize: 40, color: Colors.textMuted },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textSecondary },
  emptySubtitle: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 40 },
})
