import { useRef, useState, useCallback } from 'react'
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  ScrollView, TextInput, ActivityIndicator, Platform, Image,
} from 'react-native'
import ViewShot from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import * as MediaLibrary from 'expo-media-library'
import { Colors } from '../../constants/colors'

const SLUG_PFP = require('../../assets/slug-pfp.png')
const SLUGS_LOGO = require('../../assets/slugs-logo.png')

interface TradeData {
  pair: string
  direction: string
  leverage: string
  pnl: string
  pnlPct: string
  entryPrice: string
  markPrice: string
  referralCode: string
}

const DEFAULT_TRADE: TradeData = {
  pair: '',
  direction: 'LONG',
  leverage: '',
  pnl: '',
  pnlPct: '',
  entryPrice: '',
  markPrice: '',
  referralCode: '',
}

// ── The card that gets captured ──────────────────────────────────────────────

function PNLCard({ trade, agentName }: { trade: TradeData; agentName: string }) {
  const isPositive = !trade.pnl.startsWith('-')
  const pnlColor = isPositive ? Colors.accentGreen : Colors.accentRed
  const pnlDisplay = trade.pnl ? (isPositive ? `+$${trade.pnl}` : `-$${trade.pnl.replace('-', '')}`) : '+$0.00'
  const pctDisplay = trade.pnlPct ? (isPositive ? `+${trade.pnlPct}%` : `-${trade.pnlPct.replace('-', '')}%`) : '+0.00%'

  return (
    <View style={card.container}>
      {/* Concentric ring bg */}
      <View style={[card.ring, { width: 560, height: 560, borderRadius: 280, opacity: 0.06 }]} />
      <View style={[card.ring, { width: 420, height: 420, borderRadius: 210, opacity: 0.09 }]} />
      <View style={[card.ring, { width: 300, height: 300, borderRadius: 150, opacity: 0.12 }]} />
      <View style={[card.ring, { width: 190, height: 190, borderRadius: 95, opacity: 0.15 }]} />

      {/* Character - absolute right */}
      <Image source={SLUG_PFP} style={card.character} resizeMode="contain" />

      {/* Content */}
      <View style={card.content}>
        {/* Logo */}
        <Image source={SLUGS_LOGO} style={card.logo} resizeMode="contain" />

        {/* Trading pair + leverage */}
        {(trade.pair || trade.leverage) ? (
          <View style={card.pairRow}>
            {trade.pair ? <Text style={card.pair}>{trade.pair}</Text> : null}
            {(trade.direction || trade.leverage) ? (
              <View style={card.leverageBadge}>
                <Text style={card.leverageBadgeText}>
                  {[trade.direction, trade.leverage].filter(Boolean).join(' ')}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* PNL */}
        <Text style={[card.pnl, { color: pnlColor }]}>{pnlDisplay}</Text>
        <Text style={[card.pnlPct, { color: pnlColor }]}>{pctDisplay}</Text>

        {/* Data row */}
        {(trade.entryPrice || trade.markPrice) ? (
          <View style={card.dataRow}>
            {trade.entryPrice ? (
              <View style={card.dataCell}>
                <Text style={card.dataLabel}>Entry Price</Text>
                <Text style={card.dataValue}>{trade.entryPrice}</Text>
              </View>
            ) : null}
            {trade.markPrice ? (
              <View style={card.dataCell}>
                <Text style={card.dataLabel}>Mark Price</Text>
                <Text style={card.dataValue}>{trade.markPrice}</Text>
              </View>
            ) : null}
            {trade.referralCode ? (
              <View style={card.dataCell}>
                <Text style={card.dataLabel}>Referral code:</Text>
                <Text style={[card.dataValue, { fontWeight: '700' }]}>{trade.referralCode}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* CTA */}
        <View style={card.cta}>
          <Text style={card.ctaText}>Track this agent on </Text>
          <Image source={SLUGS_LOGO} style={card.ctaLogo} resizeMode="contain" />
        </View>
      </View>
    </View>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean
  onClose: () => void
  agentName: string
  initialTrade?: Partial<TradeData>
}

export function ShareCardModal({ visible, onClose, agentName, initialTrade }: Props) {
  const [trade, setTrade] = useState<TradeData>({ ...DEFAULT_TRADE, ...initialTrade })
  const [sharing, setSharing] = useState(false)
  const cardRef = useRef<ViewShot>(null)

  const set = (key: keyof TradeData) => (val: string) =>
    setTrade((prev) => ({ ...prev, [key]: val }))

  const handleShare = useCallback(async () => {
    if (!cardRef.current) return
    setSharing(true)
    try {
      const uri = await (cardRef.current as any).capture()
      const canShare = await Sharing.isAvailableAsync()
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share agent card' })
      } else {
        // Fallback: save to camera roll
        const { status } = await MediaLibrary.requestPermissionsAsync()
        if (status === 'granted') {
          await MediaLibrary.saveToLibraryAsync(uri)
        }
      }
    } catch (e) {
      console.error('[share-card]', e)
    }
    setSharing(false)
  }, [])

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Share Card</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Card preview */}
          <ViewShot ref={cardRef} options={{ format: 'png', quality: 0.95 }}>
            <PNLCard trade={trade} agentName={agentName} />
          </ViewShot>

          {/* Fields */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Trade Details</Text>

            <View style={styles.fieldRow}>
              <View style={styles.fieldHalf}>
                <Text style={styles.fieldLabel}>Pair</Text>
                <TextInput
                  style={styles.input}
                  value={trade.pair}
                  onChangeText={set('pair')}
                  placeholder="SOL/BTC"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="characters"
                />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={styles.fieldLabel}>Direction</Text>
                <View style={styles.directionRow}>
                  {(['LONG', 'SHORT'] as const).map((d) => (
                    <TouchableOpacity
                      key={d}
                      style={[styles.dirBtn, trade.direction === d && (d === 'LONG' ? styles.dirBtnLong : styles.dirBtnShort)]}
                      onPress={() => set('direction')(d)}
                    >
                      <Text style={[styles.dirBtnText, trade.direction === d && styles.dirBtnTextActive]}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.fieldRow}>
              <View style={styles.fieldHalf}>
                <Text style={styles.fieldLabel}>Leverage</Text>
                <TextInput
                  style={styles.input}
                  value={trade.leverage}
                  onChangeText={set('leverage')}
                  placeholder="20X"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="characters"
                />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={styles.fieldLabel}>PNL %</Text>
                <TextInput
                  style={styles.input}
                  value={trade.pnlPct}
                  onChangeText={set('pnlPct')}
                  placeholder="125.40"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>PNL Amount ($)</Text>
              <TextInput
                style={styles.input}
                value={trade.pnl}
                onChangeText={set('pnl')}
                placeholder="1245.50"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.fieldRow}>
              <View style={styles.fieldHalf}>
                <Text style={styles.fieldLabel}>Entry Price</Text>
                <TextInput
                  style={styles.input}
                  value={trade.entryPrice}
                  onChangeText={set('entryPrice')}
                  placeholder="0.00245"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={styles.fieldLabel}>Mark Price</Text>
                <TextInput
                  style={styles.input}
                  value={trade.markPrice}
                  onChangeText={set('markPrice')}
                  placeholder="0.00552"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Referral Code (optional)</Text>
              <TextInput
                style={styles.input}
                value={trade.referralCode}
                onChangeText={set('referralCode')}
                placeholder="SLUGTRADER"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="characters"
              />
            </View>
          </View>
        </ScrollView>

        {/* Share button */}
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.shareBtn, sharing && styles.shareBtnLoading]} onPress={handleShare} disabled={sharing}>
            {sharing
              ? <ActivityIndicator size="small" color={Colors.bgPrimary} />
              : <Text style={styles.shareBtnText}>Export & Share</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

// Required by expo-router — this file is a component module, not a screen
export default function ShareCardRoute() { return null }

// ── Card styles (fixed-size, captured by ViewShot) ────────────────────────────

const CARD_W = 380
const CARD_H = 380

const card = StyleSheet.create({
  container: {
    width: CARD_W,
    height: CARD_H,
    backgroundColor: '#0d0d0d',
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: Colors.accentCrimson,
    top: CARD_H / 2,
    left: CARD_W / 2,
    marginTop: -280,
    marginLeft: -280,
  },
  character: {
    position: 'absolute',
    right: -10,
    bottom: 40,
    width: 160,
    height: 180,
    opacity: 0.92,
  },
  content: {
    flex: 1,
    padding: 28,
    paddingRight: 140, // leave room for character
    justifyContent: 'space-between',
  },
  logo: {
    width: 80,
    height: 24,
  },
  pairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  pair: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  leverageBadge: {
    backgroundColor: 'rgba(0,200,150,0.2)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  leverageBadgeText: {
    color: Colors.accentGreen,
    fontSize: 12,
    fontWeight: '700',
  },
  pnl: {
    fontSize: 44,
    fontWeight: '800',
    lineHeight: 50,
    letterSpacing: -1,
    marginTop: 4,
  },
  pnlPct: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 2,
  },
  dataRow: {
    flexDirection: 'row',
    gap: 20,
    flexWrap: 'wrap',
  },
  dataCell: {
    gap: 2,
  },
  dataLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dataValue: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.accentCrimson,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  ctaText: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '500',
  },
  ctaLogo: {
    width: 58,
    height: 17,
  },
})

// ── Modal styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.bgBorder,
  },
  headerTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '600' },
  closeBtn: { padding: 4 },
  closeBtnText: { color: Colors.textSecondary, fontSize: 18 },
  scroll: { flex: 1 },
  scrollContent: {
    alignItems: 'center',
    padding: 24,
    gap: 28,
    paddingBottom: 16,
  },
  section: { width: '100%', gap: 16 },
  sectionLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  fieldRow: { flexDirection: 'row', gap: 12 },
  fieldHalf: { flex: 1, gap: 6 },
  field: { gap: 6 },
  fieldLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: '500' },
  input: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
  },
  directionRow: { flexDirection: 'row', gap: 8 },
  dirBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
  },
  dirBtnLong: { backgroundColor: 'rgba(0,200,150,0.15)', borderColor: Colors.accentGreen },
  dirBtnShort: { backgroundColor: 'rgba(239,68,68,0.15)', borderColor: Colors.accentRed },
  dirBtnText: { color: Colors.textMuted, fontSize: 13, fontWeight: '700' },
  dirBtnTextActive: { color: Colors.textPrimary },
  footer: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    borderTopWidth: 1,
    borderTopColor: Colors.bgBorder,
  },
  shareBtn: {
    backgroundColor: Colors.accentCrimson,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  shareBtnLoading: { opacity: 0.7 },
  shareBtnText: { color: Colors.bgPrimary, fontSize: 16, fontWeight: '600' },
})
