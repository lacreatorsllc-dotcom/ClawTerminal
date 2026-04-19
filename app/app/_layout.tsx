import { useEffect, useRef, useState } from 'react'
import { Stack, router } from 'expo-router'
import { StatusBar, Platform } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts } from 'expo-font'
import { Ionicons } from '@expo/vector-icons'
import { auth, onAuthStateChanged, ensureUserProfile } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import { Colors } from '../constants/colors'
import { DesktopChatDock } from '../components/DesktopChatDock'
import { LoadingScreen } from '../components/LoadingScreen'

// Keep the native splash visible until the video loading screen takes over
SplashScreen.preventAutoHideAsync()

let lastRouterAction: string | null = null

function safeReplace(path: string) {
  if (lastRouterAction === path) return
  lastRouterAction = path
  router.replace(path as any)
  setTimeout(() => { lastRouterAction = null }, 1000)
}

export default function RootLayout() {
  const { setUser, setUsername, setLoading, isLoading, user } = useAuthStore()
  const authChangeIdRef = useRef(0)
  // Keep the loader mounted until its fade-out animation finishes
  const [showLoader, setShowLoader] = useState(true)

  // Load icon fonts — on web these must be loaded explicitly before icons render
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

  return (
    <>
      {/* Black status bar matches the video background */}
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* Main app renders underneath the loading overlay at all times —
          prevents any white flash when the loader fades out */}
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

      {Platform.OS === 'web' && user ? <DesktopChatDock /> : null}

      {/* Loading overlay — stays until auth resolves AND icon fonts are loaded,
          so icons never flash as squares on first render */}
      {showLoader && (
        <LoadingScreen
          visible={isLoading || (Platform.OS === 'web' && !fontsLoaded)}
          onFadeComplete={() => setShowLoader(false)}
        />
      )}
    </>
  )
}
