import { Tabs } from 'expo-router'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { Colors } from '../../constants/colors'
import { useDesktopWebLayout } from '../../lib/responsive'

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
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color }) => (
            <Ionicons name="chatbubble-ellipses-outline" size={23} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color }) => (
            <Ionicons name="reader" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color }) => (
            <Ionicons name="search" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="agents"
        options={{
          title: 'Slugs',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="access-point" size={28} color={color} />
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
            <Ionicons name={color === Colors.accentAmber ? 'person-circle' : 'person-circle-outline'} size={26} color={color} />
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
