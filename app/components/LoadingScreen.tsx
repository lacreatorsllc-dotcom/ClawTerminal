import { useEffect, useRef } from 'react'
import { Animated, ActivityIndicator, StyleSheet } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'

interface Props {
  visible: boolean
  onFadeComplete: () => void
}

export function LoadingScreen({ visible, onFadeComplete }: Props) {
  const opacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {})
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

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.container, { opacity }]}>
      <ActivityIndicator size="large" color="#ffffff" />
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
