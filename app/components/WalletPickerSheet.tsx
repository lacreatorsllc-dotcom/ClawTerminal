import { Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { WalletProvider } from '../lib/phantomConnect'
import { Colors } from '../constants/colors'

export interface WalletOption {
  id: WalletProvider
  label: string
  subtitle: string
  icon: string
}

interface WalletPickerSheetProps {
  visible: boolean
  title?: string
  subtitle?: string
  options: WalletOption[]
  connectingWallet?: WalletProvider | null
  onClose: () => void
  onSelect: (provider: WalletProvider) => void
}

export function WalletPickerSheet({
  visible,
  title = 'Connect a wallet',
  subtitle = 'Choose a Solana wallet to connect.',
  options,
  connectingWallet,
  onClose,
  onSelect,
}: WalletPickerSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
              <Ionicons name="close" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.optionStack}>
            {options.map((option) => {
              const busy = connectingWallet === option.id
              return (
                <TouchableOpacity
                  key={option.id}
                  style={styles.optionCard}
                  onPress={() => onSelect(option.id)}
                  activeOpacity={0.85}
                  disabled={Boolean(connectingWallet)}
                >
                  <View style={styles.optionIconWrap}>
                    <Text style={styles.optionIcon}>{option.icon}</Text>
                  </View>
                  <View style={styles.optionCopy}>
                    <Text style={styles.optionLabel}>{option.label}</Text>
                    <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
                  </View>
                  {busy ? (
                    <Text style={styles.optionStatus}>Connecting…</Text>
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  )}
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#151412',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 18,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopWidth: 1,
    borderColor: Colors.bgBorder,
    gap: 16,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerCopy: { flex: 1, gap: 4 },
  title: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  optionStack: { gap: 10 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    backgroundColor: '#1a1816',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  optionIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(217,119,87,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(217,119,87,0.18)',
  },
  optionIcon: {
    color: Colors.accentAmber,
    fontSize: 18,
    fontWeight: '700',
  },
  optionCopy: { flex: 1, gap: 2 },
  optionLabel: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  optionSubtitle: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  optionStatus: {
    color: Colors.accentAmber,
    fontSize: 12,
    fontWeight: '700',
  },
})
