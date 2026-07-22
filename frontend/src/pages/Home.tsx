import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Check } from 'lucide-react'
import { SkeletonCard } from '../components/ui/LoadingState'
import { useCategoryEmoji } from '../utils/categoryUtils'
import { useInsights } from '../hooks/useInsights'
import { useAppStore } from '../store/appStore'
import api from '../lib/api'
import { ReflectionCard } from '../components/ui/ReflectionCard'
import GlobalLoader from '../components/ui/GlobalLoader'
import styles from './Home.module.css'

const API = ''


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
  const [profile, setProfile]       = useState<any>({ name: 'User', monthly_budget: 0 })
  const [todaySpend, setTodaySpend] = useState(0)
  const [monthTotal, setMonthTotal] = useState(0)
  const [savingGoals, setSavingGoals] = useState<any[]>([])
  const [budgets, setBudgets] = useState<any[]>([])
  const [topCategory, setTopCategory] = useState<{ name: string; total: number; pct: number | null }>({ name: 'None', total: 0, pct: null })
  const [transactions, setTransactions] = useState<any[]>([])
  const [reviewCount, setReviewCount] = useState(0)
  const [categorySpends, setCategorySpends] = useState<Record<string, number>>({})
  const [totalAiChats, setTotalAiChats] = useState(0)
  
  const [smsText, setSmsText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [ingestStatus, setIngestStatus] = useState<{type: 'success' | 'error', msg: string} | null>(null)

  const { insights } = useInsights()
  const getCategoryEmoji = useCategoryEmoji()

  const [chatOpen, setChatOpen] = useState(false)
  const [chatHistory, setChatHistory] = useState<{role: 'user'|'dekho', text: string}[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [stats, setStats] = useState<any>(null)

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
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const today = `${year}-${month}-${String(now.getDate()).padStart(2, '0')}`
    const monthStart = `${year}-${month}-01`
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const thirtyDaysAgoDate = `${thirtyDaysAgo.getFullYear()}-${String(thirtyDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(thirtyDaysAgo.getDate()).padStart(2, '0')}`

    Promise.all([
      api.get<any>('/api/v1/dashboard/profile').catch(() => null),
      api.get<any>('/api/v1/dashboard/transactions', { limit: 500, from_date: thirtyDaysAgoDate }).catch(() => ({ data: [] })),
      api.get<any[]>('/api/v1/dashboard/goals').catch(() => []),
      api.get<any[]>('/api/v1/dashboard/review/queue').catch(() => []),
      api.get<any[]>('/api/v1/chat/history').catch(() => []),
      api.get<any[]>('/api/v1/dashboard/budgets').catch(() => []),
    ]).then(([prof, txRes, goals, revData, chatHistRes, budgetsRes]) => {
      if (prof) setProfile({ ...prof, name: prof.fullName || prof.name || 'User' })
      if (Array.isArray(goals)) setSavingGoals(goals)
      if (Array.isArray(revData)) setReviewCount(revData.length)
      if (Array.isArray(budgetsRes)) {
        const legacyBudgets: Record<string, number> = {
          'Housing & Household': 12000, 'Utilities': 2000, 'Bills': 1500,
          'Food & Dining': 6000, 'Groceries': 2000, 'Transport': 1500,
          'Shopping': 4000, 'Entertainment': 2000, 'Travel': 3000,
          'Subscriptions': 500, 'Telecom': 500, 'Investment': 5000,
          'Others': 2000, 'Services': 2000, 'Uncategorised': 1000
        };

        budgetsRes.forEach(cat => {
          if (Array.isArray(cat.subcategories)) {
            cat.subcategories.forEach((sub: any) => {
              if (legacyBudgets[sub.label] && sub.budget === legacyBudgets[sub.label]) {
                sub.budget = 0;
              }
            });
          }
          cat.budget = cat.subcategories ? cat.subcategories.reduce((s:number, sub:any)=> s + (sub.budget||0), 0) : 0;
        });

        setBudgets(budgetsRes)
        const customEmojis: Record<string, string> = {};
        budgetsRes.forEach(cat => {
          if (Array.isArray(cat.subcategories)) {
            cat.subcategories.forEach((sub: any) => {
              if (sub.label && sub.emoji) customEmojis[sub.label] = sub.emoji;
            });
          }
        });
        useAppStore.getState().setCategoryEmojis(customEmojis);
      }
      if (Array.isArray(chatHistRes)) {
        const userMsgs = chatHistRes.filter((m: any) => m.role === 'user').length;
        setTotalAiChats(userMsgs);
      }

      const txList: any[] = txRes?.data || []
      if (Array.isArray(txList)) {
        setTransactions(txList)
        
        const currentMonthPrefix = monthStart.slice(0, 7)
        const thisMonthTxs = txList.filter(t => (t.date || '').startsWith(currentMonthPrefix))
        const total = thisMonthTxs.reduce((s: number, t: any) => s + (t.direction === 'debit' ? (t.amount ?? 0) : 0), 0)
        setMonthTotal(total)

        const todayStr = today
        const todayTxs = txList.filter((t: any) => String(t.date || '').startsWith(todayStr) && t.direction === 'debit')
        setTodaySpend(todayTxs.reduce((s: number, t: any) => s + (t.amount ?? 0), 0))

        const dayOfWeek = now.getDay(); // 0 is Sunday, 6 is Saturday
        
        // This week started on the most recent Sunday
        const startOfThisWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
        startOfThisWeek.setHours(0, 0, 0, 0);

        const startOfLastWeek = new Date(startOfThisWeek.getFullYear(), startOfThisWeek.getMonth(), startOfThisWeek.getDate() - 7);
        const endOfLastWeek = new Date(startOfThisWeek.getFullYear(), startOfThisWeek.getMonth(), startOfThisWeek.getDate() - 1);
        endOfLastWeek.setHours(23, 59, 59, 999);

        const last7DaysTotal = txList.filter(t => {
          if (t.direction !== 'debit' || !t.date) return false;
          const d = new Date(t.date);
          return d >= startOfThisWeek && d <= now;
        }).reduce((sum, t) => sum + (t.amount || 0), 0);

        const prev7DaysTotal = txList.filter(t => {
          if (t.direction !== 'debit' || !t.date) return false;
          const d = new Date(t.date);
          return d >= startOfLastWeek && d <= endOfLastWeek;
        }).reduce((sum, t) => sum + (t.amount || 0), 0);

        let pct: number | null = null;
        if (prev7DaysTotal > 0) {
          pct = Math.round(((last7DaysTotal - prev7DaysTotal) / prev7DaysTotal) * 100);
        }

        // Top category this month
        const catMap: Record<string, number> = {}
        txList.forEach((t: any) => {
          if (t.direction === 'debit' && t.date) {
            const txMonth = t.date.slice(0, 7)
            const currentMonth = monthStart.slice(0, 7)
            if (txMonth === currentMonth) {
              const c = t.category || 'Others'
              catMap[c] = (catMap[c] || 0) + (t.amount || 0)
            }
          }
        })
        setCategorySpends(catMap)
        const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1])
        if (sorted.length > 0) {
          setTopCategory({ name: sorted[0][0], total: sorted[0][1], pct: pct })
        }
      }
    }).finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchData()
    const handleUpdate = () => fetchData()
    window.addEventListener('dekho_data_updated', handleUpdate)
    
    // PostHog Tracking
    import('posthog-js').then((ph) => {
      ph.default.capture('dashboard_viewed', { platform: 'web', display_mode: 'light' })
      
      const today = new Date().toDateString();
      if (localStorage.getItem('ph_last_streak_checkin') !== today) {
        ph.default.capture('streak_checkin', { platform: 'web' })
        localStorage.setItem('ph_last_streak_checkin', today)
      }

      ph.default.capture('safe_budgets_viewed', { platform: 'web' })
    })

    return () => window.removeEventListener('dekho_data_updated', handleUpdate)
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

  if (loading && transactions.length === 0) return <GlobalLoader />

  const sumBudgets = budgets.length > 0 ? budgets.reduce((sum, cat) => sum + (cat.budget || 0), 0) : 0;
  const budget = sumBudgets;
  const budgetPct  = budget > 0 ? Math.min(Math.round((monthTotal / budget) * 100), 100) : 0;
  const goalPct    = savingGoals.length > 0
    ? Math.min(Math.round((savingGoals[0].current_amount / savingGoals[0].target_amount) * 100), 100) : 42;
  const remaining  = budget > 0 ? Math.max(budget - monthTotal, 0) : 0;
  const isOverBudget = budget > 0 && monthTotal > budget;
  
  const uniqueDays = Math.max(1, new Date().getDate())
  const avgSpend = Math.round(monthTotal / uniqueDays)

  const getCalendarDays = () => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const day = today.getDay(); 
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); 
    const monday = new Date(today.getFullYear(), today.getMonth(), diff);
    return ['M','T','W','T','F','S','S'].map((label, i) => {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      d.setHours(0,0,0,0);
      const isToday = d.getTime() === today.getTime();
      const diffDays = Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      const isCompleted = diffDays >= 0 && diffDays < (profile?.streak_days || 0);
      return { label, dateNum: d.getDate(), isCompleted, isToday };
    });
  };
  const calendarDays = getCalendarDays();

  let safeBudgetsCount = 0;
  let totalBudgetsCount = 0;
  
  if (budgets.length > 0) {
    budgets.forEach(cat => {
      cat.subcategories.forEach((sub: any) => {
        totalBudgetsCount++;
        const spent = categorySpends[sub.label] || 0;
        const hasBudget = sub.budget > 0;
        if (!hasBudget || spent < sub.budget + 1) {
          safeBudgetsCount++;
        }
      });
    });
  } else {
    // Fallback if budgets not loaded
    const categoryBudgets: Record<string, number> = {
      'Housing & Household': 12000, 'Utilities': 2000, 'Bills': 1500,
      'Food & Dining': 6000, 'Groceries': 2000, 'Transport': 1500,
      'Shopping': 4000, 'Entertainment': 2000, 'Travel': 3000,
      'Subscriptions': 500, 'Telecom': 500, 'Investment': 5000,
      'Others': 2000, 'Services': 2000, 'Uncategorised': 1000
    };
    totalBudgetsCount = Object.keys(categoryBudgets).length;
    safeBudgetsCount = Object.entries(categoryBudgets).filter(([cat, budgetLimit]) => {
      const spent = categorySpends[cat] || 0;
      return budgetLimit <= 0 || spent < budgetLimit + 1;
    }).length;
  }
  
  // Combine local session chats with the fetched backend history chats
  const localSessionChats = chatHistory.filter(c => c.role === 'user').length;
  const userAiChatsCount = totalAiChats + localSessionChats;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: '16px' }}>
          <button id="tour-settings" className={styles.iconBtn} onClick={() => navigate('/settings')} aria-label="Settings">
            <Settings size={18} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* Main Content Area (Scrollable) */}
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
              <span className={styles.focusIcon}>
                {getCategoryEmoji(topCategory.name)}
              </span>
            </div>
          </div>
          <div className={styles.focusCard}>
            <p className={styles.focusLabel}>VS LAST WEEK</p>
            <div className={styles.focusMeta}>
              <span className={styles.focusPct} data-up={(topCategory.pct || 0) > 0}>
                {topCategory.pct !== null ? `${topCategory.pct > 0 ? '+' : (topCategory.pct < 0 ? '-' : '')}${Math.abs(topCategory.pct)}%` : 'N/A'}
              </span>
              {topCategory.pct !== null && (
                <span className={styles.trendArrow} data-up={topCategory.pct > 0}>
                  {topCategory.pct > 0 ? '↗' : '↘'}
                </span>
              )}
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
            <p className={styles.progressPct}>{budget === 0 ? 'Not Set' : `${budgetPct}%`}</p>
          </div>
          <div className={styles.track}>
            <div
              className={styles.fill}
              style={{
                width: budget === 0 ? '100%' : `${budgetPct}%`,
                background: budget === 0 ? 'var(--bg-card)' 
                          : isOverBudget ? 'var(--color-negative, #e53935)'
                          : budgetPct > 70  ? '#f59e0b'
                          : 'var(--color-primary)',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', opacity: 0.6, fontSize: '11px' }}>
            <span>Spent {fmtINR(monthTotal)}</span>
            <span>{budget === 0 ? 'Budget Not Set' : `Budget ${fmtINR(budget)}`}</span>
          </div>

          <div style={{ height: 'var(--space-4)' }} />



          <div className={styles.remainingRow}>
            <p className={styles.progressLabel}>
              {budget === 0 ? 'Budget' : (isOverBudget ? '⚠️ Over Budget' : '✅ Remaining Budget')}
            </p>
            <p
              className={styles.remainingAmt}
              style={{ color: isOverBudget && budget > 0 ? 'var(--color-negative, #e53935)' : undefined }}
            >
              {budget === 0 ? 'Not Set' : (isOverBudget ? `-${fmtINR(monthTotal - budget)}` : fmtINR(remaining))}
            </p>
          </div>
        </div>
      </div>



      {/* ── Gamification & Stats (Streak Section) ── */}
      <div className={styles.px} style={{ marginTop: '32px', marginBottom: '32px' }}>
        <div style={{
          background: 'var(--bg-card, #FFFFFF)',
          borderRadius: 'var(--radius-xl, 24px)',
          padding: '32px 16px 24px',
          boxShadow: 'var(--shadow-sm, 0 2px 8px rgba(0,0,0,0.05))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          {/* Top Section */}
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', width: '90px', height: '90px', borderRadius: '50%', border: '1px solid var(--color-border, #EAEAEA)', marginBottom: '16px' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ zIndex: 1, filter: 'drop-shadow(0 4px 6px rgba(255, 107, 0, 0.3))' }}>
              <defs>
                <linearGradient id="flameGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FFA07A" />
                  <stop offset="100%" stopColor="#FF6347" />
                </linearGradient>
              </defs>
              <path d="M12 2C12 2 7 7 7 12C7 14.7614 9.23858 17 12 17C14.7614 17 17 14.7614 17 12C17 7 12 2 12 2Z" fill="url(#flameGrad)" />
              <path d="M12 10C12 10 10.5 11.5 10.5 13C10.5 13.8284 11.1716 14.5 12 14.5C12.8284 14.5 13.5 13.8284 13.5 13C13.5 11.5 12 10 12 10Z" fill="white" />
            </svg>
          </div>
          
          <div style={{ 
            fontSize: '56px', 
            fontWeight: 'var(--font-bold, 800)', 
            lineHeight: 1, 
            marginTop: '-28px', 
            color: 'var(--color-on-surface)',
            zIndex: 2,
            fontFamily: 'var(--font-headline, sans-serif)'
          }}>
            {profile?.streak_days || 0}
          </div>
          
          <div style={{ fontSize: '20px', fontWeight: 'var(--font-bold, 800)', color: 'var(--color-on-surface)', marginTop: '8px', fontFamily: 'var(--font-headline, sans-serif)' }}>
            Mindful Streak
          </div>
          
          <div style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: '4px', fontWeight: 'var(--font-medium, 500)' }}>
            You are doing really great, {(profile?.name ?? 'User').split(' ')[0]}!
          </div>

          {/* Middle Section: Weekly Calendar */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '24px', width: '100%', justifyContent: 'space-between', padding: '0 8px' }}>
            {calendarDays.map((day, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--color-muted)', fontWeight: 600 }}>{day.label}</span>
                {day.isCompleted ? (
                  <div style={{ 
                    width: '32px', height: '32px', borderRadius: '50%', 
                    background: 'linear-gradient(135deg, #FFA07A 0%, #FF6347 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 8px rgba(255, 99, 71, 0.3)'
                  }}>
                    <Check size={16} strokeWidth={3} color="white" />
                  </div>
                ) : (
                  <div style={{ 
                    width: '32px', height: '32px', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', 
                    fontSize: '13px', fontWeight: 700, 
                    color: day.isToday ? 'var(--color-on-surface)' : 'var(--color-muted)',
                    background: day.isToday ? 'rgba(0,0,0,0.03)' : 'transparent'
                  }}>
                    {day.dateNum}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Divider */}
          <div style={{ width: '100%', height: '1px', background: 'var(--color-border, #EAEAEA)', margin: '24px 0' }} />

          {/* Bottom Section: Stats */}
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>
            Your Stats
          </div>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            width: '100%',
            gap: '8px'
          }}>
            {[
              { label: 'Spends Logged', val: transactions.length.toString() },
              { label: 'Safe Budgets', val: `${safeBudgetsCount}/${totalBudgetsCount}` }
            ].map((stat, i) => (
              <div key={i} style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                borderRight: i === 1 ? 'none' : '1px solid var(--color-border, #EAEAEA)',
              }}>
                <div style={{ fontSize: '11px', color: 'var(--color-muted)', fontWeight: 600, marginBottom: '4px', textAlign: 'center', lineHeight: 1.2 }}>
                  {stat.label.split(' ')[0]}<br/>{stat.label.split(' ')[1] || ''}
                </div>
                <div style={{ fontSize: '20px', fontWeight: 'var(--font-bold, 800)', color: 'var(--color-on-surface)', fontFamily: 'var(--font-headline, sans-serif)' }}>
                  {stat.val}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Spacing at the bottom of the page */}
      <div style={{ height: '48px' }} />



    </div>
  )
}
