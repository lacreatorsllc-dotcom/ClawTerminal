import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import { isUsernameTaken, claimUsername } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import { Colors } from '../constants/colors'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

export default function SetUsernameScreen() {
  const { user, username: currentUsername, setUsername: storeUsername } = useAuthStore()
  const [username, setUsernameLocal] = useState(currentUsername ?? '')
  const [checking, setChecking] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (currentUsername) {
      setUsernameLocal(currentUsername)
      setAvailable(true)
    }
  }, [currentUsername])

  async function onChangeText(value: string) {
    const lower = value.toLowerCase()
    setUsernameLocal(lower)
    setAvailable(null)
    setError(null)
    if (!USERNAME_RE.test(lower)) return
    if (lower === currentUsername) {
      setAvailable(true)
      return
    }
    setChecking(true)
    const taken = await isUsernameTaken(lower)
    setChecking(false)
    setAvailable(!taken)
  }

  async function handleClaim() {
    if (!USERNAME_RE.test(username) || !available || !user) return
    setLoading(true)
    setError(null)
    try {
      await claimUsername(user.uid, username)
      storeUsername(username)
      router.replace('/(tabs)/settings' as any)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const isValid = USERNAME_RE.test(username)
  const canSubmit = isValid && available === true && !loading

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableOpacity style={styles.backRow} onPress={() => router.back()}>
        <Text style={styles.backArrow}>‹</Text>
        <Text style={styles.backLabel}>Profile</Text>
      </TouchableOpacity>

      <View style={styles.inner}>
        <Text style={styles.title}>Edit your slug</Text>
        <Text style={styles.subtitle}>
          Update the username people use to find you on SLUGS.
        </Text>

        <View style={styles.inputRow}>
          <Text style={styles.atSign}>@</Text>
          <TextInput
            style={styles.input}
            placeholder="your_slug"
            placeholderTextColor={Colors.textMuted}
            value={username}
            onChangeText={onChangeText}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
          {checking && <ActivityIndicator size="small" color={Colors.textMuted} style={styles.indicator} />}
          {!checking && isValid && available === true && <Text style={styles.check}>✓</Text>}
          {!checking && isValid && available === false && <Text style={styles.cross}>✕</Text>}
        </View>

        <Text style={styles.hint}>3–20 characters · lowercase · letters, numbers, underscores</Text>

        {!isValid && username.length > 0 && (
          <Text style={styles.errorText}>Invalid format</Text>
        )}
        {isValid && available === false && (
          <Text style={styles.errorText}>@{username} is taken</Text>
        )}
        {error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={[styles.claimBtn, !canSubmit && styles.claimBtnDisabled]}
          onPress={handleClaim}
          disabled={!canSubmit}
        >
          {loading
            ? <ActivityIndicator color={Colors.bgPrimary} />
            : <Text style={styles.claimBtnText}>
                {username === currentUsername ? `Keep @${username || 'slug'}` : `Save @${username || 'slug'}`}
              </Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },

  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    gap: 4,
  },
  backArrow: { fontSize: 24, color: Colors.accentAmber, lineHeight: 28 },
  backLabel: { fontSize: 16, color: Colors.accentAmber },

  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 60,
  },

  title: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22, marginBottom: 32 },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0e0e0e',
    borderRadius: 12,
    borderBottomWidth: 2,
    borderBottomColor: Colors.bgBorder,
    marginBottom: 10,
  },
  atSign: {
    fontSize: 20,
    color: Colors.accentAmber,
    fontWeight: '700',
    paddingLeft: 16,
    paddingRight: 4,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  indicator: { marginRight: 12 },
  check: { fontSize: 18, color: Colors.accentGreen, marginRight: 14, fontWeight: '700' },
  cross: { fontSize: 18, color: Colors.accentRed, marginRight: 14, fontWeight: '700' },

  hint: { fontSize: 12, color: Colors.textMuted, marginBottom: 8 },
  errorText: { fontSize: 13, color: Colors.accentRed, marginBottom: 8 },

  claimBtn: {
    backgroundColor: Colors.accentAmber,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  claimBtnDisabled: { opacity: 0.4 },
  claimBtnText: { color: Colors.bgPrimary, fontSize: 16, fontWeight: '600' },
})
