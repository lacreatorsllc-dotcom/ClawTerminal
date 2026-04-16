import { Platform, useWindowDimensions } from 'react-native'

export const DESKTOP_WEB_BREAKPOINT = 1100

export function useDesktopWebLayout() {
  const { width } = useWindowDimensions()
  return Platform.OS === 'web' && width >= DESKTOP_WEB_BREAKPOINT
}
