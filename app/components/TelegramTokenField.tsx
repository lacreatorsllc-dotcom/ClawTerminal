import { useState } from 'react'
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { Colors } from '../constants/colors'

const TOKEN_REGEX = /^\d+:[A-Za-z0-9_-]{35,}$/

type Props = {
  value: string
  onChange: (val: string) => void
}

export default function TelegramTokenField({ value, onChange }: Props) {
  const [touched, setTouched] = useState(false)

  const isValid = TOKEN_REGEX.test(value)
  const showError = touched && value.length > 0 && !isValid

  async function handlePaste() {
    const text = await Clipboard.getStringAsync()
    onChange(text.trim())
    setTouched(true)
  }

  return (
    <View>
      <View style={[
        styles.fieldRow,
        isValid && styles.fieldRowValid,
        showError && styles.fieldRowError,
      ]}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(t) => { onChange(t.trim()); setTouched(true) }}
          placeholder="110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
        />
        {isValid ? (
          <Text style={styles.checkmark}>✓</Text>
        ) : (
          <TouchableOpacity style={styles.pasteBtn} onPress={handlePaste}>
            <Text style={styles.pasteBtnText}>Paste</Text>
          </TouchableOpacity>
        )}
      </View>
      {showError && (
        <Text style={styles.errorText}>That doesn't look like a valid token</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.bgBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  fieldRowValid: {
    borderColor: Colors.accentTeal,
  },
  fieldRowError: {
    borderColor: Colors.accentRed,
  },
  input: {
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  pasteBtn: {
    backgroundColor: 'rgba(0,236,196,0.1)',
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pasteBtnText: {
    color: Colors.accentTeal,
    fontSize: 12,
    fontWeight: '600',
  },
  checkmark: {
    color: Colors.accentTeal,
    fontSize: 18,
    fontWeight: '700',
  },
  errorText: {
    color: Colors.accentRed,
    fontSize: 12,
    marginTop: 6,
    marginLeft: 4,
  },
})
