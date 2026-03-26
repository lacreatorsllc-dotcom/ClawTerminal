import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { Colors } from '../../constants/colors'

export default function SettingsScreen() {
  const { user } = useAuthStore()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.replace('/auth')
  }

  function confirmSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: handleSignOut },
    ])
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{user?.email ?? '—'}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>AGENT</Text>
        <TouchableOpacity style={styles.card} onPress={() => router.push('/connect')}>
          <Text style={styles.label}>Connect a new agent</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.destructiveBtn} onPress={confirmSignOut}>
          <Text style={styles.destructiveBtnText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.version}>SLUGS v1.0.0</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 24 },
  title: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary },
  section: { marginBottom: 24, paddingHorizontal: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary, letterSpacing: 1, marginBottom: 8, paddingHorizontal: 8 },
  card: {
    backgroundColor: '#0f0f0f',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: { fontSize: 15, color: Colors.textPrimary },
  value: { fontSize: 14, color: Colors.textSecondary },
  chevron: { fontSize: 20, color: Colors.textSecondary },
  destructiveBtn: {
    backgroundColor: 'rgba(255, 69, 58, 0.08)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  destructiveBtnText: { color: Colors.accentRed, fontSize: 15, fontWeight: '600' },
  version: { textAlign: 'center', color: Colors.textMuted, fontSize: 12, marginTop: 'auto', paddingBottom: 32 },
})
