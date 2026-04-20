import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Switch,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import {
  getPublicAgentProfile,
  listPublicFeedEventsForAgent,
  isTrackingAgent,
  trackAgent,
  untrackAgent,
  setAgentBroadcastEnabled,
  createOrGetDirectThread,
  getDirectThreadId,
} from '../../lib/firebase'
import { useAuthStore } from '../../stores/authStore'
import { useChatDockStore } from '../../stores/chatDockStore'
import { Colors } from '../../constants/colors'
import { useDesktopWebLayout } from '../../lib/responsive'

function agentColor(name: string): string {
  const palette = ['#f59e0b', '#2dd4bf', '#a78bfa', '#60a5fa', '#34d399']
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return palette[Math.abs(h) % palette.length]
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function formatCurrency(value: number | null | undefined) {
  const amount = Number(value ?? 0)
  const sign = amount >= 0 ? '+' : '-'
  return `${sign}$${Math.abs(amount).toFixed(2)}`
}

export default function PublicSlugScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuthStore()
  const openConversation = useChatDockStore((state) => state.openConversation)
  const isDesktopWeb = useDesktopWebLayout()
  const [loading, setLoading] = useState(true)
  const [slug, setSlug] = useState<any | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [feed, setFeed] = useState<any[]>([])
  const [isTracked, setIsTracked] = useState(false)
  const [trackLoading, setTrackLoading] = useState(false)
  const [broadcastEnabled, setBroadcastEnabled] = useState(true)
  const [broadcastSaving, setBroadcastSaving] = useState(false)

  const slugId = Array.isArray(id) ? id[0] : id
  const isOwner = !!user?.uid && !!slug?.user_id && user.uid === slug.user_id

  const loadSlug = useCallback(async () => {
    if (!slugId) {
      setSlug(null)
      setFeed([])
      setNotFound(true)
      setLoading(false)
      return
    }
    setLoading(true)
    setNotFound(false)
    try {
      const profile = await getPublicAgentProfile(slugId)
      if (!profile) {
        setSlug(null)
        setFeed([])
        setNotFound(true)
        return
      }

      const [events, tracked] = await Promise.all([
        listPublicFeedEventsForAgent(slugId, 24),
        user?.uid ? isTrackingAgent(user.uid, slugId) : Promise.resolve(false),
      ])

      setSlug(profile)
      setFeed(events)
      setIsTracked(tracked)
      setBroadcastEnabled(profile.broadcast_enabled !== false)
    } catch (error) {
      console.warn('[slug] loadSlug failed', error)
      setSlug(null)
      setFeed([])
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [slugId, user?.uid])

  useEffect(() => {
    loadSlug()
  }, [loadSlug])

  async function toggleTrack() {
    if (!user?.uid || !slug) return
    setTrackLoading(true)
    try {
      if (isTracked) {
        await untrackAgent(user.uid, slug.id)
        setIsTracked(false)
      } else {
        await trackAgent(user.uid, slug.id, slug.user_id)
        setIsTracked(true)
      }
    } finally {
      setTrackLoading(false)
    }
  }

  async function toggleBroadcast(next: boolean) {
    if (!slug || !isOwner) return
    setBroadcastEnabled(next)
    setBroadcastSaving(true)
    try {
      await setAgentBroadcastEnabled(slug.id, next)
    } finally {
      setBroadcastSaving(false)
    }
  }

  async function messageOwner() {
    if (!user?.uid || !slug?.user_id || user.uid === slug.user_id) return
    const threadId = getDirectThreadId(user.uid, slug.user_id)
    void createOrGetDirectThread(user.uid, slug.user_id)
    if (Platform.OS === 'web') {
      openConversation({ threadId, otherUid: slug.user_id, username: slug.owner_username })
      return
    }
    router.push({ pathname: '/messages/[threadId]', params: { threadId, otherUid: slug.user_id, username: slug.owner_username } })
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.accentAmber} />
      </View>
    )
  }

  if (notFound || !slug) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Slug not found.</Text>
      </View>
    )
  }

  const accent = agentColor(slug.name)
  const liveState = slug.live_state ?? {}
  const unrealizedPnl = Number(liveState.unrealizedPnlUsd ?? liveState.unrealized_pnl ?? 0)
  const dailyPnl = Number(liveState.dailyPnlUsd ?? liveState.daily_pnl ?? 0)
  const openPositions = Array.isArray(liveState.openPositions) ? liveState.openPositions.length : Number(liveState.open_positions ?? 0)
  const recentTrades = Array.isArray(liveState.recentTrades)
    ? liveState.recentTrades
    : Array.isArray(liveState.openPositions)
      ? liveState.openPositions
      : []
  const strategyHighlights = Array.isArray(slug.metadata?.watchlist)
    ? (slug.metadata.watchlist as string[]).slice(0, 5)
    : []

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <TouchableOpacity style={styles.backRow} onPress={() => router.back()} activeOpacity={0.8}>
        <Ionicons name="chevron-back" size={18} color={Colors.accentAmber} />
        <Text style={styles.backLabel}>Back</Text>
      </TouchableOpacity>

      <View style={styles.hero}>
        <View style={[styles.avatarRing, { borderColor: accent }]}>
          <View style={[styles.avatarInner, { backgroundColor: `${accent}22` }]}>
            <Text style={[styles.avatarInitial, { color: accent }]}>{slug.name[0]?.toUpperCase() ?? 'S'}</Text>
          </View>
        </View>

        <View style={styles.heroMeta}>
          <Text style={styles.slugName}>{slug.name}</Text>
          <Text style={styles.slugHandle}>@{slug.owner_username}/{slug.name.toLowerCase().replace(/\s+/g, '-')}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: slug.status === 'connected' ? Colors.accentGreen : Colors.accentAmber }]} />
            <Text style={styles.statusText}>{slug.status}</Text>
            <Text style={styles.statusDivider}>·</Text>
            <Text style={styles.statusText}>{slug.strategy_label}</Text>
            <Text style={styles.statusDivider}>·</Text>
            <Text style={styles.statusText}>{timeAgo(slug.last_seen)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <View style={[styles.metricCard, styles.metricCardPrimary]}>
          <Text style={[styles.metricValue, { color: unrealizedPnl >= 0 ? Colors.accentGreen : Colors.accentRed }]}>
            {formatCurrency(unrealizedPnl)}
          </Text>
          <Text style={styles.metricLabel}>Unrealized PnL</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={[styles.metricValueSmall, { color: dailyPnl >= 0 ? Colors.accentGreen : Colors.accentRed }]}>
            {formatCurrency(dailyPnl)}
          </Text>
          <Text style={styles.metricLabel}>Daily PnL</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValueSmall}>{openPositions}</Text>
          <Text style={styles.metricLabel}>Open Positions</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardEyebrow}>ABOUT</Text>
        <Text style={styles.description}>{slug.description}</Text>
        {strategyHighlights.length > 0 ? (
          <View style={styles.tagRow}>
            {strategyHighlights.map((symbol) => (
              <View key={symbol} style={styles.tag}>
                <Text style={styles.tagText}>{symbol}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.actionsRow}>
        {!isOwner && !!user && (
          <TouchableOpacity
            style={[styles.primaryBtn, isTracked && styles.secondaryShell]}
            onPress={toggleTrack}
            disabled={trackLoading}
            activeOpacity={0.85}
          >
            {trackLoading ? (
              <ActivityIndicator size="small" color={isTracked ? Colors.accentAmber : Colors.bgPrimary} />
            ) : (
              <Text style={[styles.primaryBtnText, isTracked && styles.secondaryBtnText]}>
                {isTracked ? 'Tracked' : 'Track slug'}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {!isOwner && !!user && (
          <TouchableOpacity style={styles.secondaryBtn} onPress={messageOwner} activeOpacity={0.85}>
            <Text style={styles.secondaryBtnText}>Message owner</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => router.push({ pathname: '/profile/[username]', params: { username: slug.owner_username, uid: slug.user_id } })}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryBtnText}>View operator</Text>
        </TouchableOpacity>
      </View>

      {isOwner && (
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>FOLLOWER BROADCAST</Text>
          <View style={styles.broadcastRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.broadcastTitle}>Broadcast updates to followers</Text>
              <Text style={styles.broadcastBody}>
                When enabled, public feed updates from this slug can show up for people following you or tracking this specific slug.
              </Text>
            </View>
            <Switch
              value={broadcastEnabled}
              onValueChange={toggleBroadcast}
              disabled={broadcastSaving}
              trackColor={{ false: Colors.bgBorder, true: 'rgba(0,200,150,0.35)' }}
              thumbColor={broadcastEnabled ? Colors.accentGreen : Colors.textSecondary}
            />
          </View>
          <TouchableOpacity style={styles.manageBtn} onPress={() => router.push(`/agent/${slug.id}`)} activeOpacity={0.85}>
            <Text style={styles.manageBtnText}>Open full agent view</Text>
          </TouchableOpacity>
        </View>
      )}

      {(() => {
        const tradeItems = recentTrades.slice(0, 5).map((t: any, i: number) => ({
          _key: `trade-${i}`, _type: 'trade' as const, _ts: t.created_at ?? t.closedAt ?? null, data: t,
        }))
        const feedItems = feed.map((f: any) => ({
          _key: f.id, _type: 'feed' as const, _ts: f.created_at ?? null, data: f,
        }))
        const merged = [...tradeItems, ...feedItems].sort((a, b) => {
          if (!a._ts && !b._ts) return 0
          if (!a._ts) return 1
          if (!b._ts) return -1
          return new Date(b._ts).getTime() - new Date(a._ts).getTime()
        }).slice(0, 10)

        return (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Activity</Text>
            </View>
            <View style={styles.card}>
              {merged.length === 0 ? (
                <Text style={styles.emptyText}>No activity yet.</Text>
              ) : merged.map((item, index) => {
                const isLast = index === merged.length - 1
                if (item._type === 'trade') {
                  const trade = item.data
                  const symbol = String(trade.symbol ?? trade.pair ?? trade.ticker ?? 'Market')
                  const side = String(trade.side ?? trade.direction ?? 'Trade').toUpperCase()
                  const pnl = Number(trade.pnlUsd ?? trade.pnl ?? trade.unrealizedPnlUsd ?? 0)
                  const entry = trade.entryPrice ?? trade.fillPrice ?? trade.avgEntry
                  const size = trade.size ?? trade.qty ?? trade.positionSize
                  return (
                    <View key={item._key} style={[styles.tradeRow, !isLast && styles.rowBorder]}>
                      <View style={styles.tradeTopRow}>
                        <View style={styles.tradeIdentity}>
                          <Text style={styles.tradeSymbol}>{symbol}</Text>
                          <View style={[styles.sideBadge, { backgroundColor: side.includes('SHORT') || side.includes('SELL') ? 'rgba(239,68,68,0.14)' : 'rgba(0,200,150,0.14)' }]}>
                            <Text style={[styles.sideBadgeText, { color: side.includes('SHORT') || side.includes('SELL') ? Colors.accentRed : Colors.accentGreen }]}>{side}</Text>
                          </View>
                        </View>
                        <Text style={[styles.tradePnl, { color: pnl >= 0 ? Colors.accentGreen : Colors.accentRed }]}>{formatCurrency(pnl)}</Text>
                      </View>
                      <View style={styles.tradeMetaRow}>
                        {entry != null && <Text style={styles.tradeMeta}>Entry {String(entry)}</Text>}
                        {size != null && <Text style={styles.tradeMeta}>Size {String(size)}</Text>}
                        {item._ts && <Text style={styles.tradeMeta}>{timeAgo(item._ts)}</Text>}
                      </View>
                    </View>
                  )
                }
                const ev = item.data
                return (
                  <View key={item._key} style={[styles.feedRow, !isLast && styles.rowBorder]}>
                    <View style={styles.feedTag}>
                      <Text style={styles.feedTagText}>{ev.type}</Text>
                    </View>
                    <Text style={styles.feedContent}>{ev.content}</Text>
                    <Text style={styles.feedTime}>{timeAgo(ev.created_at)}</Text>
                  </View>
                )
              })}
            </View>
          </>
        )
      })()}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  content: { padding: 16, paddingTop: 58, paddingBottom: 100, gap: 16 },
  centered: { flex: 1, backgroundColor: Colors.bgPrimary, justifyContent: 'center', alignItems: 'center' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backLabel: { color: Colors.accentAmber, fontSize: 14, fontWeight: '600' },
  hero: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  avatarRing: { width: 76, height: 76, borderRadius: 38, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  avatarInner: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 26, fontWeight: '800' },
  heroMeta: { flex: 1, gap: 4 },
  slugName: { color: Colors.textPrimary, fontSize: 30, fontWeight: '800' },
  slugHandle: { color: Colors.textSecondary, fontSize: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: Colors.textSecondary, fontSize: 13, textTransform: 'capitalize' },
  statusDivider: { color: Colors.textMuted },
  metricsRow: { flexDirection: 'row', gap: 10 },
  metricCard: {
    flex: 1,
    backgroundColor: '#171614',
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 6,
  },
  metricCardPrimary: { flex: 1.2 },
  metricValue: { fontSize: 28, fontWeight: '800' },
  metricValueSmall: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  metricLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  card: { backgroundColor: '#171614', borderWidth: 1, borderColor: Colors.bgBorder, borderRadius: 22, padding: 18, gap: 12 },
  cardEyebrow: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  description: { color: Colors.textPrimary, fontSize: 16, lineHeight: 25 },
  tagRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 2 },
  tag: { backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.bgBorder, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  tagText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  primaryBtn: { backgroundColor: Colors.accentAmber, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 12, minWidth: 118, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: Colors.bgPrimary, fontSize: 14, fontWeight: '700' },
  secondaryShell: { backgroundColor: 'rgba(217,119,87,0.1)', borderWidth: 1, borderColor: 'rgba(217,119,87,0.3)' },
  secondaryBtn: { backgroundColor: Colors.bgElevated, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 12, borderWidth: 1, borderColor: Colors.bgBorder },
  secondaryBtnText: { color: Colors.accentAmber, fontSize: 14, fontWeight: '700' },
  broadcastRow: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  broadcastTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  broadcastBody: { color: Colors.textSecondary, fontSize: 13, lineHeight: 20 },
  manageBtn: { marginTop: 6, alignSelf: 'flex-start', backgroundColor: Colors.bgElevated, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: Colors.bgBorder },
  manageBtnText: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600' },
  sectionHeader: { marginTop: 6 },
  sectionTitle: { color: Colors.textPrimary, fontSize: 20, fontWeight: '800' },
  tradeRow: { gap: 8, paddingVertical: 2 },
  tradeTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  tradeIdentity: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  tradeSymbol: { color: Colors.textPrimary, fontSize: 15, fontWeight: '800' },
  sideBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  sideBadgeText: { fontSize: 11, fontWeight: '800' },
  tradePnl: { fontSize: 15, fontWeight: '800' },
  tradeMetaRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  tradeMeta: { color: Colors.textSecondary, fontSize: 12 },
  feedRow: { gap: 8, paddingVertical: 2 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.bgBorder, paddingBottom: 14, marginBottom: 14 },
  feedTag: { alignSelf: 'flex-start', backgroundColor: 'rgba(217,119,87,0.12)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  feedTagText: { color: Colors.accentAmber, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  feedContent: { color: Colors.textPrimary, fontSize: 14, lineHeight: 22 },
  feedTime: { color: Colors.textMuted, fontSize: 12 },
  emptyText: { color: Colors.textMuted, fontSize: 14, lineHeight: 21 },
})
