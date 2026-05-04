/* ── Home Page — Daily Reflection (Stitch: "Daily Reflection Updated Nav") ── */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings } from 'lucide-react'
import { SkeletonCard } from '../components/ui/LoadingState'
import { useInsights } from '../hooks/useInsights'
import api from '../lib/api'
import { ReflectionCard } from '../components/ui/ReflectionCard'
import styles from './Home.module.css'

const API = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8000`

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function fmtINR(n: number) {
  return '₹' + n.toLocaleString('en-IN')
}

export default function Home() {
  const navigate = useNavigate()
  const [loading, setLoading]       = useState(true)
  const [showWhy, setShowWhy]       = useState(false)
  const [profile, setProfile]       = useState<any>({ name: 'User', monthly_budget: 45000 })
  const [todaySpend, setTodaySpend] = useState(0)
  const [monthTotal, setMonthTotal] = useState(0)
  const [savingGoals, setSavingGoals] = useState<any[]>([])
  const [topCategory, setTopCategory] = useState<{ name: string; total: number; pct: number }>({ name: 'None', total: 0, pct: 0 })
  const [transactions, setTransactions] = useState<any[]>([])
  const [reviewCount, setReviewCount] = useState(0)
  
  const [smsText, setSmsText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [ingestStatus, setIngestStatus] = useState<{type: 'success' | 'error', msg: string} | null>(null)

  const { insights } = useInsights()

  const [chatOpen, setChatOpen] = useState(false)
  const [chatHistory, setChatHistory] = useState<{role: 'user'|'dekho', text: string}[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  async function handleAsk() {
    if (!chatInput.trim()) return
    const question = chatInput
    setChatInput('')
    setChatHistory(h => [...h, { role: 'user', text: question }])
    setChatLoading(true)
    try {
      const token = localStorage.getItem('dekho_token') || ''
      const res = await fetch(`${API}/api/v1/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: question }),
      })
      const data = await res.json()
      const answer = data.reply ?? data.message ?? 'Sorry, I could not understand that.'
      setChatHistory(h => [...h, { role: 'dekho', text: answer }])
    } catch {
      setChatHistory(h => [...h, { role: 'dekho', text: 'Something went wrong. Please try again.' }])
    } finally {
      setChatLoading(false)
    }
  }

  const fetchData = () => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const today = now.toISOString().slice(0, 10)

    Promise.all([
      api.get<any>('/api/v1/dashboard/profile').catch(() => null),
      api.get<any>('/api/v1/dashboard/transactions', { limit: 200, from_date: monthStart }).catch(() => ({ data: [] })),
      api.get<any[]>('/api/v1/dashboard/goals').catch(() => []),
      api.get<any[]>('/api/v1/dashboard/review/queue').catch(() => []),
    ]).then(([prof, txRes, goals, revData]) => {
      if (prof) setProfile({ ...prof, name: prof.fullName || prof.name || 'User' })
      if (Array.isArray(goals)) setSavingGoals(goals)
      if (Array.isArray(revData)) setReviewCount(revData.length)

      const txList: any[] = txRes?.data || []
      if (Array.isArray(txList)) {
        setTransactions(txList)
        const total = txList.reduce((s: number, t: any) => s + (t.direction === 'debit' ? (t.amount ?? 0) : 0), 0)
        setMonthTotal(total)

        const todayStr = today
        const todayTxs = txList.filter((t: any) => String(t.date || '').startsWith(todayStr) && t.direction === 'debit')
        setTodaySpend(todayTxs.reduce((s: number, t: any) => s + (t.amount ?? 0), 0))

        // Top category this month
        const catMap: Record<string, number> = {}
        txList.filter((t: any) => t.direction === 'debit').forEach((t: any) => {
          catMap[t.category || 'Others'] = (catMap[t.category || 'Others'] || 0) + (t.amount || 0)
        })
        const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1])
        if (sorted.length > 0) {
          setTopCategory({ name: sorted[0][0], total: sorted[0][1], pct: 12 })
        }
      }
    }).finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleSmsSubmit = async () => {
    if (!smsText.trim()) return
    setIsSubmitting(true)
    setIngestStatus(null)
    try {
      const token = localStorage.getItem('dekho_token') || ''
      const res = await fetch(`${API}/api/v1/ml/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sms_text: smsText })
      })
      if (!res.ok) {
        let err;
        try {
          err = await res.json()
        } catch {
          err = { detail: `HTTP error! status: ${res.status}` }
        }
        throw new Error(err.detail || 'Failed to process SMS')
      }
      const data = await res.json()
      setIngestStatus({ type: 'success', msg: `Categorized as ${data.category} - ₹${data.amount}` })
      setSmsText('')
      fetchData() // Refresh dashboard data
    } catch (e: any) {
      setIngestStatus({ type: 'error', msg: e.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) return (
    <div style={{ padding: 'var(--space-5)' }}>
      <SkeletonCard />
      <div style={{ height: 'var(--space-4)' }} />
      <SkeletonCard />
    </div>
  )

  const budget    = profile?.monthlyBudget ?? profile?.monthly_budget ?? 50000
  const budgetPct  = Math.min(Math.round((monthTotal / budget) * 100), 100)
  const goalPct    = savingGoals.length > 0
    ? Math.min(Math.round((savingGoals[0].current_amount / savingGoals[0].target_amount) * 100), 100) : 42
  const remaining  = Math.max(budget - monthTotal, 0)
  const isOverBudget = monthTotal > budget
  
  const uniqueDays = new Set(transactions.map((t: any) => t.date?.slice(0, 10))).size || 1
  const avgSpend = Math.round(monthTotal / uniqueDays)

  const narrativeText = todaySpend > avgSpend
    ? 'Today was a comfort spending day.'
    : 'Today was a controlled spending day.'
  const narrativeSub = todaySpend > avgSpend
    ? 'You spent more on food than usual.'
    : "You're building a healthy rhythm."

  return (
    <div className={styles.page}>
      {/* ── Top Bar ── */}
      <div className={styles.topBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <img src="/logo-nobg.png" alt="Dekho Logo" style={{ width: 96, height: 96, objectFit: 'contain', margin: '-8px -12px -40px -16px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', marginTop: '24px' }}>
              <p className={styles.logoName}>DEKHO</p>
              <p className={styles.logoSub}>{getGreeting()}, {(profile?.name ?? 'Arjun').split(' ')[0]}</p>
            </div>
          </div>
        <button className={styles.iconBtn} onClick={() => navigate('/settings')} aria-label="Settings" style={{ marginTop: '16px' }}>
          <Settings size={18} strokeWidth={1.75} />
        </button>
      </div>

      {/* HERO CARD — dynamic mood-aware ReflectionCard */}
      <div className={styles.px}>
        <ReflectionCard />
      </div>

      {/* ── 2-col Mini Stats ── */}
      <div className={styles.px}>
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>TODAY</p>
            <p className={styles.statValue}>{fmtINR(todaySpend)}</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>AVERAGE</p>
            <p className={styles.statValue}>
              {fmtINR(avgSpend)}
              <span className={styles.statUnit}>/day</span>
            </p>
          </div>
        </div>
      </div>

      {/* ── Top Focus + vs Last Month ── */}
      <div className={styles.px}>
        <div className={styles.focusRow}>
          <div className={styles.focusCard}>
            <p className={styles.focusLabel}>TOP FOCUS</p>
            <div className={styles.focusVal}>
              <span className={styles.focusCat}>{topCategory.name}</span>
              <span className={styles.focusIcon}>🍽️</span>
            </div>
          </div>
          <div className={styles.focusCard}>
            <p className={styles.focusLabel}>VS LAST MONTH</p>
            <div className={styles.focusVal}>
              <span className={styles.focusPct} data-up={topCategory.pct > 0}>
                +{topCategory.pct}%
              </span>
              <span className={styles.trendArrow} data-up={topCategory.pct > 0}>
                {topCategory.pct > 0 ? '↗' : '↘'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {insights?.home.streak_nudge && (
        <div className={styles.px}>
          <div className={styles.nudgeCard}>
            <span className={styles.nudgeIcon}>⚡</span>
            <div>
              <div className={styles.nudgeHeadline}>{insights.home.streak_nudge.headline}</div>
              <div className={styles.nudgeSubtext}>{insights.home.streak_nudge.subtext}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Progress Bars ── */}
      <div className={styles.px}>
        <div className={styles.progressCard}>
          <div className={styles.progressRow}>
            <p className={styles.progressLabel}>MONTHLY BUDGET</p>
            <p className={styles.progressPct}>{budgetPct}%</p>
          </div>
          <div className={styles.track}>
            <div
              className={styles.fill}
              style={{
                width: `${budgetPct}%`,
                background: isOverBudget ? 'var(--color-negative, #e53935)'
                          : budgetPct > 70  ? '#f59e0b'
                          : 'var(--color-primary)',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', opacity: 0.6, fontSize: '11px' }}>
            <span>Spent {fmtINR(monthTotal)}</span>
            <span>Budget {fmtINR(budget)}</span>
          </div>

          <div style={{ height: 'var(--space-4)' }} />

          <div className={styles.progressRow}>
            <p className={styles.progressLabel}>INVESTMENT GOAL</p>
            <p className={styles.progressPct}>{goalPct}%</p>
          </div>
          <div className={styles.track}>
            <div className={styles.fill} style={{ width: `${goalPct}%` }} />
          </div>

          <div className={styles.remainingRow}>
            <p className={styles.progressLabel}>
              {isOverBudget ? '⚠️ Over Budget' : '✅ Remaining Budget'}
            </p>
            <p
              className={styles.remainingAmt}
              style={{ color: isOverBudget ? 'var(--color-negative, #e53935)' : undefined }}
            >
              {isOverBudget ? `-${fmtINR(monthTotal - budget)}` : fmtINR(remaining)}
            </p>
          </div>
        </div>
      </div>

      {/* ── AI Nudge Card ── */}
      <div className={styles.px}>
        <div className={styles.reviewCard} onClick={() => navigate('/review')}>
          <div className={styles.reviewLeft}>
            <div className={styles.reviewIcon}>📝</div>
            <div>
              <div className={styles.reviewDots}>
                <span /> <span /> <span />
              </div>
              <p className={styles.reviewText}>{reviewCount} transaction{reviewCount !== 1 ? 's' : ''} need review</p>
            </div>
          </div>
          <div className={styles.reviewChevron}>›</div>
        </div>
      </div>

      {/* ── Add via SMS Section ── */}
      <div className={styles.px} style={{ marginTop: '24px', paddingBottom: '32px' }}>
        <div className={styles.smsCard}>
          <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginBottom: '-8px' }}>* this feature will be available only in the prototype</div>
          <h2 className={styles.smsTitle}>Add via SMS</h2>
          <p className={styles.smsSub}>Paste your bank SMS here to categorize automatically.</p>
          <textarea
            className={styles.smsTextarea}
            placeholder="Paste your bank SMS here..."
            value={smsText}
            onChange={e => setSmsText(e.target.value)}
          />
          {ingestStatus && (
            <p className={ingestStatus.type === 'success' ? styles.smsSuccess : styles.smsError}>
              {ingestStatus.msg}
            </p>
          )}
          <button
            className={styles.smsBtn}
            onClick={handleSmsSubmit}
            disabled={isSubmitting || !smsText.trim()}
          >
            {isSubmitting ? 'Processing...' : 'Classify SMS'}
          </button>

          <div className={styles.quickAddWrap}>
            {[
              "Spent INR 450.00 on Zomato via UPI on 22-04-26. Bal: INR 12,345",
              "Your A/C XX1234 has been debited by Rs 1500 for Electricity Bill on 25-04-2026. Available Bal Rs 45,000",
              "Paid INR 800.00 to Netflix via Credit Card. Outstanding: INR 5,400",
              "INR 3,000.00 debited from a/c XX5678 for Loan EMI on 20-04-2026.",
              "Amount of INR 120.00 spent on Uber via UPI on 27-04-2026."
            ].map((msg, idx) => (
              <button
                key={idx}
                className={styles.quickAddChip}
                onClick={() => setSmsText(msg)}
              >
                Sample {idx + 1}
              </button>
            ))}
          </div>
        </div>
      </div>



    </div>
  )
}
