import { Platform } from 'react-native'

export async function captureViewToUri(ref: React.RefObject<any>): Promise<string> {
  try {
    const { captureRef } = await import('react-native-view-shot')
    return captureRef(ref, { format: 'png', quality: 0.95 })
  } catch {
    throw new Error('Screenshot not available in this environment')
  }
}

export async function shareOrSaveUri(uri: string): Promise<void> {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const link = document.createElement('a')
    link.href = uri
    link.download = `slugs-pnl-card-${Date.now()}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    return
  }

  const Sharing = require('expo-sharing')
  const canShare = await Sharing.isAvailableAsync()
  if (canShare) {
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share agent card' })
  } else {
    const MediaLibrary = await import('expo-media-library')
    const { status } = await MediaLibrary.requestPermissionsAsync()
    if (status === 'granted') {
      await MediaLibrary.saveToLibraryAsync(uri)
    }
  }
}
