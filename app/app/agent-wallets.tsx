import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Connection, LAMPORTS_PER_SOL, PublicKey, clusterApiUrl } from '@solana/web3.js'
import { Colors } from '../constants/colors'
import { ensureAgentWallet, subscribeToUserAgents } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'

type TreasuryAction =
  | { type: 'fund'; agent: any }
  | { type: 'cashout'; agent: any }
  | { type: 'send' }
  | null

const MAINNET_RPC = clusterApiUrl('mainnet-beta')

function BackMark() {
  return (
    <View style={styles.backMark}>
      <View style={[styles.backStroke, styles.backStrokeTop]} />
      <View style={[styles.backStroke, styles.backStrokeBottom]} />
    </View>
  )
}

function formatAddress(value: string | null | undefined) {
  if (!value) return 'Not connected'
  if (value.length <= 14) return value
  return `${value.slice(0, 6)}…${value.slice(-6)}`
}

function formatSol(value: number | null) {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value.toFixed(value >= 10 ? 2 : 4)} SOL`
}

function ActionComposer({
  visible,
  action,
  mainAddress,
  onClose,
}: {
  visible: boolean
  action: TreasuryAction
  mainAddress: string | null
  onClose: () => void
}) {
  const [amount, setAmount] = useState('')
  const [destination, setDestination] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!visible) return
    setAmount('')
    setNote('')
    if (action?.type === 'fund') {
      setDestination(action.agent.wallet_address ?? '')
      return
    }
    if (action?.type === 'cashout') {
      setDestination(mainAddress ?? '')
      return
    }
    setDestination('')
  }, [action, mainAddress, visible])

  if (!action) return null
  const currentAction = action

  const title =
    currentAction.type === 'fund'
      ? `Fund ${currentAction.agent.name}`
      : currentAction.type === 'cashout'
        ? `Cash out ${currentAction.agent.name}`
        : 'Send outside app'

  const body =
    currentAction.type === 'fund'
      ? 'Move funds from your main wallet into this agent wallet when you are ready to let it trade live.'
      : currentAction.type === 'cashout'
        ? 'Withdraw this agent’s funds back to your main wallet once you are happy with the results.'
        : 'Send funds from your main wallet to any external Solana address.'

  const helper =
    currentAction.type === 'fund'
      ? `From ${formatAddress(mainAddress)} to ${formatAddress(currentAction.agent.wallet_address)}`
      : currentAction.type === 'cashout'
        ? `From ${formatAddress(currentAction.agent.wallet_address)} to ${formatAddress(mainAddress)}`
        : 'Paste the destination wallet and continue in your connected wallet.'

  async function handleCopy() {
    const payload = [
      title,
      amount ? `Amount: ${amount} SOL` : null,
      destination ? `Destination: ${destination}` : null,
      note ? `Note: ${note}` : null,
    ].filter(Boolean).join('\n')

    await Clipboard.setStringAsync(payload)
    if (Platform.OS === 'web') {
      window.alert('Transfer details copied.')
    } else {
      Alert.alert('Copied', 'Transfer details copied.')
    }
  }

  function handleContinue() {
    onClose()
    router.push('/account' as any)
    const message = currentAction.type === 'send'
      ? 'Open your connected wallet to finish the external transfer.'
      : 'Open your connected wallet to approve this transfer.'
    if (Platform.OS === 'web') {
      window.setTimeout(() => window.alert(message), 120)
    } else {
      setTimeout(() => Alert.alert('Continue in wallet', message), 120)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalBody}>{body}</Text>
          <Text style={styles.modalHelper}>{helper}</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Amount</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0.50"
              placeholderTextColor={Colors.textMuted}
              keyboardType="decimal-pad"
              style={styles.fieldInput}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Destination</Text>
            <TextInput
              value={destination}
              onChangeText={setDestination}
              placeholder="Solana address"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.fieldInput, styles.fieldInputMono]}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Note</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={
                action.type === 'fund'
                  ? 'Live capital for this agent'
                  : action.type === 'cashout'
                    ? 'Withdraw back to main wallet'
                    : 'Treasury transfer'
              }
              placeholderTextColor={Colors.textMuted}
              style={styles.fieldInput}
            />
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalSecondaryBtn} onPress={handleCopy} activeOpacity={0.85}>
              <Text style={styles.modalSecondaryBtnText}>Copy details</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalPrimaryBtn, !destination && styles.modalPrimaryBtnDisabled]}
              onPress={handleContinue}
              disabled={!destination}
              activeOpacity={0.85}
            >
              <Text style={styles.modalPrimaryBtnText}>Continue in wallet</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.modalCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

export default function AgentWalletsScreen() {
  const { user, walletAddress, walletProvider } = useAuthStore()
  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busyAgentId, setBusyAgentId] = useState<string | null>(null)
  const [refreshingBalances, setRefreshingBalances] = useState(false)
  const [mainBalanceSol, setMainBalanceSol] = useState<number | null>(null)
  const [agentBalances, setAgentBalances] = useState<Record<string, number | null>>({})
  const [composerAction, setComposerAction] = useState<TreasuryAction>(null)

  useEffect(() => {
    if (!user) return
    const unsub = subscribeToUserAgents(user.uid, (rows) => {
      setAgents(rows)
      setLoading(false)
    })
    return unsub
  }, [user?.uid])

  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => {
      const aReady = typeof a.wallet_address === 'string' && a.wallet_address.length > 0 ? 1 : 0
      const bReady = typeof b.wallet_address === 'string' && b.wallet_address.length > 0 ? 1 : 0
      if (aReady !== bReady) return bReady - aReady
      return String(a.name ?? '').localeCompare(String(b.name ?? ''))
    })
  }, [agents])

  const readyAgents = useMemo(
    () => sortedAgents.filter((agent) => typeof agent.wallet_address === 'string' && agent.wallet_address.length > 0),
    [sortedAgents]
  )

  const totalAgentBalanceSol = useMemo(
    () => readyAgents.reduce((sum, agent) => sum + Number(agentBalances[agent.id] ?? 0), 0),
    [agentBalances, readyAgents]
  )

  async function refreshBalances() {
    const addresses = [
      ...(walletAddress ? [{ id: 'main', address: walletAddress }] : []),
      ...readyAgents.map((agent) => ({ id: agent.id, address: agent.wallet_address as string })),
    ]

    if (addresses.length === 0) {
      setMainBalanceSol(null)
      setAgentBalances({})
      return
    }

    setRefreshingBalances(true)
    try {
      const connection = new Connection(MAINNET_RPC, 'confirmed')
      const balances = await Promise.all(
        addresses.map(async ({ id, address }) => {
          try {
            const lamports = await connection.getBalance(new PublicKey(address))
            return { id, sol: lamports / LAMPORTS_PER_SOL }
          } catch {
            return { id, sol: null }
          }
        })
      )

      const nextAgentBalances: Record<string, number | null> = {}
      balances.forEach((entry) => {
        if (entry.id === 'main') {
          setMainBalanceSol(entry.sol)
        } else {
          nextAgentBalances[entry.id] = entry.sol
        }
      })
      setAgentBalances(nextAgentBalances)
    } finally {
      setRefreshingBalances(false)
    }
  }

  useEffect(() => {
    void refreshBalances()
  }, [walletAddress, readyAgents.map((agent) => `${agent.id}:${agent.wallet_address}`).join('|')])

  async function handleCopy(label: string, value: string) {
    await Clipboard.setStringAsync(value)
    if (Platform.OS === 'web') {
      window.alert(`${label} copied.`)
    } else {
      Alert.alert('Copied', `${label} copied.`)
    }
  }

  async function handleCreateWallet(agentId: string) {
    setBusyAgentId(agentId)
    try {
      await ensureAgentWallet(agentId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create wallet.'
      Alert.alert('Wallet error', message)
    } finally {
      setBusyAgentId(null)
    }
  }

  const mainWalletConnected = !!walletAddress

  return (
    <View style={styles.container}>
      <ActionComposer
        visible={composerAction != null}
        action={composerAction}
        mainAddress={walletAddress}
        onClose={() => setComposerAction(null)}
      />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          {Platform.OS === 'web' ? <BackMark /> : <Ionicons name="chevron-back" size={18} color={Colors.textPrimary} />}
        </TouchableOpacity>
        <Text style={styles.title}>Treasury</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>
          Users fund one main wallet, route capital into individual agent wallets when ready, then cash profits back out to the main address whenever they want.
        </Text>

        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroEyebrow}>Main wallet</Text>
              <Text style={styles.heroValue}>{mainWalletConnected ? formatSol(mainBalanceSol) : 'Connect wallet'}</Text>
              <Text style={styles.heroMeta}>
                {mainWalletConnected
                  ? `${walletProvider ?? 'Solana wallet'} · ${formatAddress(walletAddress)}`
                  : 'This is the address users fund before routing money into agents.'}
              </Text>
            </View>
            <TouchableOpacity style={styles.refreshPill} onPress={() => void refreshBalances()} activeOpacity={0.85}>
              {refreshingBalances
                ? <ActivityIndicator size="small" color={Colors.textPrimary} />
                : <Ionicons name="sync-outline" size={15} color={Colors.textPrimary} />}
            </TouchableOpacity>
          </View>

          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{readyAgents.length}</Text>
              <Text style={styles.heroStatLabel}>funded agents ready</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{formatSol(totalAgentBalanceSol)}</Text>
              <Text style={styles.heroStatLabel}>currently routed</Text>
            </View>
          </View>

          <View style={styles.heroActions}>
            {mainWalletConnected ? (
              <>
                <TouchableOpacity
                  style={styles.heroPrimaryBtn}
                  onPress={() => void handleCopy('Main wallet address', walletAddress!)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.heroPrimaryBtnText}>Copy main address</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.heroSecondaryBtn}
                  onPress={() => setComposerAction({ type: 'send' })}
                  activeOpacity={0.85}
                >
                  <Text style={styles.heroSecondaryBtnText}>Send outside app</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={styles.heroPrimaryBtn} onPress={() => router.push('/account' as any)} activeOpacity={0.85}>
                <Text style={styles.heroPrimaryBtnText}>Connect main wallet</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Route Funds To Agents</Text>
          <Text style={styles.sectionCaption}>Each agent keeps its own wallet so it can trade autonomously once funded.</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.accentAmber} style={{ marginTop: 28 }} />
        ) : sortedAgents.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No agents yet</Text>
            <Text style={styles.emptyBody}>Deploy an agent first, then its dedicated wallet will appear here.</Text>
          </View>
        ) : (
          <View style={styles.walletList}>
            {sortedAgents.map((agent) => {
              const wallet = typeof agent.wallet_address === 'string' ? agent.wallet_address : null
              const creating = busyAgentId === agent.id
              const liveBalance = wallet ? agentBalances[agent.id] ?? null : null
              const isLiveFunded =
                (typeof liveBalance === 'number' && liveBalance > 0) ||
                agent.wallet_funding_state === 'funded' ||
                agent.paper_mode === false ||
                agent.live_trading_enabled === true ||
                agent.funding_mode === 'agent_wallet_live'
              const liveStatus = isLiveFunded ? 'Live funds' : 'Paper'

              return (
                <View key={agent.id} style={styles.walletRow}>
                  <View style={styles.walletRowCopy}>
                    <View style={[styles.walletRowAvatar, { borderColor: Colors.accentAmber }]}>
                      <View style={[styles.walletRowAvatarInner, { backgroundColor: `${Colors.accentAmber}18` }]}>
                        <Text style={styles.walletRowAvatarInitial}>{String(agent.name ?? '?').charAt(0).toUpperCase()}</Text>
                      </View>
                    </View>

                    <View style={styles.walletRowMeta}>
                      <View style={styles.walletRowTop}>
                        <Text style={styles.walletRowName} numberOfLines={1}>{agent.name}</Text>
                        {wallet ? (
                          <Text style={styles.walletRowBalance}>{formatSol(liveBalance)}</Text>
                        ) : null}
                      </View>
                      <Text style={styles.walletRowStatus}>{liveStatus} agent</Text>
                      <Text style={styles.walletRowAddress} numberOfLines={1}>
                        {wallet ?? 'No agent wallet yet'}
                      </Text>
                    </View>
                  </View>

                  {wallet ? (
                    <TouchableOpacity
                      style={styles.walletCopyBtn}
                      onPress={() => void handleCopy(`${agent.name} wallet`, wallet)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="copy-outline" size={18} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.walletCreateBtn}
                      onPress={() => void handleCreateWallet(agent.id)}
                      disabled={creating}
                      activeOpacity={0.85}
                    >
                      {creating
                        ? <ActivityIndicator size="small" color={Colors.accentAmber} />
                        : <Text style={styles.walletCreateBtnText}>Create</Text>}
                    </TouchableOpacity>
                  )}
                </View>
              )
            })}
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>How It Works</Text>
        </View>
        <View style={styles.notesCard}>
          <Text style={styles.noteLine}>1. Users send funds to their main wallet address.</Text>
          <Text style={styles.noteLine}>2. From treasury, route capital into specific agents once their paper performance looks good.</Text>
          <Text style={styles.noteLine}>3. As soon as funds arrive in an agent wallet, that agent switches itself from paper to live trading.</Text>
          <Text style={styles.noteLine}>4. Use “Send outside app” to move treasury funds to any external Solana address.</Text>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backMark: { width: 10, height: 14, alignItems: 'center', justifyContent: 'center' },
  backStroke: {
    position: 'absolute',
    width: 8,
    height: 1.8,
    borderRadius: 2,
    backgroundColor: Colors.textPrimary,
    left: 1,
  },
  backStrokeTop: { top: 4, transform: [{ rotate: '-45deg' }] },
  backStrokeBottom: { bottom: 4, transform: [{ rotate: '45deg' }] },
  title: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary },
  content: { paddingHorizontal: 16, paddingBottom: 48, gap: 14 },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  heroCard: {
    borderRadius: 24,
    backgroundColor: '#16161f',
    borderWidth: 1,
    borderColor: 'rgba(100,116,255,0.18)',
    padding: 18,
    gap: 14,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  heroCopy: { flex: 1, gap: 4 },
  heroEyebrow: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  heroValue: {
    color: Colors.textPrimary,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  heroMeta: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  refreshPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStats: {
    flexDirection: 'row',
    gap: 10,
  },
  heroStat: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  heroStatValue: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  heroStatLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroActions: {
    flexDirection: 'row',
    gap: 10,
  },
  heroPrimaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#6172ff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  heroPrimaryBtnText: {
    color: '#fefefe',
    fontSize: 14,
    fontWeight: '800',
  },
  heroSecondaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  heroSecondaryBtnText: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionHeader: {
    gap: 4,
    marginTop: 4,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  sectionCaption: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  emptyCard: {
    marginTop: 4,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    backgroundColor: '#0f0f0f',
    padding: 18,
    gap: 6,
  },
  emptyTitle: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700' },
  emptyBody: { color: Colors.textMuted, fontSize: 13, lineHeight: 19 },
  walletList: {
    borderRadius: 20,
    backgroundColor: '#101010',
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    overflow: 'hidden',
  },
  walletRow: {
    minHeight: 84,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Colors.bgBorder,
    gap: 12,
  },
  walletRowCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  walletRowAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  walletRowAvatarInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletRowAvatarInitial: {
    color: Colors.accentAmber,
    fontSize: 16,
    fontWeight: '800',
  },
  walletRowMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  walletRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  walletRowName: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  walletRowBalance: {
    color: Colors.accentGreen,
    fontSize: 14,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  walletRowStatus: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  walletRowAddress: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  walletCopyBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletCreateBtn: {
    minWidth: 74,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  walletCreateBtnText: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  inlineBtn: {
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: Colors.accentAmber,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  inlineBtnDisabled: {
    opacity: 0.55,
  },
  modeBtn: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  modeBtnLive: {
    backgroundColor: 'rgba(45,212,191,0.14)',
    borderColor: 'rgba(45,212,191,0.24)',
  },
  modeBtnMuted: {
    backgroundColor: '#11110f',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  modeBtnTextLive: {
    color: Colors.accentGreen,
  },
  modeBtnTextMuted: {
    color: Colors.textSecondary,
  },
  inlineBtnText: {
    color: Colors.bgPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  inlineBtnMuted: {
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  inlineBtnMutedText: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  notesCard: {
    borderRadius: 18,
    backgroundColor: '#101010',
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    padding: 16,
    gap: 8,
  },
  noteLine: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.56)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: Colors.bgSurface,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
    gap: 12,
  },
  modalHandle: {
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: Colors.bgBorder,
    alignSelf: 'center',
    marginBottom: 2,
  },
  modalTitle: {
    color: Colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  modalBody: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  modalHelper: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  fieldInput: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    paddingHorizontal: 14,
    color: Colors.textPrimary,
    fontSize: 15,
  },
  fieldInputMono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  modalPrimaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: Colors.accentAmber,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  modalPrimaryBtnDisabled: {
    opacity: 0.45,
  },
  modalPrimaryBtnText: {
    color: Colors.bgPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  modalSecondaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  modalSecondaryBtnText: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  modalCloseBtn: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  modalCloseText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
})
