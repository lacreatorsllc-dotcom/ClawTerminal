import { Tabs } from 'expo-router'
import { Colors } from '../../constants/colors'

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          borderTopWidth: 0,
          height: 88,
          paddingBottom: 28,
          paddingTop: 10,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
        },
        tabBarActiveTintColor: Colors.accentCrimson,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 2,
          letterSpacing: 0.5,
        },
      }}
    >
      <Tabs.Screen
        name="agents"
        options={{
          title: 'Agents',
          tabBarIcon: ({ color }) => (
            <TabIcon symbol="◈" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="skills"
        options={{
          title: 'Skills',
          tabBarIcon: ({ color }) => (
            <TabIcon symbol="⬡" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <TabIcon symbol="⚙" color={color} />
          ),
        }}
      />
    </Tabs>
  )
}

function TabIcon({ symbol, color }: { symbol: string; color: string }) {
  const { Text } = require('react-native')
  return <Text style={{ fontSize: 20, color }}>{symbol}</Text>
}
