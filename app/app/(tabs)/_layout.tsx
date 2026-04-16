import { Tabs } from 'expo-router'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { View, StyleSheet } from 'react-native'
import { Colors } from '../../constants/colors'
import { useDesktopWebLayout } from '../../lib/responsive'
import { DesktopChatDock } from '../../components/DesktopChatDock'

export default function TabsLayout() {
  const isDesktopWeb = useDesktopWebLayout()

  return (
    <View style={styles.container}>
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
      {isDesktopWeb ? <DesktopChatDock /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
})
