import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Colors } from '../../constants/colors'
import { getFeedEventById, getMarketNewsById } from '../../lib/firebase'
import { ShareCardModal, type TradeData } from '../../components/share-card'

function formatStamp(value: string | null | undefined) {
  if (!value) return 'Unknown time'
  const date = new Date(value)
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function humanizeLabel(value: string | null | undefined) {
  if (!value) return 'Activity'
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatCurrency(value: unknown) {
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return `$${num.toLocaleString()}`
}

function formatSignedCurrency(value: unknown) {
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return `${num >= 0 ? '+' : '-'}$${Math.abs(num).toLocaleString()}`
}

function formatText(value: unknown) {
  if (value == null) return null
  const text = String(value).trim()
  return text.length > 0 ? text : null
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (value == null || value === '') continue
    const parsed = typeof value === 'number'
      ? value
      : Number(String(value).replace(/[$,%+,]/g, '').trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function priceText(value: unknown) {
  const num = firstNumber(value)
  if (num == null) return ''
  if (Math.abs(num) >= 1000) return num.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (Math.abs(num) >= 1) return num.toLocaleString(undefined, { maximumFractionDigits: 4 })
  return num.toPrecision(4)
}

function tradeDataFromRecord(record: any): TradeData | null {
  const payload = record?.payload ?? {}
  const pnl = firstNumber(payload.pnl, payload.realized_pnl, payload.realizedPnl, payload.unrealized_pnl, payload.unrealizedPnl)
  if (pnl == null) return null
  const symbol = formatText(payload.symbol ?? payload.asset ?? payload.coin) ?? 'CRYPTO'
  const pair = formatText(payload.pair ?? payload.market) ?? `${symbol.toUpperCase()}/USDC`
  const direction = String(payload.direction ?? payload.side ?? (String(payload.action ?? '').toLowerCase() === 'exit' ? 'CLOSED' : 'LONG')).toUpperCase()
  const size = firstNumber(payload.sizeUsd, payload.notionalUsd, payload.size, payload.qty)
  const pnlPct = firstNumber(payload.pnlPct, payload.pnl_pct, payload.realizedPnlPct, payload.unrealizedPnlPct, size ? (pnl / Math.abs(size)) * 100 : null)
  return {
    pair: pair.includes('/') ? pair.toUpperCase() : `${pair.toUpperCase()}/USDC`,
    direction,
    leverage: formatText(payload.leverage) ?? '',
    pnl: pnl.toFixed(2),
    pnlPct: pnlPct == null ? '0' : Math.abs(pnlPct).toFixed(2),
    entryPrice: priceText(payload.entry_price ?? payload.entryPrice),
    markPrice: priceText(payload.exit_price ?? payload.exitPrice ?? payload.current_price ?? payload.currentPrice ?? payload.markPrice),
    isWin: pnl >= 0,
  }
}

function DetailRow({ label, value, accent }: { label: string; value: string; accent?: 'green' | 'red' | 'amber' | 'default' }) {
  const color =
    accent === 'green' ? Colors.accentGreen :
    accent === 'red' ? Colors.accentRed :
    accent === 'amber' ? Colors.accentAmber :
    Colors.textPrimary

  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, { color }]}>{value}</Text>
    </View>
  )
}

function isTrueNewsRecord(record: any, kind?: string) {
  if (kind === 'news') return true
  if (!record) return false
  const type = String(record.type ?? '')
  const agentName = String(record.agent_name ?? '')
  const payload = record.payload ?? {}

  if (type !== 'news_sentiment') return false
  if (agentName.toLowerCase() === 'market news') return true
  if (typeof payload.url === 'string' || typeof payload.body === 'string' || typeof payload.headline === 'string') return true
  return false
}

function pickNewsField(record: any, key: string) {
  if (!record) return null
  const topLevel = record?.[key]
  if (topLevel != null && String(topLevel).trim().length > 0) return topLevel
  const payloadValue = record?.payload?.[key]
  if (payloadValue != null && String(payloadValue).trim().length > 0) return payloadValue
  return null
}

export default function FeedEventDetailScreen() {
  const params = useLocalSearchParams<{ id: string; kind?: string }>()
  const [loading, setLoading] = useState(true)
  const [record, setRecord] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showShareCard, setShowShareCard] = useState(false)

  useEffect(() => {
    let active = true

    async function load() {
      if (!params.id) {
        setError('Missing feed item id')
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      try {
        const data = params.kind === 'news'
          ? await getMarketNewsById(String(params.id))
          : await getFeedEventById(String(params.id))
        if (!active) return
        if (!data) {
          setError('We could not find this activity.')
          setRecord(null)
        } else {
          setRecord(data)
        }
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Could not load activity.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => { active = false }
  }, [params.id, params.kind])

  const isNews = isTrueNewsRecord(record, params.kind)
  const isNewsSentiment = String(record?.type ?? '') === 'news_sentiment'
  const newsHeadline = formatText(pickNewsField(record, 'headline'))
  const newsSource = formatText(pickNewsField(record, 'source'))
  const newsBody = formatText(pickNewsField(record, 'body'))
  const newsSummary = formatText(pickNewsField(record, 'summary'))
  const newsUrl = formatText(pickNewsField(record, 'url'))
  const newsMarkets = Array.isArray(record?.markets)
    ? record.markets
    : Array.isArray(record?.payload?.markets)
      ? record.payload.markets
      : []
  const title = isNews
    ? String(newsHeadline ?? record?.content ?? 'News')
    : String(record?.agent_name ?? record?.payload?.symbol ?? 'Activity')
  const subtitle = isNews
    ? String(newsSource ?? 'Market News')
    : String(isNewsSentiment ? 'market update' : record?.type ?? 'activity').replace(/_/g, ' ')
  const content = isNews
    ? String(newsBody ?? newsSummary ?? newsHeadline ?? record?.content ?? '')
    : String(record?.content ?? '')
  const payload = !isNews ? record?.payload ?? null : null
  const articleUrl = isNews ? newsUrl : payload?.url ?? null
  const shareTrade = useMemo(() => isNews ? null : tradeDataFromRecord(record), [isNews, record])
  const detailRows = !isNews && payload
    ? (
      isNewsSentiment
        ? [
          { label: 'Sentiment', value: humanizeLabel(formatText(payload.sentiment) ?? 'market update'), accent: 'amber' as const },
          { label: 'Markets', value: Array.isArray(payload.markets) ? payload.markets.join(', ') : formatText(payload.symbol) },
          { label: 'Source', value: formatText(payload.source) },
          { label: 'Summary', value: formatText(payload.summary ?? payload.details ?? record?.content) },
        ]
        : [
          { label: 'Action', value: humanizeLabel(formatText(payload.action) ?? record?.type), accent: 'amber' as const },
          { label: 'Asset', value: formatText(payload.symbol) },
          { label: 'Direction', value: formatText(payload.direction) },
          { label: 'Entry price', value: formatCurrency(payload.entry_price) },
          { label: 'Exit price', value: formatCurrency(payload.exit_price) },
          { label: 'Size', value: formatText(payload.qty) },
          {
            label: 'P&L',
            value: formatSignedCurrency(payload.pnl),
            accent: Number(payload.pnl) >= 0 ? 'green' as const : 'red' as const,
          },
          { label: 'Summary', value: formatText(payload.details) },
        ]
    ).filter((row) => !!row.value)
    : []

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={Colors.accentAmber} />
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Text style={styles.errorTitle}>Couldn&apos;t open this activity</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <Text style={styles.kicker}>{subtitle}</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.timestamp}>{formatStamp(record?.created_at)}</Text>
            {!isNews && content ? <Text style={styles.body}>{content}</Text> : null}
          </View>

          {isNews ? (
            <>
              {newsMarkets.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Markets</Text>
                  <View style={styles.chipRow}>
                    {newsMarkets.map((market: string) => (
                      <View key={market} style={styles.chip}>
                        <Text style={styles.chipText}>{market}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {content ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Full article</Text>
                  <View style={styles.articleCard}>
                    <Text style={styles.articleBody}>{content}</Text>
                  </View>
                </View>
              ) : null}

              {articleUrl ? (
                <TouchableOpacity
                  style={styles.primaryBtn}
                  activeOpacity={0.85}
                  onPress={() => Linking.openURL(String(articleUrl))}
                >
                  <Text style={styles.primaryBtnText}>Open source</Text>
                </TouchableOpacity>
              ) : null}
            </>
          ) : (
            <>
              {record?.agent_id ? (
                <TouchableOpacity
                  style={styles.primaryBtn}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/agent/${record.agent_id}` as any)}
                >
                  <Text style={styles.primaryBtnText}>Open agent</Text>
                </TouchableOpacity>
              ) : null}

              {shareTrade ? (
                <>
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    activeOpacity={0.85}
                    onPress={() => setShowShareCard(true)}
                  >
                    <Text style={styles.primaryBtnText}>Generate PnL card</Text>
                  </TouchableOpacity>
                  <ShareCardModal
                    visible={showShareCard}
                    onClose={() => setShowShareCard(false)}
                    agentId={record?.agent_id ?? 'feed-event'}
                    agentName={record?.agent_name ?? 'Agent'}
                    initialTrade={shareTrade}
                  />
                </>
              ) : null}

              {detailRows.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>{isNewsSentiment ? 'Story details' : 'Trade details'}</Text>
                  <View style={styles.detailCard}>
                    {detailRows.map((row) => (
                      <DetailRow key={row.label} label={row.label} value={row.value as string} accent={row.accent} />
                    ))}
                  </View>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: { paddingTop: 58, paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 6, paddingRight: 8 },
  backText: { color: Colors.accentAmber, fontSize: 16, fontWeight: '700' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24 },
  errorTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '700' },
  errorText: { color: Colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 16 },
  heroCard: {
    backgroundColor: '#0f0f0f',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    padding: 18,
    gap: 10,
  },
  kicker: {
    color: Colors.accentAmber,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: { color: Colors.textPrimary, fontSize: 24, fontWeight: '700', lineHeight: 30 },
  timestamp: { color: Colors.textMuted, fontSize: 12 },
  body: { color: Colors.textSecondary, fontSize: 15, lineHeight: 22 },
  section: { gap: 10 },
  sectionLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' },
  primaryBtn: {
    backgroundColor: 'rgba(217,119,87,0.12)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(217,119,87,0.28)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: Colors.accentAmber, fontSize: 14, fontWeight: '700' },
  articleCard: {
    backgroundColor: '#111111',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    padding: 16,
  },
  articleBody: {
    color: Colors.textSecondary,
    fontSize: 15,
    lineHeight: 24,
  },
  detailCard: {
    backgroundColor: '#111111',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    padding: 14,
    gap: 12,
  },
  detailRow: {
    gap: 5,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  detailLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  detailValue: {
    color: Colors.textPrimary,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
})
