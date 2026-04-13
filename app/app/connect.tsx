import { useState, useEffect } from 'react'
import { Ionicons } from '@expo/vector-icons'
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
  ActivityIndicator, TextInput, ScrollView,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { router } from 'expo-router'
import { subscribeToUserAgents } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import { useAgentsStore } from '../stores/agentsStore'
import { Colors } from '../constants/colors'

type Method = 'claude' | 'cli' | 'manus' | null
type Step = 'pick' | 'claude' | 'manus' | 'success'

const METHODS: {
  id: Method
  icon: keyof typeof Ionicons.glyphMap
  iconColor: string
  iconBg: string
  title: string
  subtitle: string
  badge?: string
}[] = [
  {
    id: 'claude',
    icon: 'sparkles',
    iconColor: Colors.accentAmber,
    iconBg: `${Colors.accentAmber}18`,
    title: 'Claude Code',
    subtitle: 'One command in your terminal',
    badge: 'Recommended',
  },
  {
    id: 'manus',
    icon: 'hardware-chip',
    iconColor: '#a78bfa',
    iconBg: 'rgba(167,139,250,0.12)',
    title: 'Manus',
    subtitle: 'Connect from a Manus sandbox terminal',
    badge: 'New',
  },
  {
    id: 'cli',
    icon: 'terminal',
    iconColor: Colors.accentTeal,
    iconBg: `${Colors.accentTeal}18`,
    title: 'Terminal / npx',
    subtitle: 'Run the connector in any shell',
  },
]

export default function ConnectScreen() {
  const { user, username } = useAuthStore()
  const { upsertAgent } = useAgentsStore()

  const [step, setStep] = useState<Step>('pick')
  const [method, setMethod] = useState<Method>(null)
  const [copied, setCopied] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [agentName, setAgentName] = useState('')

  const cliCmd = user ? `npx slugs-connector connect --token ${user.uid}` : null

  function selectMethod(m: Method) {
    setMethod(m)
    setStep(m === 'manus' ? 'manus' : 'claude')
  }

  async function handleCopy() {
    if (!cliCmd) return
    await Clipboard.setStringAsync(cliCmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Watch for new agent appearing in Firestore after user runs CLI command
  useEffect(() => {
    if (!waiting || !user) return
    const knownIds = new Set(useAgentsStore.getState().agents.map((a: any) => a.id))
    const unsub = subscribeToUserAgents(user.uid, (data) => {
      const newAgent = data.find((a: any) => !knownIds.has(a.id))
      if (newAgent) {
        upsertAgent(newAgent as any)
        setAgentName((newAgent as any).name ?? 'Agent')
        setStep('success')
        setWaiting(false)
      }
    })
    const timeout = setTimeout(() => setWaiting(false), 60_000)
    return () => { unsub(); clearTimeout(timeout) }
  }, [waiting, user?.uid])

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>
            {step === 'pick' ? 'Connect a Slug' :
             step === 'success' ? 'Slug Connected' :
             method === 'claude' ? 'Claude Code' :
             method === 'manus' ? 'Manus' : 'Terminal'}
          </Text>
          {step === 'pick' && <Text style={styles.headerSubtitle}>Choose how to connect your agent</Text>}
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollInner}>

        {/* ── Method picker ── */}
        {step === 'pick' && (
          <View style={styles.methodList}>
            {METHODS.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={styles.methodCard}
                onPress={() => selectMethod(m.id)}
                activeOpacity={0.8}
              >
                <View style={[styles.methodIcon, { backgroundColor: m.iconBg }]}>
                  <Ionicons name={m.icon} size={22} color={m.iconColor} />
                </View>
                <View style={styles.methodText}>
                  <View style={styles.methodTitleRow}>
                    <Text style={styles.methodTitle}>{m.title}</Text>
                    {m.badge && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{m.badge}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.methodSubtitle}>{m.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Claude / CLI ── */}
        {(step === 'claude') && (
          <View style={styles.stepContent}>
            {method === 'claude' && (
              <View style={styles.claudeHeader}>
                <View style={styles.claudeIconWrap}><Text style={styles.claudeLogoLg}>✦</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.claudeTitle}>Claude Code</Text>
                  <Text style={styles.claudeSubtitle}>Connect via the Claude Code terminal</Text>
                </View>
              </View>
            )}
            <Text style={styles.stepDesc}>Run this in your terminal inside your agent's environment.</Text>

            <View style={styles.commandBox}>
              <View style={styles.commandHeader}>
                <View style={styles.commandDots}>
                  <View style={[styles.dot, { backgroundColor: '#ff5f57' }]} />
                  <View style={[styles.dot, { backgroundColor: '#ffbd2e' }]} />
                  <View style={[styles.dot, { backgroundColor: '#28c840' }]} />
                </View>
                <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
                  <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={copied ? Colors.accentGreen : Colors.textSecondary} />
                  <Text style={[styles.copyBtnText, copied && { color: Colors.accentGreen }]}>{copied ? 'Copied' : 'Copy'}</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.commandScroll}>
                <Text style={styles.commandText}>{cliCmd ?? '...'}</Text>
              </ScrollView>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, waiting && styles.primaryBtnWaiting]}
              onPress={() => setWaiting(true)}
              disabled={waiting}
            >
              {waiting
                ? <><ActivityIndicator size="small" color={Colors.accentAmber} style={{ marginRight: 8 }} /><Text style={styles.primaryBtnTextWaiting}>Waiting for agent...</Text></>
                : <Text style={styles.primaryBtnText}>I ran it — connect</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={styles.backRow} onPress={() => { setStep('pick'); setWaiting(false) }}>
              <Ionicons name="arrow-back" size={14} color={Colors.textMuted} />
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Manus ── */}
        {step === 'manus' && (
          <View style={styles.stepContent}>
            <View style={styles.manusHeader}>
              <View style={styles.manusIconWrap}><Text style={styles.manusLogoLg}>M</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.manusTitle}>Connect from Manus</Text>
                <Text style={styles.manusSubtitle}>Run this command in a Manus sandbox terminal</Text>
              </View>
            </View>

            <View style={styles.stepList}>
              {[
                'Open Manus and start a task or open an existing sandbox',
                'Open the Terminal tab inside the sandbox',
                'Paste and run the command below',
              ].map((text, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
                  <Text style={styles.stepRowText}>{text}</Text>
                </View>
              ))}
            </View>

            <View style={styles.commandBox}>
              <View style={styles.commandHeader}>
                <View style={styles.commandDots}>
                  <View style={[styles.dot, { backgroundColor: '#ff5f57' }]} />
                  <View style={[styles.dot, { backgroundColor: '#ffbd2e' }]} />
                  <View style={[styles.dot, { backgroundColor: '#28c840' }]} />
                </View>
                <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
                  <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={copied ? Colors.accentGreen : Colors.textSecondary} />
                  <Text style={[styles.copyBtnText, copied && { color: Colors.accentGreen }]}>{copied ? 'Copied' : 'Copy'}</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.commandScroll}>
                <Text style={styles.commandText}>{cliCmd ?? '...'}</Text>
              </ScrollView>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, styles.manusPrimaryBtn, waiting && styles.primaryBtnWaiting]}
              onPress={() => setWaiting(true)}
              disabled={waiting}
            >
              {waiting
                ? <><ActivityIndicator size="small" color="#a78bfa" style={{ marginRight: 8 }} /><Text style={[styles.primaryBtnTextWaiting, { color: '#a78bfa' }]}>Waiting for agent...</Text></>
                : <Text style={styles.primaryBtnText}>I ran it — connect</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={styles.backRow} onPress={() => { setStep('pick'); setWaiting(false) }}>
              <Ionicons name="arrow-back" size={14} color={Colors.textMuted} />
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Success ── */}
        {step === 'success' && (
          <View style={styles.successBlock}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark-circle" size={64} color={Colors.accentGreen} />
            </View>
            <View style={styles.successCard}>
              <View style={styles.successCardTop}>
                <View style={styles.successStatusDot} />
                <Text style={styles.successStatus}>Active</Text>
              </View>
              <Text style={styles.successAgentName}>{agentName}</Text>
              {username && (
                <Text style={styles.successSlug}>@{username}/{agentName.toLowerCase().replace(/\s+/g, '-')}</Text>
              )}
            </View>
            <View style={styles.renameRow}>
              <Text style={styles.renameLabel}>Rename agent</Text>
              <TextInput
                style={styles.renameInput}
                value={agentName}
                onChangeText={setAgentName}
                placeholder="Agent name"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/(tabs)/agents')}>
              <Text style={styles.primaryBtnText}>View Slugs</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 24, paddingTop: Platform.OS === 'ios' ? 60 : 28, paddingBottom: 20,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, color: Colors.textMuted, marginTop: 3 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgElevated, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  scroll: { flex: 1 },
  scrollInner: { paddingHorizontal: 20, paddingBottom: 48 },
  methodList: { gap: 10 },
  methodCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#0f0f0f', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.bgBorder,
  },
  methodIcon: { width: 46, height: 46, borderRadius: 13, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  methodText: { flex: 1, gap: 3 },
  methodTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  methodTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  methodSubtitle: { fontSize: 13, color: Colors.textMuted },
  badge: { backgroundColor: `${Colors.accentAmber}18`, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '700', color: Colors.accentAmber, letterSpacing: 0.3 },
  stepContent: { gap: 16 },
  stepDesc: { fontSize: 14, color: Colors.textSecondary, lineHeight: 21 },
  stepList: { gap: 16 },
  stepRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  stepNum: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.bgBorder,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginTop: 1,
  },
  stepNumText: { fontSize: 12, fontWeight: '700', color: Colors.accentTeal },
  stepRowText: { flex: 1, fontSize: 14, color: Colors.textPrimary, lineHeight: 20, paddingTop: 3 },
  commandBox: { backgroundColor: '#080808', borderRadius: 14, borderWidth: 1, borderColor: Colors.bgBorder, overflow: 'hidden' },
  commandHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.bgBorder,
  },
  commandDots: { flexDirection: 'row', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  copyBtnText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  commandScroll: { padding: 14 },
  commandText: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, color: Colors.accentGreen, lineHeight: 18 },
  primaryBtn: {
    backgroundColor: Colors.accentAmber, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
  },
  primaryBtnWaiting: { backgroundColor: `${Colors.accentAmber}15`, borderWidth: 1, borderColor: Colors.accentAmber },
  primaryBtnText: { color: Colors.bgPrimary, fontSize: 16, fontWeight: '700' },
  primaryBtnTextWaiting: { color: Colors.accentAmber, fontSize: 15, fontWeight: '600' },
  manusPrimaryBtn: { backgroundColor: '#a78bfa' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'center', paddingVertical: 4 },
  backText: { fontSize: 14, color: Colors.textMuted },
  claudeHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: `${Colors.accentAmber}0d`, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: `${Colors.accentAmber}30`,
  },
  claudeIconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: `${Colors.accentAmber}18`, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  claudeLogoLg: { fontSize: 28, color: Colors.accentAmber, fontWeight: '800' },
  claudeTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  claudeSubtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  manusHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(167,139,250,0.08)', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)',
  },
  manusIconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(167,139,250,0.12)', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  manusLogoLg: { fontSize: 28, color: '#a78bfa', fontWeight: '800' },
  manusTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  manusSubtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  successBlock: { gap: 20 },
  successIconWrap: { alignItems: 'center', paddingTop: 16 },
  successCard: {
    backgroundColor: '#0f0f0f', borderRadius: 16, padding: 20, gap: 6,
    borderWidth: 1, borderColor: `${Colors.accentGreen}30`,
  },
  successCardTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  successStatusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.accentGreen },
  successStatus: { fontSize: 11, fontWeight: '700', color: Colors.accentGreen, letterSpacing: 1, textTransform: 'uppercase' },
  successAgentName: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  successSlug: { fontSize: 13, color: Colors.textMuted },
  renameRow: { gap: 8 },
  renameLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  renameInput: {
    backgroundColor: Colors.bgElevated, borderRadius: 12, borderWidth: 1, borderColor: Colors.bgBorder,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.textPrimary,
  },
})
