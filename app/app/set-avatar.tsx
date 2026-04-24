import { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { serverTimestamp } from 'firebase/firestore'
import { setProfile, uploadProfileAvatar } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import { Colors } from '../constants/colors'

export default function SetAvatarScreen() {
  const { user, username, avatarUrl, setAvatarUrl } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initials = (username ?? user?.email ?? '?').replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '?'

  async function handlePickImage() {
    if (!user?.uid) return

    setLoading(true)
    setError(null)

    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (!permission.granted) {
          setError('Photo library access is required to update your profile picture.')
          setLoading(false)
          return
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      })

      if (result.canceled || !result.assets?.[0]?.uri) {
        setLoading(false)
        return
      }

      const nextAvatarUrl = await uploadProfileAvatar(user.uid, result.assets[0].uri)
      setAvatarUrl(nextAvatarUrl)
      router.replace('/account' as any)
    } catch (e: any) {
      setError(e?.message ?? 'Could not update your profile photo right now.')
    } finally {
      setLoading(false)
    }
  }

  function handleRemovePhoto() {
    if (!user?.uid) return

    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        await setProfile(user.uid, {
          avatar_url: null,
          updated_at: serverTimestamp(),
        })
        setAvatarUrl(null)
        router.replace('/account' as any)
      } catch (e: any) {
        setError(e?.message ?? 'Could not remove your profile photo right now.')
      } finally {
        setLoading(false)
      }
    }

    if (Platform.OS === 'web') {
      if (window.confirm('Remove your profile photo?')) {
        void run()
      }
      return
    }

    Alert.alert('Remove profile photo', 'Your account will go back to initials until you upload another photo.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void run() },
    ])
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TouchableOpacity style={styles.backRow} onPress={() => router.back()}>
        <Text style={styles.backArrow}>‹</Text>
        <Text style={styles.backLabel}>Account</Text>
      </TouchableOpacity>

      <View style={styles.inner}>
        <Text style={styles.title}>Set your profile photo</Text>
        <Text style={styles.subtitle}>
          Your provider photo fills in automatically on first social sign-in, and you can replace it here any time.
        </Text>

        <View style={styles.previewWrap}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
          onPress={() => void handlePickImage()}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={Colors.bgPrimary} />
            : <Text style={styles.primaryBtnText}>{avatarUrl ? 'Replace photo' : 'Choose photo'}</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryBtn, (!avatarUrl || loading) && styles.secondaryBtnDisabled]}
          onPress={handleRemovePhoto}
          disabled={!avatarUrl || loading}
        >
          <Text style={styles.secondaryBtnText}>Remove photo</Text>
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
  previewWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  avatarImage: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 2,
    borderColor: Colors.accentAmber,
  },
  avatarFallback: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 2,
    borderColor: Colors.accentAmber,
    backgroundColor: Colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontSize: 36, fontWeight: '800', color: Colors.accentAmber, letterSpacing: 1 },
  errorText: { fontSize: 13, color: Colors.accentRed, marginBottom: 12, textAlign: 'center' },
  primaryBtn: {
    backgroundColor: Colors.accentAmber,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: Colors.bgPrimary, fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: '#0e0e0e',
  },
  secondaryBtnDisabled: { opacity: 0.45 },
  secondaryBtnText: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
})
