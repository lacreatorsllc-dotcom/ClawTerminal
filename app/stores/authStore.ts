import { create } from 'zustand'
import type { User } from 'firebase/auth'

interface AuthState {
  user: User | null
  username: string | null
  walletAddress: string | null
  walletProvider: string | null
  isLoading: boolean
  setUser: (user: User | null) => void
  setUsername: (username: string | null) => void
  setWallet: (address: string, provider: string) => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  username: null,
  walletAddress: null,
  walletProvider: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setUsername: (username) => set({ username }),
  setWallet: (walletAddress, walletProvider) => set({ walletAddress, walletProvider }),
  setLoading: (isLoading) => set({ isLoading }),
}))
