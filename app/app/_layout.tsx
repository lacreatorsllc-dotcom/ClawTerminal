import 'react-native-get-random-values'
import { useEffect, useRef } from 'react'
import { Stack, router } from 'expo-router'
import { StatusBar, Platform, View, ActivityIndicator } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts } from 'expo-font'
import * as Linking from 'expo-linking'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { auth, onAuthStateChanged, ensureUserProfile, getProfile, setProfile } from '../lib/firebase'
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
  const { user, setUser, setUsername, setDisplayName, setAvatarUrl, setWallet, clearWallet, setLoading, isLoading } = useAuthStore()
  const authChangeIdRef = useRef(0)

  const [fontsLoaded] = useFonts({ ...Ionicons.font, ...MaterialCommunityIcons.font })

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      const authChangeId = authChangeIdRef.current + 1
      authChangeIdRef.current = authChangeId

      if (!firebaseUser) {
        setUser(null)
        setUsername(null)
        setDisplayName(null)
        setAvatarUrl(null)
        clearWallet()
        setLoading(false)
        safeReplace('/auth')
        return
      }

      setUser(firebaseUser)

      try {
        const existingProfile = await getProfile(firebaseUser.uid)
        if (authChangeIdRef.current !== authChangeId) return

        if (!existingProfile?.username) {
          // New user — send to onboarding, let set-username create the profile
          setUsername(null)
          safeReplace('/onboarding')
        } else {
          // Existing user — sync social data and go to agents
          const socialProfile = firebaseUser.providerData.find((entry) => ['twitter.com', 'google.com'].includes(entry?.providerId ?? ''))
          const profile = await ensureUserProfile(firebaseUser.uid, firebaseUser.email, {
            preferredUsername: socialProfile?.providerId === 'twitter.com'
              ? (socialProfile?.displayName ?? firebaseUser.displayName ?? null)
              : null,
            displayName: firebaseUser.displayName ?? socialProfile?.displayName ?? null,
            avatarUrl: firebaseUser.photoURL ?? socialProfile?.photoURL ?? null,
            provider: socialProfile?.providerId ?? null,
            providerUid: socialProfile?.uid ?? null,
          })
          if (authChangeIdRef.current !== authChangeId) return
          setUsername(profile?.username ?? null)
          setDisplayName(typeof profile?.display_name === 'string' ? profile.display_name : null)
          setAvatarUrl(typeof profile?.avatar_url === 'string' ? profile.avatar_url : null)
          setWallet(
            typeof profile?.wallet_address === 'string' ? profile.wallet_address : null,
            typeof profile?.wallet_provider === 'string' ? profile.wallet_provider as any : null
          )
          safeReplace('/(tabs)/agents')
        }
      } catch (e) {
        if (authChangeIdRef.current !== authChangeId) return
        console.warn('[_layout] profile check failed', e)
        safeReplace('/onboarding')
      } finally {
        if (authChangeIdRef.current !== authChangeId) return
        setLoading(false)
      }
    })

    return unsub
  }, [])

  useEffect(() => {
    if (Platform.OS === 'web') return

    async function handleWalletCallback(url: string | null) {
      if (!url || !user?.uid) return
      if (!url.includes('onConnect')) return

      const {
        clearPendingWalletProvider,
        decryptConnectCallback,
        getPendingWalletProvider,
        inferProviderFromCallback,
      } = await import('../lib/phantomConnect')

      const provider = getPendingWalletProvider() ?? inferProviderFromCallback(url)
      if (!provider) return

      const result = decryptConnectCallback(url, provider)
      clearPendingWalletProvider()

      if (!result?.walletPublicKey) return

      await setProfile(user.uid, {
        wallet_address: result.walletPublicKey,
        wallet_provider: result.provider,
        wallet_connected_at: new Date().toISOString(),
      })
      setWallet(result.walletPublicKey, result.provider)
    }

    Linking.getInitialURL().then((url) => {
      void handleWalletCallback(url)
    }).catch(() => {})

    const sub = Linking.addEventListener('url', ({ url }) => {
      void handleWalletCallback(url)
    })

    return () => sub.remove()
  }, [setWallet, user?.uid])

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
        <Stack.Screen name="set-name" />
        <Stack.Screen name="set-avatar" />
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
        <Stack.Screen name="agent-wallets" options={{ presentation: 'card' }} />
        <Stack.Screen name="profile/[username]" options={{ presentation: 'card' }} />
      </Stack>

      {Platform.OS === 'web' && <DesktopChatDock />}
    </>
  )
}
