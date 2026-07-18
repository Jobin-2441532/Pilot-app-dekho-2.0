import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Theme } from '../hooks/useTheme'

/* ─────────────────────────────────────────────
   DEKHO — Global Zustand Store
   Persists: theme preference, user profile
   In-memory: chat open state, ML results cache
───────────────────────────────────────────── */

interface UserProfile {
  name: string
  avatarInitials: string
  isInvestmentEligible: boolean  // controls Grow Home vs Readiness Guardrail
  dekhoWalletBalance?: number
}

interface CustomEmojis {
  [category: string]: string;
}

interface AppState {
  /* Theme */
  theme: Theme
  setTheme: (theme: Theme) => void

  /* Chat / Chatbot FAB */
  isChatOpen: boolean
  openChat: () => void
  closeChat: () => void
  toggleChat: () => void

  /* User */
  user: UserProfile
  setUser: (user: Partial<UserProfile>) => void

  /* Onboarding */
  isOnboarded: boolean
  completeOnboarding: () => void

  /* Custom Emojis */
  categoryEmojis: CustomEmojis
  setCategoryEmojis: (emojis: CustomEmojis) => void
}

const DEFAULT_USER: UserProfile = {
  name: 'Aarav',
  avatarInitials: 'AK',
  isInvestmentEligible: true, // set to false to show ReadinessGuardrail
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      /* ── Theme ── */
      theme: 'light',
      setTheme: (theme) => set({ theme }),

      /* ── Chat ── */
      isChatOpen: false,
      openChat:   () => set({ isChatOpen: true }),
      closeChat:  () => set({ isChatOpen: false }),
      toggleChat: () => set((s) => ({ isChatOpen: !s.isChatOpen })),

      /* ── User ── */
      user: DEFAULT_USER,
      setUser: (partial) =>
        set((s) => ({ user: { ...s.user, ...partial } })),

      /* ── Onboarding ── */
      isOnboarded: !!localStorage.getItem('dekho_onboarded'),
      completeOnboarding: () => {
        localStorage.setItem('dekho_onboarded', 'true')
        set({ isOnboarded: true })
      },

      /* ── Custom Emojis ── */
      categoryEmojis: {},
      setCategoryEmojis: (emojis) => set((s) => ({ categoryEmojis: { ...s.categoryEmojis, ...emojis } })),
    }),
    {
      name: 'dekho-app-store',          // localStorage key
      partialize: (state) => ({
        theme: state.theme,             // persist theme
        user: state.user,               // persist user prefs
        isOnboarded: state.isOnboarded,
        categoryEmojis: state.categoryEmojis,
      }),
    }
  )
)
