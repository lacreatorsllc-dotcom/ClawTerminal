import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import { serverTimestamp } from 'firebase/firestore'
import { getProfile, setProfile } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import { Colors } from '../constants/colors'

const MAX_NAME_LENGTH = 32

export default function SetNameScreen() {
  const { user, displayName: currentDisplayName, username, setDisplayName } = useAuthStore()
  const [displayName, setDisplayNameLocal] = useState(currentDisplayName ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (currentDisplayName != null) {
      setDisplayNameLocal(currentDisplayName)
      return
    }

    if (!user?.uid) return

    getProfile(user.uid)
      .then((profile) => {
        const nextValue = typeof profile?.display_name === 'string' ? profile.display_name : ''
        setDisplayNameLocal(nextValue)
        setDisplayName(nextValue || null)
      })
      .catch(() => {})
  }, [currentDisplayName, setDisplayName, user?.uid])

  async function handleSave() {
    if (!user?.uid) return
    const trimmed = displayName.trim()

    if (!trimmed) {
      setError('Add a name people will recognize.')
      return
    }

    if (trimmed.length > MAX_NAME_LENGTH) {
      setError(`Keep it under ${MAX_NAME_LENGTH} characters.`)
      return
    }

    setLoading(true)
    setError(null)
    try {
      await setProfile(user.uid, {
        display_name: trimmed,
        updated_at: serverTimestamp(),
      })
      setDisplayName(trimmed)
      router.replace('/(tabs)/profile' as any)
    } catch (e: any) {
      setError(e?.message ?? 'Could not save your name right now.')
    } finally {
      setLoading(false)
    }
  }

  const trimmed = displayName.trim()
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH && !loading

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
        <Text style={styles.title}>Set your display name</Text>
        <Text style={styles.subtitle}>
          This is the name shown on leaderboard cards and around your public profile.
        </Text>

        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            placeholder={username ? `Name for @${username}` : 'Your name'}
            placeholderTextColor={Colors.textMuted}
            value={displayName}
            onChangeText={(value) => {
              setDisplayNameLocal(value)
              setError(null)
            }}
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus
            maxLength={MAX_NAME_LENGTH}
          />
        </View>

        <Text style={styles.hint}>{trimmed.length}/{MAX_NAME_LENGTH} characters</Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.saveBtn, !canSubmit && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!canSubmit}
        >
          {loading
            ? <ActivityIndicator color={Colors.bgPrimary} />
            : <Text style={styles.saveBtnText}>Save name</Text>}
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
  inputWrap: {
    backgroundColor: '#0e0e0e',
    borderRadius: 12,
    borderBottomWidth: 2,
    borderBottomColor: Colors.bgBorder,
    marginBottom: 10,
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  hint: { fontSize: 12, color: Colors.textMuted, marginBottom: 8 },
  errorText: { fontSize: 13, color: Colors.accentRed, marginBottom: 8 },
  saveBtn: {
    backgroundColor: Colors.accentAmber,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: Colors.bgPrimary, fontSize: 16, fontWeight: '700' },
})
