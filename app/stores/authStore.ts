import { create } from 'zustand'
import type { User } from 'firebase/auth'
import type { WalletProvider } from '../lib/phantomConnect'

interface AuthState {
  user: User | null
  username: string | null
  displayName: string | null
  avatarUrl: string | null
  walletAddress: string | null
  walletProvider: WalletProvider | null
  isLoading: boolean
  setUser: (user: User | null) => void
  setUsername: (username: string | null) => void
  setDisplayName: (displayName: string | null) => void
  setAvatarUrl: (avatarUrl: string | null) => void
  setWallet: (address: string | null, provider: WalletProvider | null) => void
  clearWallet: () => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  username: null,
  displayName: null,
  avatarUrl: null,
  walletAddress: null,
  walletProvider: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setUsername: (username) => set({ username }),
  setDisplayName: (displayName) => set({ displayName }),
  setAvatarUrl: (avatarUrl) => set({ avatarUrl }),
  setWallet: (walletAddress, walletProvider) => set({ walletAddress, walletProvider }),
  clearWallet: () => set({ walletAddress: null, walletProvider: null }),
  setLoading: (isLoading) => set({ isLoading }),
}))
