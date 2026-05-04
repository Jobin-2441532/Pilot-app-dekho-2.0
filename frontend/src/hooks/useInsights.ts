/**
 * useInsights.ts
 * --------------
 * Fetches narrative insight cards from our backend at /api/v1/insights/all.
 * JWT token is read from localStorage ('dekho_token') and attached automatically.
 * Insight data is user-isolated server-side via the JWT identity.
 */
import { useState, useEffect } from 'react'

const BASE = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8000`

export interface InsightsData {
  home: {
    hero_card:     { headline: string; subtext: string; detail?: string; tap_label: string }
    streak_nudge?: { headline: string; subtext: string; personal_note?: string }
    savings_nudge?: { headline: string; subtext: string } | null
  }
  expenses: {
    hero_insight:        { headline: string; tag?: string; lines: string[]; saving_hint?: string }
    pattern_caption:     string
    subscription_audit?: { headline: string; subtext: string; cta: string } | null
  }
  assets: {
    net_worth_insight:     { headline: string; subtext: string }
    savings_insight:       { headline: string; subtext: string; milestone?: string }
    investment_opportunity?: { tag: string; headline: string; subtext: string; cta?: string } | null
  }
  budgets: {
    monthly_pulse: {
      headline: string; subtext: string
      spent: string; budget: string; safe_to_spend: string; pct: number
    }
    goal_card: {
      headline: string; subtext: string
      saved: string; target: string; pct: number; target_date: string; monthly: string
    }
  }
  behavior: {
    weekly_summary: {
      tag: string; lines: string[]; peak_time_note: string
      impulse_note?: string; controlled_note?: string; intentional_ratio: number
    }
    spending_identity: { identity: string; description: string; stage_note: string }
  }
}

function getToken(): string | null {
  return localStorage.getItem('dekho_token')
}

/** Hook: fetches all insight cards in one call, cached 30 min server-side. */
export function useInsights(_userId?: number | null) {
  const [insights, setInsights] = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }

    setLoading(true)
    fetch(`${BASE}/api/v1/insights/all`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => {
        if (!r.ok) throw new Error(`Insights API ${r.status}`)
        return r.json()
      })
      .then(data => { setInsights(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  /** Call after uploading new transactions to bust the server-side cache. */
  const invalidate = async () => {
    const token = getToken()
    if (!token) return
    try {
      await fetch(`${BASE}/api/v1/insights/invalidate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch {
      // Non-critical — cache will expire naturally after 30 min
    }
  }

  return { insights, loading, error, invalidate }
}
