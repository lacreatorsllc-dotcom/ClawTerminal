import { useEffect, useRef } from 'react'
import { Stack, router } from 'expo-router'
import { StatusBar, Platform, View, ActivityIndicator } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts } from 'expo-font'
import { Ionicons } from '@expo/vector-icons'
import { auth, onAuthStateChanged, ensureUserProfile } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import { Colors } from '../constants/colors'
import { DesktopChatDock } from '../components/DesktopChatDock'

SplashScreen.preventAutoHideAsync()
SplashScreen.hideAsync().catch(() => {})

let lastRouterAction: string | null = null

function safeReplace(path: string) {
  if (lastRouterAction === path) return
  lastRouterAction = path
  router.replace(path as any)
  setTimeout(() => { lastRouterAction = null }, 1000)
}

export default function RootLayout() {
  const { setUser, setUsername, setLoading, isLoading } = useAuthStore()
  const authChangeIdRef = useRef(0)

  const [fontsLoaded] = useFonts({ ...Ionicons.font })

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      const authChangeId = authChangeIdRef.current + 1
      authChangeIdRef.current = authChangeId

      if (!firebaseUser) {
        setUser(null)
        setUsername(null)
        setLoading(false)
        safeReplace('/auth')
        return
      }

      setUser(firebaseUser)

      try {
        const profile = await ensureUserProfile(firebaseUser.uid, firebaseUser.email)
        if (authChangeIdRef.current !== authChangeId) return
        setUsername(profile?.username ?? null)
        if (!profile?.username) {
          safeReplace('/set-username')
        } else {
          safeReplace('/(tabs)/agents')
        }
      } catch (e) {
        if (authChangeIdRef.current !== authChangeId) return
        console.warn('[_layout] ensureUserProfile failed', e)
        safeReplace('/set-username')
      } finally {
        if (authChangeIdRef.current !== authChangeId) return
        setLoading(false)
      }
    })

    return unsub
  }, [])

  if (isLoading || !fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bgPrimary, justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.bgPrimary} />
        <ActivityIndicator color={Colors.accentAmber} />
      </View>
    )
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bgPrimary } }}>
        <Stack.Screen name="auth" />
        <Stack.Screen name="set-username" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="agent/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="slug/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="chat/[threadId]" options={{ presentation: 'card' }} />
        <Stack.Screen name="messages/[threadId]" options={{ presentation: 'card' }} />
        <Stack.Screen name="connect" options={{ presentation: 'modal' }} />
        <Stack.Screen name="skill/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="account" options={{ presentation: 'card' }} />
        <Stack.Screen name="profile/[username]" options={{ presentation: 'card' }} />
      </Stack>

      {Platform.OS === 'web' && <DesktopChatDock />}
    </>
  )
}
