import { useRef, useState, useCallback, useEffect } from 'react'
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  ActivityIndicator, Platform, Image, ScrollView,
} from 'react-native'
import { captureViewToUri, shareOrSaveUri } from '../lib/capture'
import { supabase } from '../lib/supabase'
import { Colors } from '../constants/colors'

const SLUGS_LOGO = require('../assets/slugs-logo.png')

const PNL_REQUEST = 'What are my current open positions? Show unrealized P&L.'

export interface TradeData {
  pair: string
  direction: string
  leverage: string
  pnl: string
  pnlPct: string
  entryPrice: string
  markPrice: string
}

const EMPTY_TRADE: TradeData = {
  pair: '', direction: 'LONG', leverage: '',
  pnl: '0', pnlPct: '0', entryPrice: '', markPrice: '',
}

const LAST_KNOWN: TradeData = {
  pair: 'SOL/BTC', direction: 'LONG', leverage: '20X',
  pnl: '1245.50', pnlPct: '125.40', entryPrice: '0.00245', markPrice: '0.00552',
}

// ── Card designs ──────────────────────────────────────────────────────────────

export type CardDesign = 'rings' | 'circuit'

const DESIGNS: { id: CardDesign; label: string; bg: string }[] = [
  { id: 'rings',   label: 'Rings',   bg: '#0d0d0d' },
  { id: 'circuit', label: 'Circuit', bg: '#0d1117' },
]

const CARD_W = 380
const CARD_H = 440

function pnlDisplay(trade: TradeData) {
  const isPos = !trade.pnl.startsWith('-')
  const abs = trade.pnl.replace('-', '')
  return {
    isPos,
    pnlStr: isPos ? `+$${abs}` : `-$${abs}`,
    pctStr: isPos ? `+${trade.pnlPct}%` : `-${trade.pnlPct.replace('-', '')}%`,
    green: Colors.accentGreen,
    red: Colors.accentRed,
    color: isPos ? Colors.accentGreen : Colors.accentRed,
  }
}

// ── Design: Rings ────────────────────────────────────────────────────────────
function CardRings({ trade, agentName, agentAvatarUrl }: { trade: TradeData; agentName: string; agentAvatarUrl?: string }) {
  const { isPos, pnlStr, pctStr, color } = pnlDisplay(trade)
  // Rings centered at ~60% down the card so they spread into corners nicely
  const RCX = CARD_W / 2
  const RCY = CARD_H * 0.58
  const RINGS = [700, 580, 470, 370, 280, 200, 130]

  return (
    <View style={[cardBase.container, { backgroundColor: '#0e0e0e', height: CARD_H }]}>
      {/* Concentric rings */}
      {RINGS.map((s, i) => (
        <View key={s} style={{
          position: 'absolute',
          width: s, height: s, borderRadius: s / 2,
          borderWidth: 1,
          borderColor: `rgba(160,160,160,${0.055 + i * 0.012})`,
          top: RCY - s / 2,
          left: RCX - s / 2,
        }} />
      ))}

      <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 24, paddingBottom: 20 }}>
        {/* Logo */}
        <View style={{ alignItems: 'center', marginBottom: 18 }}>
          <Image source={SLUGS_LOGO} style={{ width: 110, height: 34 }} resizeMode="contain" />
        </View>

        {/* Pair + direction/leverage badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
          {trade.pair ? (
            <Text style={{ color: '#e8714a', fontSize: 19, fontWeight: '700', letterSpacing: 0.3 }}>{trade.pair}</Text>
          ) : null}
          {(trade.direction || trade.leverage) ? (
            <View style={{ backgroundColor: '#1d5e3a', borderRadius: 20, paddingHorizontal: 13, paddingVertical: 5 }}>
              <Text style={{ color: '#4cde8a', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 }}>
                {[trade.direction, trade.leverage].filter(Boolean).join(' ')}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Ghost + main PnL */}
        <View style={{ alignItems: 'center', marginBottom: 2 }}>
          {/* Ghost — offset up-right, silver tone */}
          <Text style={{
            position: 'absolute',
            top: -10, left: 12,
            color: 'rgba(180,180,180,0.28)',
            fontSize: 54, fontWeight: '800', letterSpacing: -1.5,
          }}>{pnlStr}</Text>
          {/* Main */}
          <Text style={{ color: '#ffffff', fontSize: 54, fontWeight: '800', letterSpacing: -1.5 }}>{pnlStr}</Text>
        </View>

        {/* Avatar zone — avatar image centered, pct pill overlaid on top */}
        <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', marginTop: -4 }}>
          {agentAvatarUrl ? (
            <View>
              <Image source={{ uri: agentAvatarUrl }} style={{ width: 110, height: 130, resizeMode: 'contain' }} />
              {/* Pct overlaid near top of avatar */}
              <View style={{
                position: 'absolute', top: 6, alignSelf: 'center',
                backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 8,
                paddingHorizontal: 9, paddingVertical: 3,
              }}>
                <Text style={{ color, fontSize: 13, fontWeight: '800' }}>{pctStr}</Text>
              </View>
            </View>
          ) : (
            /* No avatar: show pct pill alone */
            <View style={{
              backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10,
              paddingHorizontal: 16, paddingVertical: 7,
            }}>
              <Text style={{ color, fontSize: 20, fontWeight: '800' }}>{pctStr}</Text>
            </View>
          )}
        </View>

        {/* Entry Price / Mark Price — flanking the avatar area */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, marginBottom: 18 }}>
          {trade.entryPrice ? (
            <View style={{ alignItems: 'flex-start' }}>
              <Text style={{ color: '#888', fontSize: 11, fontWeight: '500' }}>Entry Price</Text>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 2 }}>{trade.entryPrice}</Text>
            </View>
          ) : <View />}
          {trade.markPrice ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: '#888', fontSize: 11, fontWeight: '500' }}>Mark Price</Text>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 2 }}>{trade.markPrice}</Text>
            </View>
          ) : <View />}
        </View>

        {/* CTA button */}
        <View style={{
          borderWidth: 1.5,
          borderColor: '#6b3a22',
          borderRadius: 30,
          paddingVertical: 13,
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(12,8,6,0.7)',
        }}>
          <Text style={{ color: '#c0c0c0', fontSize: 15, fontWeight: '400' }}>Track this agent on </Text>
          <Text style={{ color: '#e8714a', fontSize: 15, fontWeight: '900' }}>SLUGS</Text>
        </View>
      </View>
    </View>
  )
}

// ── Design: Circuit ───────────────────────────────────────────────────────────
function CircuitTraces() {
  const O = '#e8714a' // orange trace color
  const T = 1.5       // line thickness
  const DOT = 5       // node dot size
  // Corner traces: top-left, top-right, bottom-left, bottom-right
  return (
    <>
      {/* Top-left */}
      <View style={{ position: 'absolute', top: 24, left: 0, width: 90, height: 1.5, backgroundColor: O, opacity: 0.8 }} />
      <View style={{ position: 'absolute', top: 24, left: 0, width: T, height: 60, backgroundColor: O, opacity: 0.8 }} />
      <View style={{ position: 'absolute', top: 60, left: 0, width: 40, height: T, backgroundColor: O, opacity: 0.6 }} />
      <View style={{ position: 'absolute', top: 60 - DOT/2, left: 38, width: DOT, height: DOT, borderRadius: DOT/2, backgroundColor: O, opacity: 0.9 }} />
      <View style={{ position: 'absolute', top: 80, left: 16, width: T, height: 40, backgroundColor: O, opacity: 0.5 }} />
      <View style={{ position: 'absolute', top: 118, left: 16, width: 30, height: T, backgroundColor: O, opacity: 0.5 }} />
      <View style={{ position: 'absolute', top: 24 - DOT/2, left: 88, width: DOT, height: DOT, borderRadius: DOT/2, backgroundColor: O, opacity: 0.9 }} />

      {/* Top-right */}
      <View style={{ position: 'absolute', top: 24, right: 0, width: 90, height: T, backgroundColor: O, opacity: 0.8 }} />
      <View style={{ position: 'absolute', top: 24, right: 0, width: T, height: 60, backgroundColor: O, opacity: 0.8 }} />
      <View style={{ position: 'absolute', top: 60, right: 0, width: 40, height: T, backgroundColor: O, opacity: 0.6 }} />
      <View style={{ position: 'absolute', top: 60 - DOT/2, right: 38, width: DOT, height: DOT, borderRadius: DOT/2, backgroundColor: O, opacity: 0.9 }} />
      <View style={{ position: 'absolute', top: 80, right: 16, width: T, height: 30, backgroundColor: O, opacity: 0.5 }} />
      <View style={{ position: 'absolute', top: 108, right: 16, width: 20, height: T, backgroundColor: O, opacity: 0.5 }} />
      {/* Top-right node circles */}
      <View style={{ position: 'absolute', top: 38, right: 14, width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: O, opacity: 0.7 }} />
      <View style={{ position: 'absolute', top: 52, right: 14, width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: O, opacity: 0.7 }} />
      <View style={{ position: 'absolute', top: 24 - DOT/2, right: 88, width: DOT, height: DOT, borderRadius: DOT/2, backgroundColor: O, opacity: 0.9 }} />

      {/* Bottom-left */}
      <View style={{ position: 'absolute', bottom: 24, left: 0, width: 80, height: T, backgroundColor: O, opacity: 0.8 }} />
      <View style={{ position: 'absolute', bottom: 24, left: 0, width: T, height: 60, backgroundColor: O, opacity: 0.8 }} />
      <View style={{ position: 'absolute', bottom: 60, left: 0, width: 36, height: T, backgroundColor: O, opacity: 0.6 }} />
      <View style={{ position: 'absolute', bottom: 60 - DOT/2, left: 34, width: DOT, height: DOT, borderRadius: DOT/2, backgroundColor: O, opacity: 0.9 }} />
      <View style={{ position: 'absolute', bottom: 24 - DOT/2, left: 78, width: DOT, height: DOT, borderRadius: DOT/2, backgroundColor: O, opacity: 0.9 }} />

      {/* Bottom-right */}
      <View style={{ position: 'absolute', bottom: 24, right: 0, width: 80, height: T, backgroundColor: O, opacity: 0.8 }} />
      <View style={{ position: 'absolute', bottom: 24, right: 0, width: T, height: 60, backgroundColor: O, opacity: 0.8 }} />
      <View style={{ position: 'absolute', bottom: 60, right: 0, width: 36, height: T, backgroundColor: O, opacity: 0.6 }} />
      <View style={{ position: 'absolute', bottom: 60 - DOT/2, right: 34, width: DOT, height: DOT, borderRadius: DOT/2, backgroundColor: O, opacity: 0.9 }} />
      <View style={{ position: 'absolute', bottom: 24 - DOT/2, right: 78, width: DOT, height: DOT, borderRadius: DOT/2, backgroundColor: O, opacity: 0.9 }} />
      {/* Bottom-right node circles */}
      <View style={{ position: 'absolute', bottom: 38, right: 14, width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: O, opacity: 0.7 }} />
      <View style={{ position: 'absolute', bottom: 52, right: 14, width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: O, opacity: 0.7 }} />
    </>
  )
}

function CardCircuit({ trade, agentName, agentAvatarUrl }: { trade: TradeData; agentName: string; agentAvatarUrl?: string }) {
  const { isPos, pnlStr, pctStr, color } = pnlDisplay(trade)
  const neonGreen = '#39ff14'
  const neonRed = '#ff3b3b'
  const pnlColor = isPos ? neonGreen : neonRed

  return (
    <View style={[cardBase.container, { backgroundColor: '#0d1117', height: CARD_H }]}>
      <CircuitTraces />

      <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 22, paddingBottom: 20 }}>
        {/* Logo */}
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <Image source={SLUGS_LOGO} style={{ width: 110, height: 34 }} resizeMode="contain" />
        </View>

        {/* Pair + badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 16 }}>
          {trade.pair ? (
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{trade.pair}</Text>
          ) : null}
          {(trade.direction || trade.leverage) ? (
            <View style={{ borderWidth: 1.5, borderColor: '#4cde8a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 }}>
              <Text style={{ color: '#4cde8a', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 }}>
                {[trade.direction, trade.leverage].filter(Boolean).join(' ')}
              </Text>
            </View>
          ) : null}
        </View>

        {/* PnL + avatar row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          {agentAvatarUrl ? (
            <Image source={{ uri: agentAvatarUrl }} style={{ width: 90, height: 110, resizeMode: 'contain', marginLeft: -10 }} />
          ) : null}
          <View style={{ flex: 1, alignItems: agentAvatarUrl ? 'flex-end' : 'center', paddingRight: agentAvatarUrl ? 4 : 0 }}>
            <Text style={{
              color: pnlColor,
              fontSize: agentAvatarUrl ? 46 : 52,
              fontWeight: '900',
              letterSpacing: -1,
              textShadowColor: pnlColor,
              textShadowRadius: 16,
              textShadowOffset: { width: 0, height: 0 },
            }}>{pnlStr}</Text>
          </View>
        </View>

        {/* Entry / Mark */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20 }}>
          {trade.entryPrice ? (
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: '#888', fontSize: 12, fontWeight: '500' }}>Entry Price</Text>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 3 }}>{trade.entryPrice}</Text>
            </View>
          ) : null}
          {trade.markPrice ? (
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: '#888', fontSize: 12, fontWeight: '500' }}>Mark Price</Text>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 3 }}>{trade.markPrice}</Text>
            </View>
          ) : null}
        </View>

        {/* CTA */}
        <View style={{
          borderWidth: 2,
          borderColor: '#e8714a',
          borderRadius: 30,
          paddingVertical: 13,
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.3)',
        }}>
          <Text style={{ color: '#e0e0e0', fontSize: 15, fontWeight: '400' }}>Track this agent on </Text>
          <Text style={{ color: '#e8714a', fontSize: 15, fontWeight: '900' }}>SLUGS</Text>
        </View>
      </View>
    </View>
  )
}

// ── Card router ───────────────────────────────────────────────────────────────
function PNLCard({ trade, agentName, agentAvatarUrl, design }: { trade: TradeData; agentName: string; agentAvatarUrl?: string; design: CardDesign }) {
  if (design === 'circuit') return <CardCircuit trade={trade} agentName={agentName} agentAvatarUrl={agentAvatarUrl} />
  return <CardRings trade={trade} agentName={agentName} agentAvatarUrl={agentAvatarUrl} />
}

// ── Parse agent response ──────────────────────────────────────────────────────
function parseAgentResponse(text: string): TradeData | null {
  try {
    const match = text.match(/\{[\s\S]*?"pnl"[\s\S]*?\}/)
    if (match) {
      const parsed = JSON.parse(match[0]) as Partial<TradeData>
      if (parsed.pnl !== undefined) return { ...EMPTY_TRADE, ...parsed }
    }
  } catch {}
  const row = (label: string) => {
    const re = new RegExp(`\\|[^|]*${label}[^|]*\\|\\s*\\*?\\*?([^|*\\n]+)\\*?\\*?\\s*\\|`, 'i')
    return text.match(re)?.[1]?.trim() ?? ''
  }
  const pair = row('Asset').replace(/^[^\w]*/, '')
  const side = row('Side').replace(/^[^\w]*/, '').toUpperCase()
  const entry = row('Entry Price').replace(/[$,]/g, '')
  const current = row('Current Price').replace(/[$,]/g, '')
  const leverage = row('Leverage').replace(/[$,Xx]/g, '') + (row('Leverage') ? 'X' : '')
  const pnlRaw = row('Unrealized')
  const pnlMatch = pnlRaw.match(/([+-]?\$?[\d,.]+).*?\(([+-]?[\d.]+)%\)/)
  const pnl = pnlMatch ? pnlMatch[1].replace(/[$,+]/g, '') : '0'
  const pnlPct = pnlMatch ? pnlMatch[2].replace(/[+]/g, '') : '0'
  const isNeg = pnlRaw.startsWith('-')
  if (!pair && !entry) return null
  return {
    pair, direction: side || 'LONG',
    leverage: leverage.replace(/^X$/, ''),
    pnl: isNeg ? `-${pnl}` : pnl,
    pnlPct: isNeg ? `-${pnlPct}` : pnlPct,
    entryPrice: entry, markPrice: current,
  }
}

// ── Modal ─────────────────────────────────────────────────────────────────────
interface Props {
  visible: boolean
  onClose: () => void
  agentId: string
  agentName: string
  agentAvatarUrl?: string
  initialTrade?: TradeData
}

export function ShareCardModal({ visible, onClose, agentId, agentName, agentAvatarUrl, initialTrade }: Props) {
  const [trade, setTrade]     = useState<TradeData>(initialTrade ?? LAST_KNOWN)
  const [design, setDesign]   = useState<CardDesign>('rings')
  const [fetching, setFetching]   = useState(false)
  const [sharing, setSharing]     = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const cardRef    = useRef<any>(null)
  const channelRef = useRef<any>(null)

  const fetchPNL = useCallback(async () => {
    setFetching(true)
    setFetchError(null)
    const channel = supabase.channel(`agent:${agentId}`)
    channelRef.current = channel
    const timeout = setTimeout(() => {
      setFetching(false)
      setFetchError('No response from agent.')
      supabase.removeChannel(channel)
    }, 30_000)
    channel.on('broadcast', { event: 'message' }, (event) => {
      const payload = event.payload as { direction: string; content: string }
      if (payload.direction !== 'outbound') return
      const parsed = parseAgentResponse(payload.content)
      if (parsed) {
        setTrade(parsed)
        clearTimeout(timeout)
        setFetching(false)
        supabase.removeChannel(channel)
      }
    })
    await channel.subscribe()
    await channel.send({ type: 'broadcast', event: 'message', payload: { direction: 'inbound', content: PNL_REQUEST, ts: Date.now() } })
  }, [agentId])

  useEffect(() => {
    if (visible) {
      if (initialTrade) setTrade(initialTrade)
      else fetchPNL()
    }
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [visible])

  const handleShare = useCallback(async () => {
    if (!cardRef.current) return
    setSharing(true)
    try {
      const uri = await captureViewToUri(cardRef)
      await shareOrSaveUri(uri)
    } catch (e) { console.error('[share-card]', e) }
    setSharing(false)
  }, [])

  return (
    <>
      {Platform.OS !== 'web' && (
        <View ref={cardRef} collapsable={false} pointerEvents="none" style={{ position: 'absolute', left: -9999, top: 0 }}>
          <PNLCard trade={trade} agentName={agentName} agentAvatarUrl={agentAvatarUrl} design={design} />
        </View>
      )}

      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Share Card</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Card preview */}
            <View style={styles.cardWrap} ref={Platform.OS === 'web' ? cardRef : undefined} pointerEvents="none">
              <PNLCard trade={trade} agentName={agentName} agentAvatarUrl={agentAvatarUrl} design={design} />
            </View>

            {/* Design picker */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.designRow}>
              {DESIGNS.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={[styles.designChip, design === d.id && styles.designChipActive]}
                  onPress={() => setDesign(d.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.designSwatch, { backgroundColor: d.bg }]} />
                  <Text style={[styles.designLabel, design === d.id && styles.designLabelActive]}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Status */}
            <View style={styles.statusRow}>
              {fetching ? (
                <><ActivityIndicator size="small" color={Colors.accentAmber} /><Text style={styles.statusText}>Fetching live P&L…</Text></>
              ) : fetchError ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{fetchError}</Text>
                  <TouchableOpacity onPress={fetchPNL} style={styles.retryBtn}><Text style={styles.retryText}>Retry</Text></TouchableOpacity>
                </View>
              ) : (
                <><View style={styles.liveDot} /><Text style={styles.statusText}>Live P&L · {agentName}</Text><TouchableOpacity onPress={fetchPNL} style={styles.refreshBtn}><Text style={styles.refreshText}>Refresh</Text></TouchableOpacity></>
              )}
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.shareBtn, (sharing || fetching) && styles.shareBtnLoading]}
              onPress={handleShare}
              disabled={sharing || fetching}
            >
              {sharing
                ? <ActivityIndicator size="small" color={Colors.bgPrimary} />
                : <Text style={styles.shareBtnText}>Export & Share</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  )
}

// ── Shared card base styles ───────────────────────────────────────────────────
const cardBase = StyleSheet.create({
  container: { width: CARD_W, height: CARD_H, borderRadius: 20, overflow: 'hidden', position: 'relative' },
  ring: { position: 'absolute', borderWidth: 1 },
  content: { flex: 1, padding: 28, justifyContent: 'space-between' },
  logo: { width: 80, height: 24 },
  pairRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  pair: { color: Colors.textPrimary, fontSize: 18, fontWeight: '700' },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  pnl: { fontSize: 48, fontWeight: '800', lineHeight: 54, letterSpacing: -1, marginTop: 4 },
  pct: { fontSize: 18, fontWeight: '600', marginTop: 2 },
  dataRow: { flexDirection: 'row', gap: 20 },
  dataCell: { gap: 2 },
  dataLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  dataValue: { color: Colors.textPrimary, fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  cta: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 24, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' },
  ctaText: { fontSize: 13, fontWeight: '500' },
  ctaLogo: { width: 58, height: 17 },
})

// ── Modal styles ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.bgBorder },
  headerTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '600' },
  closeBtn: { padding: 4 },
  closeBtnText: { color: Colors.textSecondary, fontSize: 18 },
  scroll: { alignItems: 'center', paddingTop: 28, paddingBottom: 20, gap: 20 },
  cardWrap: { alignItems: 'center' },
  designRow: { paddingHorizontal: 16, gap: 10 },
  designChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: Colors.bgBorder, backgroundColor: Colors.bgElevated },
  designChipActive: { borderColor: Colors.accentCrimson, backgroundColor: 'rgba(220,38,38,0.1)' },
  designSwatch: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: '#ffffff22' },
  designLabel: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  designLabelActive: { color: Colors.accentCrimson, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, flexWrap: 'wrap', justifyContent: 'center' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.accentGreen },
  statusText: { fontSize: 13, color: Colors.textMuted },
  refreshBtn: { paddingHorizontal: 12, paddingVertical: 5, backgroundColor: Colors.bgElevated, borderRadius: 8 },
  refreshText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  errorBox: { alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  errorText: { fontSize: 12, color: Colors.accentRed, textAlign: 'center', lineHeight: 18 },
  retryBtn: { paddingHorizontal: 16, paddingVertical: 7, backgroundColor: Colors.bgElevated, borderRadius: 8 },
  retryText: { fontSize: 13, color: Colors.textPrimary, fontWeight: '600' },
  footer: { padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20, borderTopWidth: 1, borderTopColor: Colors.bgBorder },
  shareBtn: { backgroundColor: Colors.accentCrimson, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  shareBtnLoading: { opacity: 0.7 },
  shareBtnText: { color: Colors.bgPrimary, fontSize: 16, fontWeight: '600' },
})
