import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import App from './App'
import './index.css'

/* ── Handle Vite chunk loading errors ── */
window.addEventListener('vite:preloadError', (event) => {
  console.warn('Vite preload error, reloading page...', event);
  window.location.reload();
});
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.message && event.reason.message.match(/Failed to fetch dynamically imported module/i)) {
    console.warn('Chunk load error, reloading page...');
    event.preventDefault();
    window.location.reload();
  }
});

/* ── PostHog Initialization ── */
// Using Vite env vars instead of NEXT_PUBLIC since this is a Vite app
if (typeof window !== 'undefined') {
  posthog.init(import.meta.env.VITE_POSTHOG_KEY || 'phc_placeholder_key', {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com',
    loaded: (posthog) => {
      if (import.meta.env.DEV) posthog.debug(false) // Disable debug in dev to reduce noise
    },
    // Don't auto-capture anything beyond page views per spec
    autocapture: false,
    session_recording: {
      maskAllInputs: false
    }
  })
}

/* ── TanStack Query client — configured for fintech data ── */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:        1000 * 60 * 5,   // 5 min — financial data doesn't change every second
      gcTime:           1000 * 60 * 30,  // 30 min cache
      retry:            1,
      refetchOnWindowFocus: false,       // avoid jarring refetches mid-session
    },
  },
})

/* ── Apply persisted theme before first render (avoids flash) ── */
const savedStore = localStorage.getItem('dekho-app-store')
if (savedStore) {
  try {
    const { state } = JSON.parse(savedStore)
    if (state?.theme) {
      document.documentElement.setAttribute('data-theme', state.theme)
    }
  } catch {
    document.documentElement.setAttribute('data-theme', 'light')
  }
}

/* ── Warmup ping — wake Render server before user tries to load data ── */
if (typeof window !== 'undefined') {
  // Fire-and-forget: ping /health immediately so Render starts warming up.
  // By the time the user logs in and hits Home, the 30-60s cold start is done.
  fetch('/health', { method: 'GET', cache: 'no-store' }).catch(() => {
    // Silently ignore failures — this is just a warmup hint
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <PostHogProvider client={posthog}>
        <App />
      </PostHogProvider>
    </QueryClientProvider>
  </React.StrictMode>
)

