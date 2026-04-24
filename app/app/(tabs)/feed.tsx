import { useEffect, useMemo, useRef, useState } from 'react'
import {
  View, Text, FlatList, StyleSheet, Platform, TouchableOpacity,
  Modal, ScrollView, Animated, LayoutAnimation, UIManager,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import {
  subscribeToFollowing,
  subscribeToFollowingLeaderboard,
  subscribeToMyFeed,
  subscribeToPublicFeed,
  subscribeToTrackedAgents,
  subscribeToTrackedAgentFeed,
  subscribeToTrackedAgentDocs,
  subscribeToUserAgents,
  subscribeToUserAgentsPnl,
  subscribeToMarketNews,
  publishAgentPnl,
  getPnlSharingPref,
  setPnlSharingPref,
  batchGetUsernames,
  fetchAgentsByIds,
} from '../../lib/firebase'
import { useAuthStore } from '../../stores/authStore'
import { Colors } from '../../constants/colors'
import { useDesktopWebLayout } from '../../lib/responsive'
import { ShareCardModal, type TradeData } from '../../components/share-card'

// ── Types ─────────────────────────────────────────────────────────────────────

type CardType = 'pnl' | 'trade' | 'news' | 'update' | 'system'
type SharingPref = 'auto' | 'manual' | 'private' | null

interface PnLData {
  symbol?: string
  pnl: number
  pct: number
  side?: string
}

interface FeedItem {
  id: string
  agent_id: string
  user_id: string
  agentName: string
  content: string
  created_at: string
  cardType: CardType
  pnl?: PnLData | null
  payload?: Record<string, any>
  rawType?: string
  source: 'mine' | 'following' | 'tracked' | 'news'
}

interface FeedAgentSnapshot {
  id: string
  name?: string
  owner_username?: string | null
  last_seen?: string | null
  last_synced?: string | null
  live_state?: Record<string, any> | null
}

function agentSnapshotActivityIso(agent?: { last_seen?: string | null; last_synced?: string | null } | null) {
  return agent?.last_seen ?? agent?.last_synced ?? null
}

interface LeaderboardEntry {
  uid: string
  username: string
  display_name: string | null
  avatar_url: string | null
  total_pnl: number
  active_agents: number
  total_agents: number
  top_agents: Array<{ id: string; name: string; pnl: number }>
  updated_at: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ts: string): string {
  const d = new Date(ts)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (diff < 86400) return time
  const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  return `${date} · ${time}`
}

function toFeedItem(raw: any, nameMap?: Map<string, string>, source: FeedItem['source'] = 'following'): FeedItem {
  const cardType: CardType =
    raw.type === 'pnl' || raw.type === 'daily_pnl' ? 'pnl'
    : raw.type === 'trade' ? 'trade'
    : raw.type === 'news_sentiment' ? 'news'
    : raw.type === 'system' ? 'system'
    : 'update'

  const pnlVal = raw.payload?.pnl ?? null
  const pnl: PnLData | null =
    cardType === 'pnl' && pnlVal != null
      ? { pnl: Number(pnlVal), pct: raw.payload?.pct ?? 0, symbol: raw.payload?.symbol, side: raw.payload?.side }
      : null

  const agentName = raw.agent_name || (nameMap instanceof Map ? nameMap.get(String(raw.agent_id ?? '')) : undefined) || 'Agent'

  return {
    id: raw.id,
    agent_id: raw.agent_id,
    user_id: raw.user_id,
    agentName,
    content: raw.content,
    created_at: raw.created_at,
    cardType,
    pnl,
    payload: raw.payload,
    rawType: raw.type,
    source,
  }
}

function sourceLabel(source: FeedItem['source']) {
  if (source === 'mine') return 'Your agent'
  if (source === 'tracked') return 'Tracked'
  if (source === 'news') return 'News'
  return 'Following'
}

function getFilterGroup(item: FeedItem): FeedItem['source'] {
  if (item.cardType === 'news') return 'news'
  return item.source
}

function openFeedItem(item: FeedItem) {
  const kind = item.cardType === 'news' && item.agent_id === 'market_news' ? 'news' : 'feed'
  router.push({
    pathname: '/feed-event/[id]' as any,
    params: { id: item.id, kind },
  })
}

function WebInlineArrow({ color }: { color: string }) {
  return <Text style={[styles.webInlineArrow, { color }]}>{'>'}</Text>
}

function slugifyName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function buildAgentHandleKey(ownerUsername: string | null | undefined, agentName: string | null | undefined) {
  const owner = normalizeAgentKey(ownerUsername)
  const slug = normalizeAgentKey(slugifyName(String(agentName ?? '')))
  if (!owner || !slug) return ''
  return `${owner}/${slug}`
}

function normalizeAgentKey(value: string | null | undefined) {
  if (!value) return ''
  return String(value).trim().toLowerCase()
}

function normalizeSymbol(value: string | null | undefined) {
  return String(value ?? '').trim().toUpperCase()
}

function resolvePositionPnl(position: any): number | null {
  const explicit =
    position?.unrealizedPnlUsd ??
    position?.unrealized_pnl ??
    position?.unrealizedPnl ??
    position?.unrealized ??
    position?.floatingPnl ??
    position?.pnl

  if (explicit != null && Number.isFinite(Number(explicit))) {
    return Number(explicit)
  }

  const current = Number(position?.currentPrice ?? position?.current_price ?? position?.markPrice ?? position?.mark_price)
  const entry = Number(position?.entryPrice ?? position?.entry_price ?? position?.fillPrice ?? position?.fill_price)
  const qty = Number(position?.qty ?? position?.size ?? position?.quantity ?? 0)
  const sizeUsd = Number(position?.sizeUsd ?? position?.positionSize ?? 0)
  const sideRaw = String(position?.side ?? position?.direction ?? '').toLowerCase()

  const multiplier = sideRaw.includes('sell') || sideRaw.includes('short') ? -1 : 1

  if (Number.isFinite(current) && Number.isFinite(entry) && Number.isFinite(qty) && qty !== 0) {
    return (current - entry) * qty * multiplier
  }

  if (Number.isFinite(current) && Number.isFinite(entry) && entry > 0 && Number.isFinite(sizeUsd) && sizeUsd > 0) {
    return multiplier * ((current - entry) / entry) * sizeUsd
  }

  return null
}

function resolveTradePnlFromPrices(params: {
  actionLabel: string
  direction?: string | null
  qty?: number | null
  entryPrice?: number | null
  exitPrice?: number | null
  currentPrice?: number | null
}): number | null {
  const { actionLabel, direction, qty, entryPrice, exitPrice, currentPrice } = params
  const safeQty = Number(qty ?? 0)
  if (!Number.isFinite(safeQty) || safeQty <= 0) return null

  const sideRaw = String(direction ?? '').toLowerCase()
  const multiplier = sideRaw.includes('short') || actionLabel === 'SOLD' ? -1 : 1

  if ((actionLabel === 'SOLD' || actionLabel === 'CLOSED') && entryPrice != null && exitPrice != null) {
    return (Number(exitPrice) - Number(entryPrice)) * safeQty * multiplier
  }

  if (actionLabel === 'BOUGHT' && entryPrice != null && currentPrice != null) {
    return (Number(currentPrice) - Number(entryPrice)) * safeQty * multiplier
  }

  return null
}

function readNumeric(...values: any[]): number | null {
  for (const value of values) {
    if (value == null || value === '') continue
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
  }
  return null
}

function resolveAgentSnapshotPnl(agent: any): number | null {
  if (!agent) return null
  const liveState = agent.live_state ?? agent.liveState ?? agent.state ?? agent.metadata?.live_state ?? agent.metadata?.liveState ?? null
  const explicit = readNumeric(
    liveState?.unrealizedPnlUsd,
    liveState?.unrealized_pnl,
    liveState?.unrealizedPnl,
    liveState?.dailyPnlUsd,
    liveState?.daily_pnl,
    liveState?.dailyPnl,
    liveState?.session_pnl,
    agent?.unrealizedPnlUsd,
    agent?.unrealized_pnl,
    agent?.unrealizedPnl,
    agent?.dailyPnlUsd,
    agent?.daily_pnl,
    agent?.dailyPnl,
    agent?.session_pnl,
    agent?.metadata?.unrealizedPnlUsd,
    agent?.metadata?.unrealized_pnl,
    agent?.metadata?.unrealizedPnl,
    agent?.metadata?.dailyPnlUsd,
    agent?.metadata?.daily_pnl,
    agent?.metadata?.dailyPnl,
    agent?.metadata?.session_pnl,
  )
  if (explicit != null) return explicit

  const openPositions = Array.isArray(liveState?.openPositions)
    ? liveState.openPositions
    : Array.isArray(liveState?.positions)
      ? liveState.positions
      : Array.isArray(liveState?.open_positions)
        ? liveState.open_positions
        : []
  const derivedPositionPnl = openPositions
    .map((position: any) => resolvePositionPnl(position))
    .filter((value: number | null): value is number => value != null)
  if (derivedPositionPnl.length > 0) {
    return derivedPositionPnl.reduce((sum, value) => sum + value, 0)
  }

  const recentTrades = Array.isArray(liveState?.recentTrades)
    ? liveState.recentTrades
    : Array.isArray(liveState?.recent_trades)
      ? liveState.recent_trades
      : []
  const derivedTradePnl = recentTrades
    .map((trade: any) => readNumeric(
      trade?.pnlUsd,
      trade?.pnl,
      trade?.realizedPnlUsd,
      trade?.realized_pnl,
      trade?.realizedPnl,
      trade?.unrealizedPnlUsd,
      trade?.unrealized_pnl,
      trade?.unrealizedPnl,
    ))
    .filter((value: number | null): value is number => value != null)
  if (derivedTradePnl.length > 0) return derivedTradePnl[0]

  return null
}

function toShareTrade(item: FeedItem): TradeData | null {
  if (item.cardType === 'pnl' && item.pnl) {
    return {
      pair: item.pnl.symbol ? `${item.pnl.symbol}/USD` : item.agentName,
      direction: item.pnl.side ?? 'LONG',
      leverage: '',
      pnl: String(item.pnl.pnl),
      pnlPct: String(item.pnl.pct ?? 0),
      entryPrice: item.payload?.entry_price != null ? String(item.payload.entry_price) : '',
      markPrice: item.payload?.mark_price != null ? String(item.payload.mark_price) : '',
    }
  }

  if (item.cardType === 'trade' && item.payload?.pnl != null) {
    return {
      pair: item.payload?.symbol ? `${item.payload.symbol}/USD` : item.agentName,
      direction: item.payload?.direction ?? 'LONG',
      leverage: item.payload?.leverage ? String(item.payload.leverage) : '',
      pnl: String(item.payload.pnl),
      pnlPct: String(item.payload?.pnl_pct ?? 0),
      entryPrice: item.payload?.entry_price != null ? String(item.payload.entry_price) : '',
      markPrice: item.payload?.exit_price != null ? String(item.payload.exit_price) : '',
    }
  }

  return null
}

// ── Avatar ─────────────────────────────────────────────────────────────────────

function agentColor(name: string): string {
  const palette = ['#f59e0b', '#2dd4bf', '#a78bfa', '#60a5fa', '#34d399']
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return palette[Math.abs(h) % palette.length]
}

function AgentAvatar({ name, size = 44 }: { name: string; size?: number }) {
  const color = agentColor(name)
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color + '22',
          borderColor: color,
        },
      ]}
    >
      <Text style={[styles.avatarText, { color, fontSize: size >= 40 ? 18 : 15 }]}>{name[0]?.toUpperCase() ?? 'A'}</Text>
    </View>
  )
}

function LeaderboardCard({
  entry,
  rank,
}: {
  entry: LeaderboardEntry
  rank: number
}) {
  const isPositive = entry.total_pnl >= 0
  const pnlColor = isPositive ? Colors.accentGreen : Colors.accentRed
  const label = entry.total_agents === 1 ? 'agent' : 'agents'
  const displayName = entry.display_name?.trim() || entry.username

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.leaderboardCard}
      onPress={() => router.push({ pathname: '/profile/[username]' as any, params: { username: entry.username, uid: entry.uid } })}
    >
      <View style={styles.leaderboardCardInner}>
        <View style={styles.leaderboardAvatarWrap}>
          <AgentAvatar name={entry.username || 'U'} />
          <View style={styles.rankBadge}>
            <Text style={styles.rankBadgeText}>{rank}</Text>
          </View>
        </View>
        <View style={styles.leaderboardCopy}>
          <Text style={styles.leaderboardName} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.leaderboardHandle} numberOfLines={1}>@{entry.username}</Text>
          <Text style={styles.leaderboardMeta} numberOfLines={1}>
            {entry.total_agents} {label}
            <Text style={styles.leaderboardDot}> · </Text>
            <Text style={[styles.leaderboardInlinePnl, { color: pnlColor }]}>
              {entry.total_pnl >= 0 ? '+' : '-'}${Math.abs(entry.total_pnl).toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </Text>
            <Text style={styles.leaderboardMetaMuted}> this week</Text>
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  )
}

// ── Cards ──────────────────────────────────────────────────────────────────────

function TrackedAgentCard({ agent }: { agent: any }) {
  const resolvedPnl = resolveAgentSnapshotPnl(agent)
  const unrealized = Number(resolvedPnl ?? 0)
  const hasPnl = resolvedPnl != null
  const isPositive = unrealized >= 0
  const color = hasPnl ? (isPositive ? Colors.accentGreen : Colors.accentRed) : Colors.textMuted
  const symbol = String(agent.coin ?? agent.metadata?.coin ?? agent.live_state?.coin ?? '').toUpperCase()
  const statusLabel = agent.status === 'connected' ? 'LIVE' : 'TRACKED'
  const ownerUsername = String(agent.owner_username ?? agent.metadata?.owner_username ?? '').trim()
  const handle = ownerUsername
    ? `@${ownerUsername}/${slugifyName(agent.name ?? 'tracked-agent')}`
    : (agent.name ?? 'Tracked agent')

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => router.push(`/agent/${agent.id}` as any)}
      style={styles.tradeFeedRow}
    >
      <View style={styles.tradeFeedIdentity}>
        <AgentAvatar name={agent.name ?? 'A'} size={36} />
        <View style={styles.tradeFeedCopy}>
          <View style={styles.tradeFeedTopLine}>
            <Text style={styles.tradeFeedHandle} numberOfLines={1}>
              {handle}
            </Text>
          </View>
          <View style={styles.tradeFeedBottomLine}>
            <Text style={[styles.tradeFeedAction, { color: Colors.accentAmber }]}>
              {statusLabel}
            </Text>
            {symbol ? <Text style={styles.tradeFeedSymbol}>{symbol}</Text> : null}
            <Text style={styles.tradeFeedTime}>· {formatTime(agentSnapshotActivityIso(agent) ?? new Date().toISOString())}</Text>
          </View>
        </View>
      </View>

      <View style={styles.tradeFeedRight}>
        {hasPnl ? (
          <Text style={[styles.tradeFeedPnl, { color }]}>
            {unrealized >= 0 ? '+' : '-'}${Math.abs(unrealized).toFixed(2)}
          </Text>
        ) : (
          <Text style={styles.tradeFeedTime}>watching</Text>
        )}
      </View>
    </TouchableOpacity>
  )
}

function PnLCard({ item, onShare }: { item: FeedItem; onShare: () => void }) {
  const data = item.pnl
  const isPositive = !data || data.pnl >= 0
  const pnlColor = isPositive ? Colors.accentGreen : Colors.accentRed
  const symbol = item.payload?.symbol ?? null
  const details = item.payload?.details ?? item.content

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => openFeedItem(item)}
      style={styles.card}
    >
      <View style={styles.cardTopRow}>
        <View style={styles.agentRow}>
          <AgentAvatar name={item.agentName} />
          <View style={{ gap: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.agentName}>{item.agentName}</Text>
              <View style={styles.sourceBadge}>
                <Text style={styles.sourceBadgeText}>{sourceLabel(item.source)}</Text>
              </View>
              {data?.symbol && (
                <View style={styles.symbolBadge}>
                  <Text style={styles.symbolText}>{data.symbol}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
        <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>
      </View>

      {data && (
        <>
          <View style={styles.tradeMetaWrap}>
            <View style={[styles.tradeBadge, { backgroundColor: 'rgba(45,212,191,0.12)' }]}>
              <Text style={[styles.tradeBadgeText, { color: Colors.accentGreen }]}>PNL</Text>
            </View>
            {symbol ? <Text style={styles.tradeSymbol}>{symbol}</Text> : null}
            <Text style={[styles.tradePnl, { color: pnlColor }]}>
              {data.pnl >= 0 ? '+$' : '-$'}{Math.abs(data.pnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            {data.pct !== 0 && (
              <Text style={[styles.tradePnl, { color: pnlColor }]}>
                {data.pct > 0 ? '+' : ''}{data.pct.toFixed(2)}%
              </Text>
            )}
          </View>

          {details ? <Text style={styles.tradeDetails} numberOfLines={3}>{details}</Text> : null}
        </>
      )}

      <View style={styles.cardTypeRow}>
        <Text style={[styles.cardTypeText, { color: Colors.accentGreen }]}>◆ PnL Snapshot</Text>
        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.inlineAction} onPress={onShare} activeOpacity={0.8}>
            <Text style={styles.inlineActionText}>Share card</Text>
          </TouchableOpacity>
          <Text style={styles.cardChevron}>›</Text>
        </View>
      </View>
    </TouchableOpacity>
  )
}

function UpdateCard({ item }: { item: FeedItem }) {
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => openFeedItem(item)}
      style={styles.card}
    >
      <View style={styles.cardTopRow}>
        <View style={styles.agentRow}>
          <AgentAvatar name={item.agentName} />
          <View style={{ gap: 3 }}>
            <Text style={styles.agentName}>{item.agentName}</Text>
            <Text style={styles.feedMetaText}>{sourceLabel(item.source)}</Text>
          </View>
        </View>
        <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>
      </View>
      <Text style={styles.cardContent} numberOfLines={4}>{item.content}</Text>
      <View style={styles.cardTypeRow}>
        <Text style={[styles.cardTypeText, styles.cardTypeMuted]}>◆ Update</Text>
        <Text style={styles.cardChevron}>›</Text>
      </View>
    </TouchableOpacity>
  )
}

const TRADE_ACTION_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  ENTRY:       { label: 'ENTRY',       color: Colors.accentGreen, bg: 'rgba(45,212,191,0.12)' },
  EXIT:        { label: 'EXIT',        color: Colors.accentAmber, bg: 'rgba(217,119,87,0.12)' },
  STOP_HIT:    { label: 'STOP HIT',   color: Colors.accentRed,   bg: 'rgba(239,68,68,0.12)'  },
  TAKE_PROFIT: { label: 'TAKE PROFIT',color: Colors.accentGreen, bg: 'rgba(45,212,191,0.12)' },
}

function TradeCard({ item, agentSnapshot }: { item: FeedItem; agentSnapshot?: FeedAgentSnapshot | null }) {
  const p = item.payload ?? {}
  const action = String(p.action ?? 'TRADE').toUpperCase()
  const style = TRADE_ACTION_STYLES[action] ?? { label: action, color: Colors.textMuted, bg: 'rgba(255,255,255,0.06)' }
  const symbol = p.symbol ?? null
  const actionLabel = action === 'ENTRY' ? 'BOUGHT' : action === 'EXIT' ? 'SOLD' : action === 'TAKE_PROFIT' ? 'CLOSED' : style.label
  const isCloseTrade =
    action === 'EXIT' ||
    action === 'TAKE_PROFIT' ||
    action === 'STOP_HIT' ||
    actionLabel === 'SOLD' ||
    actionLabel === 'CLOSED'
  const unrealizedPnlRaw = readNumeric(
    p.unrealizedPnlUsd,
    p.unrealized_pnl,
    p.unrealizedPnl,
    p.pnl_unrealized,
  )
  const realizedPnlRaw = readNumeric(
    p.realizedPnlUsd,
    p.realized_pnl,
    p.realizedPnl,
    p.pnl,
    p.session_pnl,
    p.daily_pnl,
  )
  const liveState = agentSnapshot?.live_state ?? (agentSnapshot as any)?.liveState ?? (agentSnapshot as any)?.state ?? null
  const agentLevelUnrealizedPnl = readNumeric(
    liveState?.unrealizedPnlUsd,
    liveState?.unrealized_pnl,
    liveState?.unrealizedPnl,
    liveState?.pnl,
    liveState?.session_pnl,
    (agentSnapshot as any)?.unrealizedPnlUsd,
    (agentSnapshot as any)?.unrealized_pnl,
    (agentSnapshot as any)?.session_pnl,
  )
  const agentLevelRealizedPnl = readNumeric(
    liveState?.realizedPnlUsd,
    liveState?.realized_pnl,
    liveState?.realizedPnl,
    liveState?.dailyPnlUsd,
    liveState?.daily_pnl,
    (agentSnapshot as any)?.dailyPnlUsd,
    (agentSnapshot as any)?.daily_pnl,
  )
  const openPositions = Array.isArray(liveState?.openPositions)
    ? liveState.openPositions
    : Array.isArray(liveState?.positions)
      ? liveState.positions
      : Array.isArray(liveState?.open_positions)
        ? liveState.open_positions
        : []
  const recentTrades = Array.isArray(liveState?.recentTrades)
    ? liveState.recentTrades
    : Array.isArray(liveState?.recent_trades)
      ? liveState.recent_trades
      : []
  const targetSymbol = normalizeSymbol(symbol ?? p.tokenSymbol ?? p.token ?? liveState?.coin ?? agentSnapshot?.name)
  const matchingPosition = openPositions.find((position: any) => {
    const positionSymbol = normalizeSymbol(position?.symbol ?? position?.tokenSymbol ?? position?.token ?? position?.pair)
    return positionSymbol && positionSymbol === targetSymbol
  }) ?? openPositions[0] ?? null
  const matchingRecentTrade = recentTrades.find((trade: any) => {
    const tradeSymbol = normalizeSymbol(trade?.symbol ?? trade?.tokenSymbol ?? trade?.token ?? trade?.pair)
    return tradeSymbol && tradeSymbol === targetSymbol
  }) ?? recentTrades[0] ?? null
  const positionUnrealizedPnl = matchingPosition ? resolvePositionPnl(matchingPosition) : null
  const currentPrice = readNumeric(
    p.current_price,
    p.currentPrice,
    p.mark_price,
    p.markPrice,
    matchingPosition?.currentPrice,
    matchingPosition?.current_price,
    matchingPosition?.markPrice,
    matchingPosition?.mark_price,
    liveState?.priceUsd,
    liveState?.lastPrice,
    liveState?.markPrice,
    liveState?.mark_price,
  )
  const payloadQty = readNumeric(
    p.qty,
    p.quantity,
    p.size,
    p.position_size,
  )
  const payloadEntryPrice = readNumeric(
    p.entry_price,
    p.entryPrice,
    p.fillPrice,
    p.fill_price,
    matchingPosition?.entryPrice,
    matchingPosition?.entry_price,
  )
  const payloadExitPrice = readNumeric(
    p.exit_price,
    p.exitPrice,
    matchingRecentTrade?.exitPrice,
    matchingRecentTrade?.exit_price,
  )
  const inferredTradePnl = resolveTradePnlFromPrices({
    actionLabel,
    direction: p.direction ?? matchingPosition?.direction ?? matchingPosition?.side ?? null,
    qty: payloadQty ?? matchingPosition?.qty ?? matchingPosition?.size ?? matchingPosition?.quantity ?? null,
    entryPrice: payloadEntryPrice,
    exitPrice: payloadExitPrice,
    currentPrice,
  })
  const recentTradePnl = readNumeric(
    matchingRecentTrade?.pnlUsd,
    matchingRecentTrade?.pnl,
    matchingRecentTrade?.realizedPnlUsd,
    matchingRecentTrade?.realizedPnl,
    matchingRecentTrade?.unrealizedPnlUsd,
    matchingRecentTrade?.unrealizedPnl,
  )
  const liveUnrealizedPnl = readNumeric(
    inferredTradePnl,
    positionUnrealizedPnl,
    liveState?.unrealizedPnlUsd,
    liveState?.unrealized_pnl,
    liveState?.unrealizedPnl,
    liveState?.pnl,
    liveState?.dailyPnlUsd,
    liveState?.daily_pnl,
    liveState?.session_pnl,
    (agentSnapshot as any)?.unrealizedPnlUsd,
    (agentSnapshot as any)?.unrealized_pnl,
    recentTradePnl,
    agentLevelUnrealizedPnl,
  )
  const liveRealizedPnl = readNumeric(
    inferredTradePnl,
    liveState?.realizedPnlUsd,
    liveState?.realized_pnl,
    liveState?.realizedPnl,
    p.pnlUsd,
    p.pnl_usd,
    recentTradePnl,
    liveState?.dailyPnlUsd,
    liveState?.daily_pnl,
    liveState?.session_pnl,
    (agentSnapshot as any)?.dailyPnlUsd,
    (agentSnapshot as any)?.daily_pnl,
    (agentSnapshot as any)?.session_pnl,
    agentLevelRealizedPnl,
  )
  const pnlRaw = isCloseTrade
    ? (realizedPnlRaw ?? liveRealizedPnl ?? unrealizedPnlRaw ?? liveUnrealizedPnl)
    : (unrealizedPnlRaw ?? liveUnrealizedPnl ?? realizedPnlRaw ?? liveRealizedPnl)
  const pnlValue = pnlRaw != null ? Number(pnlRaw) : null
  const pnl: number | null = pnlValue != null && Number.isFinite(pnlValue) ? pnlValue : null
  const displayPnl = pnl

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => openFeedItem(item)}
      style={styles.tradeFeedRow}
    >
      <View style={styles.tradeFeedIdentity}>
        <AgentAvatar name={item.agentName} size={36} />
        <View style={styles.tradeFeedCopy}>
          <View style={styles.tradeFeedTopLine}>
            <Text style={styles.tradeFeedHandle} numberOfLines={1}>
              {p.owner_username ? `@${p.owner_username}/${slugifyName(item.agentName)}` : item.agentName}
            </Text>
          </View>
          <View style={styles.tradeFeedBottomLine}>
            <Text style={[styles.tradeFeedAction, { color: style.color }]}>
              {actionLabel}
            </Text>
            {symbol ? <Text style={styles.tradeFeedSymbol}>{symbol}</Text> : null}
            <Text style={styles.tradeFeedTime}>· {formatTime(item.created_at)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.tradeFeedRight}>
        {displayPnl != null ? (
          <Text style={[styles.tradeFeedPnl, { color: displayPnl >= 0 ? Colors.accentGreen : Colors.accentRed }]}>
            {displayPnl >= 0 ? '+' : '-'}${Math.abs(displayPnl).toFixed(2)}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  )
}

function NewsSentimentCard({ item }: { item: FeedItem }) {
  const p = item.payload ?? {}
  const headline: string = p.headline ?? item.content
  const sentiment: 'bullish' | 'bearish' | 'neutral' = p.sentiment ?? 'neutral'
  const markets: string[] = p.markets ?? []
  const source: string | null = p.source ?? null
  const sentimentColor = sentiment === 'bullish' ? Colors.accentGreen : sentiment === 'bearish' ? Colors.accentRed : Colors.textSecondary
  const sentimentBg = sentiment === 'bullish' ? 'rgba(45,212,191,0.12)' : sentiment === 'bearish' ? 'rgba(239,68,68,0.10)' : 'rgba(255,255,255,0.05)'
  const sentimentLabel = sentiment === 'bullish' ? 'Bullish' : sentiment === 'bearish' ? 'Bearish' : 'Neutral'

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => openFeedItem(item)}
      style={styles.card}
    >
      <View style={styles.cardTopRow}>
        <View style={styles.agentRow}>
          <AgentAvatar name={item.agentName} />
          <View style={{ gap: 2 }}>
            <Text style={styles.agentName}>{item.agentName}</Text>
            <Text style={styles.feedMetaText}>{sourceLabel(item.source)}{source ? ` · ${source}` : ''}</Text>
          </View>
        </View>
        <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>
      </View>

      <Text style={styles.newsHeadline}>
        {headline}
      </Text>

      <View style={styles.newsMetaRow}>
        <View style={[styles.tradeBadge, { backgroundColor: sentimentBg }]}>
          <Text style={[styles.tradeBadgeText, { color: sentimentColor }]}>{sentimentLabel}</Text>
        </View>
        {markets.map((m) => (
          <View key={m} style={[styles.tradeBadge, styles.newsTickerBadge]}>
            <Text style={[styles.tradeBadgeText, { color: Colors.textSecondary }]}>{m}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.cardTypeRow, styles.newsFooterRow]}>
        <Text style={[styles.cardTypeText, styles.cardTypeNews]}>◆ News Sentiment</Text>
        <Text style={styles.cardChevron}>›</Text>
      </View>
    </TouchableOpacity>
  )
}

function renderCard(item: FeedItem, onShare: (item: FeedItem) => void, agentSnapshots?: Record<string, FeedAgentSnapshot>) {
  const normalizedName = normalizeAgentKey(item.agentName)
  const normalizedSlug = normalizeAgentKey(slugifyName(item.agentName))
  const handleKey = buildAgentHandleKey(item.payload?.owner_username, item.agentName)
  const resolvedAgentSnapshot =
    agentSnapshots?.[item.agent_id] ??
    agentSnapshots?.[handleKey] ??
    agentSnapshots?.[normalizedName] ??
    agentSnapshots?.[normalizedSlug]

  if (item.cardType === 'pnl' && item.pnl != null) return <PnLCard item={item} onShare={() => onShare(item)} />
  if (item.cardType === 'trade') return <TradeCard item={item} agentSnapshot={resolvedAgentSnapshot ?? null} />
  if (item.cardType === 'news') return <NewsSentimentCard item={item} />
  return <UpdateCard item={item} />
}

// ── Empty states ───────────────────────────────────────────────────────────────

function EmptyFollowing() {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>◎</Text>
      <Text style={styles.emptyTitle}>No one here yet</Text>
      <Text style={styles.emptySubtitle}>Follow traders or track specific slugs to see performance updates in your feed.</Text>
      <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/search' as any)}>
        <Text style={styles.emptyBtnText}>Find People & Slugs</Text>
      </TouchableOpacity>
    </View>
  )
}

function EmptyPosts() {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>◎</Text>
      <Text style={styles.emptyTitle}>Feed is quiet</Text>
      <Text style={styles.emptySubtitle}>The people and slugs you follow have not shared any public updates yet.</Text>
    </View>
  )
}

// ── PnL Sharing Prompt ────────────────────────────────────────────────────────

function PnlSharingPrompt({
  visible,
  onSelect,
}: {
  visible: boolean
  onSelect: (pref: 'auto' | 'manual' | 'private') => void
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => onSelect('private')}
    >
      <View style={styles.promptContainer}>
        <View style={styles.promptHandle} />

        <View style={styles.promptHeader}>
          <Text style={styles.promptTitle}>Share your PnL?</Text>
          <Text style={styles.promptSubtitle}>
            Let your followers see how your agents are performing.
          </Text>
        </View>

        <View style={styles.promptOptions}>
          {/* Auto share */}
          <TouchableOpacity style={styles.optionCard} onPress={() => onSelect('auto')} activeOpacity={0.8}>
            <View style={[styles.optionIcon, { backgroundColor: 'rgba(0,200,150,0.12)' }]}>
              <Ionicons name="flash" size={20} color={Colors.accentGreen} />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Share All Agents</Text>
              <Text style={styles.optionDesc}>Automatically post live PnL for all your agents. Followers see updates as they happen.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* Manual share */}
          <TouchableOpacity style={styles.optionCard} onPress={() => onSelect('manual')} activeOpacity={0.8}>
            <View style={[styles.optionIcon, { backgroundColor: 'rgba(99,102,241,0.12)' }]}>
              <Ionicons name="send" size={20} color="#818cf8" />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Post Manually</Text>
              <Text style={styles.optionDesc}>You control what gets shared. Tap "Post PnL" whenever you want to show off a win (or a lesson).</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* Keep private */}
          <TouchableOpacity style={[styles.optionCard, styles.optionCardMuted]} onPress={() => onSelect('private')} activeOpacity={0.8}>
            <View style={[styles.optionIcon, { backgroundColor: 'rgba(255,255,255,0.04)' }]}>
              <Ionicons name="lock-closed" size={20} color={Colors.textMuted} />
            </View>
            <View style={styles.optionText}>
              <Text style={[styles.optionTitle, { color: Colors.textMuted }]}>Keep Private</Text>
              <Text style={styles.optionDesc}>Only you can see your PnL. You can change this anytime in settings.</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

// ── Post PnL Modal ────────────────────────────────────────────────────────────

function PostPnlModal({
  visible,
  agents,
  onClose,
  onPost,
}: {
  visible: boolean
  agents: any[]
  onClose: () => void
  onPost: (agent: any) => void
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.promptContainer}>
        <View style={styles.promptHandle} />
        <View style={styles.promptHeader}>
          <Text style={styles.promptTitle}>Post PnL</Text>
          <Text style={styles.promptSubtitle}>Choose an agent to share with your followers.</Text>
        </View>

        {agents.length === 0 ? (
          <View style={styles.noAgentsPnl}>
            <Text style={styles.noAgentsPnlText}>No agents with live PnL data right now.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.agentList}>
            {agents.map((a) => {
              const unrealized: number = a.live_state?.unrealizedPnlUsd ?? 0
              const isPos = unrealized >= 0
              return (
                <TouchableOpacity key={a.id} style={styles.agentPostRow} onPress={() => onPost(a)} activeOpacity={0.8}>
                  <View style={styles.agentPostLeft}>
                    <View style={[styles.agentPostAvatar, { backgroundColor: agentColor(a.name) + '22', borderColor: agentColor(a.name) }]}>
                      <Text style={[styles.avatarText, { color: agentColor(a.name) }]}>{a.name[0].toUpperCase()}</Text>
                    </View>
                    <View>
                      <Text style={styles.agentPostName}>{a.name}</Text>
                      <Text style={styles.agentPostLabel}>Unrealized PnL</Text>
                    </View>
                  </View>
                  <Text style={[styles.agentPostPnl, { color: isPos ? Colors.accentGreen : Colors.accentRed }]}>
                    {isPos ? '+$' : '-$'}{Math.abs(unrealized).toFixed(2)}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        )}

        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function FeedScreen() {
  const isDesktopWeb = useDesktopWebLayout()
  const { user, walletAddress, walletProvider } = useAuthStore()
  const leaderboardIntroOpacity = useRef(new Animated.Value(0)).current
  const [followingUids, setFollowingUids] = useState<string[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [usernameMap, setUsernameMap] = useState<Record<string, string>>({})
  const [trackedAgentIds, setTrackedAgentIds] = useState<string[]>([])
  const [trackedAgentDocs, setTrackedAgentDocs] = useState<any[]>([])
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [followingFeed, setFollowingFeed] = useState<FeedItem[]>([])
  const [trackedFeed, setTrackedFeed] = useState<FeedItem[]>([])
  const [userAgents, setUserAgents] = useState<any[]>([])
  const [ownedAgents, setOwnedAgents] = useState<any[]>([])
  const [feedAgentSnapshots, setFeedAgentSnapshots] = useState<Record<string, FeedAgentSnapshot>>({})
  const [newsFeed, setNewsFeed] = useState<FeedItem[]>([])
  const [myAgentsFeed, setMyAgentsFeed] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sharingPref, setSharingPref] = useState<SharingPref>(undefined as any)
  const [showSharingPrompt, setShowSharingPrompt] = useState(false)
  const [showPostModal, setShowPostModal] = useState(false)
  const [posting, setPosting] = useState(false)
  const [feedFilter, setFeedFilter] = useState<'all' | 'mine' | 'following' | 'tracked' | 'news'>('all')
  const [shareItem, setShareItem] = useState<FeedItem | null>(null)

  // Load sharing pref once
  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    getPnlSharingPref(user.uid).then((pref) => {
      setSharingPref(pref)
      // Show prompt if: pref never set AND user has agents with live data
      if (pref === null) {
        // Will check again after agents load
      }
    })
  }, [user?.uid])

  // Subscribe to following list
  useEffect(() => {
    if (!user) return
    return subscribeToFollowing(user.uid, (ids) => {
      setFollowingUids(ids)
    })
  }, [user?.uid])

  useEffect(() => {
    if (!user || followingUids.length === 0) {
      setLeaderboard([])
      return
    }
    return subscribeToFollowingLeaderboard(followingUids, (rows) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
      setLeaderboard(rows)
    })
  }, [user?.uid, followingUids.join(',')])

  useEffect(() => {
    Animated.timing(leaderboardIntroOpacity, {
      toValue: leaderboard.length > 0 ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start()
  }, [leaderboard.length, leaderboardIntroOpacity])

  useEffect(() => {
    if (!user) return
    return subscribeToTrackedAgents(user.uid, (ids) => {
      setTrackedAgentIds(ids)
    })
  }, [user?.uid])

  useEffect(() => {
    if (trackedAgentIds.length === 0) { setTrackedAgentDocs([]); return }
    return subscribeToTrackedAgentDocs(trackedAgentIds, setTrackedAgentDocs)
  }, [trackedAgentIds.join(',')])

  // Subscribe to followed users' public feed
  useEffect(() => {
    if (!user) return
    if (followingUids.length === 0) {
      setFollowingFeed([])
      return
    }
    const nameMap = new Map(trackedAgentDocs.map((a) => [a.id, a.name]))
    const trackedSet = new Set(trackedAgentIds)
    const unsub = subscribeToPublicFeed(followingUids, (events) => {
      // Skip events from agents already shown in the TRACKING section
      const filtered = events.filter((e) => !trackedSet.has(String(e.agent_id ?? '')))
      setFollowingFeed(filtered.map((e) => toFeedItem(e, nameMap, 'following')))
    })
    return unsub
  }, [user?.uid, followingUids.join(','), trackedAgentIds.join(',')])

  useEffect(() => {
    const ids = Array.from(new Set([...followingFeed, ...trackedFeed, ...myAgentsFeed]
      .map((item) => item.user_id)
      .filter(Boolean)))
    if (ids.length === 0) return
    void batchGetUsernames(ids).then((map) => {
      setUsernameMap((prev) => ({ ...prev, ...map }))
    })
  }, [followingFeed, trackedFeed, myAgentsFeed])

  useEffect(() => {
    const agentIds = Array.from(new Set(
      [...followingFeed, ...trackedFeed, ...myAgentsFeed]
        .filter((item) => item.cardType === 'trade')
        .map((item) => item.agent_id)
        .filter(Boolean)
    ))

    if (agentIds.length === 0) {
      setFeedAgentSnapshots({})
      return
    }

    let active = true
    void fetchAgentsByIds(agentIds).then((rows) => {
      if (!active) return
      const next: Record<string, FeedAgentSnapshot> = {}

      ;[...ownedAgents, ...userAgents, ...trackedAgentDocs].forEach((row) => {
        if (!row?.id) return
        next[row.id] = row
        const normalizedName = normalizeAgentKey(row.name)
        const normalizedSlug = normalizeAgentKey(slugifyName(row.name ?? ''))
        const handleKey = buildAgentHandleKey(row.owner_username, row.name)
        if (normalizedName) next[normalizedName] = row
        if (normalizedSlug) next[normalizedSlug] = row
        if (handleKey) next[handleKey] = row
      })

      rows.forEach((row) => {
        next[row.id] = row
        const normalizedName = normalizeAgentKey(row.name)
        const normalizedSlug = normalizeAgentKey(slugifyName(row.name ?? ''))
        const handleKey = buildAgentHandleKey(row.owner_username, row.name)
        if (normalizedName) next[normalizedName] = row
        if (normalizedSlug) next[normalizedSlug] = row
        if (handleKey) next[handleKey] = row
      })
      setFeedAgentSnapshots(next)
    }).catch(() => {
      if (!active) return
      const fallback: Record<string, FeedAgentSnapshot> = {}
      ;[...ownedAgents, ...userAgents, ...trackedAgentDocs].forEach((row) => {
        if (!row?.id) return
        fallback[row.id] = row
        const normalizedName = normalizeAgentKey(row.name)
        const normalizedSlug = normalizeAgentKey(slugifyName(row.name ?? ''))
        const handleKey = buildAgentHandleKey(row.owner_username, row.name)
        if (normalizedName) fallback[normalizedName] = row
        if (normalizedSlug) fallback[normalizedSlug] = row
        if (handleKey) fallback[handleKey] = row
      })
      setFeedAgentSnapshots(fallback)
    })

    return () => {
      active = false
    }
  }, [followingFeed, trackedFeed, myAgentsFeed, ownedAgents, userAgents, trackedAgentDocs])

  useEffect(() => {
    if (!user) return
    if (trackedAgentIds.length === 0) {
      setTrackedFeed([])
      return
    }
    const nameMap = new Map(trackedAgentDocs.map((a) => [a.id, a.name]))
    const unsub = subscribeToTrackedAgentFeed(trackedAgentIds, (events) => {
      setTrackedFeed(events.map((e) => toFeedItem(e, nameMap, 'tracked')))
    })
    return unsub
  }, [user?.uid, trackedAgentIds.join(','), trackedAgentDocs])

  // Subscribe to the user's own public feed events from all owned agents.
  useEffect(() => {
    if (!user) return
    const nameMap = new Map(userAgents.map((a) => [a.id, a.name]))
    return subscribeToMyFeed(user.uid, (events) => {
      setMyAgentsFeed(events.map((e) => toFeedItem(e, nameMap, 'mine')))
    })
  }, [user?.uid, userAgents.map((a) => a.id).join(',')])

  useEffect(() => {
    const seen = new Set<string>()
    const merged = [...followingFeed, ...trackedFeed, ...myAgentsFeed, ...newsFeed]
      .filter((item) => { if (seen.has(item.id)) return false; seen.add(item.id); return true })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    setFeedItems(merged)
    setLoading(false)
  }, [followingFeed, trackedFeed, myAgentsFeed, newsFeed])

  // Subscribe to user's own agents with live PnL (for posting + prompt trigger)
  useEffect(() => {
    if (!user) return
    return subscribeToUserAgentsPnl(user.uid, (agents) => {
      setUserAgents(agents)
      // Show prompt once if pref unset and they have live data
      setSharingPref((prev) => {
        if (prev === null && agents.length > 0) {
          setShowSharingPrompt(true)
        }
        return prev
      })
    })
  }, [user?.uid])

  useEffect(() => {
    if (!user) return
    return subscribeToUserAgents(user.uid, setOwnedAgents)
  }, [user?.uid])

  // Subscribe to market news if user has any agent with news_sentiment skill
  useEffect(() => {
    if (!user) return
    const hasNewsSentiment = userAgents.some((a) =>
      (a.skills ?? a.metadata?.skills ?? []).includes('news_sentiment') ||
      (a.strategy ?? a.metadata?.strategy ?? '') === 'News Sentiment' ||
      (a.agent_type ?? a.metadata?.agent_type ?? '') === 'news_sentiment'
    )
    if (!hasNewsSentiment) { setNewsFeed([]); return }

    // Collect all coins the user's agents trade
    const coins = Array.from(new Set(
      userAgents.flatMap((a) => {
        const sym: string = a.coin ?? a.metadata?.coin ?? a.live_state?.coin ?? ''
        return sym ? [sym.toUpperCase()] : ['BTC']
      })
    ))

    return subscribeToMarketNews(coins, (events) => {
      setNewsFeed(events.map((e) => ({
        id: e.id,
        agent_id: 'market_news',
        user_id: 'system',
        agentName: e.source ?? 'Market News',
        content: e.headline,
        created_at: e.created_at,
        cardType: 'news' as CardType,
        payload: e,
        source: 'news' as const,
      })))
    })
  }, [user?.uid, userAgents.map(a => a.id).join(',')])

  async function handleSharingPrefSelect(pref: 'auto' | 'manual' | 'private') {
    if (!user) return
    setShowSharingPrompt(false)
    setSharingPref(pref)
    await setPnlSharingPref(user.uid, pref)
  }

  async function handlePostPnl(agent: any) {
    if (!user || posting) return
    setPosting(true)
    setShowPostModal(false)
    try {
      await publishAgentPnl(
        user.uid,
        agent.id,
        agent.name,
        agent.live_state?.unrealizedPnlUsd ?? 0,
        agent.live_state?.dailyPnlUsd ?? null,
      )
    } catch (e) {
      console.warn('[feed] post pnl error', e)
    }
    setPosting(false)
  }

  const showPostBtn = sharingPref === 'manual' && userAgents.length > 0
  const filteredFeedItems = useMemo(() => {
    if (feedFilter === 'all') {
      return feedItems.filter((item) => item.cardType !== 'update')
    }
    return feedItems.filter((item) => getFilterGroup(item) === feedFilter)
  }, [feedFilter, feedItems])
  const decoratedFeedItems = useMemo(
    () => filteredFeedItems.map((item) => ({
      ...item,
      payload: {
        ...(item.payload ?? {}),
        owner_username: item.payload?.owner_username ?? usernameMap[item.user_id] ?? null,
      },
    })),
    [filteredFeedItems, usernameMap]
  )
  const trackedActivityAgentIds = useMemo(
    () => new Set(trackedFeed.map((item) => item.agent_id)),
    [trackedFeed]
  )
  const silentTrackedAgents = useMemo(
    () => trackedAgentDocs.filter((agent) => !trackedActivityAgentIds.has(agent.id)),
    [trackedAgentDocs, trackedActivityAgentIds]
  )

  const shareTrade = shareItem ? toShareTrade(shareItem) : null
  const portfolioPnl = useMemo(
    () => userAgents.reduce((sum, agent) => sum + Number(agent.live_state?.unrealizedPnlUsd ?? 0), 0),
    [userAgents]
  )
  const portfolioDailyPnl = useMemo(
    () => userAgents.reduce((sum, agent) => sum + Number(agent.live_state?.dailyPnlUsd ?? 0), 0),
    [userAgents]
  )
  const portfolioPnlPositive = portfolioPnl >= 0
  const portfolioDailyPositive = portfolioDailyPnl >= 0
  const liveAgentCount = ownedAgents.filter((agent) => agent.status === 'connected').length
  const trackedCount = trackedAgentIds.length
  const newsCount = feedItems.filter((item) => getFilterGroup(item) === 'news').length
  const fundedWalletCount = ownedAgents.filter((agent) => typeof agent.wallet_address === 'string' && agent.wallet_address.length > 0).length
  const depositedBalanceUsd = useMemo(
    () => ownedAgents.reduce((sum, agent) => sum + Number(agent.live_state?.walletBalanceUsd ?? agent.live_state?.fundedUsd ?? 0), 0),
    [ownedAgents]
  )
  const hasConnectedWallet = !!walletAddress
  const filterChips: { key: typeof feedFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: feedItems.length },
    { key: 'mine', label: 'Agents', count: ownedAgents.length },
    { key: 'following', label: 'Friends', count: followingUids.length },
    { key: 'tracked', label: 'Tracked', count: trackedAgentIds.length },
    { key: 'news', label: 'News', count: newsCount },
  ]

  const feedChrome = (
    <>
      <View style={[styles.header, isDesktopWeb && styles.headerDesktop]}>
        <View>
          <Text style={styles.title}>Feed</Text>
          {isDesktopWeb ? <Text style={styles.desktopSubtitle}>Performance from the traders you follow and the specific slugs you track.</Text> : null}
        </View>
        <View style={styles.headerRight} />
      </View>

      <View style={[styles.heroSection, isDesktopWeb && styles.heroSectionDesktop]}>
        <View style={styles.heroPanel}>
          <View style={styles.heroStatusWrap}>
            <View style={styles.heroStatusRow}>
              <View style={styles.heroStatusDot} />
              <Text style={styles.heroStatusText}>{hasConnectedWallet ? 'Wallet-ready' : 'Setup wallet'}</Text>
            </View>
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>Crypto Balance</Text>
            <Text style={styles.heroValue}>
              ${depositedBalanceUsd.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
            </Text>
            <Text style={styles.heroDelta}>
              {fundedWalletCount} agent wallet{fundedWalletCount === 1 ? '' : 's'} ready
            </Text>
          </View>

          <View style={styles.heroActionsCol}>
            <TouchableOpacity
              style={styles.heroAction}
              activeOpacity={0.85}
              onPress={() => router.push((ownedAgents.length > 0 ? '/agent-wallets' : '/deploy') as any)}
            >
              <Text style={styles.heroActionText}>{ownedAgents.length > 0 ? 'Deposit' : 'Deploy agent'}</Text>
            </TouchableOpacity>
            {!hasConnectedWallet ? (
              <TouchableOpacity
                style={styles.heroSecondaryAction}
                activeOpacity={0.85}
                onPress={() => router.push('/account' as any)}
              >
                <Text style={styles.heroSecondaryActionText}>Connect wallet</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>

      {leaderboard.length > 0 ? (
        <Animated.View style={{ opacity: leaderboardIntroOpacity }}>
          <View style={[styles.leaderboardSection, isDesktopWeb && styles.leaderboardSectionDesktop]}>
            <View style={styles.sectionHeader}>
              <View style={styles.leaderboardTitleRow}>
                <Ionicons name="trophy-outline" size={16} color={Colors.textMuted} />
                <Text style={styles.sectionTitle}>Weekly Top Agents</Text>
              </View>
              <Text style={styles.leaderboardCaption}>Friends ranked by live paper performance</Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={[styles.leaderboardScroller, isDesktopWeb && styles.leaderboardScrollerDesktop]}
              contentContainerStyle={[styles.leaderboardList, isDesktopWeb && styles.leaderboardListDesktop]}
            >
              {leaderboard.map((entry, index) => (
                <View key={entry.uid} style={styles.leaderboardItem}>
                  <LeaderboardCard entry={entry} rank={index + 1} />
                </View>
              ))}
            </ScrollView>
          </View>
        </Animated.View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.filterRow, isDesktopWeb && styles.filterRowDesktop]}
      >
        {filterChips.map((chip) => (
          <TouchableOpacity
            key={chip.key}
            style={[styles.filterChip, feedFilter === chip.key && styles.filterChipActive]}
            onPress={() => setFeedFilter(chip.key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterChipText, feedFilter === chip.key && styles.filterChipTextActive]}>{chip.label}</Text>
            <Text style={[styles.filterChipCount, feedFilter === chip.key && styles.filterChipCountActive]}>{chip.count}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {!loading && (
        <View style={[styles.activityHeader, isDesktopWeb && styles.activityHeaderDesktop]}>
          <View>
            <Text style={styles.activityTitle}>
              {feedFilter === 'all'
                ? 'Live Activity'
                : feedFilter === 'mine'
                  ? 'Your Agents'
                  : feedFilter === 'following'
                    ? 'Friends'
                    : feedFilter === 'tracked'
                      ? 'Tracked Agents'
                      : 'News Flow'}
            </Text>
            <Text style={styles.activitySubtitle}>
              {feedFilter === 'news'
                ? 'Headlines and agent-posted market context in one place.'
                : 'Fast-moving updates from agents you own, follow, and track.'}
            </Text>
          </View>
        </View>
      )}
    </>
  )

  return (
    <View style={styles.container}>
      <View style={[styles.pageFrame, isDesktopWeb && styles.pageFrameDesktop]}>
        {/* Feed */}
        {loading ? null : followingUids.length === 0 && trackedAgentIds.length === 0 ? (
          <FlatList
            style={styles.feedList}
            data={[]}
            keyExtractor={(item, index) => String(index)}
            ListHeaderComponent={feedChrome}
            ListEmptyComponent={<EmptyFollowing />}
            contentContainerStyle={[styles.list, isDesktopWeb && styles.listDesktop]}
            showsVerticalScrollIndicator={false}
          />
        ) : feedFilter === 'tracked' && trackedAgentDocs.length > 0 ? (
          <FlatList
            style={styles.feedList}
            data={[
              ...silentTrackedAgents.map((agent) => ({ kind: 'tracked-agent' as const, id: `tracked-${agent.id}`, agent })),
              ...decoratedFeedItems.map((item) => ({ kind: 'feed-item' as const, id: item.id, item })),
            ]}
            keyExtractor={(entry) => entry.id}
            ListHeaderComponent={feedChrome}
            renderItem={({ item }) => (
              <View style={isDesktopWeb ? styles.desktopListItem : undefined}>
                {item.kind === 'tracked-agent'
                  ? <TrackedAgentCard agent={item.agent} />
                  : renderCard(item.item, setShareItem, feedAgentSnapshots)}
              </View>
            )}
            contentContainerStyle={[styles.list, isDesktopWeb && styles.listDesktop]}
            showsVerticalScrollIndicator={false}
          />
        ) : decoratedFeedItems.length === 0 ? (
          <FlatList
            style={styles.feedList}
            data={[]}
            keyExtractor={(item, index) => String(index)}
            ListHeaderComponent={feedChrome}
            ListEmptyComponent={<EmptyPosts />}
            contentContainerStyle={[styles.list, isDesktopWeb && styles.listDesktop]}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <FlatList
            style={styles.feedList}
            data={decoratedFeedItems}
            keyExtractor={(i) => i.id}
            ListHeaderComponent={feedChrome}
            renderItem={({ item }) => (
              <View style={isDesktopWeb ? styles.desktopListItem : undefined}>
                {renderCard(item, setShareItem, feedAgentSnapshots)}
              </View>
            )}
            contentContainerStyle={[styles.list, isDesktopWeb && styles.listDesktop]}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      {/* Modals */}
      <PnlSharingPrompt
        visible={showSharingPrompt}
        onSelect={handleSharingPrefSelect}
      />
      <PostPnlModal
        visible={showPostModal}
        agents={userAgents}
        onClose={() => setShowPostModal(false)}
        onPost={handlePostPnl}
      />
      {shareItem && shareTrade && (
        <ShareCardModal
          visible={!!shareItem}
          onClose={() => setShareItem(null)}
          agentId={shareItem.agent_id}
          agentName={shareItem.agentName}
          initialTrade={shareTrade}
        />
      )}
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  pageFrame: { flex: 1, width: '100%' },
  pageFrameDesktop: {
    alignSelf: 'center',
    maxWidth: 1080,
  },

  header: {
    paddingHorizontal: 0,
    paddingTop: 60,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  headerDesktop: {
    paddingTop: 42,
    paddingHorizontal: 0,
  },
  title: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary },
  desktopSubtitle: { fontSize: 14, color: Colors.textMuted, marginTop: 4 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  heroSection: {
    paddingHorizontal: 0,
    paddingBottom: 14,
    gap: 10,
    width: '100%',
    alignSelf: 'stretch',
  },
  heroSectionDesktop: {
    paddingHorizontal: 0,
  },
  heroPanel: {
    position: 'relative',
    backgroundColor: '#16130f',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(217,119,87,0.24)',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroStatusWrap: {
    position: 'absolute',
    top: 14,
    right: 16,
    zIndex: 2,
  },
  heroStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accentGreen,
  },
  heroStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.accentGreen,
  },
  heroCopy: {
    flex: 1,
    gap: 4,
    paddingRight: 10,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Colors.textMuted,
  },
  heroValue: {
    fontSize: 29,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.6,
  },
  heroDelta: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.accentGreen,
  },
  heroActionsCol: {
    gap: 10,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingTop: 30,
  },
  heroAction: {
    minWidth: 118,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: Colors.accentAmber,
    borderWidth: 1,
    borderColor: Colors.accentAmber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.bgPrimary,
  },
  heroSecondaryAction: {
    minWidth: 118,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(217,119,87,0.08)',
    borderWidth: 1,
    borderColor: Colors.accentAmber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSecondaryActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.accentAmber,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  leaderboardSection: {
    paddingHorizontal: 0,
    paddingBottom: 14,
    gap: 8,
  },
  leaderboardSectionDesktop: {
    paddingHorizontal: 0,
  },
  leaderboardCaption: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  leaderboardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  leaderboardScroller: {
    marginHorizontal: 0,
  },
  leaderboardScrollerDesktop: {
    marginHorizontal: 0,
  },
  leaderboardList: {
    gap: 8,
    paddingHorizontal: 0,
  },
  leaderboardListDesktop: {
    paddingHorizontal: 0,
  },
  leaderboardItem: {
    width: 278,
  },
  leaderboardCard: {
    backgroundColor: '#1a1b18',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  leaderboardCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  leaderboardAvatarWrap: {
    position: 'relative',
  },
  rankBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    minWidth: 17,
    height: 17,
    borderRadius: 8.5,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#101010',
    borderWidth: 1,
    borderColor: 'rgba(217,119,87,0.28)',
  },
  rankBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.accentAmber,
  },
  leaderboardCopy: { flex: 1, gap: 2 },
  leaderboardName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  leaderboardHandle: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  leaderboardMeta: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  leaderboardDot: {
    color: Colors.textMuted,
  },
  leaderboardInlinePnl: {
    fontWeight: '800',
  },
  leaderboardMetaMuted: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  postBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(217,119,87,0.1)',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(217,119,87,0.2)',
  },
  postBtnText: { color: Colors.accentAmber, fontSize: 13, fontWeight: '600' },
  webInlineArrow: { fontSize: 13, lineHeight: 13, fontWeight: '800' },
  filterRow: {
    paddingHorizontal: 0,
    paddingBottom: 16,
    gap: 8,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
  },
  filterRowDesktop: {
    paddingHorizontal: 0,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#1a1a18',
    borderWidth: 1,
    borderColor: '#2a2a28',
    alignSelf: 'flex-start',
  },
  filterChipActive: {
    backgroundColor: 'rgba(217,119,87,0.12)',
    borderColor: Colors.accentAmber,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  filterChipTextActive: {
    color: Colors.accentAmber,
  },
  filterChipCount: {
    minWidth: 18,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  filterChipCountActive: {
    color: Colors.accentAmber,
  },
  activityHeader: {
    paddingHorizontal: 0,
    paddingBottom: 12,
  },
  activityHeaderDesktop: {
    paddingHorizontal: 0,
  },
  activityTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  activitySubtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textMuted,
  },

  feedList: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 120, gap: 10 },
  listDesktop: { paddingHorizontal: 20, paddingBottom: 48 },
  desktopListItem: { width: '100%', alignSelf: 'stretch' },

  // Cards
  card: {
    backgroundColor: '#10100f',
    borderRadius: 18,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  agentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  agentName: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  feedMetaText: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
  timestamp: { fontSize: 11, color: Colors.textMuted },

  avatar: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 1.5, justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 14, fontWeight: '700' },

  symbolBadge: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  symbolText: { fontSize: 10, fontWeight: '700', color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  sourceBadge: {
    backgroundColor: 'rgba(217,119,87,0.08)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.accentAmber,
  },

  pnlRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  metricRow: { gap: 4 },
  metricPrimary: { lineHeight: 32 },
  metricSupport: { fontSize: 12, lineHeight: 18, color: Colors.textMuted },
  pnlDollar: { fontSize: 28, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  pnlPct: { fontSize: 16, fontWeight: '600' },

  cardContent: { fontSize: 14, color: Colors.textSecondary, lineHeight: 21 },

  // Trade card
  tradeMetaWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  tradeBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tradeBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  tradeSymbol: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  tradePrice: { fontSize: 13, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  tradePnl: { fontSize: 13, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  tradeDetails: { fontSize: 13, color: Colors.textMuted, lineHeight: 19, fontStyle: 'italic' },
  tradeFeedRow: {
    backgroundColor: '#181916',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  tradeFeedIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tradeFeedCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  tradeFeedTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 2,
  },
  tradeFeedHandle: {
    fontSize: 14,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  tradeFeedTime: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  tradeFeedBottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
  },
  tradeFeedAction: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.35,
  },
  tradeFeedSymbol: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  tradeFeedRight: {
    minWidth: 96,
    width: 96,
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 0,
  },
  tradeFeedPnl: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlign: 'right',
  },
  tradeFeedChevron: {
    fontSize: 16,
    color: Colors.textMuted,
    lineHeight: 16,
  },
  cardTypeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTypeText: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  cardTypeTracked: { color: Colors.accentGreen },
  cardTypeMuted: { color: Colors.textMuted },
  cardTypeNews: { color: '#b79667' },
  cardChevron: { fontSize: 18, color: Colors.textMuted, lineHeight: 20 },
  inlineAction: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  inlineActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  newsHeadline: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  newsSummary: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 20,
  },
  newsMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  newsTickerBadge: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  newsFooterRow: {
    paddingTop: 2,
  },

  // Empty states
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingBottom: 80 },
  emptyIcon: { fontSize: 40, color: Colors.textMuted },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textSecondary },
  emptySubtitle: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
  emptyBtn: {
    marginTop: 8,
    backgroundColor: 'rgba(217,119,87,0.1)', borderRadius: 20,
    paddingHorizontal: 24, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(217,119,87,0.25)',
  },
  emptyBtnText: { color: Colors.accentAmber, fontSize: 14, fontWeight: '600' },

  // PnL sharing prompt
  promptContainer: {
    flex: 1, backgroundColor: Colors.bgPrimary,
    paddingHorizontal: 20, paddingBottom: 40,
  },
  promptHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.bgBorder,
    alignSelf: 'center', marginTop: 12, marginBottom: 28,
  },
  promptHeader: { gap: 8, marginBottom: 28 },
  promptTitle: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary },
  promptSubtitle: { fontSize: 14, color: Colors.textMuted, lineHeight: 20 },
  promptOptions: { gap: 10 },

  optionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#0f0f0f', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.bgBorder,
  },
  optionCardMuted: { borderColor: 'transparent', backgroundColor: '#0a0a0a' },
  optionIcon: {
    width: 42, height: 42, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  optionText: { flex: 1, gap: 4 },
  optionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  optionDesc: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },

  // Post PnL modal
  agentList: { paddingVertical: 8, gap: 8 },
  agentPostRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#0f0f0f', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.bgBorder,
  },
  agentPostLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  agentPostAvatar: {
    width: 38, height: 38, borderRadius: 19, borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center',
  },
  agentPostName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  agentPostLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  agentPostPnl: { fontSize: 17, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  cancelBtn: {
    marginTop: 16,
    backgroundColor: Colors.bgElevated, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.bgBorder,
  },
  cancelBtnText: { color: Colors.textSecondary, fontSize: 15, fontWeight: '600' },
  noAgentsPnl: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  noAgentsPnlText: { fontSize: 14, color: Colors.textMuted },
})
