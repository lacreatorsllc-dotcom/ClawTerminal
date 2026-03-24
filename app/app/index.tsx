import { View, ActivityIndicator } from 'react-native'

export default function Index() {
  return (
    <View style={{ flex: 1, backgroundColor: '#080A0E', justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator color="#00E5CC" />
    </View>
  )
}
