import { Tabs } from 'expo-router'
import { View } from 'react-native'
import { Colors } from '../../constants/colors'
import { useDesktopWebLayout } from '../../lib/responsive'

function TabIcon({
  color,
  kind,
}: {
  color: string
  kind: 'chat' | 'feed' | 'search' | 'slugs' | 'profile'
}) {
  if (kind === 'chat') {
    return (
      <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{
          width: 18,
          height: 14,
          borderWidth: 2,
          borderColor: color,
          borderRadius: 7,
        }} />
        <View style={{
          position: 'absolute',
          left: 4,
          bottom: 2,
          width: 7,
          height: 7,
          borderLeftWidth: 2,
          borderBottomWidth: 2,
          borderColor: color,
          transform: [{ rotate: '-35deg' }],
          backgroundColor: Colors.bgPrimary,
        }} />
      </View>
    )
  }

  if (kind === 'feed') {
    return (
      <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
        {[0, 1, 2].map((line) => (
          <View
            key={line}
            style={{
              width: line === 2 ? 12 : 16,
              height: 2,
              borderRadius: 999,
              backgroundColor: color,
            }}
          />
        ))}
      </View>
    )
  }

  if (kind === 'search') {
    return (
      <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{
          width: 12,
          height: 12,
          borderWidth: 2,
          borderColor: color,
          borderRadius: 999,
          position: 'absolute',
          top: 4,
          left: 4,
        }} />
        <View style={{
          width: 8,
          height: 2,
          borderRadius: 999,
          backgroundColor: color,
          position: 'absolute',
          right: 3,
          bottom: 5,
          transform: [{ rotate: '45deg' }],
        }} />
      </View>
    )
  }

  if (kind === 'slugs') {
    return (
      <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{
          width: 18,
          height: 18,
          borderWidth: 2,
          borderColor: color,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <View style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            backgroundColor: color,
          }} />
        </View>
      </View>
    )
  }

  return (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: 9,
        height: 9,
        borderWidth: 2,
        borderColor: color,
        borderRadius: 999,
        position: 'absolute',
        top: 2,
      }} />
      <View style={{
        width: 16,
        height: 9,
        borderWidth: 2,
        borderColor: color,
        borderTopWidth: 0,
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 10,
        position: 'absolute',
        bottom: 2,
      }} />
    </View>
  )
}

export default function TabsLayout() {
  const isDesktopWeb = useDesktopWebLayout()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          backgroundColor: Colors.bgPrimary,
        },
        tabBarShowLabel: isDesktopWeb,
        tabBarLabelPosition: isDesktopWeb ? 'beside-icon' : undefined,
        tabBarLabelStyle: {
          fontSize: isDesktopWeb ? 16 : 14,
          fontWeight: '700',
          marginLeft: 0,
        },
        tabBarIconStyle: isDesktopWeb ? { marginBottom: 0, marginRight: 12 } : undefined,
        tabBarItemStyle: isDesktopWeb
          ? {
              width: 224,
              minHeight: 58,
              marginHorizontal: 12,
              marginVertical: 6,
              borderRadius: 18,
            }
          : undefined,
        tabBarPosition: isDesktopWeb ? 'left' : 'bottom',
        tabBarVariant: isDesktopWeb ? 'material' : 'uikit',
        tabBarStyle: isDesktopWeb
          ? {
              backgroundColor: '#11100f',
              borderRightWidth: 1,
              borderRightColor: Colors.bgBorder,
              borderTopWidth: 0,
              width: 272,
              paddingTop: 44,
              paddingBottom: 28,
              paddingHorizontal: 10,
            }
          : {
              position: 'absolute',
              backgroundColor: 'rgba(15, 15, 15, 0.92)',
              borderTopWidth: 0,
              height: 64,
              paddingBottom: 8,
              paddingTop: 8,
              borderRadius: 32,
              marginHorizontal: 16,
              marginBottom: 24,
              bottom: 0,
            },
        tabBarActiveTintColor: Colors.accentAmber,
        tabBarInactiveTintColor: Colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color }) => (
            <TabIcon kind="feed" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color }) => (
            <TabIcon kind="search" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="agents"
        options={{
          title: 'Slugs',
          tabBarIcon: ({ color }) => (
            <TabIcon kind="slugs" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color }) => (
            <TabIcon kind="chat" color={color} />
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
            <TabIcon kind="profile" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{ href: null }}
      />
    </Tabs>
  )
}
