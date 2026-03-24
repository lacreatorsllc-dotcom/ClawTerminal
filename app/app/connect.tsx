import { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useAgentsStore } from '../stores/agentsStore'
import { Colors } from '../constants/colors'

type Step = 'install' | 'waiting' | 'success'

export default function ConnectScreen() {
  const [step, setStep] = useState<Step>('install')
  const [copied, setCopied] = useState(false)
  const [connectedAgent, setConnectedAgent] = useState<string | null>(null)
  const { user, isLoading } = useAuthStore()
  const { upsertAgent } = useAgentsStore()

  const token = user?.id ?? null
  const installCmd = token ? `npx claw-connector connect --token ${token}` : null

  async function handleCopy() {
    if (!installCmd) return
    await Clipboard.setStringAsync(installCmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    if (step !== 'waiting' || !user) return

    const channel = supabase
      .channel(`user:${user.id}:agents`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'agents',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const agent = payload.new as any
        upsertAgent(agent)
        setConnectedAgent(agent.name)
        setStep('success')
      })
      .subscribe()

    const timeout = setTimeout(() => {
      if (step === 'waiting') setStep('install')
    }, 60_000)

    return () => {
      supabase.removeChannel(channel)
      clearTimeout(timeout)
    }
  }, [step, user])

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Connect Agent</Text>
      </View>

      <View style={styles.content}>
        {step === 'install' && (
          <>
            <Text style={styles.stepTitle}>Run this command</Text>
            <Text style={styles.stepDesc}>In your agent's environment, run the connector command below. It will automatically register and appear here.</Text>

            {isLoading || !installCmd ? (
              <View style={[styles.commandBox, styles.commandBoxLoading]}>
                <Text style={styles.commandPlaceholder}>Generating command…</Text>
              </View>
            ) : (
              <View style={styles.commandBox}>
                <Text style={styles.command}>{installCmd}</Text>
                <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
                  <Text style={styles.copyBtnText}>{copied ? '✓ Copied' : 'Copy'}</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={[styles.primaryBtn, (!installCmd || isLoading) && styles.primaryBtnDisabled]}
              onPress={() => setStep('waiting')}
              disabled={!installCmd || isLoading}
            >
              <Text style={styles.primaryBtnText}>I ran it — waiting for connection</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'waiting' && (
          <>
            <View style={styles.waitingIcon}>
              <Text style={styles.waitingEmoji}>◈</Text>
            </View>
            <Text style={styles.stepTitle}>Waiting for agent…</Text>
            <Text style={styles.stepDesc}>Listening for your agent to connect. This usually takes a few seconds.</Text>
            <TouchableOpacity onPress={() => setStep('install')}>
              <Text style={styles.backLink}>← Back to command</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'success' && (
          <>
            <View style={styles.successIcon}>
              <Text style={styles.successEmoji}>✓</Text>
            </View>
            <Text style={styles.stepTitle}>{connectedAgent ?? 'Agent'} connected</Text>
            <Text style={styles.stepDesc}>Your agent is online and ready to receive messages.</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/(tabs)/agents')}>
              <Text style={styles.primaryBtnText}>Open Agents</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 24,
    paddingBottom: 16,
    gap: 16,
  },
  closeBtn: { padding: 4 },
  closeBtnText: { color: Colors.textSecondary, fontSize: 18 },
  title: { fontSize: 20, fontWeight: '600', color: Colors.textPrimary },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 32, gap: 16 },
  stepTitle: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  stepDesc: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  commandBox: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    borderLeftWidth: 2,
    borderLeftColor: Colors.accentCrimson,
    padding: 16,
    gap: 12,
  },
  command: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, color: Colors.accentTeal, lineHeight: 20 },
  copyBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(193, 18, 31, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  copyBtnText: { color: Colors.accentCrimson, fontSize: 13, fontWeight: '600' },
  primaryBtn: {
    backgroundColor: Colors.accentCrimson,
    borderRadius: 24,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: Colors.bgPrimary, fontSize: 16, fontWeight: '600' },
  waitingIcon: { alignItems: 'center', paddingVertical: 32 },
  waitingEmoji: { fontSize: 64, color: Colors.accentTeal },
  successIcon: { alignItems: 'center', paddingVertical: 32 },
  successEmoji: { fontSize: 64, color: Colors.accentGreen },
  backLink: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center' },
  commandBoxLoading: { opacity: 0.5 },
  commandPlaceholder: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, color: Colors.textSecondary },
  primaryBtnDisabled: { opacity: 0.4 },
})
