import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { router } from 'expo-router'
import { Colors } from '../constants/colors'

const STEPS = [
  {
    icon: '⌖',
    title: 'Your agents,\nin your pocket.',
    body: 'SLUGS connects to your AI agents wherever they run — locally, in the cloud, or anywhere in between.',
  },
  {
    icon: '◈',
    title: 'One command\nto connect.',
    body: 'Run a single CLI command in your agent\'s environment. It registers instantly — no config files, no keys to manage.',
  },
  {
    icon: '▸',
    title: 'Send. Receive.\nStay in control.',
    body: 'Chat with your agents in real time, assign skills, and monitor status from anywhere. Full control, zero friction.',
  },
]

export default function OnboardingScreen() {
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  function handleNext() {
    if (isLast) {
      router.replace('/auth')
    } else {
      setStep((s) => s + 1)
    }
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.skipBtn} onPress={() => router.replace('/auth')}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={styles.icon}>{current.icon}</Text>
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.body}>{current.body}</Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>

        <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
          <Text style={styles.nextBtnText}>{isLast ? 'Get Started' : 'Next'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
    paddingTop: Platform.OS === 'ios' ? 60 : 24,
    paddingBottom: Platform.OS === 'ios' ? 48 : 24,
    paddingHorizontal: 32,
  },
  skipBtn: {
    alignSelf: 'flex-end',
    padding: 8,
  },
  skipText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 24,
  },
  icon: {
    fontSize: 72,
    color: Colors.accentCrimson,
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 44,
    letterSpacing: -0.5,
  },
  body: {
    fontSize: 16,
    color: Colors.textSecondary,
    lineHeight: 24,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.bgBorder,
  },
  dotActive: {
    width: 20,
    backgroundColor: Colors.accentCrimson,
  },
  nextBtn: {
    backgroundColor: Colors.accentCrimson,
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  nextBtnText: {
    color: Colors.bgPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
})
