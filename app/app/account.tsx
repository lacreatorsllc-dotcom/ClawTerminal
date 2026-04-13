import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import { router } from 'expo-router'
import { useAuthStore } from '../stores/authStore'
import { auth, signOut } from '../lib/firebase'
import { Colors } from '../constants/colors'

export default function SettingsScreen() {
  const { user, username, walletAddress, walletProvider } = useAuthStore()

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
    await signOut(auth)
    router.replace('/auth')
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
    { icon: 'storefront-outline', label: 'Browse marketplace', onPress: () => router.push('/(tabs)/skills') },
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
            <View style={styles.accountAvatar}>
              <Text style={styles.accountInitials}>{initials}</Text>
            </View>
            <View style={styles.accountInfo}>
              <Text style={styles.accountHandle}>{username ? `@${username}` : user?.email}</Text>
              {username && <Text style={styles.accountEmail}>{user?.email}</Text>}
            </View>
          </View>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.row} onPress={copyUserId} activeOpacity={0.7}>
            <Ionicons name="key-outline" size={18} color={Colors.textSecondary} />
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>User ID</Text>
              <Text style={styles.userIdText} numberOfLines={1}>{user?.id ?? '—'}</Text>
            </View>
            <Ionicons name="copy-outline" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Wallet */}
      {walletAddress && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>WALLET</Text>
          <View style={styles.card}>
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
          </View>
        </View>
      )}

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
  connectedBadge: {
    backgroundColor: 'rgba(0,200,150,0.1)',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },
  connectedText: { fontSize: 11, fontWeight: '700', color: Colors.accentGreen },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: 14, padding: 16,
  },
  signOutText: { color: Colors.accentRed, fontSize: 15, fontWeight: '600' },

  version: { textAlign: 'center', color: Colors.textMuted, fontSize: 12, marginTop: 16 },
})
