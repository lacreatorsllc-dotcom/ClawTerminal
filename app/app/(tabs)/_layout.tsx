import { Tabs } from 'expo-router'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native'
import { Colors } from '../../constants/colors'
import { useDesktopWebLayout } from '../../lib/responsive'

function DesktopTabIcon({ color, kind }: { color: string; kind: 'chat' | 'feed' | 'search' | 'slugs' | 'profile' }) {
  if (kind === 'chat') {
    return (
      <View style={styles.iconChatWrap}>
        <View style={[styles.iconBubble, { borderColor: color }]}>
          <View style={[styles.iconDot, { backgroundColor: color }]} />
          <View style={[styles.iconDot, { backgroundColor: color }]} />
          <View style={[styles.iconDot, { backgroundColor: color }]} />
        </View>
      </View>
    )
  }

  if (kind === 'feed') {
    return (
      <View style={[styles.iconDoc, { borderColor: color }]}>
        <View style={[styles.iconDocLine, { backgroundColor: color }]} />
        <View style={[styles.iconDocLineShort, { backgroundColor: color }]} />
        <View style={[styles.iconDocLine, { backgroundColor: color }]} />
      </View>
    )
  }

  if (kind === 'search') {
    return (
      <View style={styles.iconSearchWrap}>
        <View style={[styles.iconSearchCircle, { borderColor: color }]} />
        <View style={[styles.iconSearchHandle, { backgroundColor: color }]} />
      </View>
    )
  }

  if (kind === 'slugs') {
    return (
      <View style={styles.iconSlugsWrap}>
        <View style={[styles.iconSlugsCenter, { borderColor: color }]} />
        <View style={[styles.iconSlugsRingOne, { borderColor: color }]} />
        <View style={[styles.iconSlugsRingTwo, { borderColor: color }]} />
      </View>
    )
  }

  return (
    <View style={[styles.iconProfileCircle, { borderColor: color }]}>
      <View style={[styles.iconProfileHead, { backgroundColor: color }]} />
      <View style={[styles.iconProfileBody, { backgroundColor: color }]} />
    </View>
  )
}

function routeKind(name: string): 'chat' | 'feed' | 'search' | 'slugs' | 'profile' | null {
  if (name === 'chat') return 'chat'
  if (name === 'feed') return 'feed'
  if (name === 'search') return 'search'
  if (name === 'agents') return 'slugs'
  if (name === 'profile') return 'profile'
  return null
}

function DesktopSidebar({ state, descriptors, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.desktopSidebar}>
      <View style={styles.desktopSidebarInner}>
        {state.routes.map((route, index) => {
          const kind = routeKind(route.name)
          if (!kind) return null

          const isFocused = state.index === index
          const color = isFocused ? Colors.accentAmber : Colors.textMuted
          const label = descriptors[route.key].options.title ?? route.name

          return (
            <TouchableOpacity
              key={route.key}
              style={[styles.desktopNavItem, isFocused && styles.desktopNavItemActive]}
              onPress={() => navigation.navigate(route.name)}
              activeOpacity={0.88}
            >
              <DesktopTabIcon kind={kind} color={color} />
              <Text style={[styles.desktopNavLabel, { color }]}>{label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

export default function TabsLayout() {
  const isDesktopWeb = useDesktopWebLayout()

  return (
    <View style={styles.container}>
      <Tabs
        tabBar={(props) => isDesktopWeb ? <DesktopSidebar {...props} /> : undefined}
        screenOptions={{
          headerShown: false,
          sceneStyle: {
            backgroundColor: Colors.bgPrimary,
          },
          tabBarShowLabel: isDesktopWeb ? false : true,
          tabBarLabelPosition: isDesktopWeb ? undefined : undefined,
          tabBarLabelStyle: {
            fontSize: isDesktopWeb ? 16 : 14,
            fontWeight: '700',
            marginLeft: 0,
          },
          tabBarIconStyle: undefined,
          tabBarItemStyle: undefined,
          tabBarPosition: isDesktopWeb ? 'left' : 'bottom',
          tabBarVariant: isDesktopWeb ? undefined : 'uikit',
          tabBarStyle: isDesktopWeb
            ? {
                display: 'none',
              }
            : {
                position: 'absolute',
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                borderTopWidth: 0,
                height: 88,
                paddingBottom: 28,
                paddingTop: 10,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
              },
          tabBarActiveTintColor: Colors.accentAmber,
          tabBarInactiveTintColor: Colors.textMuted,
        }}
      >
        <Tabs.Screen
          name="chat"
          options={{
            title: 'Chat',
            tabBarIcon: ({ color }) => (
              isDesktopWeb
                ? <DesktopTabIcon kind="chat" color={color} />
                : <Ionicons name="chatbubble-ellipses-outline" size={23} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="feed"
          options={{
            title: 'Feed',
            tabBarIcon: ({ color }) => (
              isDesktopWeb
                ? <DesktopTabIcon kind="feed" color={color} />
                : <Ionicons name="reader" size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: 'Search',
            tabBarIcon: ({ color }) => (
              isDesktopWeb
                ? <DesktopTabIcon kind="search" color={color} />
                : <Ionicons name="search" size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="agents"
          options={{
            title: 'Slugs',
            tabBarIcon: ({ color }) => (
              isDesktopWeb
                ? <DesktopTabIcon kind="slugs" color={color} />
                : <MaterialCommunityIcons name="access-point" size={28} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="skills"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => (
              isDesktopWeb
                ? <DesktopTabIcon kind="profile" color={color} />
                : <Ionicons name={color === Colors.accentAmber ? 'person-circle' : 'person-circle-outline'} size={26} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{ href: null }}
        />
      </Tabs>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  desktopSidebar: {
    width: 272,
    backgroundColor: '#11100f',
    borderRightWidth: 1,
    borderRightColor: Colors.bgBorder,
    paddingTop: 44,
    paddingBottom: 28,
    paddingHorizontal: 10,
  },
  desktopSidebarInner: {
    gap: 12,
  },
  desktopNavItem: {
    minHeight: 58,
    borderRadius: 18,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  desktopNavItemActive: {
    backgroundColor: 'rgba(217,119,87,0.14)',
  },
  desktopNavLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  iconChatWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBubble: {
    width: 20,
    height: 16,
    borderWidth: 1.8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  iconDot: {
    width: 2.5,
    height: 2.5,
    borderRadius: 2,
  },
  iconDoc: {
    width: 18,
    height: 22,
    borderWidth: 1.8,
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingTop: 4,
    gap: 3,
  },
  iconDocLine: {
    height: 1.8,
    borderRadius: 2,
    width: '100%',
  },
  iconDocLineShort: {
    height: 1.8,
    borderRadius: 2,
    width: '72%',
  },
  iconSearchWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSearchCircle: {
    width: 15,
    height: 15,
    borderWidth: 1.8,
    borderRadius: 999,
  },
  iconSearchHandle: {
    position: 'absolute',
    width: 9,
    height: 1.8,
    borderRadius: 2,
    transform: [{ rotate: '45deg' }],
    right: 2,
    bottom: 4,
  },
  iconSlugsWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSlugsCenter: {
    width: 4,
    height: 4,
    borderRadius: 999,
    borderWidth: 1.8,
  },
  iconSlugsRingOne: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 999,
    borderWidth: 1.6,
    opacity: 0.9,
  },
  iconSlugsRingTwo: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1.3,
    opacity: 0.55,
  },
  iconProfileCircle: {
    width: 20,
    height: 20,
    borderRadius: 999,
    borderWidth: 1.8,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 3,
  },
  iconProfileHead: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  iconProfileBody: {
    marginTop: 2,
    width: 10,
    height: 5,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
})
