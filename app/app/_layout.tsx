import { useEffect, useRef } from 'react'
import { Stack, router } from 'expo-router'
import { StatusBar, View, ActivityIndicator } from 'react-native'
import { auth, onAuthStateChanged, getProfile } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import { Colors } from '../constants/colors'

let lastRouterAction: string | null = null

function safeReplace(path: string) {
  if (lastRouterAction === path) return
  lastRouterAction = path
  router.replace(path as any)
  setTimeout(() => { lastRouterAction = null }, 1000)
}

export default function RootLayout() {
  const { setUser, setUsername, setLoading, isLoading } = useAuthStore()

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setUser(null)
        setUsername(null)
        setLoading(false)
        safeReplace('/auth')
        return
      }

      setUser(user)

      try {
        const profile = await getProfile(user.uid)
        setUsername(profile?.username ?? null)
        if (!profile?.username) {
          safeReplace('/set-username')
        } else {
          safeReplace('/(tabs)/agents')
        }
      } catch (e) {
        console.warn('[_layout] getProfile failed', e)
        safeReplace('/set-username')
      } finally {
        setLoading(false)
      }
    })

    return unsub
  }, [])

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bgPrimary, justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.bgPrimary} />
        <ActivityIndicator color={Colors.accentAmber} />
      </View>
    )
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bgPrimary} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bgPrimary } }}>
        <Stack.Screen name="auth" />
        <Stack.Screen name="set-username" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="agent/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="connect" options={{ presentation: 'modal' }} />
        <Stack.Screen name="skill/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="account" options={{ presentation: 'card' }} />
        <Stack.Screen name="profile/[username]" options={{ presentation: 'card' }} />
      </Stack>
    </>
  )
}
