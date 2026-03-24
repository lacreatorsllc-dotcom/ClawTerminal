import { useEffect } from 'react'
import { Stack, router } from 'expo-router'
import { StatusBar, View, ActivityIndicator } from 'react-native'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { Colors } from '../constants/colors'

export default function RootLayout() {
  const { setSession, setLoading, isLoading } = useAuthStore()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
      if (!session) router.replace('/auth')
      else router.replace('/(tabs)/agents')
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (!session) router.replace('/auth')
    })

    return () => subscription.unsubscribe()
  }, [])

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bgPrimary, justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.bgPrimary} />
        <ActivityIndicator color={Colors.accentCrimson} />
      </View>
    )
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bgPrimary} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bgPrimary } }}>
        <Stack.Screen name="auth" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="agent/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="connect" options={{ presentation: 'modal' }} />
        <Stack.Screen name="skill/[id]" options={{ presentation: 'card' }} />
      </Stack>
    </>
  )
}
