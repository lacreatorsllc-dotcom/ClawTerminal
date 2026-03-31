import { useState, useEffect, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Image, Linking, Alert, Modal, ScrollView,
} from 'react-native'
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

type Tab = 'chat' | 'trades' | 'status' | 'vitals' | 'activity' | 'skills'

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

const SLASH_COMMANDS = [
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

const URL_REGEX = /^https?:\/\/[^\s]+$/
const TOKEN_REGEX = /(https?:\/\/[^\s]+|`\/[a-z][a-z0-9_\s\-\[\]]*`|\/[a-z][a-z0-9_]*)/g

function MessageText({ content, outbound }: { content: string; outbound: boolean }) {
  const parts = content.split(TOKEN_REGEX)
  return (
    <Text style={[styles.bubbleText, outbound && styles.bubbleTextOut]}>
      {parts.map((part, i) => {
        if (URL_REGEX.test(part)) return <Text key={i} style={styles.bubbleLink} onPress={() => Linking.openURL(part)}>{part}</Text>
        if (/^`\//.test(part)) return <Text key={i} style={styles.bubbleCmd}>{part.replace(/`/g, '')}</Text>
        if (/^\/[a-z]/.test(part)) return <Text key={i} style={styles.bubbleCmd}>{part}</Text>
        return <Text key={i}>{part}</Text>
      })}
    </Text>
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

const STATUS_COLOR: Record<AgentStatus, string> = {
  connected: Colors.accentGreen,
  connecting: Colors.accentTeal,
  stale: Colors.accentAmber,
  error: Colors.accentRed,
  disconnected: Colors.textSecondary,
}

export default function AgentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
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

  const { agents, getConnectionStatus, upsertAgent } = useAgentsStore()
  const { user, session } = useAuthStore()
  const { messagesByAgent, setMessages, addMessage } = useChatStore()
  const showToast = useUIStore((s) => s.showToast)

  const agent = agents.find((a) => a.id === id)
  const messages = messagesByAgent[id] ?? []
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
        addMessage(id, msg)
      },
    })
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [id])

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

    // Persist to DB so it survives navigation
    const { error: insertError } = await supabase.from('messages').insert({
      agent_id: id,
      user_id: user.id,
      direction: 'inbound' as const,
      content,
    })
    if (insertError) showToast('Message not saved')

    await sendMessage(channelRef.current, id, user.id, content, meta)

    // If this is a Telegram agent, forward the message via Edge Function
    if (agent?.metadata?.type === 'telegram') {
      fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/telegram-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: id, userId: user.id, text: content }),
      }).catch(() => {}) // fire-and-forget
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
      <Text style={{ color: Colors.textSecondary, textAlign: 'center', marginTop: 100 }}>Agent not found</Text>
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
          </View>
        </View>
        <View style={styles.headerActions}>
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
        {(['chat', 'trades', 'status', 'vitals', 'activity', 'skills'] as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Chat Tab */}
      {tab === 'chat' && (
        <>
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <View style={[styles.bubble, item.direction === 'inbound' && styles.bubbleOut]}>
                {item.metadata?.attachments?.map((url, i) => (
                  <Image key={i} source={{ uri: url }} style={styles.bubbleImage} resizeMode="cover" />
                ))}
                {item.content && item.content !== '[image]' && (
                  <MessageText content={item.content} outbound={item.direction === 'inbound'} />
                )}
                <Text style={styles.bubbleTime}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
            )}
            contentContainerStyle={styles.chatList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />
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
              {SLASH_COMMANDS.filter(c => c.cmd.startsWith(input)).map((c) => (
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
                const matches = SLASH_COMMANDS.filter(c => c.cmd.startsWith(v))
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
  chatList: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  bubble: {
    maxWidth: '80%',
    backgroundColor: Colors.bgElevated,
    borderRadius: 16,
    padding: 12,
    alignSelf: 'flex-start',
  },
  bubbleOut: { alignSelf: 'flex-end', backgroundColor: '#1a0608' },
  bubbleImage: { width: '100%', height: 180, borderRadius: 10, marginBottom: 6 },
  bubbleText: { color: Colors.textPrimary, fontSize: 15, lineHeight: 20 },
  bubbleTextOut: { color: '#fff' },
  bubbleLink: { color: Colors.accentTeal, textDecorationLine: 'underline' },
  bubbleCmd: { color: '#a78bfa' },
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
})
