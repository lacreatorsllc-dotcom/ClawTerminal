import { Platform } from 'react-native'
import { router } from 'expo-router'
import { supabase } from './supabase'

// Lazily load expo-notifications to avoid crashing in Expo Go
async function getNotifications() {
  try {
    return await import('expo-notifications')
  } catch {
    return null
  }
}

// Set up foreground notification handler
getNotifications().then((N) => {
  if (!N) return
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  })
})

export async function registerForPushNotifications(): Promise<string | null> {
  const N = await getNotifications()
  if (!N) return null

  try {
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('messages', {
        name: 'Agent Messages',
        importance: N.AndroidImportance.HIGH,
        sound: 'default',
      })
    }

    const { status: existingStatus } = await N.getPermissionsAsync()
    let finalStatus = existingStatus
    if (existingStatus !== 'granted') {
      const { status } = await N.requestPermissionsAsync()
      finalStatus = status
    }
    if (finalStatus !== 'granted') return null

    const tokenResult = await Promise.race([
      N.getExpoPushTokenAsync(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ])
    return tokenResult ? (tokenResult as any).data : null
  } catch {
    return null
  }
}

export async function savePushToken(userId: string, token: string) {
  await supabase.from('users').update({ push_token: token }).eq('id', userId)
}

export async function setupPushNotifications(userId: string) {
  try {
    const token = await registerForPushNotifications()
    if (token) await savePushToken(userId, token)
  } catch {}
}

export async function handleNotificationTap(response: any) {
  const agentId = response?.notification?.request?.content?.data?.agentId as string | undefined
  if (agentId) router.push(`/agent/${agentId}`)
}
