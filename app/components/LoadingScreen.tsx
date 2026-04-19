import { useEffect, useRef } from 'react'
import { Animated, StyleSheet } from 'react-native'
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av'
import * as SplashScreen from 'expo-splash-screen'

interface Props {
  /** True while the app is still initializing. Triggers fade-out when it goes false. */
  visible: boolean
  /** Called after the fade-out animation completes — unmount the screen. */
  onFadeComplete: () => void
}

export function LoadingScreen({ visible, onFadeComplete }: Props) {
  const opacity = useRef(new Animated.Value(1)).current
  const splashHidden = useRef(false)

  // Fade out when the app finishes loading
  useEffect(() => {
    if (!visible) {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onFadeComplete()
      })
    }
  }, [visible])

  function handlePlaybackStatus(status: AVPlaybackStatus) {
    // Hide the native splash as soon as the video starts playing — seamless handoff
    if (!splashHidden.current && status.isLoaded && status.isPlaying) {
      splashHidden.current = true
      SplashScreen.hideAsync().catch(() => {})
    }
  }

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.container, { opacity }]}>
      <Video
        source={require('../assets/loading.mp4')}
        style={styles.video}
        resizeMode={ResizeMode.CONTAIN}
        isLooping
        shouldPlay
        isMuted
        onPlaybackStatusUpdate={handlePlaybackStatus}
      />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
})
