import 'react-native-get-random-values'
import { install } from 'react-native-quick-crypto'
import { Buffer } from 'buffer'

install()

if (!(global as any).Buffer) {
  ;(global as any).Buffer = Buffer
}
