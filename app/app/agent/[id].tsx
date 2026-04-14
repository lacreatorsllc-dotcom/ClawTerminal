import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Image, Linking, Alert, Modal, ScrollView, Dimensions, Clipboard, Animated,
} from 'react-native'
import * as FileSystem from 'expo-file-system'
import * as MediaLibrary from 'expo-media-library'
import { ShareCardModal, type TradeData } from '../../components/share-card'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase, subscribeToAgent, sendMessage } from '../../lib/supabase'
import { useAgentsStore } from '../../stores/agentsStore'
import { useAuthStore } from '../../stores/authStore'
import { useChatStore } from '../../stores/chatStore'
import { useUIStore } from '../../stores/uiStore'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../constants/colors'
import type { Message, AgentStatus } from '../../lib/types'
import { subscribeToSlug001, subscribeToSlug001Feed, subscribeToSlug001Trades, subscribeToMessages, addMessage, subscribeToDecisions, db, type PaperAgentState } from '../../lib/firebase'
import { doc, onSnapshot as fsOnSnapshot } from 'firebase/firestore'

type Tab = 'chat' | 'trades' | 'status' | 'vitals' | 'activity' | 'skills' | 'studio'

function parsePositionsFromResponse(text: string): TradeData[] {
  const positions: TradeData[] = []

  // Try JSON array first
  try {
    const arrMatch = text.match(/\[[\s\S]*?\]/)
    if (arrMatch) {
      const arr = JSON.parse(arrMatch[0])
      if (Array.isArray(arr) && arr.length > 0 && arr[0].pnl !== undefined) return arr
    }
  } catch {}

  // Parse markdown tables — each position block is separated by ---
  const blocks = text.split(/---+/)
  for (const block of blocks) {
    const row = (label: string) => {
      const re = new RegExp(`\\|[^|]*${label}[^|]*\\|\\s*\\*?\\*?([^|*\\n]+)\\*?\\*?\\s*\\|`, 'i')
      return block.match(re)?.[1]?.trim() ?? ''
    }
    const pair = row('Asset').replace(/^[^\w]*/, '')
    const entry = row('Entry Price').replace(/[$,]/g, '')
    if (!pair && !entry) continue

    const side    = row('Side').replace(/^[^\w]*/, '').toUpperCase()
    const current = row('Current Price').replace(/[$,]/g, '')
    const pnlRaw  = row('Unrealized')
    const pnlMatch = pnlRaw.match(/([+-]?\$?[\d,.]+).*?\(([+-]?[\d.]+)%\)/)
    const pnl    = pnlMatch ? pnlMatch[1].replace(/[$,+]/g, '') : '0'
    const pnlPct = pnlMatch ? pnlMatch[2].replace(/[+]/g, '') : '0'
    const isNeg  = pnlRaw.startsWith('-')

    positions.push({
      pair,
      direction: side || 'LONG',
      leverage: '',
      pnl: isNeg ? `-${pnl}` : pnl,
      pnlPct: isNeg ? `-${pnlPct}` : pnlPct,
      entryPrice: entry,
      markPrice: current,
    })
  }

  return positions
}

interface InstalledSkill {
  id: string           // used as key
  skillId?: string     // local skills UUID → /skill/[id]
  skillSlug?: string   // ClawHub slug → /skill/clawhub/[slug]
  name: string
  description: string
  version: string
  category: string | null
}

const SLASH_COMMANDS_DEFAULT = [
  { cmd: '/help',      desc: 'Show command list' },
  { cmd: '/status',    desc: 'Agent status & health' },
  { cmd: '/agents',    desc: 'List all agents' },
  { cmd: '/positions', desc: 'Open positions with live P&L' },
  { cmd: '/summary',   desc: 'Daily trading report' },
  { cmd: '/review',    desc: 'Recent decisions' },
  { cmd: '/stats',     desc: 'Performance statistics' },
  { cmd: '/context',   desc: 'Token context data' },
  { cmd: '/query',     desc: 'Query market data for a token' },
  { cmd: '/watch',     desc: 'Watch a token live' },
  { cmd: '/catalysts', desc: 'Upcoming market events' },
  { cmd: '/entry',     desc: 'Log a trade entry' },
  { cmd: '/exit',      desc: 'Log a trade exit' },
  { cmd: '/note',      desc: 'Add a note to a token' },
  { cmd: '/pause',     desc: 'Pause the agent' },
  { cmd: '/resume',    desc: 'Resume the agent' },
  { cmd: '/soul',      desc: 'View agent soul/personality' },
  { cmd: '/whoami',    desc: 'Account info' },
  { cmd: '/decisions', desc: 'Recent trade decisions' },
]

const SLASH_COMMANDS_KODA = [
  { cmd: '/brief',         desc: 'Turn an idea into a structured brief' },
  { cmd: '/trends',        desc: 'Find trending topics in your niche' },
  { cmd: '/concept',       desc: 'Build 3 creative concepts' },
  { cmd: '/script',        desc: 'Write a punchy video script' },
  { cmd: '/art-direction', desc: 'Set palette, mood & lighting' },
  { cmd: '/storyboard',    desc: 'Map every shot with timing' },
  { cmd: '/generate',      desc: 'Generate AI images for each shot' },
  { cmd: '/assemble',      desc: 'Assemble your reel from all assets' },
  { cmd: '/publish',       desc: 'Write captions and posting strategy' },
  { cmd: '/repurpose',     desc: 'Adapt content to every platform' },
  { cmd: '/pipeline',      desc: 'Run the full creative pipeline' },
]

function getSlashCommands(agentName?: string) {
  if (agentName?.toLowerCase() === 'koda') return SLASH_COMMANDS_KODA
  return SLASH_COMMANDS_DEFAULT
}

const TRADING_AGENT_NAMES = ['blue chip', 'trading-boy', 'bluechip']

function getAgentTabs(agentName?: string): Tab[] {
  const name = agentName?.toLowerCase() ?? ''
  if (TRADING_AGENT_NAMES.some((n) => name.includes(n))) {
    return ['chat', 'trades', 'status', 'vitals', 'activity', 'skills']
  }
  if (name === 'koda') {
    return ['chat', 'studio', 'status', 'vitals', 'activity', 'skills']
  }
  return ['chat', 'status', 'vitals', 'activity', 'skills']
}

const URL_REGEX = /^https?:\/\/[^\s]+$/
const CMD_ONLY_REGEX = /^\/[a-z][a-z0-9_-]*(\s.*)?$/
const TOKEN_REGEX = /(https?:\/\/[^\s]+|`\/[a-z][a-z0-9_\s\-\[\]]*`|\/[a-z][a-z0-9_-]*|[+]\$[\d,]+\.?\d*|-\$[\d,]+\.?\d*)/g

const MessageText = memo(function MessageText({ content, outbound }: { content: string; outbound: boolean }) {
  const parts = useMemo(() => content.split(TOKEN_REGEX), [content])
  return (
    <Text style={[styles.bubbleText, outbound && styles.bubbleTextOut]}>
      {parts.map((part, i) => {
        if (URL_REGEX.test(part)) return <Text key={i} style={styles.bubbleLink} onPress={() => Linking.openURL(part)}>{part}</Text>
        if (/^`\//.test(part)) return <Text key={i} style={styles.bubbleCmd}>{part.replace(/`/g, '')}</Text>
        if (/^\/[a-z]/.test(part)) return <Text key={i} style={styles.bubbleCmd}>{part}</Text>
        if (/^\+\$/.test(part)) return <Text key={i} style={styles.bubblePnlPos}>{part}</Text>
        if (/^-\$/.test(part)) return <Text key={i} style={styles.bubblePnlNeg}>{part}</Text>
        return <Text key={i}>{part}</Text>
      })}
    </Text>
  )
})

const IMG_W = Dimensions.get('window').width * 0.65

function ImageBubble({ url }: { url: string }) {
  const [lightboxVisible, setLightboxVisible] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [imgLoading, setImgLoading] = useState(true)
  const [imgError, setImgError] = useState(false)
  const shimmer = useRef(new Animated.Value(0)).current

  useEffect(() => {
    // Prefetch so lightbox opens instantly
    Image.prefetch(url).catch(() => {})
    // Shimmer loop
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [url])

  async function handleDownload() {
    setDownloading(true)
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync()
      if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access to save images.'); return }
      const fileName = url.split('/').pop() ?? 'koda-image.png'
      const localUri = FileSystem.cacheDirectory + fileName
      await FileSystem.downloadAsync(url, localUri)
      await MediaLibrary.saveToLibraryAsync(localUri)
      Alert.alert('Saved', 'Image saved to your photo library.')
    } catch (e: any) {
      Alert.alert('Download failed', e.message)
    } finally {
      setDownloading(false)
    }
  }

  const shimmerOpacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.85] })

  return (
    <>
      <TouchableOpacity activeOpacity={imgLoading ? 1 : 0.85} onPress={() => !imgLoading && !imgError && setLightboxVisible(true)}>
        <View style={styles.bubbleImage}>
          {/* Skeleton shown while loading */}
          {(imgLoading || imgError) && (
            <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 10, backgroundColor: imgError ? Colors.bgElevated : Colors.bgSurface, opacity: imgError ? 1 : shimmerOpacity, alignItems: 'center', justifyContent: 'center' }]}>
              {imgError
                ? <Text style={{ color: Colors.textMuted, fontSize: 12 }}>Failed to load</Text>
                : <ActivityIndicator size="small" color={Colors.textMuted} />
              }
            </Animated.View>
          )}
          <Image
            source={{ uri: url }}
            style={[StyleSheet.absoluteFill, { borderRadius: 10, opacity: imgLoading || imgError ? 0 : 1 }]}
            resizeMode="cover"
            onLoadStart={() => { setImgLoading(true); setImgError(false) }}
            onLoad={() => setImgLoading(false)}
            onError={() => { setImgLoading(false); setImgError(true) }}
          />
        </View>
      </TouchableOpacity>
      <Modal visible={lightboxVisible} transparent animationType="fade" onRequestClose={() => setLightboxVisible(false)}>
        <View style={lightboxStyles.backdrop}>
          <TouchableOpacity style={lightboxStyles.close} onPress={() => setLightboxVisible(false)}>
            <Text style={lightboxStyles.closeText}>✕</Text>
          </TouchableOpacity>
          <Image source={{ uri: url }} style={lightboxStyles.fullImage} resizeMode="contain" />
          <TouchableOpacity style={lightboxStyles.downloadBtn} onPress={handleDownload} disabled={downloading}>
            {downloading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={lightboxStyles.downloadText}>↓ Save to Photos</Text>
            }
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  )
}

function VideoBubble({ url }: { url: string }) {
  return (
    <View style={videoBubbleStyles.container}>
      <View style={videoBubbleStyles.thumb}>
        <Text style={videoBubbleStyles.playIcon}>▶</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={videoBubbleStyles.label}>Video ready</Text>
        <Text style={videoBubbleStyles.url} numberOfLines={1}>{url}</Text>
      </View>
      <TouchableOpacity style={videoBubbleStyles.openBtn} onPress={() => Linking.openURL(url)} activeOpacity={0.7}>
        <Text style={videoBubbleStyles.openBtnText}>Open ↗</Text>
      </TouchableOpacity>
    </View>
  )
}

const videoBubbleStyles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10, padding: 10, marginBottom: 6,
    width: IMG_W,
  },
  thumb: {
    width: 44, height: 44, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  playIcon: { fontSize: 18, color: '#fff' },
  label: { fontSize: 13, fontWeight: '600', color: '#fff', marginBottom: 2 },
  url: { fontSize: 11, color: Colors.textMuted },
  openBtn: {
    backgroundColor: Colors.accentTeal + '22',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  openBtnText: { fontSize: 12, fontWeight: '600', color: Colors.accentTeal },
})

const SCREEN_W = Dimensions.get('window').width
const SCREEN_H = Dimensions.get('window').height

const lightboxStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  close: { position: 'absolute', top: 56, right: 20, zIndex: 10, padding: 12 },
  closeText: { color: '#fff', fontSize: 22, fontWeight: '600' },
  fullImage: { width: SCREEN_W, height: SCREEN_H - 160, },
  downloadBtn: {
    position: 'absolute', bottom: 52,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 24, paddingHorizontal: 24, paddingVertical: 12,
  },
  downloadText: { color: '#fff', fontSize: 15, fontWeight: '600' },
})

const MessageBubble = memo(function MessageBubble({ item }: { item: Message }) {
  const [pressed, setPressed] = useState(false)
  const timeStr = useMemo(
    () => new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    [item.created_at]
  )

  function handleLongPress() {
    if (item.content && item.content !== '[image]') {
      Clipboard.setString(item.content)
      setPressed(true)
      setTimeout(() => setPressed(false), 600)
    }
  }

  return (
    <TouchableOpacity
      activeOpacity={1}
      onLongPress={handleLongPress}
      style={[styles.bubble, item.direction === 'inbound' && styles.bubbleOut, pressed && styles.bubblePressed]}
    >
      {item.metadata?.video_url && <VideoBubble url={item.metadata.video_url} />}
      {item.metadata?.attachments?.map((url, i) => (
        <ImageBubble key={i} url={url} />
      ))}
      {item.content && item.content !== '[image]' && (
        <MessageText content={item.content} outbound={item.direction === 'inbound'} />
      )}
      <Text style={styles.bubbleTime}>{timeStr}</Text>
    </TouchableOpacity>
  )
})

function TypingBubble() {
  const dot1 = useRef(new Animated.Value(0.3)).current
  const dot2 = useRef(new Animated.Value(0.3)).current
  const dot3 = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    const makeDotAnim = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 280, useNativeDriver: true }),
          Animated.delay(560),
        ])
      )
    const a1 = makeDotAnim(dot1, 0)
    const a2 = makeDotAnim(dot2, 186)
    const a3 = makeDotAnim(dot3, 372)
    a1.start(); a2.start(); a3.start()
    return () => { a1.stop(); a2.stop(); a3.stop() }
  }, [])

  return (
    <View style={[styles.bubble, styles.bubbleOut, { paddingVertical: 12, paddingHorizontal: 14 }]}>
      <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
        {([dot1, dot2, dot3] as Animated.Value[]).map((dot, i) => (
          <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.textMuted, opacity: dot }} />
        ))}
      </View>
    </View>
  )
}

const MOCK_OPEN_TRADES: TradeData[] = [
  { pair: 'SOL/BTC',  direction: 'LONG',  leverage: '20X', pnl: '1245.50', pnlPct: '125.40', entryPrice: '0.00245', markPrice: '0.00552' },
  { pair: 'SOL/USDT', direction: 'LONG',  leverage: '3X',  pnl: '42.18',   pnlPct: '8.43',   entryPrice: '83.11',   markPrice: '90.27'   },
  { pair: 'ETH/USDT', direction: 'LONG',  leverage: '2X',  pnl: '-18.50',  pnlPct: '-3.21',  entryPrice: '1980.00', markPrice: '1916.40' },
  { pair: 'BTC/USDT', direction: 'SHORT', leverage: '5X',  pnl: '312.77',  pnlPct: '15.64',  entryPrice: '92400.00',markPrice: '87956.00'},
  { pair: 'BONK/SOL', direction: 'LONG',  leverage: '10X', pnl: '-7.33',   pnlPct: '-14.66', entryPrice: '0.0000182',markPrice:'0.0000155'},
]

const MOCK_CLOSED_TRADES: TradeData[] = [
  { pair: 'BTC/USDT', direction: 'LONG',  leverage: '2X',  pnl: '124.60',  pnlPct: '12.46',  entryPrice: '81200.00',markPrice: '91320.00'},
  { pair: 'SOL/USDT', direction: 'SHORT', leverage: '3X',  pnl: '-55.30',  pnlPct: '-11.06', entryPrice: '95.40',   markPrice: '106.00'  },
  { pair: 'ETH/USDT', direction: 'LONG',  leverage: '1X',  pnl: '88.00',   pnlPct: '4.40',   entryPrice: '2000.00', markPrice: '2088.00' },
  { pair: 'WIF/USDT', direction: 'LONG',  leverage: '5X',  pnl: '430.20',  pnlPct: '86.04',  entryPrice: '1.24',    markPrice: '2.31'    },
  { pair: 'JUP/USDT', direction: 'SHORT', leverage: '3X',  pnl: '-22.10',  pnlPct: '-7.37',  entryPrice: '1.50',    markPrice: '1.61'    },
  { pair: 'PYTH/USDT',direction: 'LONG',  leverage: '4X',  pnl: '67.50',   pnlPct: '16.88',  entryPrice: '0.40',    markPrice: '0.467'   },
  { pair: 'SOL/BTC',  direction: 'SHORT', leverage: '10X', pnl: '-180.00', pnlPct: '-36.00', entryPrice: '0.00480', markPrice: '0.00653' },
]

function TradeCard({ pos, onShare }: { pos: TradeData; onShare: () => void }) {
  const isPos = !pos.pnl.startsWith('-')
  const pnlColor = isPos ? Colors.accentGreen : Colors.accentRed
  return (
    <View style={tradeCardStyles.card}>
      <View style={tradeCardStyles.top}>
        <View style={tradeCardStyles.pairRow}>
          <Text style={tradeCardStyles.pair}>{pos.pair}</Text>
          <View style={[tradeCardStyles.dirBadge, { backgroundColor: pos.direction === 'LONG' ? 'rgba(0,200,150,0.12)' : 'rgba(239,68,68,0.12)' }]}>
            <Text style={[tradeCardStyles.dirText, { color: pos.direction === 'LONG' ? Colors.accentGreen : Colors.accentRed }]}>{pos.direction}</Text>
          </View>
          {pos.leverage ? (
            <View style={tradeCardStyles.leverageBadge}>
              <Text style={tradeCardStyles.leverageText}>{pos.leverage}</Text>
            </View>
          ) : null}
        </View>
        <TouchableOpacity style={tradeCardStyles.shareBtn} onPress={onShare} activeOpacity={0.7}>
          <Text style={tradeCardStyles.shareBtnText}>Share</Text>
        </TouchableOpacity>
      </View>
      <Text style={[tradeCardStyles.pnl, { color: pnlColor }]}>
        {isPos ? '+' : ''}${Math.abs(parseFloat(pos.pnl)).toFixed(2)}
        {'  '}
        <Text style={[tradeCardStyles.pnlPct, { color: pnlColor }]}>({isPos ? '+' : ''}{pos.pnlPct}%)</Text>
      </Text>
      <View style={tradeCardStyles.priceRow}>
        {pos.entryPrice ? <Text style={tradeCardStyles.priceLabel}>Entry <Text style={tradeCardStyles.priceVal}>${pos.entryPrice}</Text></Text> : null}
        {pos.markPrice ? <Text style={tradeCardStyles.priceLabel}>Mark <Text style={tradeCardStyles.priceVal}>${pos.markPrice}</Text></Text> : null}
      </View>
    </View>
  )
}

const tradeCardStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgElevated,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  pairRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pair: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  dirBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  dirText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  leverageBadge: { backgroundColor: 'rgba(167,139,250,0.12)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  leverageText: { fontSize: 11, fontWeight: '700', color: '#a78bfa' },
  shareBtn: { backgroundColor: Colors.bgSurface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: Colors.bgBorder },
  shareBtnText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  pnl: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  pnlPct: { fontSize: 15, fontWeight: '600' },
  priceRow: { flexDirection: 'row', gap: 16 },
  priceLabel: { fontSize: 12, color: Colors.textMuted },
  priceVal: { color: Colors.textSecondary, fontWeight: '600' },
})

// ─── Studio Tab ──────────────────────────────────────────────────────────────

type WorkItem = { type: string; preview: string; timestamp: string; full: string }

const WORK_TYPES: { label: string; pattern: RegExp; color: string }[] = [
  { label: 'Brief',         pattern: /^BRIEF\s*\n---/m,          color: '#a855f7' },
  { label: 'Script',        pattern: /^BLOCK 1 — HOOK/m,         color: '#ff453a' },
  { label: 'Concept',       pattern: /^CONCEPT [ABC]\n---/m,      color: '#6a9bcc' },
  { label: 'Art Direction', pattern: /^ART DIRECTION\n---/m,      color: '#d97757' },
  { label: 'Storyboard',    pattern: /^SHOT DECK\n---/m,          color: '#00c896' },
  { label: 'Trend',         pattern: /^TREND #1\n---/m,           color: '#fbbf24' },
  { label: 'Publish',       pattern: /^PUBLISH\n---/m,            color: '#ff6b6b' },
  { label: 'Repurpose',     pattern: /^REPURPOSE\n---/m,          color: '#34d399' },
]

function parseWorkItems(messages: Message[]): WorkItem[] {
  const items: WorkItem[] = []
  for (const msg of messages) {
    if (msg.direction !== 'outbound') continue
    const text = msg.content
    for (const wt of WORK_TYPES) {
      if (wt.pattern.test(text)) {
        const lines = text.split('\n').filter(Boolean)
        const preview = lines.slice(0, 3).join(' ').slice(0, 120)
        items.push({ type: wt.label, preview, timestamp: msg.created_at, full: text })
        break
      }
    }
  }
  return items.reverse()
}

function StudioTab({ messages, notionUrl }: { messages: Message[]; notionUrl?: string }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const workItems = useMemo(() => parseWorkItems(messages), [messages])

  const grouped = useMemo(() => {
    const map: Record<string, WorkItem[]> = {}
    for (const item of workItems) {
      if (!map[item.type]) map[item.type] = []
      map[item.type].push(item)
    }
    return map
  }, [workItems])

  const typeColor = (type: string) => WORK_TYPES.find((w) => w.label === type)?.color ?? Colors.textMuted

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {/* Notion link */}
      <TouchableOpacity
        style={studioStyles.notionBtn}
        onPress={() => notionUrl ? Linking.openURL(notionUrl) : null}
        activeOpacity={notionUrl ? 0.7 : 1}
      >
        <View style={studioStyles.notionIcon}>
          <Text style={studioStyles.notionIconText}>N</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={studioStyles.notionLabel}>Notion Workspace</Text>
          <Text style={studioStyles.notionSub} numberOfLines={1}>
            {notionUrl ?? 'Set notion_url in agent metadata to link'}
          </Text>
        </View>
        {notionUrl && <Text style={studioStyles.notionArrow}>↗</Text>}
      </TouchableOpacity>

      {workItems.length === 0 ? (
        <View style={{ alignItems: 'center', marginTop: 48 }}>
          <Text style={{ color: Colors.textMuted, fontSize: 14 }}>No work yet — run /brief to start your first project</Text>
        </View>
      ) : (
        Object.entries(grouped).map(([type, items]) => (
          <View key={type} style={{ marginBottom: 24 }}>
            <View style={studioStyles.sectionHeader}>
              <View style={[studioStyles.typeDot, { backgroundColor: typeColor(type) }]} />
              <Text style={studioStyles.sectionTitle}>{type.toUpperCase()}</Text>
              <Text style={studioStyles.sectionCount}>{items.length}</Text>
            </View>
            {items.map((item, i) => {
              const key = `${type}-${i}`
              const isOpen = expanded === key
              return (
                <TouchableOpacity
                  key={key}
                  style={studioStyles.workCard}
                  activeOpacity={0.75}
                  onPress={() => setExpanded(isOpen ? null : key)}
                >
                  <View style={studioStyles.workCardTop}>
                    <View style={[studioStyles.workTypeBadge, { backgroundColor: typeColor(type) + '22' }]}>
                      <Text style={[studioStyles.workTypeBadgeText, { color: typeColor(type) }]}>{item.type}</Text>
                    </View>
                    <Text style={studioStyles.workTime}>
                      {new Date(item.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                  <Text style={studioStyles.workPreview} numberOfLines={isOpen ? undefined : 3}>
                    {isOpen ? item.full : item.preview}
                  </Text>
                  <Text style={studioStyles.workExpand}>{isOpen ? 'Show less' : 'Show more'}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        ))
      )}
    </ScrollView>
  )
}

const studioStyles = StyleSheet.create({
  notionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bgSurface,
    borderRadius: 12, padding: 14, marginBottom: 24,
    borderWidth: 1, borderColor: Colors.bgBorder,
  },
  notionIcon: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  notionIconText: { fontSize: 18, fontWeight: '700', color: '#000' },
  notionLabel: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  notionSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  notionArrow: { fontSize: 18, color: Colors.textMuted },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, justifyContent: 'space-between' },
  typeDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1 },
  sectionCount: { fontSize: 11, color: Colors.textMuted },
  workCard: {
    backgroundColor: Colors.bgSurface, borderRadius: 12,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.bgBorder,
  },
  workCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  workTypeBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  workTypeBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  workTime: { fontSize: 11, color: Colors.textMuted },
  workPreview: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  workExpand: { fontSize: 12, color: Colors.accentTeal, marginTop: 8 },
})

const DEFAULT_OR_MODELS = [
  { id: 'openai/gpt-4o',                       name: 'GPT-4o' },
  { id: 'openai/gpt-4o-mini',                  name: 'GPT-4o Mini' },
  { id: 'anthropic/claude-sonnet-4-6',         name: 'Claude Sonnet 4.6' },
  { id: 'anthropic/claude-haiku-4-5',          name: 'Claude Haiku 4.5' },
  { id: 'anthropic/claude-opus-4-6',           name: 'Claude Opus 4.6' },
  { id: 'google/gemini-pro-1.5',               name: 'Gemini Pro 1.5' },
  { id: 'meta-llama/llama-3.1-70b-instruct',   name: 'Llama 3.1 70B' },
  { id: 'mistralai/mistral-large',             name: 'Mistral Large' },
  { id: 'deepseek/deepseek-chat',              name: 'DeepSeek Chat' },
  { id: 'x-ai/grok-2',                        name: 'Grok 2' },
]

const STATUS_COLOR: Record<AgentStatus, string> = {
  connected: Colors.accentGreen,
  connecting: Colors.accentTeal,
  stale: Colors.accentAmber,
  error: Colors.accentRed,
  disconnected: Colors.textSecondary,
}

// ── Slug #001 Profile Screen ──────────────────────────────────────────────────

const SLUG001_STATUS: Record<string, { color: string; label: string }> = {
  active:     { color: Colors.accentGreen, label: 'Active' },
  paused:     { color: Colors.accentAmber, label: 'Paused' },
  cooldown:   { color: Colors.accentTeal,  label: 'Cooldown' },
  'no-trade': { color: Colors.textMuted,   label: 'No Trade' },
}

function Sparkline({ history }: { history: number[] }) {
  if (!history || history.length < 2) return null
  const W = 200, H = 48
  const min = Math.min(...history), max = Math.max(...history)
  const range = max - min || 1
  const pts = history.map((v, i) => {
    const x = (i / (history.length - 1)) * W
    const y = H - ((v - min) / range) * H
    return `${x},${y}`
  }).join(' ')
  const isPositive = history[history.length - 1] >= history[0]
  const color = isPositive ? Colors.accentGreen : Colors.accentRed
  return (
    <View style={s001.sparklineWrap}>
      {/* SVG-style polyline via absolute positioned views — React Native has no SVG built-in */}
      <View style={[s001.sparklineLine, { width: W, height: H }]}>
        {history.map((v, i) => {
          if (i === 0) return null
          const prev = history[i - 1]
          const x1 = ((i - 1) / (history.length - 1)) * W
          const y1 = H - ((prev - min) / range) * (H - 8) - 4
          const x2 = (i / (history.length - 1)) * W
          const y2 = H - ((v - min) / range) * (H - 8) - 4
          const dx = x2 - x1, dy = y2 - y1
          const len = Math.sqrt(dx * dx + dy * dy)
          const angle = Math.atan2(dy, dx) * (180 / Math.PI)
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: x1,
                top: y1,
                width: len,
                height: 1.5,
                backgroundColor: color,
                opacity: 0.7,
                transform: [{ rotate: `${angle}deg` }],
                transformOrigin: '0 50%',
              }}
            />
          )
        })}
      </View>
    </View>
  )
}

function formatTime001(ts: string): string {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ── TradingBoyScreen ──────────────────────────────────────────────────────────

type TbTab = 'chat' | 'status' | 'activity'

const TB_SLASH_COMMANDS = [
  { cmd: '/help',               desc: 'Show available commands' },
  { cmd: '/status',             desc: 'Agent status & health' },
  { cmd: '/agents',             desc: 'All active agents' },
  { cmd: '/positions',          desc: 'Open positions with live P&L' },
  { cmd: '/decisions',          desc: 'Recent trade decisions' },
  { cmd: '/pnl',                desc: 'Daily profit & loss' },
  { cmd: '/summary',            desc: 'Daily activity summary' },
  { cmd: '/analyze-slug001',    desc: 'AI analysis of the Range Farmer' },
  { cmd: '/pause',              desc: 'Pause the agent' },
  { cmd: '/resume',             desc: 'Resume the agent' },
  { cmd: '/override',           desc: 'Send instruction to agent' },
]

function TradingBoyScreen({ agentId }: { agentId: string }) {
  const [activeTab, setActiveTab] = useState<TbTab>('chat')
  const [messages, setMessages] = useState<any[]>([])
  const [agentDoc, setAgentDoc] = useState<any>(null)
  const [decisions, setDecisions] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [cmdPickerVisible, setCmdPickerVisible] = useState(false)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const { user } = useAuthStore()
  const flatRef = useRef<any>(null)

  useEffect(() => subscribeToMessages(agentId, setMessages), [agentId])
  useEffect(() => subscribeToDecisions(agentId, setDecisions), [agentId])
  useEffect(() => {
    const unsub = fsOnSnapshot(doc(db, 'agents', agentId), (snap) => {
      if (snap.exists()) setAgentDoc(snap.data())
    })
    return unsub
  }, [agentId])

  async function sendChat() {
    const text = input.trim()
    if (!text || !user) return
    setInput('')
    await addMessage(agentId, {
      agent_id: agentId,
      user_id: user.uid ?? (user as any).id,
      direction: 'inbound',
      content: text,
    })
  }

  async function sendControl(cmd: '/pause' | '/resume') {
    if (!user) return
    await addMessage(agentId, {
      agent_id: agentId,
      user_id: user.uid ?? (user as any).id,
      direction: 'inbound',
      content: cmd,
    })
  }

  const reversed = [...messages].reverse()
  const isConnected = agentDoc?.status === 'connected'
  const isPaused = agentDoc?.live_admin?.paused === true
  const agentName = agentDoc?.name ?? 'Agent'

  function decisionColor(actionType: string): string {
    if (actionType === 'BUY' || actionType?.includes('BUY')) return Colors.accentGreen
    if (actionType === 'SELL' || actionType?.includes('SELL')) return Colors.accentRed
    return Colors.textMuted
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0e0e0c' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={tb.header}>
        <TouchableOpacity onPress={() => router.back()} style={tb.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={tb.headerTitle}>{agentName}</Text>
            <View style={[tb.statusDot, { backgroundColor: isConnected ? Colors.accentGreen : Colors.accentRed }]} />
          </View>
          <Text style={{ color: Colors.textMuted, fontSize: 12, marginTop: 1 }}>by Cabal Ventures</Text>
        </View>
        <TouchableOpacity
          style={tb.controlBtn}
          onPress={() => sendControl(isPaused ? '/resume' : '/pause')}
        >
          <Ionicons name={isPaused ? 'play' : 'pause'} size={16} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={tb.tabBar}>
        {(['chat', 'status', 'activity'] as TbTab[]).map((t) => (
          <TouchableOpacity key={t} style={tb.tabBtn} onPress={() => setActiveTab(t)}>
            <Text style={[tb.tabText, activeTab === t && tb.tabTextActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
            {activeTab === t && <View style={tb.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Chat tab */}
      {activeTab === 'chat' && (
        <>
          <View style={{ flex: 1 }}>
            <FlatList
              ref={flatRef}
              data={reversed}
              keyExtractor={(item) => item.id ?? String(item.created_at)}
              inverted
              contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
              onScroll={(e) => setShowScrollBtn(e.nativeEvent.contentOffset.y > 80)}
              scrollEventThrottle={100}
              renderItem={({ item }) => {
                const isUser = item.direction === 'inbound'
                const isAlert = item.alert === true
                return (
                  <View style={{ alignItems: isUser ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                    <View style={{
                      backgroundColor: isUser ? Colors.accentAmber : isAlert ? '#1a1500' : '#1a1a1a',
                      borderRadius: 14,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      maxWidth: '88%',
                      borderWidth: isAlert ? 1 : 0,
                      borderColor: isAlert ? Colors.accentAmber : 'transparent',
                    }}>
                      <Text style={{ color: isUser ? '#000' : Colors.textPrimary, fontSize: 15, lineHeight: 21 }}>
                        {item.content}
                      </Text>
                    </View>
                    <Text style={{ color: Colors.textMuted, fontSize: 11, marginTop: 3, marginHorizontal: 4 }}>
                      {item.created_at ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </Text>
                  </View>
                )
              }}
            />
            {showScrollBtn && (
              <TouchableOpacity
                style={{
                  position: 'absolute', bottom: 12, alignSelf: 'center',
                  backgroundColor: '#1a1a1a', borderRadius: 20,
                  paddingHorizontal: 14, paddingVertical: 8,
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  borderWidth: 1, borderColor: '#333',
                }}
                onPress={() => {
                  flatRef.current?.scrollToOffset({ offset: 0, animated: true })
                  setShowScrollBtn(false)
                }}
              >
                <Ionicons name="arrow-down" size={14} color={Colors.textSecondary} />
                <Text style={{ color: Colors.textSecondary, fontSize: 13 }}>Latest</Text>
              </TouchableOpacity>
            )}
          </View>
          {cmdPickerVisible && (
            <ScrollView style={styles.cmdPicker} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {TB_SLASH_COMMANDS.filter(c => c.cmd.startsWith(input)).map((c) => (
                <TouchableOpacity
                  key={c.cmd}
                  style={styles.cmdPickerRow}
                  onPress={async () => {
                    setCmdPickerVisible(false)
                    setInput('')
                    if (!user) return
                    await addMessage(agentId, {
                      agent_id: agentId,
                      user_id: user.uid ?? (user as any).id,
                      direction: 'inbound',
                      content: c.cmd,
                    })
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cmdPickerCmd}>{c.cmd}</Text>
                  <Text style={styles.cmdPickerDesc}>{c.desc}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <View style={tb.inputRow}>
            <TextInput
              style={tb.input}
              value={input}
              onChangeText={(v) => {
                setInput(v)
                const matches = TB_SLASH_COMMANDS.filter(c => c.cmd.startsWith(v))
                setCmdPickerVisible(v.startsWith('/') && !v.includes(' ') && !(matches.length === 1 && matches[0].cmd === v))
              }}
              placeholder={`Message ${agentName}...`}
              placeholderTextColor={Colors.textMuted}
              onSubmitEditing={sendChat}
              returnKeyType="send"
              multiline
            />
            <TouchableOpacity onPress={sendChat} style={[tb.sendBtn, { opacity: input.trim() ? 1 : 0.4 }]} disabled={!input.trim()}>
              <Ionicons name="arrow-up" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Status tab */}
      {activeTab === 'status' && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {/* Name + connection */}
          <View style={tb.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={tb.cardTitle}>{agentName}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[tb.statusDot, { backgroundColor: isConnected ? Colors.accentGreen : Colors.accentRed }]} />
                <Text style={{ color: isConnected ? Colors.accentGreen : Colors.accentRed, fontSize: 12 }}>
                  {isConnected ? 'connected' : 'disconnected'}
                </Text>
              </View>
            </View>
          </View>

          {/* Live state */}
          <View style={tb.card}>
            <Text style={tb.cardLabel}>STATE</Text>
            <Text style={tb.cardValue}>{agentDoc?.live_state?.state ?? '—'}</Text>
          </View>

          <View style={tb.cardRow}>
            <View style={[tb.card, { flex: 1 }]}>
              <Text style={tb.cardLabel}>DAILY P&L</Text>
              <Text style={[tb.cardValue, { color: (agentDoc?.live_state?.dailyPnlUsd ?? 0) >= 0 ? Colors.accentGreen : Colors.accentRed }]}>
                {(agentDoc?.live_state?.dailyPnlUsd ?? 0) >= 0 ? '+' : ''}${(agentDoc?.live_state?.dailyPnlUsd ?? 0).toFixed(2)}
              </Text>
            </View>
            <View style={[tb.card, { flex: 1 }]}>
              <Text style={tb.cardLabel}>OPEN POS.</Text>
              <Text style={tb.cardValue}>{agentDoc?.live_state?.openPositions?.length ?? 0}</Text>
            </View>
          </View>

          {(() => {
            const positions: any[] = agentDoc?.live_state?.openPositions ?? []
            const unrealized = positions.reduce((sum: number, p: any) => sum + Number(p.unrealizedPnl ?? p.pnl ?? 0), 0)
            return (
              <View style={tb.card}>
                <Text style={tb.cardLabel}>UNREALIZED P&L</Text>
                <Text style={[tb.cardValue, { color: unrealized >= 0 ? Colors.accentGreen : Colors.accentRed }]}>
                  {unrealized >= 0 ? '+' : ''}${unrealized.toFixed(2)}
                </Text>
              </View>
            )
          })()}

          <View style={tb.cardRow}>
            <View style={[tb.card, { flex: 1 }]}>
              <Text style={tb.cardLabel}>ACTIVE SETUPS</Text>
              <Text style={tb.cardValue}>{agentDoc?.live_state?.activeConditionalSetups ?? '—'}</Text>
            </View>
            <View style={[tb.card, { flex: 1 }]}>
              <Text style={tb.cardLabel}>PAUSED</Text>
              <Text style={[tb.cardValue, { color: isPaused ? Colors.accentAmber : Colors.textSecondary }]}>
                {isPaused ? 'Yes' : 'No'}
              </Text>
            </View>
          </View>

          <View style={tb.card}>
            <Text style={tb.cardLabel}>LAST TICK</Text>
            <Text style={tb.cardValue}>
              {agentDoc?.last_tick_at ? formatTime001(agentDoc.last_tick_at) : '—'}
            </Text>
          </View>

          {agentDoc?.watchlist && agentDoc.watchlist.length > 0 && (
            <View style={tb.card}>
              <Text style={tb.cardLabel}>WATCHLIST</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {agentDoc.watchlist.map((sym: string) => (
                  <View key={sym} style={tb.chip}>
                    <Text style={tb.chipText}>{sym}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* Activity tab */}
      {activeTab === 'activity' && (
        <FlatList
          data={decisions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          ListEmptyComponent={
            <Text style={{ color: Colors.textMuted, textAlign: 'center', marginTop: 32 }}>
              No decisions yet
            </Text>
          }
          renderItem={({ item }) => (
            <View style={tb.decisionRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ color: Colors.textPrimary, fontWeight: '700', fontSize: 14 }}>{item.tokenSymbol}</Text>
                <View style={[tb.actionBadge, { backgroundColor: decisionColor(item.actionType) + '22', borderColor: decisionColor(item.actionType) }]}>
                  <Text style={{ color: decisionColor(item.actionType), fontSize: 10, fontWeight: '700' }}>{item.actionType}</Text>
                </View>
                <Text style={{ color: Colors.textMuted, fontSize: 11, marginLeft: 'auto' }}>
                  {item.eventTime ? formatTime001(item.eventTime) : ''}
                </Text>
              </View>
              <Text style={{ color: Colors.textSecondary, fontSize: 13, lineHeight: 18 }} numberOfLines={2}>
                {item.details}
              </Text>
            </View>
          )}
        />
      )}
    </KeyboardAvoidingView>
  )
}

const tb = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 56, paddingBottom: 12,
    backgroundColor: '#0e0e0c',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  controlBtn: {
    width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#1a1a18', borderWidth: 1, borderColor: '#2a2a28',
  },
  tabBar: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1e1e1c',
    backgroundColor: '#0e0e0c',
  },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, position: 'relative' },
  tabText: { fontSize: 13, color: Colors.textMuted, fontWeight: '500' },
  tabTextActive: { color: Colors.textPrimary, fontWeight: '700' },
  tabIndicator: {
    position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2,
    backgroundColor: Colors.accentAmber, borderRadius: 1,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, paddingBottom: 28,
    backgroundColor: '#0e0e0c', borderTopWidth: 1, borderTopColor: '#1e1e1c',
  },
  input: {
    flex: 1, backgroundColor: '#1a1a18', borderRadius: 20, borderWidth: 1,
    borderColor: '#2a2a28', paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: Colors.textPrimary, maxHeight: 100,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.accentAmber,
    justifyContent: 'center', alignItems: 'center',
  },
  card: {
    backgroundColor: '#1a1a18', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#2a2a28',
  },
  cardRow: { flexDirection: 'row', gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  cardLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.8, marginBottom: 4 },
  cardValue: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary },
  chip: {
    backgroundColor: '#252522', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#333330',
  },
  chipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  decisionRow: {
    backgroundColor: '#1a1a18', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#2a2a28',
  },
  actionBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1,
  },
})

// ── BlueChipScreen ────────────────────────────────────────────────────────────

const BC_SLASH_COMMANDS = [
  { cmd: '/help',      desc: 'Show available commands' },
  { cmd: '/status',    desc: 'Agent status & health' },
  { cmd: '/positions', desc: 'Open positions with live P&L' },
  { cmd: '/pnl',       desc: 'Session P&L summary' },
  { cmd: '/summary',   desc: 'Daily market briefing' },
  { cmd: '/agents',    desc: 'List connected agents' },
]

function BlueChipScreen({ agentId }: { agentId: string }) {
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [cmdPickerVisible, setCmdPickerVisible] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const { user } = useAuthStore()
  const flatRef = useRef<any>(null)

  useEffect(() => subscribeToMessages(agentId, setMessages), [agentId])

  function handleScroll(e: any) {
    setAtBottom(e.nativeEvent.contentOffset.y < 40)
  }

  async function sendChat() {
    const text = input.trim()
    if (!text || !user) return
    setInput('')
    await addMessage(agentId, {
      agent_id: agentId,
      user_id: user.id,
      direction: 'inbound',
      content: text,
    })
  }

  const reversed = [...messages].reverse()

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      {/* Header */}
      <View style={s001.header}>
        <TouchableOpacity onPress={() => router.back()} style={s001.backBtn}>
          <Text style={s001.backText}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ color: Colors.text, fontWeight: '700', fontSize: 17 }}>Blue Chip</Text>
          <Text style={{ color: Colors.accentGreen, fontSize: 12, marginTop: 1 }}>● connected</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {/* Messages */}
      <FlatList
        ref={flatRef}
        data={reversed}
        keyExtractor={(item) => item.id ?? String(item.created_at)}
        inverted
        onScroll={handleScroll}
        scrollEventThrottle={100}
        contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
        renderItem={({ item }) => {
          const isUser = item.direction === 'inbound'
          return (
            <View style={{ alignItems: isUser ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
              <View style={{
                backgroundColor: isUser ? Colors.accentAmber : '#1a1a1a',
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 10,
                maxWidth: '80%',
              }}>
                <Text style={{ color: isUser ? '#000' : Colors.text, fontSize: 15, lineHeight: 21 }}>{item.content}</Text>
              </View>
              <Text style={{ color: Colors.textMuted, fontSize: 11, marginTop: 3, marginHorizontal: 4 }}>
                {item.created_at ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
              </Text>
            </View>
          )
        }}
      />

      {/* Slash command picker */}
      {cmdPickerVisible && (
        <ScrollView style={styles.cmdPicker} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {BC_SLASH_COMMANDS.filter(c => c.cmd.startsWith(input)).map((c) => (
            <TouchableOpacity
              key={c.cmd}
              style={styles.cmdPickerRow}
              onPress={async () => {
                setCmdPickerVisible(false)
                setInput('')
                if (!user) return
                await addMessage(agentId, {
                  agent_id: agentId,
                  user_id: (user as any).id ?? (user as any).uid,
                  direction: 'inbound',
                  content: c.cmd,
                })
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.cmdPickerCmd}>{c.cmd}</Text>
              <Text style={styles.cmdPickerDesc}>{c.desc}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Input */}
      <View style={s001.inputRow}>
        <TextInput
          style={s001.input}
          value={input}
          onChangeText={(v) => {
            setInput(v)
            const matches = BC_SLASH_COMMANDS.filter(c => c.cmd.startsWith(v))
            setCmdPickerVisible(v.startsWith('/') && !v.includes(' ') && !(matches.length === 1 && matches[0].cmd === v))
          }}
          placeholder="Message Blue Chip..."
          placeholderTextColor={Colors.textMuted}
          onSubmitEditing={sendChat}
          returnKeyType="send"
          multiline
        />
        <TouchableOpacity onPress={sendChat} style={[s001.sendBtn, { opacity: input.trim() ? 1 : 0.4 }]} disabled={!input.trim()}>
          <Ionicons name="arrow-up" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

function Slug001Screen() {
  const [state, setState] = useState<PaperAgentState | null>(null)
  const [trades, setTrades] = useState<any[]>([])
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [tab, setTab] = useState<'chat' | 'trades' | 'positions'>('chat')
  const [selectedTrade, setSelectedTrade] = useState<any | null>(null)
  const [showShare, setShowShare] = useState(false)
  const { user } = useAuthStore()
  const flatRef = useRef<any>(null)
  const [atBottom, setAtBottom] = useState(true)

  useEffect(() => { return subscribeToSlug001(setState) }, [])
  useEffect(() => { return subscribeToSlug001Trades(setTrades) }, [])
  useEffect(() => { return subscribeToMessages('slug-001', setMessages) }, [])
  // Inverted list: offset 0 = newest messages (visual bottom). atBottom = user sees newest.
  function handleScroll(e: any) {
    setAtBottom(e.nativeEvent.contentOffset.y < 40)
  }

  async function sendChat() {
    const text = input.trim()
    if (!text) return
    setInput('')
    await addMessage('slug-001', {
      agent_id: 'slug-001',
      user_id: user?.id ?? 'anonymous',
      direction: 'inbound',
      content: text,
    })
  }

  const s = state?.status ?? 'active'
  const { color: statusColor, label: statusLabel } = SLUG001_STATUS[s] ?? SLUG001_STATUS.active
  const sessionPnl = state?.session_pnl ?? 0
  const isPos = sessionPnl >= 0
  const pnlColor = isPos ? Colors.accentGreen : Colors.accentRed
  const positions = (state?.positions ?? []) as any[]

  const shareInitialTrade = {
    pair: 'BTC/USDT',
    direction: 'GRID',
    leverage: '',
    pnl: Math.abs(sessionPnl).toFixed(2),
    pnlPct: state?.price_change_24h_pct != null ? Math.abs(state.price_change_24h_pct).toFixed(2) : '',
    entryPrice: state?.grid_center ? `$${Math.round(state.grid_center).toLocaleString()}` : '',
    markPrice: state?.btc_price ? `$${Math.round(state.btc_price).toLocaleString()}` : '',
    referralCode: '',
  }

  // Profile header — shown in all tabs
  const profileHeader = (
    <>
      {/* Header */}
      <View style={s001.header}>
        <TouchableOpacity onPress={() => router.back()} style={s001.backBtn}>
          <Text style={s001.backText}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowShare(true)} style={s001.shareBtn}>
          <Text style={s001.shareBtnText}>Share PnL</Text>
        </TouchableOpacity>
      </View>

      <ShareCardModal
        visible={showShare}
        onClose={() => setShowShare(false)}
        agentName="Slug #001"
        initialTrade={shareInitialTrade}
      />

      {/* Identity */}
      <View style={[s001.identityRow, { paddingHorizontal: 20 }]}>
        <View style={s001.avatar}>
          <Text style={s001.avatarText}>⬡</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={s001.name}>Slug #001</Text>
            <View style={s001.paperBadge}><Text style={s001.paperBadgeText}>PAPER</Text></View>
          </View>
          <Text style={s001.handle}>@slugs/range-farmer</Text>
          <View style={s001.statusRow}>
            <View style={[s001.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[s001.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
            <Text style={s001.bullet}>·</Text>
            <Text style={s001.strategy}>{state?.strategy ?? 'Dynamic Grid'}</Text>
          </View>
        </View>
      </View>

      {/* PnL strip */}
      <View style={[s001.pnlStrip, { marginHorizontal: 20, marginTop: 12 }]}>
        <View style={s001.pnlMain}>
          <Text style={[s001.pnlValue, { color: pnlColor }]}>
            {isPos ? '+$' : '-$'}{Math.abs(sessionPnl).toFixed(2)}
          </Text>
          <Text style={s001.pnlLabel}>session pnl</Text>
        </View>
        <View style={s001.stripDivider} />
        <View style={s001.stripStat}>
          <Text style={s001.stripValue}>{state?.total_fills ?? 0}</Text>
          <Text style={s001.stripLabel}>fills</Text>
        </View>
        <View style={s001.stripDivider} />
        <View style={s001.stripStat}>
          <Text style={s001.stripValue}>
            {state?.btc_price ? `$${Math.round(state.btc_price).toLocaleString()}` : '—'}
          </Text>
          <Text style={s001.stripLabel}>btc price</Text>
        </View>
        <View style={s001.stripDivider} />
        <View style={s001.stripStat}>
          <Text style={[s001.stripValue, { color: (state?.price_change_24h_pct ?? 0) >= 0 ? Colors.accentGreen : Colors.accentRed }]}>
            {(state?.price_change_24h_pct ?? 0) >= 0 ? '+' : ''}{(state?.price_change_24h_pct ?? 0).toFixed(2)}%
          </Text>
          <Text style={s001.stripLabel}>24h change</Text>
        </View>
      </View>

      {/* Tab toggle */}
      <View style={[s001.tabRow, { paddingHorizontal: 20, marginTop: 16, marginBottom: 4 }]}>
        {(['chat', 'trades', 'positions'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[s001.tabPill, tab === t && s001.tabPillActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[s001.tabPillText, tab === t && s001.tabPillTextActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  )

  // ── Chat tab ──────────────────────────────────────────────────────────────
  if (tab === 'chat') {
    return (
      <KeyboardAvoidingView
        style={s001.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {profileHeader}
        <View style={{ flex: 1 }}>
          <FlatList
            ref={flatRef}
            data={[...messages].reverse()}
            keyExtractor={(m) => m.id}
            inverted
            contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 16 }}
            onScroll={handleScroll}
            scrollEventThrottle={100}
            ListEmptyComponent={
              <View style={s001.emptyTab}>
                <Text style={s001.emptyTabText}>No messages yet. Say something.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const isMe = item.direction === 'inbound'
              return (
                <View style={[s001.bubble, isMe ? s001.bubbleMe : s001.bubbleAgent]}>
                  <Text style={[s001.bubbleText, isMe ? s001.bubbleTextMe : s001.bubbleTextAgent]}>
                    {item.content}
                  </Text>
                  <Text style={s001.bubbleTime}>{formatTime001(item.created_at)}</Text>
                </View>
              )
            }}
          />
          {!atBottom && (
            <TouchableOpacity
              style={s001.scrollDownBtn}
              onPress={() => {
                flatRef.current?.scrollToOffset({ offset: 0, animated: true })
                setAtBottom(true)
              }}
            >
              <Text style={s001.scrollDownText}>↓</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={s001.inputBar}>
          <TextInput
            style={s001.inputField}
            value={input}
            onChangeText={setInput}
            placeholder="Message Slug #001..."
            placeholderTextColor={Colors.textMuted}
            multiline
            returnKeyType="send"
            onSubmitEditing={sendChat}
          />
          <TouchableOpacity
            style={[s001.sendBtn, !input.trim() && { opacity: 0.4 }]}
            onPress={sendChat}
            disabled={!input.trim()}
          >
            <Text style={s001.sendBtnText}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    )
  }

  // ── Activity / Positions tabs ─────────────────────────────────────────────
  return (
    <View style={s001.container}>
      {profileHeader}
      <ScrollView contentContainerStyle={s001.scroll} showsVerticalScrollIndicator={false}>
        {/* Description */}
        <Text style={s001.desc}>
          Farming BTC volatility with a dynamic grid strategy. Places buy and sell orders across a range, capturing spreads as price oscillates. Adjusts grid center and spacing based on market regime.
        </Text>

        {/* Sparkline */}
        {state?.pnl_history && state.pnl_history.length > 2 && (
          <View style={s001.chartCard}>
            <Text style={s001.chartLabel}>PnL History</Text>
            <Sparkline history={state.pnl_history} />
          </View>
        )}

        {/* Grid info */}
        <View style={s001.gridCard}>
          <View style={s001.gridRow}>
            <View style={s001.gridStat}>
              <Text style={s001.gridLabel}>REGIME</Text>
              <Text style={s001.gridValue}>{state?.regime ?? '—'}</Text>
            </View>
            <View style={s001.gridStat}>
              <Text style={s001.gridLabel}>CENTER</Text>
              <Text style={s001.gridValue}>
                {state?.grid_center ? `$${Math.round(state.grid_center).toLocaleString()}` : '—'}
              </Text>
            </View>
            <View style={s001.gridStat}>
              <Text style={s001.gridLabel}>LEVELS</Text>
              <Text style={s001.gridValue}>{state?.grid_levels ?? '—'}</Text>
            </View>
            <View style={s001.gridStat}>
              <Text style={s001.gridLabel}>SPACING</Text>
              <Text style={s001.gridValue}>{state?.grid_spacing_pct ?? '—'}%</Text>
            </View>
          </View>
        </View>

        {/* Trades tab */}
        {tab === 'trades' && (
          <View style={{ gap: 8 }}>
            {trades.length === 0 && (
              <View style={s001.emptyTab}>
                <Text style={s001.emptyTabText}>No trades yet — waiting for first fill.</Text>
              </View>
            )}
            {trades.map((item) => {
              const side: string = item.side ?? 'buy'
              const isBuy = side === 'buy'
              const sideColor = isBuy ? Colors.accentGreen : Colors.accentRed
              const sideBg = isBuy ? 'rgba(0,200,150,0.12)' : 'rgba(255,69,58,0.12)'
              const pnl: number | null = item.pnl != null ? Number(item.pnl) : null
              const fillPrice: number | null = item.fillPrice != null ? Number(item.fillPrice) : null
              const qty: number | null = item.qty != null ? Number(item.qty) : null
              const pnlColor = pnl != null ? (pnl >= 0 ? Colors.accentGreen : Colors.accentRed) : Colors.textMuted
              return (
                <TouchableOpacity
                  key={item.id}
                  style={s001.tradeCard}
                  onPress={() => setSelectedTrade(item)}
                  activeOpacity={0.75}
                >
                  <View style={s001.tradeTop}>
                    <View style={[s001.sideBadge, { backgroundColor: sideBg }]}>
                      <Text style={[s001.sideText, { color: sideColor }]}>{side.toUpperCase()}</Text>
                    </View>
                    <Text style={s001.tradePair}>BTC/USDT</Text>
                    <View style={s001.tradeAgentTag}>
                      <Text style={s001.tradeAgentText}>Slug #001</Text>
                    </View>
                    <View style={{ flex: 1 }} />
                    {pnl != null && (
                      <Text style={[s001.tradePnl, { color: pnlColor }]}>
                        {pnl >= 0 ? '+$' : '-$'}{Math.abs(pnl).toFixed(2)}
                      </Text>
                    )}
                  </View>
                  <View style={s001.tradeDetails}>
                    {fillPrice != null && (
                      <View style={s001.tradeDetailCol}>
                        <Text style={s001.tradeDetailLabel}>ENTRY</Text>
                        <Text style={s001.tradeDetailValue}>${fillPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text>
                      </View>
                    )}
                    {qty != null && (
                      <View style={s001.tradeDetailCol}>
                        <Text style={s001.tradeDetailLabel}>SIZE</Text>
                        <Text style={s001.tradeDetailValue}>{qty} BTC</Text>
                      </View>
                    )}
                    {item.type && (
                      <View style={s001.tradeDetailCol}>
                        <Text style={s001.tradeDetailLabel}>TYPE</Text>
                        <Text style={s001.tradeDetailValue}>{item.type === 'grid_fill' ? 'Grid' : 'Manual'}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }} />
                    <Text style={s001.tradeTime}>{formatTime001(item.created_at)}</Text>
                  </View>
                </TouchableOpacity>
              )
            })}

            {/* Trade detail modal */}
            <Modal
              visible={selectedTrade != null}
              transparent
              animationType="slide"
              onRequestClose={() => setSelectedTrade(null)}
            >
              <TouchableOpacity
                style={s001.modalOverlay}
                activeOpacity={1}
                onPress={() => setSelectedTrade(null)}
              >
                <TouchableOpacity activeOpacity={1} style={s001.modalSheet} onPress={() => {}}>
                  {selectedTrade && (() => {
                    const t = selectedTrade
                    const isBuy = t.side === 'buy'
                    const sideColor = isBuy ? Colors.accentGreen : Colors.accentRed
                    const sideBg = isBuy ? 'rgba(0,200,150,0.12)' : 'rgba(255,69,58,0.12)'
                    const pnl = t.pnl != null ? Number(t.pnl) : null
                    const pnlColor = pnl != null ? (pnl >= 0 ? Colors.accentGreen : Colors.accentRed) : Colors.textMuted
                    const btcAtFill = t.btc_price != null ? Number(t.btc_price) : null
                    const sessionAtFill = t.session_pnl != null ? Number(t.session_pnl) : null
                    return (
                      <>
                        <View style={s001.modalHandle} />
                        <View style={s001.modalHeader}>
                          <View style={[s001.sideBadge, { backgroundColor: sideBg }]}>
                            <Text style={[s001.sideText, { color: sideColor }]}>{(t.side ?? '?').toUpperCase()}</Text>
                          </View>
                          <Text style={s001.modalTitle}>BTC/USDT</Text>
                          <View style={s001.tradeAgentTag}>
                            <Text style={s001.tradeAgentText}>Slug #001</Text>
                          </View>
                        </View>

                        {pnl != null && (
                          <Text style={[s001.modalPnl, { color: pnlColor }]}>
                            {pnl >= 0 ? '+$' : '-$'}{Math.abs(pnl).toFixed(4)}
                          </Text>
                        )}

                        <View style={s001.modalGrid}>
                          {t.fillPrice != null && (
                            <View style={s001.modalGridItem}>
                              <Text style={s001.modalGridLabel}>ENTRY PRICE</Text>
                              <Text style={s001.modalGridValue}>${Number(t.fillPrice).toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
                            </View>
                          )}
                          {t.qty != null && (
                            <View style={s001.modalGridItem}>
                              <Text style={s001.modalGridLabel}>SIZE</Text>
                              <Text style={s001.modalGridValue}>{t.qty} BTC</Text>
                            </View>
                          )}
                          {btcAtFill != null && (
                            <View style={s001.modalGridItem}>
                              <Text style={s001.modalGridLabel}>BTC AT FILL</Text>
                              <Text style={s001.modalGridValue}>${Math.round(btcAtFill).toLocaleString()}</Text>
                            </View>
                          )}
                          {t.qty != null && t.fillPrice != null && (
                            <View style={s001.modalGridItem}>
                              <Text style={s001.modalGridLabel}>NOTIONAL</Text>
                              <Text style={s001.modalGridValue}>${(Number(t.qty) * Number(t.fillPrice)).toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
                            </View>
                          )}
                          {sessionAtFill != null && (
                            <View style={s001.modalGridItem}>
                              <Text style={s001.modalGridLabel}>SESSION PNL AT FILL</Text>
                              <Text style={[s001.modalGridValue, { color: sessionAtFill >= 0 ? Colors.accentGreen : Colors.accentRed }]}>
                                {sessionAtFill >= 0 ? '+$' : '-$'}{Math.abs(sessionAtFill).toFixed(2)}
                              </Text>
                            </View>
                          )}
                          <View style={s001.modalGridItem}>
                            <Text style={s001.modalGridLabel}>TYPE</Text>
                            <Text style={s001.modalGridValue}>{t.type === 'grid_fill' ? 'Grid Fill' : 'Manual'}</Text>
                          </View>
                          <View style={s001.modalGridItem}>
                            <Text style={s001.modalGridLabel}>TIME</Text>
                            <Text style={s001.modalGridValue}>{t.created_at ? new Date(t.created_at).toLocaleString() : '—'}</Text>
                          </View>
                        </View>

                        <TouchableOpacity
                          style={s001.modalDismiss}
                          onPress={() => setSelectedTrade(null)}
                        >
                          <Text style={s001.modalDismissText}>Close</Text>
                        </TouchableOpacity>
                      </>
                    )
                  })()}
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>
          </View>
        )}

        {/* Positions tab */}
        {tab === 'positions' && (
          <View style={{ gap: 8 }}>
            {positions.length === 0 && (
              <View style={s001.emptyTab}>
                <Text style={s001.emptyTabText}>No open positions.</Text>
              </View>
            )}
            {positions.map((p: any, i: number) => {
              const pnl = (p.currentPrice - p.fillPrice) * p.qty * (p.side === 'sell' ? -1 : 1)
              const isPosP = pnl >= 0
              return (
                <View key={i} style={s001.positionCard}>
                  <View style={s001.positionTop}>
                    <View style={[s001.sideBadge, { backgroundColor: p.side === 'buy' ? 'rgba(0,200,150,0.12)' : 'rgba(255,69,58,0.12)' }]}>
                      <Text style={[s001.sideText, { color: p.side === 'buy' ? Colors.accentGreen : Colors.accentRed }]}>
                        {p.side.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={s001.positionPair}>BTC/USDT</Text>
                    <View style={{ flex: 1 }} />
                    <Text style={[s001.positionPnl, { color: isPosP ? Colors.accentGreen : Colors.accentRed }]}>
                      {isPosP ? '+$' : '-$'}{Math.abs(pnl).toFixed(4)}
                    </Text>
                  </View>
                  <View style={s001.positionPriceRow}>
                    <View>
                      <Text style={s001.positionPriceLabel}>Entry</Text>
                      <Text style={s001.positionPriceValue}>${p.fillPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text>
                    </View>
                    <View>
                      <Text style={s001.positionPriceLabel}>Current</Text>
                      <Text style={s001.positionPriceValue}>${(p.currentPrice ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text>
                    </View>
                    <View>
                      <Text style={s001.positionPriceLabel}>Qty</Text>
                      <Text style={s001.positionPriceValue}>{p.qty} BTC</Text>
                    </View>
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const s001 = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backBtn: { padding: 4 },
  backText: { fontSize: 26, color: Colors.accentAmber, lineHeight: 30 },
  shareBtn: { backgroundColor: 'rgba(217,119,87,0.12)', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(217,119,87,0.3)' },
  shareBtnText: { fontSize: 13, fontWeight: '600', color: Colors.accentAmber },
  scroll: { paddingHorizontal: 20, paddingBottom: 120, gap: 16 },

  identityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(217,119,87,0.12)',
    borderWidth: 2, borderColor: Colors.accentAmber,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 26, color: Colors.accentAmber },
  name: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  handle: { fontSize: 12, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  bullet: { color: Colors.textMuted, fontSize: 11 },
  strategy: { fontSize: 11, color: Colors.textMuted, fontWeight: '500' },
  paperBadge: {
    backgroundColor: 'rgba(217,119,87,0.12)', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(217,119,87,0.3)',
  },
  paperBadgeText: { fontSize: 9, fontWeight: '700', color: Colors.accentAmber, letterSpacing: 0.8 },

  desc: { fontSize: 14, color: Colors.textSecondary, lineHeight: 21 },

  pnlStrip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0d0d0d', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(217,119,87,0.15)',
  },
  pnlMain: { gap: 2 },
  pnlValue: { fontSize: 28, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', letterSpacing: -0.5 },
  pnlLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  stripDivider: { width: 1, height: 36, backgroundColor: Colors.bgBorder, marginHorizontal: 12 },
  stripStat: { gap: 2, alignItems: 'center' },
  stripValue: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  stripLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },

  chartCard: { backgroundColor: '#0d0d0d', borderRadius: 16, padding: 16, gap: 12 },
  chartLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' },
  sparklineWrap: { alignItems: 'flex-start' },
  sparklineLine: { position: 'relative' },

  gridCard: { backgroundColor: '#0d0d0d', borderRadius: 14, padding: 14 },
  gridRow: { flexDirection: 'row', justifyContent: 'space-between' },
  gridStat: { alignItems: 'center', gap: 4 },
  gridLabel: { fontSize: 9, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  gridValue: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  tabRow: { flexDirection: 'row', gap: 8 },
  tabPill: {
    paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: 20, backgroundColor: Colors.bgElevated,
    borderWidth: 1, borderColor: Colors.bgBorder,
  },
  tabPillActive: { backgroundColor: 'rgba(217,119,87,0.12)', borderColor: Colors.accentAmber },
  tabPillText: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  tabPillTextActive: { color: Colors.accentAmber },

  activityCard: { backgroundColor: '#0f0f0f', borderRadius: 14, padding: 14, gap: 6 },
  activityTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activityDot: { width: 6, height: 6, borderRadius: 3 },
  activityTime: { fontSize: 11, color: Colors.textMuted },
  activityPnl: { fontSize: 22, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  activityContent: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },

  tradeCard: {
    backgroundColor: '#0f0f0f', borderRadius: 14, padding: 14, gap: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  tradeTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tradePair: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  tradeAgentTag: {
    backgroundColor: 'rgba(217,119,87,0.1)', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(217,119,87,0.2)',
  },
  tradeAgentText: { fontSize: 10, fontWeight: '700', color: Colors.accentAmber, letterSpacing: 0.4 },
  tradePnl: { fontSize: 15, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  tradeDetails: { flexDirection: 'row', alignItems: 'flex-end', gap: 20 },
  tradeDetailCol: { gap: 2 },
  tradeDetailLabel: { fontSize: 9, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  tradeDetailValue: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  tradeTime: { fontSize: 10, color: Colors.textMuted, alignSelf: 'flex-end' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#141413', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, gap: 16,
    borderTopWidth: 1, borderColor: Colors.bgBorder,
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.bgBorder, alignSelf: 'center', marginBottom: 4 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  modalPnl: { fontSize: 32, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', letterSpacing: -0.5 },
  modalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 0, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.bgBorder },
  modalGridItem: { width: '50%', padding: 14, gap: 4, borderBottomWidth: 1, borderRightWidth: 1, borderColor: Colors.bgBorder },
  modalGridLabel: { fontSize: 9, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  modalGridValue: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  modalDismiss: {
    backgroundColor: Colors.bgElevated, borderRadius: 14, padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.bgBorder,
  },
  modalDismissText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },

  positionCard: { backgroundColor: '#0f0f0f', borderRadius: 14, padding: 14, gap: 10 },
  positionTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sideBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  sideText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  positionPair: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  positionPnl: { fontSize: 14, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  positionPriceRow: { flexDirection: 'row', gap: 20 },
  positionPriceLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  positionPriceValue: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  emptyTab: { paddingVertical: 32, alignItems: 'center' },
  emptyTabText: { fontSize: 13, color: Colors.textMuted },

  bubble: { maxWidth: '80%', borderRadius: 16, padding: 12, gap: 4 },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: Colors.accentAmber },
  bubbleAgent: { alignSelf: 'flex-start', backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: Colors.bgBorder },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextMe: { color: '#000', fontWeight: '500' },
  bubbleTextAgent: { color: Colors.textPrimary },
  bubbleTime: { fontSize: 10, color: 'rgba(0,0,0,0.4)', alignSelf: 'flex-end' },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    borderTopWidth: 1, borderTopColor: Colors.bgBorder,
    backgroundColor: Colors.bgPrimary,
  },
  inputField: {
    flex: 1, minHeight: 40, maxHeight: 120,
    backgroundColor: '#1a1a1a', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.bgBorder,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.accentAmber,
    justifyContent: 'center', alignItems: 'center',
  },
  sendBtnText: { fontSize: 18, color: '#000', fontWeight: '700', lineHeight: 22 },
  scrollDownBtn: {
    position: 'absolute', bottom: 12, alignSelf: 'center',
    backgroundColor: Colors.accentAmber,
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  scrollDownText: { fontSize: 18, color: '#000', fontWeight: '700', lineHeight: 22 },
})

// ── Main Agent Detail Screen ───────────────────────────────────────────────────

export default function AgentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()

  // Slug #001 gets its own dedicated screen
  if (id === 'slug-001') return <Slug001Screen />

  const agentSnap = useAgentsStore.getState().agents.find((a) => a.id === id) as any
  // cabal_trading_boy always goes to TradingBoyScreen (even if named "Blue Chip")
  if (agentSnap?.agent_type === 'cabal_trading_boy' && id) return <TradingBoyScreen agentId={id} />
  // Legacy connector-based Blue Chip
  if (agentSnap?.agent_type === 'cabal_blue_chip' && id) return <BlueChipScreen agentId={id} />

  const [tab, setTab] = useState<Tab>('chat')
  const [showShareCard, setShowShareCard] = useState(false)
  const [selectedTrade, setSelectedTrade] = useState<TradeData | null>(null)
  const [showPositionPicker, setShowPositionPicker] = useState(false)
  const [fetchingPositions, setFetchingPositions] = useState(false)
  const [availablePositions, setAvailablePositions] = useState<TradeData[]>([])
  const [positionFetchError, setPositionFetchError] = useState<string | null>(null)
  const positionChannelRef = useRef<any>(null)
  const [tokenStats, setTokenStats] = useState<{ input: number; output: number; messageCount: number } | null>(null)
  const [agentSkills, setAgentSkills] = useState<InstalledSkill[]>([])
  const [loadingSkills, setLoadingSkills] = useState(false)
  const [uninstallingSkillId, setUninstallingSkillId] = useState<string | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set())
  const [bulkUninstalling, setBulkUninstalling] = useState(false)
  const [input, setInput] = useState('')
  const [cmdPickerVisible, setCmdPickerVisible] = useState(false)
  const [attachments, setAttachments] = useState<{ local: string; remote?: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const flatListRef = useRef<FlatList>(null)
  const channelRef = useRef<any>(null)
  const prevMsgCountRef = useRef(0)
  const isAtBottomRef = useRef(true)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [unreadWhileScrolled, setUnreadWhileScrolled] = useState(0)
  const [isAgentTyping, setIsAgentTyping] = useState(false)
  const [modelSettingsVisible, setModelSettingsVisible] = useState(false)
  const [selectedWorkflow, setSelectedWorkflow] = useState<'openai' | 'anthropic' | 'openrouter'>('openai')
  const [imageProvider, setImageProvider] = useState<'manus' | 'dalle'>('manus')
  const [llmApiKey, setLlmApiKey] = useState('')
  const [orKey, setOrKey] = useState('')
  const [orModel, setOrModel] = useState('')
  const [orModelSearch, setOrModelSearch] = useState('')
  const [orModels, setOrModels] = useState<{ id: string; name: string }[]>([])
  const [fetchingModels, setFetchingModels] = useState(false)
  const [savingModel, setSavingModel] = useState(false)

  const { agents, getConnectionStatus, upsertAgent } = useAgentsStore()
  const { user, session, isLoading: authLoading } = useAuthStore()
  const { messagesByAgent, setMessages, addMessage } = useChatStore()
  const showToast = useUIStore((s) => s.showToast)

  const agent = agents.find((a) => a.id === id)

  // Load saved settings when modal opens
  useEffect(() => {
    if (!modelSettingsVisible || !agent) return
    const meta = agent.metadata as any
    const provider = meta?.llmProvider ?? (meta?.openrouterKey ? 'openrouter' : 'openai')
    setSelectedWorkflow(provider)
    setImageProvider(meta?.imageProvider ?? 'manus')
    setLlmApiKey(provider === 'openai' ? (meta?.openaiKey ?? '') : (meta?.anthropicKey ?? ''))
    setOrKey(meta?.openrouterKey ?? '')
    setOrModel(meta?.model ?? '')
    setOrModelSearch('')
  }, [modelSettingsVisible])

  async function fetchOpenRouterModels(key: string) {
    if (!key.trim()) return
    setFetchingModels(true)
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${key.trim()}` },
      })
      if (!res.ok) { showToast('Invalid OpenRouter key'); return }
      const data = await res.json() as { data: { id: string; name: string }[] }
      setOrModels(data.data ?? [])
    } catch {
      showToast('Failed to fetch models')
    } finally {
      setFetchingModels(false)
    }
  }

  async function saveModelSettings() {
    if (!agent) return
    setSavingModel(true)
    const meta = (agent.metadata ?? {}) as any
    const base = { ...meta, imageProvider, llmProvider: selectedWorkflow }
    let update: any
    if (selectedWorkflow === 'openai') {
      update = { ...base, openrouterKey: undefined, model: undefined, openaiKey: llmApiKey.trim() || undefined, anthropicKey: undefined }
    } else if (selectedWorkflow === 'anthropic') {
      update = { ...base, openrouterKey: undefined, model: undefined, anthropicKey: llmApiKey.trim() || undefined, openaiKey: undefined }
    } else {
      update = { ...base, openrouterKey: orKey.trim(), model: orModel, openaiKey: undefined, anthropicKey: undefined }
    }
    Object.keys(update).forEach(k => update[k] === undefined && delete update[k])
    await supabase.from('agents').update({ metadata: update }).eq('id', agent.id)
    upsertAgent({ ...agent, metadata: update })
    setSavingModel(false)
    setModelSettingsVisible(false)
    const label = selectedWorkflow === 'openrouter' ? orModel : selectedWorkflow === 'anthropic' ? 'Anthropic' : 'OpenAI'
    showToast(`Switched to ${label}`)
  }

  const slashCommands = useMemo(() => getSlashCommands(agent?.name), [agent?.name])
  const agentTabs = useMemo(() => getAgentTabs(agent?.name), [agent?.name])
  useEffect(() => {
    if (!agentTabs.includes(tab)) setTab('chat')
  }, [agentTabs])
  const messages = messagesByAgent[id] ?? []
  // Inverted FlatList needs data in reverse order (newest first = renders at visual bottom)
  const messagesReversed = useMemo(() => [...messages].reverse(), [messages])
  const status = id ? getConnectionStatus(id) : 'disconnected'

  useEffect(() => {
    if (!id || tab !== 'skills') return
    setLoadingSkills(true)
    Promise.all([
      supabase.from('agent_skills').select('skill_slug, config, status').eq('agent_id', id).eq('status', 'active'),
      supabase.from('skills').select('id, name, description, category, version'),
    ]).then(([{ data: rows }, { data: localSkills }]) => {
      const localMap = new Map((localSkills ?? []).map((s: any) => [s.id, s]))
      setAgentSkills(
        (rows ?? []).map((row: any) => {
          const local = row.skill_slug ? localMap.get(row.skill_slug) : null
          return {
            id: row.skill_slug ?? String(Math.random()),
            skillId: local ? row.skill_slug : undefined,
            skillSlug: !local ? (row.skill_slug ?? undefined) : undefined,
            name: local?.name ?? row.config?.displayName ?? row.skill_slug ?? 'Unknown',
            description: local?.description ?? '',
            version: local?.version ?? row.config?.version ?? '1.0.0',
            category: local?.category ?? null,
          }
        })
      )
      setLoadingSkills(false)
    })
  }, [id, tab])

  async function handleUninstallSkill(skill: InstalledSkill) {
    Alert.alert('Uninstall skill', `Remove "${skill.name}" from this agent?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Uninstall', style: 'destructive',
        onPress: async () => {
          setUninstallingSkillId(skill.id)
          const slug = skill.skillId ?? skill.skillSlug
          await supabase.from('agent_skills').update({ status: 'inactive' }).eq('agent_id', id).eq('skill_slug', slug)
          setAgentSkills((prev) => prev.filter((s) => s.id !== skill.id))
          setUninstallingSkillId(null)
          showToast(`${skill.name} uninstalled`)
        },
      },
    ])
  }

  async function handleBulkUninstall() {
    if (selectedSkillIds.size === 0) return
    const count = selectedSkillIds.size

    const doUninstall = async () => {
      setBulkUninstalling(true)
      const toRemove = agentSkills.filter((s) => selectedSkillIds.has(s.id))
      await Promise.all(
        toRemove.map((s) =>
          supabase.from('agent_skills').update({ status: 'inactive' })
            .eq('agent_id', id).eq('skill_slug', s.skillId ?? s.skillSlug)
        )
      )
      setAgentSkills((prev) => prev.filter((s) => !selectedSkillIds.has(s.id)))
      setBulkUninstalling(false)
      setSelectMode(false)
      setSelectedSkillIds(new Set())
      showToast(`${count} skill${count !== 1 ? 's' : ''} uninstalled`)
    }

    if (Platform.OS === 'web') {
      if (window.confirm(`Remove ${count} skill${count !== 1 ? 's' : ''} from this agent?`)) {
        await doUninstall()
      }
    } else {
      Alert.alert(
        'Uninstall skills',
        `Remove ${count} skill${count !== 1 ? 's' : ''} from this agent?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: `Uninstall ${count}`, style: 'destructive', onPress: doUninstall },
        ]
      )
    }
  }

  function toggleSkillSelection(skillId: string) {
    setSelectedSkillIds((prev) => {
      const next = new Set(prev)
      next.has(skillId) ? next.delete(skillId) : next.add(skillId)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedSkillIds.size === agentSkills.length) {
      setSelectedSkillIds(new Set())
    } else {
      setSelectedSkillIds(new Set(agentSkills.map((s) => s.id)))
    }
  }

  useEffect(() => {
    if (!id || tab !== 'vitals') return
    supabase
      .from('messages')
      .select('input_tokens, output_tokens')
      .eq('agent_id', id)
      .then(({ data }) => {
        if (!data) return
        let input = 0, output = 0, messageCount = data.length
        for (const row of data) {
          input += row.input_tokens ?? 0
          output += row.output_tokens ?? 0
        }
        setTokenStats({ input, output, messageCount })
      })
  }, [id, tab])

  // Load message history
  useEffect(() => {
    if (!id) return
    supabase
      .from('messages')
      .select('*')
      .eq('agent_id', id)
      .order('created_at', { ascending: true })
      .limit(100)
      .then(({ data }) => { if (data) setMessages(id, data) })
  }, [id])

  // Subscribe to realtime
  useEffect(() => {
    if (!id) return
    channelRef.current = subscribeToAgent(id, {
      onMessage: (payload) => {
        const msgId = (payload as any).id ?? String(payload.ts)
        const msg: Message = {
          id: msgId,
          agent_id: id,
          user_id: user?.id ?? '',
          direction: payload.direction as 'inbound' | 'outbound',
          content: payload.content,
          created_at: new Date(payload.ts).toISOString(),
          metadata: payload.metadata ?? null,
        }
        if (payload.direction === 'outbound') setIsAgentTyping(false)
        addMessage(id, msg)
      },
    })
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [id])

  // Reset unread badge and typing state when switching tabs
  useEffect(() => {
    if (tab !== 'chat') { setIsAgentTyping(false); return }
    isAtBottomRef.current = true
    setShowScrollBtn(false)
    setUnreadWhileScrolled(0)
  }, [tab])

  // Track unread messages while scrolled up (inverted: offset 0 = bottom/newest)
  useEffect(() => {
    const count = messages.length
    if (count === 0 || tab !== 'chat') return
    if (count > prevMsgCountRef.current && !isAtBottomRef.current) {
      setUnreadWhileScrolled((n) => n + (count - prevMsgCountRef.current))
    }
    prevMsgCountRef.current = count
  }, [messages.length, tab])

  const renderMessage = useCallback(({ item }: { item: Message }) => (
    <MessageBubble item={item} />
  ), [])

  // Inverted list: offset 0 = visual bottom (newest). atBottom = user is at newest messages.
  const handleScroll = useCallback((event: any) => {
    const atBottom = event.nativeEvent.contentOffset.y < 80
    isAtBottomRef.current = atBottom
    setShowScrollBtn(!atBottom)
    if (atBottom) setUnreadWhileScrolled(0)
  }, [])

  const scrollToBottom = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true })
    setUnreadWhileScrolled(0)
    setShowScrollBtn(false)
    isAtBottomRef.current = true
  }, [])

  function handleDisconnect() {
    if (!agent) return
    Alert.alert(
      'Disconnect agent?',
      `Mark "${agent.name}" as disconnected. The agent process will still run until stopped on your machine.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('agents').update({ status: 'disconnected' }).eq('id', agent.id)
            upsertAgent({ ...agent, status: 'disconnected' })
          },
        },
      ]
    )
  }

  async function handlePickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo access to send images.'); return }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
    })
    if (result.canceled) return

    // Show local previews immediately
    const newItems = result.assets.map((a) => ({ local: a.uri }))
    setAttachments((prev) => [...prev, ...newItems])

    // Upload via base64 → ArrayBuffer → direct fetch with explicit auth token
    const token = session?.access_token
    if (!token) { Alert.alert('Not logged in', 'Please sign out and back in.'); setUploading(false); return }
    setUploading(true)
    for (const asset of result.assets) {
      try {
        const ext = (asset.mimeType?.split('/')[1]) ?? asset.uri.split('.').pop() ?? 'jpg'
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const contentType = asset.mimeType ?? 'image/jpeg'
        const uploadUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/message-attachments/${fileName}`
        const FileSystem = require('expo-file-system/legacy')
        const res = await FileSystem.uploadAsync(uploadUrl, asset.uri, {
          httpMethod: 'POST',
          uploadType: 1, // MULTIPART — uses foreground session, response is parseable
          fieldName: 'file',
          mimeType: contentType,
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
          },
        })
        if (res.status >= 200 && res.status < 300) {
          const publicUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/public/message-attachments/${fileName}`
          setAttachments((prev) => prev.map((a) => a.local === asset.uri ? { local: a.local, remote: publicUrl } : a))
        } else {
          Alert.alert('Upload failed', res.body ?? `Status ${res.status}`)
          setAttachments((prev) => prev.filter((a) => a.local !== asset.uri))
        }
      } catch (e: any) {
        Alert.alert('Upload error', e?.message ?? 'Unknown error')
        setAttachments((prev) => prev.filter((a) => a.local !== asset.uri))
      }
    }
    setUploading(false)
  }

  async function handleSend() {
    if ((!input.trim() && attachments.length === 0) || !user || !id) return
    const content = input.trim() || (attachments.length > 0 ? '[image]' : '')
    setInput('')
    const urls = attachments.filter((a) => a.remote).map((a) => a.remote!)
    const meta = urls.length > 0 ? { attachments: urls } : undefined
    setAttachments([])

    const sentAt = new Date().toISOString()

    // Add optimistically so it appears immediately
    addMessage(id, {
      id: `local-${Date.now()}`,
      agent_id: id,
      user_id: user.id,
      direction: 'inbound',
      content,
      created_at: sentAt,
      metadata: meta ?? null,
    })

    if (agent?.metadata?.paired) setIsAgentTyping(true)

    if (agent?.metadata?.type === 'telegram') {
      // Telegram: persist inbound + forward via edge function
      await supabase.from('messages').insert({
        agent_id: id, user_id: user.id, direction: 'inbound' as const, content,
      })
      fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/telegram-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: id, userId: user.id, text: content }),
      }).catch(() => {})
    } else if (agent?.metadata?.paired) {
      // Connector agent: persist inbound + relay via Realtime for connector to pick up
      const { error: insertError } = await supabase.from('messages').insert({
        agent_id: id, user_id: user.id, direction: 'inbound' as const, content,
      })
      if (insertError) showToast('Message not saved')
      await sendMessage(channelRef.current, id, user.id, content, meta)
    } else {
      // Platform agent: persist inbound first, then call chat edge function
      await supabase.from('messages').insert({
        agent_id: id, user_id: user.id, direction: 'inbound' as const, content,
      })
      const { data: { session: freshSession } } = await supabase.auth.getSession()
      if (!freshSession?.access_token) {
        showToast('Session expired — please sign in again')
        return
      }
      fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${freshSession.access_token}`,
        },
        body: JSON.stringify({ agent_id: id, content }),
      }).then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}))
          showToast((err as any).error ?? `Error ${r.status}`)
          return
        }
        // Fetch the new outbound message from DB and add it to the store
        const { data } = await supabase
          .from('messages')
          .select('*')
          .eq('agent_id', id)
          .eq('direction', 'outbound')
          .order('created_at', { ascending: false })
          .limit(1)
        if (data?.[0]) addMessage(id, data[0])
      }).catch(() => showToast('Failed to reach agent'))
    }
  }

  async function handleSharePNL() {
    setAvailablePositions([])
    setPositionFetchError(null)
    setFetchingPositions(true)
    setShowPositionPicker(true)

    if (positionChannelRef.current) supabase.removeChannel(positionChannelRef.current)

    const channel = supabase.channel(`agent:${id}`)
    positionChannelRef.current = channel

    const timeout = setTimeout(() => {
      setFetchingPositions(false)
      setPositionFetchError('No response from trading-boy. Make sure it\'s running with OKX skills.')
      supabase.removeChannel(channel)
    }, 30_000)

    channel.on('broadcast', { event: 'message' }, (event) => {
      const payload = event.payload as { direction: string; content: string }
      if (payload.direction !== 'outbound') return

      clearTimeout(timeout)
      setFetchingPositions(false)
      const positions = parsePositionsFromResponse(payload.content)
      if (positions.length === 0) {
        setPositionFetchError('No open positions found.')
      } else {
        setAvailablePositions(positions)
      }
      supabase.removeChannel(channel)
    })

    await channel.subscribe()
    await channel.send({
      type: 'broadcast',
      event: 'message',
      payload: { direction: 'inbound', content: 'List all my open positions with unrealized P&L. Be brief.', ts: Date.now() },
    })
  }

  if (!agent) return (
    <View style={styles.container}>
      {authLoading
        ? <ActivityIndicator size="large" color={Colors.accentAmber} style={{ marginTop: 100 }} />
        : <Text style={{ color: Colors.textSecondary, textAlign: 'center', marginTop: 100 }}>Agent not found</Text>
      }
    </View>
  )

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'web' ? 'padding' : Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <ShareCardModal
        visible={showShareCard}
        onClose={() => { setShowShareCard(false); setSelectedTrade(null) }}
        agentId={id}
        agentName={agent.name}
        initialTrade={selectedTrade ?? undefined}
      />

      {/* Model Settings Modal */}
      <Modal visible={modelSettingsVisible} transparent animationType="slide" onRequestClose={() => setModelSettingsVisible(false)}>
        <View style={modelStyles.overlay}>
          <View style={modelStyles.sheet}>
            {/* Header */}
            <View style={modelStyles.sheetHeader}>
              <Text style={modelStyles.sheetTitle}>Model</Text>
              <TouchableOpacity onPress={() => setModelSettingsVisible(false)} style={modelStyles.closeBtn}>
                <Text style={modelStyles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Current model display */}
            {(() => {
              const meta = (agent?.metadata ?? {}) as any
              const provider = meta?.llmProvider ?? (meta?.openrouterKey ? 'openrouter' : 'openai')
              const labelMap: Record<string, string> = { openai: 'OpenAI', anthropic: 'Anthropic', openrouter: 'OpenRouter' }
              const subMap: Record<string, string> = { openai: 'gpt-4o', anthropic: meta?.model ?? 'claude-opus-4-6', openrouter: meta?.model ?? 'select a model' }
              return (
                <View style={modelStyles.currentCard}>
                  <View style={modelStyles.currentDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={modelStyles.currentLabel}>Currently running</Text>
                    <Text style={modelStyles.currentModel}>{labelMap[provider] ?? provider}</Text>
                    <Text style={modelStyles.currentSub}>{subMap[provider]}</Text>
                  </View>
                </View>
              )
            })()}

            {/* LLM picker */}
            <Text style={modelStyles.label}>Language Model</Text>
            <View style={modelStyles.workflowRow}>
              <TouchableOpacity
                style={[modelStyles.workflowCard, selectedWorkflow === 'openai' && modelStyles.workflowCardActive]}
                onPress={() => setSelectedWorkflow('openai')}
                activeOpacity={0.75}
              >
                <Text style={modelStyles.workflowIcon}>🟢</Text>
                <Text style={[modelStyles.workflowName, selectedWorkflow === 'openai' && { color: Colors.accentTeal }]}>OpenAI</Text>
                <Text style={modelStyles.workflowDesc}>gpt-4o</Text>
                {selectedWorkflow === 'openai' && <Text style={modelStyles.workflowCheck}>✓</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={[modelStyles.workflowCard, selectedWorkflow === 'anthropic' && modelStyles.workflowCardActive]}
                onPress={() => setSelectedWorkflow('anthropic')}
                activeOpacity={0.75}
              >
                <Text style={modelStyles.workflowIcon}>🟠</Text>
                <Text style={[modelStyles.workflowName, selectedWorkflow === 'anthropic' && { color: Colors.accentTeal }]}>Anthropic</Text>
                <Text style={modelStyles.workflowDesc}>claude-opus-4-6</Text>
                {selectedWorkflow === 'anthropic' && <Text style={modelStyles.workflowCheck}>✓</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={[modelStyles.workflowCard, selectedWorkflow === 'openrouter' && modelStyles.workflowCardActive]}
                onPress={() => setSelectedWorkflow('openrouter')}
                activeOpacity={0.75}
              >
                <Text style={modelStyles.workflowIcon}>🔀</Text>
                <Text style={[modelStyles.workflowName, selectedWorkflow === 'openrouter' && { color: Colors.accentTeal }]}>OpenRouter</Text>
                <Text style={modelStyles.workflowDesc}>100+ models</Text>
                {selectedWorkflow === 'openrouter' && <Text style={modelStyles.workflowCheck}>✓</Text>}
              </TouchableOpacity>
            </View>

            {/* API key input for OpenAI / Anthropic */}
            {(selectedWorkflow === 'openai' || selectedWorkflow === 'anthropic') && (
              <TextInput
                style={[modelStyles.input, { marginTop: 12 }]}
                value={llmApiKey}
                onChangeText={setLlmApiKey}
                placeholder={selectedWorkflow === 'openai' ? 'sk-... (leave blank to use default)' : 'sk-ant-... (leave blank to use default)'}
                placeholderTextColor={Colors.textMuted}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}

            {/* Image Generation picker */}
            <Text style={[modelStyles.label, { marginTop: 20 }]}>Image Generation</Text>
            <View style={modelStyles.workflowRow}>
              <TouchableOpacity
                style={[modelStyles.workflowCard, imageProvider === 'manus' && modelStyles.workflowCardActive]}
                onPress={() => setImageProvider('manus')}
                activeOpacity={0.75}
              >
                <Text style={modelStyles.workflowIcon}>🍌</Text>
                <Text style={[modelStyles.workflowName, imageProvider === 'manus' && { color: Colors.accentTeal }]}>Nano Banana Pro</Text>
                <Text style={modelStyles.workflowDesc}>Manus · higher quality</Text>
                {imageProvider === 'manus' && <Text style={modelStyles.workflowCheck}>✓</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={[modelStyles.workflowCard, imageProvider === 'dalle' && modelStyles.workflowCardActive]}
                onPress={() => setImageProvider('dalle')}
                activeOpacity={0.75}
              >
                <Text style={modelStyles.workflowIcon}>🎨</Text>
                <Text style={[modelStyles.workflowName, imageProvider === 'dalle' && { color: Colors.accentTeal }]}>DALL-E 3</Text>
                <Text style={modelStyles.workflowDesc}>OpenAI · fast & reliable</Text>
                {imageProvider === 'dalle' && <Text style={modelStyles.workflowCheck}>✓</Text>}
              </TouchableOpacity>
            </View>

            {/* OpenRouter config — only visible when selected */}
            {selectedWorkflow === 'openrouter' && (
              <>
                <Text style={[modelStyles.label, { marginTop: 16 }]}>API Key</Text>
                <View style={modelStyles.keyRow}>
                  <TextInput
                    style={[modelStyles.input, { flex: 1, marginBottom: 0 }]}
                    value={orKey}
                    onChangeText={setOrKey}
                    placeholder="sk-or-..."
                    placeholderTextColor={Colors.textMuted}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={[modelStyles.fetchBtn, (fetchingModels || !orKey.trim()) && { opacity: 0.4 }]}
                    onPress={() => fetchOpenRouterModels(orKey)}
                    disabled={fetchingModels || !orKey.trim()}
                  >
                    {fetchingModels
                      ? <ActivityIndicator size="small" color={Colors.accentTeal} />
                      : <Text style={modelStyles.fetchBtnText}>Load</Text>
                    }
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={[modelStyles.input, { marginTop: 10 }]}
                  value={orModelSearch}
                  onChangeText={setOrModelSearch}
                  placeholder="Search models…"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                />

                <ScrollView style={modelStyles.modelList} keyboardShouldPersistTaps="handled">
                  {(orModels.length > 0 ? orModels : DEFAULT_OR_MODELS)
                    .filter(m => m.id.toLowerCase().includes(orModelSearch.toLowerCase()) || m.name.toLowerCase().includes(orModelSearch.toLowerCase()))
                    .map(m => (
                      <TouchableOpacity
                        key={m.id}
                        style={[modelStyles.modelRow, orModel === m.id && modelStyles.modelRowSelected]}
                        onPress={() => { setOrModel(m.id); setOrModelSearch('') }}
                        activeOpacity={0.7}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[modelStyles.modelId, orModel === m.id && { color: Colors.accentTeal }]}>{m.id}</Text>
                          {m.name !== m.id && <Text style={modelStyles.modelName}>{m.name}</Text>}
                        </View>
                        {orModel === m.id && <Text style={modelStyles.checkmark}>✓</Text>}
                      </TouchableOpacity>
                    ))
                  }
                </ScrollView>
              </>
            )}

            <TouchableOpacity
              style={[modelStyles.saveBtn, (savingModel || (selectedWorkflow === 'openrouter' && (!orKey.trim() || !orModel))) && { opacity: 0.4 }]}
              onPress={saveModelSettings}
              disabled={savingModel || (selectedWorkflow === 'openrouter' && (!orKey.trim() || !orModel))}
            >
              {savingModel
                ? <ActivityIndicator color="#000" size="small" />
                : <Text style={modelStyles.saveBtnText}>Apply</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.agentName}>{agent.name}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[status] }]} />
            <Text style={[styles.statusText, { color: STATUS_COLOR[status] }]}>{status}</Text>
            {(() => {
              const meta = agent.metadata as any
              if (meta?.openrouterKey && meta?.model) return <Text style={styles.modelBadge}>{meta.model.split('/').pop()}</Text>
              const provider = meta?.llmProvider ?? 'openai'
              return <Text style={styles.modelBadge}>{provider}</Text>
              return null
            })()}
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.gearBtn} onPress={() => setModelSettingsVisible(true)}>
            <Text style={styles.gearBtnText}>⚙</Text>
          </TouchableOpacity>
          {['connected', 'connecting', 'stale'].includes(status) && (
            <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
              <Text style={styles.disconnectBtnText}>Disconnect</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.shareBtn} onPress={handleSharePNL}>
            <Text style={styles.shareBtnText}>Share P&L</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {agentTabs.map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Chat Tab */}
      {tab === 'chat' && (
        <>
          <View style={styles.chatArea}>
            <FlatList
              ref={flatListRef}
              data={messagesReversed}
              keyExtractor={(m) => m.id}
              renderItem={renderMessage}
              contentContainerStyle={styles.chatList}
              ListHeaderComponent={isAgentTyping ? <TypingBubble /> : null}
              inverted
              removeClippedSubviews={true}
              windowSize={10}
              maxToRenderPerBatch={10}
              initialNumToRender={20}
              onScroll={handleScroll}
              scrollEventThrottle={100}
            />
            {showScrollBtn && (
              <TouchableOpacity style={styles.scrollToBottomBtn} onPress={scrollToBottom} activeOpacity={0.85}>
                {unreadWhileScrolled > 0 && (
                  <View style={styles.scrollToBottomBadge}>
                    <Text style={styles.scrollToBottomBadgeText}>
                      {unreadWhileScrolled > 99 ? '99+' : unreadWhileScrolled}
                    </Text>
                  </View>
                )}
                <Ionicons name="chevron-down" size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          {attachments.length > 0 && (
            <View style={styles.attachmentPreview}>
              {attachments.map((att, i) => (
                <View key={i} style={styles.attachmentThumbWrap}>
                  <Image source={{ uri: att.local }} style={styles.attachmentThumb} />
                  <TouchableOpacity style={styles.attachmentRemove} onPress={() => setAttachments((p) => p.filter((_, j) => j !== i))}>
                    <Text style={styles.attachmentRemoveText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          {cmdPickerVisible && (
            <ScrollView
              style={styles.cmdPicker}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {slashCommands.filter(c => c.cmd.startsWith(input)).map((c) => (
                <TouchableOpacity
                  key={c.cmd}
                  style={styles.cmdPickerRow}
                  onPress={() => {
                    setCmdPickerVisible(false)
                    setInput('')
                    if (!user || !id) return
                    const content = c.cmd
                    addMessage(id, { id: Date.now().toString(), agent_id: id, user_id: user.id, direction: 'inbound', content, created_at: new Date().toISOString() })
                    sendMessage(channelRef.current, id, user.id, content, {})
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cmdPickerCmd}>{c.cmd}</Text>
                  <Text style={styles.cmdPickerDesc}>{c.desc}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.attachBtn} onPress={handlePickImage} disabled={uploading}>
              {uploading
                ? <ActivityIndicator size="small" color={Colors.textMuted} />
                : <Text style={styles.attachBtnText}>⊕</Text>
              }
            </TouchableOpacity>
            <TextInput
              style={styles.chatInput}
              value={input}
              onChangeText={(v) => {
                setInput(v)
                const matches = slashCommands.filter(c => c.cmd.startsWith(v))
              setCmdPickerVisible(v.startsWith('/') && !v.includes(' ') && !(matches.length === 1 && matches[0].cmd === v))
              }}
              placeholder="Message agent…"
              placeholderTextColor={Colors.textMuted}
              multiline={Platform.OS !== 'web'}
              returnKeyType="send"
              blurOnSubmit={true}
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity style={[styles.sendBtn, (!input.trim() && attachments.length === 0 || uploading) && styles.sendBtnDisabled]} onPress={handleSend} disabled={uploading}>
              <Text style={styles.sendBtnText}>↑</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Status Tab */}
      {tab === 'status' && (
        <View style={styles.tabContent}>
          {/* Big status indicator */}
          <View style={styles.statusHero}>
            <View style={[styles.statusHeroDot, { backgroundColor: STATUS_COLOR[status] }]} />
            <Text style={[styles.statusHeroText, { color: STATUS_COLOR[status] }]}>{status.toUpperCase()}</Text>
          </View>

          <View style={styles.statusCard}>
            <Row label="Last seen" value={agent.last_seen ? new Date(agent.last_seen).toLocaleString() : '—'} />
            <Row label="Agent ID" value={agent.id.slice(0, 8) + '…'} mono />
            <Row label="Member since" value={agent.created_at ? new Date(agent.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—'} />
          </View>

          {/* Metadata badges */}
          {(agent.metadata?.storage_mode || agent.metadata?.platform || agent.metadata?.protocol_version) && (
            <View style={styles.badgeRow}>
              {agent.metadata?.storage_mode && (
                <View style={styles.badge}>
                  <Text style={styles.badgeLabel}>storage</Text>
                  <Text style={styles.badgeValue}>{String(agent.metadata.storage_mode)}</Text>
                </View>
              )}
              {agent.metadata?.platform && (
                <View style={styles.badge}>
                  <Text style={styles.badgeLabel}>platform</Text>
                  <Text style={styles.badgeValue}>{String(agent.metadata.platform)}</Text>
                </View>
              )}
              {agent.metadata?.protocol_version && (
                <View style={styles.badge}>
                  <Text style={styles.badgeLabel}>protocol</Text>
                  <Text style={styles.badgeValue}>v{String(agent.metadata.protocol_version)}</Text>
                </View>
              )}
              {agent.metadata?.powered_by && (
                <View style={styles.badge}>
                  <Text style={styles.badgeLabel}>model</Text>
                  <Text style={styles.badgeValue}>{String(agent.metadata.powered_by)}</Text>
                </View>
              )}
            </View>
          )}

          {status === 'disconnected' || status === 'error' ? (
            <View style={styles.reconnectBox}>
              <Text style={styles.reconnectLabel}>Agent offline. Re-run to reconnect:</Text>
              <Text style={styles.reconnectCmd}>{`npx slugs-connector connect --token ${user?.id}`}</Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Vitals Tab */}
      {tab === 'vitals' && (
        <View style={styles.tabContent}>
          {tokenStats ? (
            <>
              {/* Cost hero */}
              <View style={styles.costHero}>
                <Text style={styles.costLabel}>EST. COST</Text>
                <Text style={styles.costValue}>
                  ${((tokenStats.input / 1_000_000) * 0.80 + (tokenStats.output / 1_000_000) * 4.00).toFixed(4)}
                </Text>
                <Text style={styles.costNote}>Haiku · $0.80/M in · $4.00/M out</Text>
              </View>

              {/* Token split */}
              <View style={styles.tokenCard}>
                <View style={styles.tokenSplitRow}>
                  <View style={styles.tokenSide}>
                    <Text style={styles.tokenSideLabel}>INPUT</Text>
                    <Text style={styles.tokenSideValue}>{(tokenStats.input / 1000).toFixed(1)}k</Text>
                  </View>
                  <View style={styles.tokenTotal}>
                    <Text style={styles.tokenTotalValue}>{((tokenStats.input + tokenStats.output) / 1000).toFixed(1)}k</Text>
                    <Text style={styles.tokenTotalLabel}>total tokens</Text>
                  </View>
                  <View style={[styles.tokenSide, { alignItems: 'flex-end' }]}>
                    <Text style={styles.tokenSideLabel}>OUTPUT</Text>
                    <Text style={[styles.tokenSideValue, { color: Colors.accentTeal }]}>{(tokenStats.output / 1000).toFixed(1)}k</Text>
                  </View>
                </View>

                {/* Split bar */}
                {tokenStats.input + tokenStats.output > 0 && (
                  <View style={styles.splitBarTrack}>
                    <View
                      style={[
                        styles.splitBarFill,
                        { flex: tokenStats.input, backgroundColor: Colors.textMuted },
                      ]}
                    />
                    <View
                      style={[
                        styles.splitBarFill,
                        { flex: tokenStats.output, backgroundColor: Colors.accentTeal },
                      ]}
                    />
                  </View>
                )}
              </View>

              {/* Message count */}
              <View style={styles.statusCard}>
                <Row label="Messages" value={tokenStats.messageCount.toLocaleString()} />
                <Row label="Avg tokens / msg" value={tokenStats.messageCount > 0 ? Math.round((tokenStats.input + tokenStats.output) / tokenStats.messageCount).toLocaleString() : '—'} />
              </View>
            </>
          ) : (
            <View style={styles.vitalsEmpty}>
              <Text style={styles.vitalsEmptyText}>No token data yet</Text>
              <Text style={styles.vitalsEmptyHint}>Token usage is tracked when cloud storage mode is active</Text>
            </View>
          )}
        </View>
      )}

      {/* Activity Tab */}
      {tab === 'activity' && (
        <View style={{ flex: 1 }}>
          {messages.length === 0 ? (
            <View style={styles.tabContent}>
              <Text style={styles.activityEmpty}>No activity yet — send a message to get started</Text>
            </View>
          ) : (
            <FlatList
              data={[...messages].reverse()}
              keyExtractor={(m) => m.id + '-activity'}
              contentContainerStyle={styles.activityList}
              renderItem={({ item }) => (
                <View style={styles.activityRow}>
                  <View style={[styles.activityDot, { backgroundColor: item.direction === 'inbound' ? Colors.accentCrimson : Colors.accentTeal }]} />
                  <View style={styles.activityContent}>
                    <Text style={styles.activityLabel}>{item.direction === 'inbound' ? 'You' : agent.name}</Text>
                    <Text style={styles.activityText} numberOfLines={2}>{item.content}</Text>
                  </View>
                  <Text style={styles.activityTime}>
                    {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              )}
            />
          )}
        </View>
      )}
      {/* Skills Tab */}
      {tab === 'skills' && (
        <View style={{ flex: 1 }}>
          {loadingSkills ? (
            <View style={styles.tabContent}>
              <ActivityIndicator color={Colors.accentTeal} />
            </View>
          ) : agentSkills.length === 0 ? (
            <View style={styles.tabContent}>
              <Text style={styles.activityEmpty}>No skills installed — browse the Skills tab to add some</Text>
            </View>
          ) : (
            <>
              {/* Skills toolbar */}
              <View style={styles.skillsToolbar}>
                {selectMode ? (
                  <>
                    <TouchableOpacity onPress={toggleSelectAll}>
                      <Text style={styles.toolbarSelectAll}>
                        {selectedSkillIds.size === agentSkills.length ? 'Deselect All' : 'Select All'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setSelectMode(false); setSelectedSkillIds(new Set()) }}>
                      <Text style={styles.toolbarCancel}>Cancel</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity style={styles.toolbarEditBtn} onPress={() => setSelectMode(true)}>
                    <Text style={styles.toolbarEditText}>Edit</Text>
                  </TouchableOpacity>
                )}
              </View>

              <FlatList
                data={agentSkills}
                keyExtractor={(s) => s.id}
                contentContainerStyle={[styles.skillList, selectMode && { paddingBottom: 90 }]}
                renderItem={({ item }) => {
                  const selected = selectedSkillIds.has(item.id)
                  return (
                    <TouchableOpacity
                      style={[styles.skillCard, selected && styles.skillCardSelected]}
                      activeOpacity={0.75}
                      onPress={() => {
                        if (selectMode) {
                          toggleSkillSelection(item.id)
                        } else {
                          if (item.skillId) router.push(`/skill/${item.skillId}?agentId=${id}`)
                          else if (item.skillSlug) router.push(`/skill/clawhub/${item.skillSlug}?agentId=${id}`)
                        }
                      }}
                    >
                      {selectMode && (
                        <View style={[styles.skillCheckbox, selected && styles.skillCheckboxSelected]}>
                          {selected && <Ionicons name="checkmark" size={12} color="#fff" />}
                        </View>
                      )}
                      <View style={[styles.skillIcon, { backgroundColor: categoryColor(item.category) + '22' }]}>
                        <Text style={[styles.skillIconText, { color: categoryColor(item.category) }]}>
                          {item.name[0].toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.skillInfo}>
                        <Text style={styles.skillName}>{item.name}</Text>
                        <View style={styles.skillMeta}>
                          {item.category ? <Text style={[styles.skillCategory, { color: categoryColor(item.category) }]}>{item.category}</Text> : null}
                          <Text style={styles.skillVersion}>v{item.version}</Text>
                        </View>
                        {item.description ? (
                          <Text style={styles.skillDesc} numberOfLines={2}>{item.description}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  )
                }}
              />

              {/* Bulk uninstall bar */}
              {selectMode && (
                <View style={styles.bulkBar}>
                  <TouchableOpacity
                    style={[styles.bulkBtn, selectedSkillIds.size === 0 && styles.bulkBtnDisabled]}
                    onPress={handleBulkUninstall}
                    disabled={selectedSkillIds.size === 0 || bulkUninstalling}
                  >
                    {bulkUninstalling
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={styles.bulkBtnText}>
                          {selectedSkillIds.size === 0
                            ? 'Select skills to uninstall'
                            : `Uninstall ${selectedSkillIds.size} skill${selectedSkillIds.size !== 1 ? 's' : ''}`
                          }
                        </Text>
                    }
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      )}
      {/* ── Studio Tab ── */}
      {tab === 'studio' && (
        <StudioTab messages={messages} notionUrl={agent?.metadata?.notion_url as string | undefined} />
      )}
      {/* ── Trades Tab ── */}
      {tab === 'trades' && (
        <ScrollView style={styles.tabContent} contentContainerStyle={{ padding: 16, gap: 0 }}>
          {/* Open positions */}
          <Text style={styles.tradesSectionLabel}>OPEN</Text>
          {MOCK_OPEN_TRADES.map((pos, i) => <TradeCard key={`open-${i}`} pos={pos} onShare={() => { setSelectedTrade(pos); setShowShareCard(true) }} />)}

          {/* Closed trades */}
          <Text style={[styles.tradesSectionLabel, { marginTop: 24 }]}>CLOSED</Text>
          {MOCK_CLOSED_TRADES.map((pos, i) => <TradeCard key={`closed-${i}`} pos={pos} onShare={() => { setSelectedTrade(pos); setShowShareCard(true) }} />)}
        </ScrollView>
      )}

      {/* ── Position Picker Modal ── */}
      <Modal visible={showPositionPicker && !showShareCard} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPositionPicker(false)}>
        <View style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>Select Position to Share</Text>
            <TouchableOpacity onPress={() => setShowPositionPicker(false)} style={styles.pickerClose}>
              <Text style={styles.pickerCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.pickerContent}>
            {fetchingPositions ? (
              <View style={styles.centered}>
                <ActivityIndicator color={Colors.accentAmber} />
                <Text style={[styles.activityEmpty, { marginTop: 12 }]}>Asking {agent?.name}…</Text>
              </View>
            ) : positionFetchError ? (
              <View style={styles.centered}>
                <Text style={[styles.activityEmpty, { color: Colors.accentRed, textAlign: 'center' }]}>{positionFetchError}</Text>
                <TouchableOpacity style={styles.refreshPositionsBtn} onPress={handleSharePNL}>
                  <Text style={styles.refreshPositionsBtnText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              availablePositions.map((pos, i) => {
                const isPos = !pos.pnl.startsWith('-')
                const pnlColor = isPos ? Colors.accentGreen : Colors.accentRed
                return (
                  <TouchableOpacity
                    key={i}
                    style={styles.pickerRow}
                    onPress={() => { setSelectedTrade(pos); setShowPositionPicker(false); setShowShareCard(true) }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.pickerRowLeft}>
                      <Text style={styles.pickerPair}>{pos.pair}</Text>
                      <Text style={[styles.pickerPnl, { color: pnlColor }]}>{isPos ? '+' : ''}${pos.pnl}  ({isPos ? '+' : ''}{pos.pnlPct}%)</Text>
                    </View>
                    <View style={[styles.tradeDirBadge, { backgroundColor: pos.direction === 'LONG' ? 'rgba(0,200,150,0.15)' : 'rgba(239,68,68,0.15)' }]}>
                      <Text style={[styles.tradeDirText, { color: pos.direction === 'LONG' ? Colors.accentGreen : Colors.accentRed }]}>{pos.direction}</Text>
                    </View>
                  </TouchableOpacity>
                )
              })
            )}
          </ScrollView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}

function categoryColor(category: string | null | undefined): string {
  switch (category?.toLowerCase()) {
    case 'finance': return Colors.accentAmber
    case 'registry': return Colors.accentTeal
    case 'productivity': return Colors.accentPurple
    case 'data': return '#60a5fa'
    default: return Colors.textSecondary
  }
}

function Row({ label, value, valueColor, mono }: { label: string; value: string; valueColor?: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueColor ? { color: valueColor } : {}, mono ? styles.mono : {}]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12, gap: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  disconnectBtn: {
    backgroundColor: 'rgba(255,149,0,0.08)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.2)',
  },
  disconnectBtnText: { color: Colors.accentAmber, fontSize: 13, fontWeight: '600' },
  shareBtn: {
    backgroundColor: 'rgba(255,69,58,0.08)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  shareBtnText: { color: Colors.accentCrimson, fontSize: 13, fontWeight: '600' },
  backBtn: { padding: 4 },
  backBtnText: { fontSize: 28, color: Colors.textSecondary, lineHeight: 28 },
  headerInfo: { flex: 1 },
  agentName: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12 },
  tabs: { flexDirection: 'row', borderBottomWidth: 0, marginHorizontal: 16 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.accentCrimson },
  tabText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
  tabTextActive: { color: Colors.accentCrimson },
  chatArea: { flex: 1, position: 'relative' },
  chatList: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 8 },
  scrollToBottomBtn: {
    position: 'absolute',
    right: 14,
    bottom: 12,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  scrollToBottomBadge: {
    position: 'absolute',
    top: -5,
    right: -3,
    backgroundColor: Colors.accentCrimson,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  scrollToBottomBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  bubble: {
    maxWidth: '80%',
    backgroundColor: Colors.bgElevated,
    borderRadius: 16,
    padding: 12,
    alignSelf: 'flex-start',
  },
  bubbleOut: { alignSelf: 'flex-end', backgroundColor: '#1a0608' },
  bubbleImage: { width: IMG_W, height: 200, borderRadius: 10, marginBottom: 6, overflow: 'hidden', backgroundColor: Colors.bgSurface },
  bubblePressed: { opacity: 0.6 },
  bubbleText: { color: Colors.textPrimary, fontSize: 15, lineHeight: 20 },
  bubbleTextOut: { color: '#fff' },
  bubbleLink: { color: Colors.accentTeal, textDecorationLine: 'underline' },
  bubbleCmd: { color: '#a78bfa', fontWeight: '600' },
  bubbleCmdOut: { color: '#c4b5fd' },
  bubblePnlPos: { color: Colors.accentGreen, fontWeight: '700' },
  bubblePnlNeg: { color: Colors.accentRed, fontWeight: '700' },
  cmdPicker: {
    maxHeight: 220,
    backgroundColor: Colors.bgElevated,
    borderTopWidth: 1,
    borderTopColor: Colors.bgBorder,
  },
  cmdPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: Colors.bgBorder,
    gap: 12,
  },
  cmdPickerCmd: { color: '#a78bfa', fontSize: 14, fontWeight: '500', width: 100 },
  cmdPickerDesc: { color: Colors.textSecondary, fontSize: 13, flex: 1 },
  bubbleTime: { color: Colors.textSecondary, fontSize: 11, marginTop: 4, alignSelf: 'flex-end' },
  sendBtnDisabled: { opacity: 0.4 },
  attachmentPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  attachmentThumbWrap: { position: 'relative' },
  attachmentThumb: { width: 64, height: 64, borderRadius: 8 },
  attachmentRemove: {
    position: 'absolute', top: -6, right: -6,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.accentCrimson,
    justifyContent: 'center', alignItems: 'center',
  },
  attachmentRemoveText: { color: '#fff', fontSize: 12, fontWeight: '700', lineHeight: 14 },
  inputRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  attachBtn: {
    width: 44, height: 44,
    justifyContent: 'center', alignItems: 'center',
    borderRadius: 12,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
  },
  attachBtnText: { color: Colors.textSecondary, fontSize: 22 },
  chatInput: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    borderBottomWidth: 2,
    borderBottomColor: Colors.accentCrimson,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.textPrimary,
    fontSize: 15,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.accentCrimson,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnText: { color: Colors.bgPrimary, fontSize: 20, fontWeight: '700' },
  tabContent: { flex: 1, padding: 16 },
  statusCard: { backgroundColor: '#0f0f0f', borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', padding: 14 },
  rowLabel: { color: Colors.textSecondary, fontSize: 14 },
  rowValue: { color: Colors.textPrimary, fontSize: 14 },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  reconnectBox: { marginTop: 16, backgroundColor: 'rgba(245, 158, 11, 0.08)', borderRadius: 12, padding: 16, gap: 8 },
  reconnectLabel: { color: Colors.accentAmber, fontSize: 13 },
  reconnectCmd: { color: Colors.accentTeal, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 },

  // Status tab
  statusHero: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  statusHeroDot: { width: 12, height: 12, borderRadius: 6 },
  statusHeroText: { fontSize: 22, fontWeight: '800', letterSpacing: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  badge: {
    backgroundColor: '#0f0f0f',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
  },
  badgeLabel: { fontSize: 9, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  badgeValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },

  // Vitals tab
  costHero: {
    backgroundColor: '#0f0f0f',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
  },
  costLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.5, marginBottom: 4 },
  costValue: { fontSize: 36, fontWeight: '800', color: Colors.accentAmber, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  costNote: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },

  tokenCard: { backgroundColor: '#0f0f0f', borderRadius: 16, padding: 16, marginBottom: 12, gap: 12 },
  tokenSplitRow: { flexDirection: 'row', alignItems: 'center' },
  tokenSide: { flex: 1, gap: 2 },
  tokenSideLabel: { fontSize: 9, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  tokenSideValue: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  tokenTotal: { alignItems: 'center', gap: 2 },
  tokenTotalValue: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  tokenTotalLabel: { fontSize: 10, color: Colors.textMuted },
  splitBarTrack: { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', gap: 1 },
  splitBarFill: { height: 4, borderRadius: 2 },

  vitalsEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 80 },
  vitalsEmptyText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  vitalsEmptyHint: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 32 },

  activityEmpty: { color: Colors.textSecondary, textAlign: 'center', marginTop: 48 },
  tradesSectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },

  // Trades tab
  tradeCard: { backgroundColor: '#0f0f0f', borderRadius: 14, padding: 16, gap: 8, borderWidth: 1, borderColor: Colors.bgBorder },
  tradeCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tradePairRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tradePair: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  tradeDirBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  tradeDirText: { fontSize: 11, fontWeight: '700' },
  tradeShareBtn: { backgroundColor: Colors.accentCrimson, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  tradeShareBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  tradePnl: { fontSize: 26, fontWeight: '800' },
  tradePnlPct: { fontSize: 16, fontWeight: '600' },
  tradePriceRow: { flexDirection: 'row', gap: 20 },
  tradePriceLabel: { fontSize: 12, color: Colors.textMuted },
  tradePriceVal: { color: Colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  refreshPositionsBtn: { backgroundColor: Colors.bgElevated, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24, alignSelf: 'center', marginTop: 8 },
  refreshPositionsBtnText: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },

  // Position picker modal
  pickerContainer: { flex: 1, backgroundColor: Colors.bgPrimary },
  pickerHeader: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.bgBorder, alignItems: 'center' },
  pickerHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.bgBorder, marginBottom: 12 },
  pickerTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  pickerClose: { position: 'absolute', right: 16, top: 16 },
  pickerCloseText: { color: Colors.textSecondary, fontSize: 18 },
  pickerContent: { padding: 20, gap: 12 },
  pickerRow: { backgroundColor: '#0f0f0f', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.bgBorder },
  pickerRowLeft: { gap: 4 },
  pickerPair: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  pickerPnl: { fontSize: 14, fontWeight: '600' },
  activityList: { padding: 16, gap: 2 },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.bgBorder,
  },
  activityDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  activityContent: { flex: 1, gap: 2 },
  activityLabel: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  activityText: { fontSize: 14, color: Colors.textPrimary, lineHeight: 19 },
  activityTime: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  skillsToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  toolbarEditBtn: { paddingVertical: 4, paddingHorizontal: 2 },
  toolbarEditText: { fontSize: 14, fontWeight: '600', color: Colors.accentAmber },
  toolbarSelectAll: { fontSize: 14, fontWeight: '600', color: Colors.accentAmber },
  toolbarCancel: { fontSize: 14, color: Colors.textSecondary },
  skillList: { padding: 12, gap: 10 },
  skillCard: {
    backgroundColor: '#0f0f0f',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  skillCardSelected: {
    borderWidth: 1.5,
    borderColor: Colors.accentRed,
  },
  skillCheckbox: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.textMuted,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0, marginTop: 9,
  },
  skillCheckboxSelected: {
    backgroundColor: Colors.accentRed,
    borderColor: Colors.accentRed,
  },
  bulkBar: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    padding: 16,
    paddingBottom: 28,
    backgroundColor: Colors.bgPrimary,
    borderTopWidth: 1,
    borderTopColor: Colors.bgBorder,
  },
  bulkBtn: {
    backgroundColor: Colors.accentRed,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  bulkBtnDisabled: { backgroundColor: Colors.bgElevated },
  bulkBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  skillRemoveBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 4,
  },
  skillIcon: {
    width: 38, height: 38, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  skillIconText: { fontSize: 16, fontWeight: '700' },
  skillInfo: { flex: 1, gap: 3, paddingRight: 16 },
  skillName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  skillMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  skillCategory: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  skillVersion: { fontSize: 11, color: Colors.textMuted },
  skillDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginTop: 2 },
  centered: { alignItems: 'center' as const, justifyContent: 'center' as const, paddingVertical: 24 },

  // Header additions
  modelBadge: { fontSize: 10, color: Colors.textMuted, marginLeft: 6, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  gearBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.bgBorder, alignItems: 'center', justifyContent: 'center' },
  gearBtnText: { fontSize: 16, color: Colors.textSecondary },
})

const modelStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.bgElevated,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 44,
    maxHeight: '88%',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  closeBtn: { padding: 4 },
  closeBtnText: { fontSize: 18, color: Colors.textMuted },

  // Current model card
  currentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bgSurface,
    borderRadius: 14, padding: 14, marginBottom: 24,
    borderWidth: 1, borderColor: Colors.bgBorder,
  },
  currentDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accentGreen },
  currentLabel: { fontSize: 11, fontWeight: '600', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 },
  currentModel: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  currentSub: { fontSize: 12, color: Colors.textMuted },

  label: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 },

  // Workflow cards
  workflowRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  workflowCard: {
    flex: 1, backgroundColor: Colors.bgSurface,
    borderRadius: 14, padding: 14,
    borderWidth: 1.5, borderColor: Colors.bgBorder,
    position: 'relative',
  },
  workflowCardActive: { borderColor: Colors.accentTeal },
  workflowIcon: { fontSize: 22, marginBottom: 8 },
  workflowName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  workflowDesc: { fontSize: 11, color: Colors.textMuted, lineHeight: 16 },
  workflowCheck: { position: 'absolute', top: 10, right: 12, fontSize: 13, color: Colors.accentTeal, fontWeight: '700' },

  // OpenRouter config
  keyRow: { flexDirection: 'row', gap: 8 },
  input: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.bgBorder,
    paddingHorizontal: 12, paddingVertical: 10,
    color: Colors.textPrimary, fontSize: 14,
    marginBottom: 0,
  },
  fetchBtn: {
    backgroundColor: Colors.bgSurface, borderRadius: 10, borderWidth: 1, borderColor: Colors.bgBorder,
    paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', minWidth: 56,
  },
  fetchBtnText: { fontSize: 13, fontWeight: '600', color: Colors.accentTeal },
  modelList: { maxHeight: 200, marginBottom: 16, marginTop: 2 },
  modelRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 10, marginBottom: 4,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1, borderColor: Colors.bgBorder,
  },
  modelRowSelected: { borderColor: Colors.accentTeal },
  modelId: { fontSize: 12, color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  modelName: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  checkmark: { fontSize: 13, color: Colors.accentTeal, marginLeft: 6 },

  saveBtn: {
    backgroundColor: Colors.accentTeal, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 16,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#000' },
})
