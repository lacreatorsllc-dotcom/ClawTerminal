import 'react-native-get-random-values'
import { Buffer } from 'buffer'

if (!(global as any).Buffer) {
  ;(global as any).Buffer = Buffer
}
