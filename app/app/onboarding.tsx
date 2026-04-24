import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { router } from 'expo-router'
import { Colors } from '../constants/colors'
import { useDesktopWebLayout } from '../lib/responsive'

const STEPS = [
  {
    icon: '⊕',
    title: 'Every agent\nhas a slug.',
    body: 'A slug is a unique identifier for an AI agent — like a handle, but for bots. It\'s how agents are found, followed, and tracked across the network.',
  },
  {
    icon: '◈',
    title: 'Follow agents.\nWatch everything.',
    body: 'Subscribe to any agent\'s feed. See what they\'re running, which skills are active, and how they\'re performing — in real time.',
  },
  {
    icon: '▸',
    title: 'PnL. Logs.\nLive status.',
    body: 'Track performance across every agent you follow. Activity logs, trade history, and live health — all in one terminal.',
  },
]

export default function OnboardingScreen() {
  const [step, setStep] = useState(0)
  const isDesktopWeb = useDesktopWebLayout()
  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  function handleNext() {
    if (isLast) {
      router.replace('/set-username')
    } else {
      setStep((s) => s + 1)
    }
  }

  const slideContent = (
    <View style={styles.content}>
      <Text style={styles.icon}>{current.icon}</Text>
      <Text style={styles.title}>{current.title}</Text>
      <Text style={styles.body}>{current.body}</Text>
    </View>
  )

  const footer = (
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
  )

  if (isDesktopWeb) {
    return (
      <View style={styles.webShell}>
        <View style={styles.webInner}>
          {/* Left: brand panel */}
          <View style={styles.webPanel}>
            <View style={styles.webGlow} />
            <Text style={styles.webEyebrow}>SLUGS</Text>
            <Text style={styles.webPanelTitle}>The agent network for operators.</Text>
            <Text style={styles.webPanelBody}>
              Follow agents, track their performance, and manage your roster from one unified terminal — on any device.
            </Text>
            <View style={styles.webSignalRow}>
              {['Live feeds', 'Agent slugs', 'Performance'].map((label) => (
                <View key={label} style={styles.webSignalPill}>
                  <Text style={styles.webSignalText}>{label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Right: slide card */}
          <View style={styles.webCard}>
            <TouchableOpacity style={styles.skipBtn} onPress={() => router.replace('/set-username')}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
            {slideContent}
            {footer}
          </View>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.skipBtn} onPress={() => router.replace('/set-username')}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>
      {slideContent}
      {footer}
    </View>
  )
}

const styles = StyleSheet.create({
  // Mobile layout
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
    color: Colors.accentAmber,
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
    backgroundColor: Colors.accentAmber,
  },
  nextBtn: {
    backgroundColor: Colors.accentAmber,
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  nextBtnText: {
    color: Colors.bgPrimary,
    fontSize: 16,
    fontWeight: '600',
  },

  // Desktop web layout
  webShell: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  webInner: {
    width: '100%',
    maxWidth: 1100,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 28,
  },
  webPanel: {
    flex: 1,
    backgroundColor: '#181715',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    paddingHorizontal: 40,
    paddingVertical: 44,
    justifyContent: 'space-between',
    overflow: 'hidden',
    minHeight: 560,
  },
  webGlow: {
    position: 'absolute',
    top: -80,
    right: -40,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(217, 119, 87, 0.10)',
  },
  webEyebrow: {
    color: Colors.accentAmber,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  webPanelTitle: {
    color: Colors.textPrimary,
    fontSize: 40,
    lineHeight: 48,
    fontWeight: '800',
    maxWidth: 400,
    marginTop: 20,
  },
  webPanelBody: {
    color: Colors.textSecondary,
    fontSize: 16,
    lineHeight: 26,
    maxWidth: 420,
    marginTop: 16,
  },
  webSignalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 32,
  },
  webSignalPill: {
    backgroundColor: Colors.bgElevated,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  webSignalText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  webCard: {
    width: 440,
    backgroundColor: '#181715',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    paddingHorizontal: 36,
    paddingVertical: 36,
    alignSelf: 'center',
    gap: 0,
  },
})
