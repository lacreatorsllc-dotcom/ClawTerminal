import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Platform, ActivityIndicator, Linking, Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import { router } from 'expo-router'
import type { WalletProvider } from '../lib/phantomConnect'
import { useAuthStore } from '../stores/authStore'
import { auth, setProfile, signOut } from '../lib/firebase'
import { Colors } from '../constants/colors'
import { WalletPickerSheet } from '../components/WalletPickerSheet'

const BASE_SOLANA_WALLETS: { id: WalletProvider; label: string; subtitle: string }[] = [
  { id: 'phantom', label: 'Phantom', subtitle: 'Most popular Solana wallet' },
  { id: 'backpack', label: 'Backpack', subtitle: 'Wallet plus xNFT ecosystem' },
  { id: 'solflare', label: 'Solflare', subtitle: 'Popular Solana wallet for mobile and web' },
]

export default function SettingsScreen() {
  const { user, username, displayName, avatarUrl, walletAddress, walletProvider, setWallet, clearWallet, setLoading } = useAuthStore()
  const [connectingWallet, setConnectingWallet] = useState<WalletProvider | null>(null)
  const [walletError, setWalletError] = useState<string | null>(null)
  const [walletSheetVisible, setWalletSheetVisible] = useState(false)
  const walletOptions = Platform.OS === 'android'
    ? [
        { id: 'seeker' as WalletProvider, label: 'Seeker wallet', subtitle: 'Use Android native wallet connection' },
        ...BASE_SOLANA_WALLETS,
      ]
    : BASE_SOLANA_WALLETS

  const initials = (() => {
    if (username) {
      const parts = username.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/)
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
      return parts[0].slice(0, 2).toUpperCase()
    }
    return (user?.email ?? '?')[0].toUpperCase()
  })()

  async function copyUserId() {
    if (!user?.uid) return
    await Clipboard.setStringAsync(user.uid)
    Alert.alert('Copied', 'User ID copied to clipboard.')
  }

  async function handleSignOut() {
    setLoading(true)
    await signOut(auth)
  }

  async function persistWalletConnection(address: string, provider: WalletProvider) {
    if (!user?.uid) return

    await setProfile(user.uid, {
      wallet_address: address,
      wallet_provider: provider,
      wallet_connected_at: new Date().toISOString(),
    })
    setWallet(address, provider)
  }

  async function handleWalletConnect(provider: WalletProvider) {
    if (!user?.uid) return

    setConnectingWallet(provider)
    setWalletError(null)

    try {
      if (provider === 'seeker' && Platform.OS === 'android') {
        const { connectSeekerWallet } = await import('../lib/mobileWallet')
        const result = await connectSeekerWallet()
        await persistWalletConnection(result.walletPublicKey, result.provider)
        return
      }

      const {
        beginMobileWalletConnect,
        connectInjectedWallet,
        getWalletInstallUrl,
      } = await import('../lib/phantomConnect')

      if (Platform.OS === 'web') {
        const result = await connectInjectedWallet(provider)
        if (!result) {
          window.open(getWalletInstallUrl(provider), '_blank', 'noopener,noreferrer')
          setWalletError(`${provider[0].toUpperCase()}${provider.slice(1)} is not installed in this browser`)
          return
        }

        await persistWalletConnection(result.walletPublicKey, result.provider)
        return
      }

      const url = beginMobileWalletConnect(provider)
      const supported = await Linking.canOpenURL(url)

      if (!supported) {
        const installUrl = getWalletInstallUrl(provider)
        await Linking.openURL(installUrl)
        setWalletError(`${provider[0].toUpperCase()}${provider.slice(1)} is not installed on this device`)
        return
      }

      await Linking.openURL(url)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wallet connection failed'
      setWalletError(message)
    } finally {
      setConnectingWallet(null)
    }
  }

  async function handleDisconnectWallet() {
    if (!user?.uid) return

    await setProfile(user.uid, {
      wallet_address: null,
      wallet_provider: null,
      wallet_connected_at: null,
    })
    clearWallet()
    setWalletError(null)
  }

  function confirmSignOut() {
    if (Platform.OS === 'web') {
      if (window.confirm('Sign out of SLUGS?')) handleSignOut()
    } else {
      Alert.alert('Sign Out', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: handleSignOut },
      ])
    }
  }

  const ROWS: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }[] = [
    { icon: 'add-circle-outline', label: 'Connect a slug', onPress: () => router.push('/connect') },
    { icon: 'image-outline', label: 'Edit profile photo', onPress: () => router.push('/set-avatar' as any) },
    { icon: 'create-outline', label: 'Edit display name', onPress: () => router.push('/set-name') },
    { icon: 'person-outline', label: 'Edit username', onPress: () => router.push('/set-username') },
  ]

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>

      {/* Account */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.card}>
          <View style={styles.accountRow}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.accountAvatarImage} />
            ) : (
              <View style={styles.accountAvatar}>
                <Text style={styles.accountInitials}>{initials}</Text>
              </View>
            )}
            <View style={styles.accountInfo}>
              <Text style={styles.accountHandle}>{displayName || (username ? `@${username}` : user?.email)}</Text>
              <Text style={styles.accountEmail}>{username ? `@${username}` : user?.email}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.row} onPress={copyUserId} activeOpacity={0.7}>
            <Ionicons name="key-outline" size={18} color={Colors.textSecondary} />
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>User ID</Text>
              <Text style={styles.userIdText} numberOfLines={1}>{user?.uid ?? '—'}</Text>
            </View>
            <Ionicons name="copy-outline" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Wallet */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>WALLET</Text>
        <View style={styles.walletNotice}>
          <Text style={styles.walletNoticeTitle}>Paper trade first, fund later</Text>
          <Text style={styles.walletNoticeBody}>
            Once you feel confident in how an agent is performing with paper trading, you can send crypto to its agent wallet and let it trade live on its own.
          </Text>
        </View>
        <View style={styles.card}>
          {walletAddress ? (
            <>
              <View style={styles.row}>
                <Ionicons name="wallet-outline" size={18} color={Colors.accentGreen} />
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>{walletProvider ?? 'Wallet'}</Text>
                  <Text style={styles.walletAddr}>{walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}</Text>
                </View>
                <View style={styles.connectedBadge}>
                  <Text style={styles.connectedText}>Connected</Text>
                </View>
              </View>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.row} onPress={() => void Clipboard.setStringAsync(walletAddress)} activeOpacity={0.7}>
                <Ionicons name="copy-outline" size={18} color={Colors.textSecondary} />
                <Text style={styles.rowLabel}>Copy wallet address</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.row} onPress={handleDisconnectWallet} activeOpacity={0.7}>
                <Ionicons name="unlink-outline" size={18} color={Colors.accentRed} />
                <Text style={[styles.rowLabel, styles.disconnectLabel]}>Disconnect wallet</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.walletStack}>
              <View style={styles.walletIntro}>
                <Text style={styles.walletTitle}>Connect a Solana wallet</Text>
                <Text style={styles.walletSubtitle}>
                  Link your wallet so account permissions and agent funding stay tied to the same profile on Android and web.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.walletAction}
                onPress={() => setWalletSheetVisible(true)}
                disabled={!!connectingWallet}
                activeOpacity={0.85}
              >
                <View style={styles.walletActionCopy}>
                  <Text style={styles.walletActionLabel}>Connect wallet</Text>
                  <Text style={styles.walletActionSub}>
                    {Platform.OS === 'android'
                      ? 'Choose Seeker wallet, Phantom, Backpack, or Solflare'
                      : 'Choose Phantom, Backpack, or Solflare'}
                  </Text>
                </View>
                {connectingWallet
                  ? <ActivityIndicator color={Colors.bgPrimary} />
                  : <Ionicons name="chevron-up" size={18} color={Colors.bgPrimary} />
                }
              </TouchableOpacity>

              {walletError && <Text style={styles.walletError}>{walletError}</Text>}
            </View>
          )}
        </View>
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>MANAGE</Text>
        <View style={styles.card}>
          {ROWS.map((item, i) => (
            <View key={item.label}>
              <TouchableOpacity style={styles.row} onPress={item.onPress} activeOpacity={0.7}>
                <Ionicons name={item.icon} size={18} color={Colors.textSecondary} />
                <Text style={styles.rowLabel}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
              {i < ROWS.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>
      </View>

      {/* Sign out */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.signOutBtn} onPress={confirmSignOut}>
          <Ionicons name="log-out-outline" size={18} color={Colors.accentRed} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.version}>SLUGS v1.0.0</Text>

      <WalletPickerSheet
        visible={walletSheetVisible}
        title="Connect a Solana wallet"
        subtitle="Pick the wallet you want to use with this account."
        options={walletOptions.map((option) => ({
          ...option,
          icon:
            option.id === 'seeker'
              ? 'S'
              : option.id === 'phantom'
                ? '◎'
                : option.id === 'backpack'
                  ? '⬡'
                  : '◌',
        }))}
        connectingWallet={connectingWallet}
        onClose={() => setWalletSheetVisible(false)}
        onSelect={(provider) => {
          setWalletSheetVisible(false)
          void handleWalletConnect(provider)
        }}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  content: { paddingBottom: 80 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 28,
    paddingBottom: 20,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.bgElevated,
    justifyContent: 'center', alignItems: 'center',
  },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },

  section: { marginBottom: 12, paddingHorizontal: 16 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textMuted,
    letterSpacing: 1.2, marginBottom: 8, paddingHorizontal: 4,
    textTransform: 'uppercase',
  },
  card: { backgroundColor: '#0f0f0f', borderRadius: 16, overflow: 'hidden' },

  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  accountAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1.5, borderColor: Colors.accentAmber,
    justifyContent: 'center', alignItems: 'center',
  },
  accountAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: Colors.accentAmber,
  },
  accountInitials: { fontSize: 15, fontWeight: '700', color: Colors.accentAmber, letterSpacing: 0.5 },
  accountInfo: { gap: 2 },
  accountHandle: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  accountEmail: { fontSize: 12, color: Colors.textMuted },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15 },
  rowContent: { flex: 1, gap: 1 },
  rowLabel: { flex: 1, fontSize: 15, color: Colors.textPrimary },
  divider: { height: 1, backgroundColor: Colors.bgBorder, marginHorizontal: 16 },

  userIdText: {
    fontSize: 11, color: Colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  walletAddr: {
    fontSize: 11, color: Colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  walletStack: {
    gap: 12,
    padding: 16,
  },
  walletIntro: {
    gap: 6,
  },
  walletTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  walletSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.textMuted,
  },
  walletNotice: {
    marginBottom: 10,
    padding: 14,
    gap: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(217,119,87,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(217,119,87,0.22)',
  },
  walletNoticeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  walletNoticeBody: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.textSecondary,
  },
  walletAction: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: Colors.accentAmber,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  walletActionCopy: {
    flex: 1,
    gap: 2,
  },
  walletActionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.bgPrimary,
  },
  walletActionSub: {
    fontSize: 11,
    color: 'rgba(0,0,0,0.68)',
  },
  walletError: {
    fontSize: 12,
    lineHeight: 18,
    color: Colors.accentRed,
  },
  connectedBadge: {
    backgroundColor: 'rgba(0,200,150,0.1)',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },
  connectedText: { fontSize: 11, fontWeight: '700', color: Colors.accentGreen },
  disconnectLabel: { color: Colors.accentRed },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: 14, padding: 16,
  },
  signOutText: { color: Colors.accentRed, fontSize: 15, fontWeight: '600' },

  version: { textAlign: 'center', color: Colors.textMuted, fontSize: 12, marginTop: 16 },
})
