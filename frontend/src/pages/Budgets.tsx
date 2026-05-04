import { useState, useEffect } from 'react'
import { Bell, Plus, Edit2, Trash2 } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { SkeletonCard } from '../components/ui/LoadingState'
import { useInsights } from '../hooks/useInsights'
import api from '../lib/api'
import styles from './Budgets.module.css'

const API = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8000`

interface BudgetCategory {
  label: string
  subtitle: string
  spent: number
  budget: number
}

const GOAL_IMAGES = [
  "https://picsum.photos/seed/dekho_goal1/800/400",
  "https://picsum.photos/seed/dekho_goal2/800/400",
  "https://picsum.photos/seed/dekho_goal3/800/400",
  "https://picsum.photos/seed/dekho_goal4/800/400",
  "https://picsum.photos/seed/dekho_goal5/800/400"
];

export default function Budgets() {
  const { toggleChat } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [goals, setGoals] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [profile, setProfile] = useState<any>(null)

  const { insights, loading: insightsLoading } = useInsights()

  const [totalSpent, setTotalSpent] = useState(0)
  const [totalBudget, setTotalBudget] = useState(45000)

  // Edit Budget State
  const [isEditingBudget, setIsEditingBudget] = useState(false)
  const [newBudget, setNewBudget] = useState("")
  
  // Edit Category Budget State
  const [editCategoryBudget, setEditCategoryBudget] = useState<{label: string, budget: string} | null>(null)

  // Add Goal State
  const [isAddingGoal, setIsAddingGoal] = useState(false)
  const [goalName, setGoalName] = useState('')
  const [goalTarget, setGoalTarget] = useState('')
  const [goalDeadline, setGoalDeadline] = useState('')

  // New goal actions
  const [editingGoal, setEditingGoal] = useState<any>(null)
  const [addingMoneyGoal, setAddingMoneyGoal] = useState<any>(null)
  const [autoPayGoal, setAutoPayGoal] = useState<any>(null)
  const [addMoneyAmount, setAddMoneyAmount] = useState('')
  
  const [editGoalName, setEditGoalName] = useState('')
  const [editGoalTarget, setEditGoalTarget] = useState('')
  const [editGoalDeadline, setEditGoalDeadline] = useState('')

  const [autoPayAmount, setAutoPayAmount] = useState('')
  const [autoPayDate, setAutoPayDate] = useState('')

  const buffer = Math.max(totalBudget - totalSpent, 0)
  const overallPct = Math.min(Math.round((totalSpent / (totalBudget || 1)) * 100), 100)

  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)

  const [categoriesData, setCategoriesData] = useState<any[]>([
    {
      label: 'Essentials', subtitle: 'NON-NEGOTIABLE', spent: 0, budget: 25000,
      subcategories: [
        { label: 'Housing & Household', emoji: '🏠', amount: 0, match: ['Housing', 'Household'] },
        { label: 'Utilities', emoji: '⚡', amount: 0, match: ['Utilities'] },
        { label: 'Bills', emoji: '🧾', amount: 0, match: ['Bills'] },
        { label: 'Food & Dining', emoji: '🍴', amount: 0, match: ['Food & Dining'] },
        { label: 'Groceries', emoji: '🛒', amount: 0, match: ['Groceries'] },
        { label: 'Transport', emoji: '🚗', amount: 0, match: ['Transport'] },
        { label: 'Health', emoji: '💊', amount: 0, match: ['Health'] },
        { label: 'Personal Care', emoji: '🧴', amount: 0, match: ['Personal Care'] },
        { label: 'Insurance', emoji: '🛡️', amount: 0, match: ['Insurance'] },
        { label: 'Loan EMI', emoji: '💳', amount: 0, match: ['Loan EMI'] },
        { label: 'Credit Card', emoji: '💳', amount: 0, match: ['Credit Card'] },
      ]
    },
    {
      label: 'Lifestyle', subtitle: 'FLEXIBLE', spent: 0, budget: 10000,
      subcategories: [
        { label: 'Shopping', emoji: '🛍️', amount: 0, match: ['Shopping'] },
        { label: 'Entertainment', emoji: '🎬', amount: 0, match: ['Entertainment'] },
        { label: 'Travel', emoji: '✈️', amount: 0, match: ['Travel'] },
        { label: 'Subscriptions', emoji: '📺', amount: 0, match: ['Subscriptions'] },
        { label: 'Telecom', emoji: '📱', amount: 0, match: ['Telecom'] },
      ]
    },
    {
      label: 'Future-oriented', subtitle: 'GOALS', spent: 0, budget: 5000,
      subcategories: [
        { label: 'Investment', emoji: '💰', amount: 0, match: ['Investment'] },
      ]
    },
    {
      label: 'Buffer', subtitle: 'FLEXIBILITY', spent: 0, budget: 5000,
      subcategories: [
        { label: 'Others', emoji: '🔮', amount: 0, match: ['Others'] },
        { label: 'Services', emoji: '🛠️', amount: 0, match: ['Services'] },
        { label: 'Uncategorised', emoji: '❓', amount: 0, match: ['Uncategorised'] },
      ]
    },
  ])

  // ── Monthly Pulse Mood ──────────────────────────────────────────────────
  const now2 = new Date()
  const daysInMonth = new Date(now2.getFullYear(), now2.getMonth() + 1, 0).getDate()
  const daysPassed = now2.getDate()
  const monthPct = (daysPassed / daysInMonth) * 100
  const spendPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0

  const getPulseMood = () => {
    if (spendPct > 100) return 'stretched'
    if (spendPct > 85 && daysPassed > 5) return 'tight'
    if (spendPct > 70) return 'mindful'
    if (spendPct < 20 && monthPct > 40) return 'underspent'
    if (spendPct >= 50 && spendPct <= 70 && monthPct >= 50) return 'on_track'
    return 'cruising'
  }
  const pulseMood = getPulseMood()
  const PULSE_HEADLINES: Record<string, string> = {
    cruising:   'Cruising smoothly this month.',
    on_track:   'Pacing well. Right where you should be.',
    mindful:    'Getting into the second half. Stay mindful.',
    tight:      'The month is tightening up a little.',
    stretched:  'A stretched month. It happens — reset is coming.',
    underspent: "You're running very lean this month."
  }
  const PULSE_SUBS: Record<string, string> = {
    cruising:   `₹${buffer.toLocaleString('en-IN')} remaining — you're well in control.`,
    on_track:   'Spending is matching the calendar. Keep the rhythm.',
    mindful:    `₹${buffer.toLocaleString('en-IN')} left for the rest of the month. Conscious choices from here.`,
    tight:      `₹${buffer.toLocaleString('en-IN')} to work with. Small decisions matter now.`,
    stretched:  'Over budget this month. Every month is a new page — this one taught you something.',
    underspent: 'Running lean. Either a quiet month or savings are winning — both are fine.'
  }

  // ── Category Micro-insights ──────────────────────────────────────────────
  const getCatInsight = (label: string, pct: number): string => {
    if (label === 'Essentials') {
      if (pct === 0) return 'Core needs covered. The foundation is solid.'
      if (pct < 50) return 'Core needs covered. The foundation is solid.'
      if (pct < 80) return 'Essentials are tracking well this month.'
      if (pct < 100) return 'Most of your essentials budget is used — expected at this point.'
      return 'Essentials ran over this month. These things happen.'
    }
    if (label === 'Lifestyle') {
      if (pct === 0) return 'No lifestyle spend yet — saving it for when it matters.'
      if (pct < 50) return 'Light on lifestyle this month. That\'s perfectly fine.'
      if (pct < 80) return 'Enjoying life within your plan. Nice balance.'
      if (pct < 100) return 'Lifestyle budget is mostly used — the fun happened.'
      return 'A little over on lifestyle. Worth it sometimes.'
    }
    if (label === 'Future-oriented') {
      if (pct === 0) return 'Future-you is waiting. No rush — but worth starting.'
      if (pct < 50) return 'A start has been made. Small steps compound.'
      if (pct < 80) return 'Halfway to your goals commitment. Keep going.'
      if (pct < 100) return 'Strong progress on future goals this month.'
      return 'Future-oriented budget fully allocated. Remarkable.'
    }
    if (label === 'Buffer') {
      if (pct === 0) return 'Buffer untouched — that\'s the goal of a buffer.'
      if (pct < 60) return 'A little dipped into the buffer. That\'s what it\'s there for.'
      return 'Buffer has absorbed some pressure this month. It did its job.'
    }
    return ''
  }

  // ── Goal Mood ────────────────────────────────────────────────────────────
  const getGoalMood = (pct: number, deadline: string | null) => {
    if (!deadline) {
      if (pct < 15) return 'Every journey starts somewhere. You\'ve started.'
      if (pct < 40) return 'The foundation is being laid. Keep adding to it.'
      if (pct < 65) return 'Real momentum now. This goal is becoming real.'
      if (pct < 85) return 'You\'re in the home stretch. The end is visible.'
      return 'Almost there. One of those rare moments — stay with it.'
    }
    const daysLeft = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)
    const expectedPct = daysLeft < 0 ? 100 : Math.max(0, 100 - (daysLeft / 365) * 100)
    if (pct < expectedPct - 10) return 'A little behind the pace — but the goal is still yours.'
    if (pct > expectedPct + 10) return 'Ahead of schedule. You\'re moving faster than you planned.'
    if (pct < 15) return 'Every journey starts somewhere. You\'ve started.'
    if (pct < 40) return 'The foundation is being laid. Keep adding to it.'
    if (pct < 65) return 'Real momentum now. This goal is becoming real.'
    if (pct < 85) return 'You\'re in the home stretch. The end is visible.'
    return 'Almost there. One of those rare moments — stay with it.'
  }

  const loadData = () => {
    Promise.all([
      api.get<any[]>('/api/v1/dashboard/goals').catch(() => []),
      api.get<any>('/api/v1/dashboard/profile').catch(() => null),
      api.get<any>('/api/v1/dashboard/transactions', { limit: 200 }).catch(() => ({ data: [] })),
    ]).then(([g, p, txRes]) => {
      if (Array.isArray(g)) setGoals(g)
      if (p) {
        setProfile(p)
        setTotalBudget(p.monthlyBudget || p.monthly_budget || 45000)
      }
      const txList = txRes?.data || []
      if (Array.isArray(txList)) {
        const now = new Date()
        const thisMonthTxs = txList.filter((tx: any) => {
          const d = new Date(tx.date)
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
        })
        setTransactions(thisMonthTxs)

        const total = thisMonthTxs.reduce((s: number, tx: any) =>
          s + (tx.direction === 'credit' ? 0 : (tx.amount ?? 0)), 0
        )
        setTotalSpent(total)

        // Calculate categories from real transaction data
        const newCats = [...categoriesData]
        newCats.forEach(cat => {
          const savedBudget = localStorage.getItem(`dekho_budget_${cat.label}`)
          if (savedBudget) cat.budget = parseFloat(savedBudget)
          cat.spent = 0
          cat.subcategories.forEach((sub: any) => { sub.amount = 0 })
        })
        thisMonthTxs.forEach((tx: any) => {
          if (tx.direction === 'credit' || (tx.amount ?? 0) < 0) return
          let found = false
          newCats.forEach(cat => {
            cat.subcategories.forEach((sub: any) => {
              if (sub.match.includes(tx.category)) {
                sub.amount += (tx.amount || 0)
                cat.spent += (tx.amount || 0)
                found = true
              }
            })
          })
          if (!found) {
            newCats[3].subcategories[0].amount += (tx.amount || 0)
            newCats[3].spent += (tx.amount || 0)
          }
        })
        setCategoriesData(newCats)
      }
    }).finally(() => setLoading(false))
  }

  useEffect(() => {
    loadData()
    const handleUpdate = () => loadData()
    window.addEventListener('dekho_data_updated', handleUpdate)
    return () => window.removeEventListener('dekho_data_updated', handleUpdate)
  }, [])

  const fmt = (n: number | null | undefined) => {
    if (n == null || isNaN(n)) return '₹0';
    return '₹' + n.toLocaleString('en-IN');
  }

  if (loading) return (
    <div style={{ padding: 'var(--space-5)' }}>
      <SkeletonCard />
      <div style={{ height: 'var(--space-4)' }} />
      <SkeletonCard />
    </div>
  )

  const displayGoals = goals

  return (
    <div className={styles.page}>
      {/* ── Top bar ── */}
      <div className={styles.topBar}>
        <p style={{ fontFamily: 'var(--font-headline)', fontSize: '24px', fontWeight: 'bold', color: 'var(--color-on-surface)', margin: 0 }}>Budgets & Goals</p>
      </div>

      {/* ── Pulse Card ── */}
      <div className={styles.px}>
        <div className={styles.pulseCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div className={styles.pulseLabel} style={{ margin: 0 }}>MONTHLY PULSE</div>
            <button 
              onClick={() => { setNewBudget(totalBudget.toString()); setIsEditingBudget(true); }}
              style={{ background: 'none', border: 'none', color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              aria-label="Edit Budget"
            >
              <Edit2 size={16} />
            </button>
          </div>
          <div className={styles.pulseHeadline}>{PULSE_HEADLINES[pulseMood]}</div>
          <div className={styles.pulseMeta}>
            <span>SPENT: {fmt(totalSpent)}</span>
            <span>BUDGET: {fmt(totalBudget)}</span>
          </div>
          <div className={styles.pulseBar}>
            <div className={styles.pulseBarFill} style={{ width: `${overallPct}%` }} />
          </div>
          <div className={styles.pulseSafe}>
            Safe to spend: <strong>{fmt(buffer)}</strong>
          </div>
          <div className={styles.pulseSubtext}>{PULSE_SUBS[pulseMood]}</div>
        </div>
      </div>

      {/* ── Categories ── */}
      <div className={styles.px}>
        <div className={styles.categoryList}>
          {categoriesData.map((cat) => {
            const pct = Math.min(Math.round((cat.spent / (cat.budget || 1)) * 100), 100)
            const isOver = cat.spent > cat.budget
            const isExpanded = expandedCategory === cat.label
            return (
              <div 
                key={cat.label} 
                className={styles.categoryCard}
                onClick={() => setExpandedCategory(isExpanded ? null : cat.label)}
              >
                <div className={styles.catHeader}>
                  <div className={styles.catTitleRow}>
                    <span className={styles.catLabel} style={{ display: 'flex', alignItems: 'center' }}>
                      {cat.label}
                      <button 
                        onClick={(e) => { e.stopPropagation(); setEditCategoryBudget({ label: cat.label, budget: cat.budget.toString() }) }}
                        style={{ background: 'none', border: 'none', marginLeft: '8px', cursor: 'pointer', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', opacity: 0.7 }}
                        aria-label="Edit Section Budget"
                      >
                        <Edit2 size={12} />
                      </button>
                    </span>
                    <span className={styles.catAmts}>{fmt(cat.spent)} / {fmt(cat.budget)}</span>
                  </div>
                  <div className={styles.catSubRow}>
                    <span className={styles.catSub}>{cat.subtitle}</span>
                    <span className={styles.catChevron}>
                      <svg width="12" height="8" viewBox="0 0 12 8" fill="none" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                        <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                  </div>
                </div>
                <div className={styles.catTrack}>
                  <div
                    className={styles.catFill}
                    style={{
                      width: `${pct}%`,
                      background: isOver ? 'var(--color-negative)' : 'var(--color-primary)',
                    }}
                  />
                </div>
                <p className={styles.catMicroInsight}>{getCatInsight(cat.label, pct)}</p>
                {isExpanded && (
                  <div className={styles.subCatList}>
                    {cat.subcategories.map((sub: any) => (
                      <div key={sub.label} className={styles.subCatRow}>
                        <span className={styles.subCatLabel}>{sub.emoji} {sub.label}</span>
                        <span className={styles.subCatAmt}>{fmt(sub.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Goals ── */}
      <div className={styles.px}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>Your Goals</p>
          <button className={styles.addBtn} onClick={() => setIsAddingGoal(true)} aria-label="Add goal">
            <Plus size={14} />
            + New Goal
          </button>
        </div>

        {insights?.budgets.goal_card && (
          <div className={styles.goalHeadline}>
            {insights.budgets.goal_card.headline}
          </div>
        )}


        {displayGoals.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 24px', background: 'var(--bg-surface)', borderRadius: '16px', border: '2px dashed var(--color-outline)', marginBottom: '16px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎯</div>
            <p style={{ fontWeight: 'bold', fontSize: '16px', color: 'var(--color-on-surface)', marginBottom: '6px' }}>What are you saving towards?</p>
            <p style={{ fontSize: '13px', color: 'var(--color-muted)', marginBottom: '16px' }}>A trip, a gadget, a rainy day — give your money a direction.</p>
            <button onClick={() => setIsAddingGoal(true)} style={{ padding: '10px 24px', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: '20px', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}>
              + Set your first goal
            </button>
          </div>
        )}

        {displayGoals.map((goal: any, index: number) => {
          const currentAmt = goal.currentAmount ?? goal.current_amount ?? 0;
          const targetAmt = goal.targetAmount ?? goal.target_amount ?? 1;
          const pct = Math.min(Math.round((currentAmt / targetAmt) * 100), 100)
          let deadline = 'No date'
          try {
            if (goal.deadline) {
              deadline = new Date(goal.deadline).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
            }
          } catch (e) {
            console.error("Invalid date for goal:", goal)
          }
          return (
            <div key={goal.id} className={styles.goalCard}>
              {/* Goal image header */}
              <div className={styles.goalImageWrap}>
                <div className={styles.goalImageBg} style={{ backgroundImage: `url(${GOAL_IMAGES[index % GOAL_IMAGES.length]})` }} />
                <div className={styles.goalImageOverlay}>
                  <p className={styles.goalImageTitle}>{goal.name} is getting closer ✨</p>
                </div>
                <button 
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (window.confirm('Are you sure you want to delete this goal?')) {
                      try {
                        const rawId = String(goal.id).replace(/^g/, '')
                        await api.delete(`/api/v1/dashboard/goals/${rawId}`)
                        loadData()
                      } catch (err) {
                        console.error('Failed to delete goal', err)
                      }
                    }
                  }}
                  style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer', zIndex: 10 }}
                  aria-label="Delete Goal"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {/* Goal details */}
              <div className={styles.goalDetails}>
                <div className={styles.goalMeta}>
                  <p className={styles.goalStatus} style={{ fontStyle: 'italic', color: '#9B7E6A' }}>{getGoalMood(pct, goal.deadline || null)}</p>
                  <div className={styles.goalDeadlineWrap}>
                    <span className={styles.goalDeadlineLabel}>TARGET</span>
                    <span className={styles.goalDeadline}>{deadline}</span>
                  </div>
                </div>

                <div className={styles.goalName}>{goal.name}</div>

                <div className={styles.goalProgress}>
                  <span className={styles.goalCurrent}>{fmt(currentAmt)}</span>
                  <span className={styles.goalSep}> /{fmt(targetAmt).replace('₹', '')}</span>
                  <span className={styles.goalPct}>{pct}%</span>
                </div>

                <div className={styles.goalTrack}>
                  <div className={styles.goalFill} style={{ width: `${pct}%` }} />
                </div>

                <div className={styles.goalContribCard} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {goal.autoPayStatus === 'active' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className={styles.goalContribIcon}>⚡</div>
                      <p className={styles.goalContribText}>
                        <strong>₹{(goal.autoPayAmount || 0).toLocaleString('en-IN')}/month</strong> auto-pay on the {goal.autoPayDate}th
                      </p>
                    </div>
                  ) : (
                    <p className={styles.goalContribText} style={{ color: 'var(--color-muted)' }}>Set up auto-save to reach this goal on autopilot.</p>
                  )}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button onClick={() => setAddingMoneyGoal(goal)} style={{ flex: 1, padding: '8px', fontSize: '12px', background: 'var(--bg-surface-highest)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: 'var(--color-on-surface)' }}>Add Money</button>
                    <button onClick={() => {
                      setAutoPayGoal(goal)
                      setAutoPayAmount(goal.autoPayAmount ? String(goal.autoPayAmount) : '')
                      setAutoPayDate(goal.autoPayDate ? String(goal.autoPayDate) : '')
                    }} style={{ flex: 1, padding: '8px', fontSize: '12px', background: 'var(--bg-surface-highest)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: 'var(--color-on-surface)' }}>Auto Pay</button>
                    <button onClick={() => {
                      setEditingGoal(goal)
                      setEditGoalName(goal.name)
                      setEditGoalTarget(goal.targetAmount)
                      setEditGoalDeadline(goal.deadline || '')
                    }} style={{ flex: 1, padding: '8px', fontSize: '12px', background: 'var(--bg-surface-highest)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: 'var(--color-on-surface)' }}>Edit</button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modals */}
      {isEditingBudget && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0 }}>Edit Monthly Budget</h3>
            <input type="number" value={newBudget} onChange={e => setNewBudget(e.target.value)} placeholder="Amount (e.g. 50000)" style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--color-outline)' }} />
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setIsEditingBudget(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--color-outline)', background: 'transparent' }}>Cancel</button>
              <button onClick={async () => {
                try {
                  await api.post('/api/v1/dashboard/profile/budget', { monthly_budget: parseFloat(newBudget) })
                } catch { /* non-fatal */ }
                setTotalBudget(parseFloat(newBudget) || totalBudget)
                setIsEditingBudget(false)
                loadData()
              }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: 'var(--color-primary)', color: 'white', fontWeight: 'bold' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {editCategoryBudget && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0 }}>Edit {editCategoryBudget.label} Budget</h3>
            <input type="number" value={editCategoryBudget.budget} onChange={e => setEditCategoryBudget({...editCategoryBudget, budget: e.target.value})} placeholder="Amount" style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--color-outline)' }} />
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setEditCategoryBudget(null)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--color-outline)', background: 'transparent' }}>Cancel</button>
              <button onClick={() => {
                const updatedCats = categoriesData.map(c => 
                  c.label === editCategoryBudget.label ? { ...c, budget: parseFloat(editCategoryBudget.budget) || 0 } : c
                )
                setCategoriesData(updatedCats)
                localStorage.setItem(`dekho_budget_${editCategoryBudget.label}`, editCategoryBudget.budget)
                setEditCategoryBudget(null)
              }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: 'var(--color-primary)', color: 'white', fontWeight: 'bold' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {isAddingGoal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0 }}>Add New Goal</h3>
            <input type="text" value={goalName} onChange={e => setGoalName(e.target.value)} placeholder="Goal Name (e.g. New Laptop)" style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--color-outline)' }} />
            <input type="number" value={goalTarget} onChange={e => setGoalTarget(e.target.value)} placeholder="Target Amount" style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--color-outline)' }} />
            <input type="date" value={goalDeadline} onChange={e => setGoalDeadline(e.target.value)} style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--color-outline)' }} />
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setIsAddingGoal(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--color-outline)', background: 'transparent' }}>Cancel</button>
              <button onClick={async () => {
                try {
                  await api.post('/api/v1/dashboard/goals', {
                    name: goalName,
                    target_amount: parseFloat(goalTarget),
                    deadline: goalDeadline || null,
                  })
                  setIsAddingGoal(false)
                  setGoalName(''); setGoalTarget(''); setGoalDeadline('')
                  loadData()
                } catch { alert('Failed to save goal') }
              }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: 'var(--color-primary)', color: 'white', fontWeight: 'bold' }}>Save Goal</button>
            </div>
          </div>
        </div>
      )}

      {/* Adding Money Modal */}
      {addingMoneyGoal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0 }}>Add Money to {addingMoneyGoal.name}</h3>
            <input type="number" value={addMoneyAmount} onChange={e => setAddMoneyAmount(e.target.value)} placeholder="Amount (₹)" style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--color-outline)' }} />
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setAddingMoneyGoal(null)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--color-outline)', background: 'transparent' }}>Cancel</button>
              <button onClick={async () => {
                try {
                  const rawId = String(addingMoneyGoal.id).replace(/^g/, '')
                  await api.post(`/api/v1/dashboard/goals/${rawId}/add_money`, { amount: parseFloat(addMoneyAmount) })
                  setAddingMoneyGoal(null)
                  setAddMoneyAmount('')
                  loadData()
                } catch (err: any) {
                    const msg = err?.message || ''
                    if (msg.includes('404') || msg.includes('not found')) {
                      alert('Goal not found. Try logging out and back in.')
                    } else if (msg.includes('401')) {
                      alert('Session expired. Please log in again.')
                    } else {
                      alert('Failed to add money: ' + msg)
                    }
                  }
              }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: 'var(--color-primary)', color: 'white', fontWeight: 'bold' }}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Editing Goal Modal */}
      {editingGoal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0 }}>Edit Goal</h3>
            <input type="text" value={editGoalName} onChange={e => setEditGoalName(e.target.value)} placeholder="Goal Name" style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--color-outline)' }} />
            <input type="number" value={editGoalTarget} onChange={e => setEditGoalTarget(e.target.value)} placeholder="Target Amount" style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--color-outline)' }} />
            <input type="date" value={editGoalDeadline} onChange={e => setEditGoalDeadline(e.target.value)} style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--color-outline)' }} />
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setEditingGoal(null)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--color-outline)', background: 'transparent' }}>Cancel</button>
              <button onClick={async () => {
                try {
                  const rawId = String(editingGoal.id).replace(/^g/, '')
                  await api.put(`/api/v1/dashboard/goals/${rawId}`, {
                    name: editGoalName,
                    target_amount: parseFloat(editGoalTarget),
                    deadline: editGoalDeadline || null,
                  })
                  setEditingGoal(null)
                  loadData()
                } catch { alert('Failed to edit goal') }
              }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: 'var(--color-primary)', color: 'white', fontWeight: 'bold' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Auto Pay Modal */}
      {autoPayGoal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0 }}>Auto Pay Settings</h3>
            <input type="number" value={autoPayAmount} onChange={e => setAutoPayAmount(e.target.value)} placeholder="Amount (₹)" style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--color-outline)' }} />
            <input type="number" min="1" max="31" value={autoPayDate} onChange={e => setAutoPayDate(e.target.value)} placeholder="Day of month (1-31)" style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--color-outline)' }} />
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setAutoPayGoal(null)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--color-outline)', background: 'transparent' }}>Cancel</button>
              <button onClick={async () => {
                try {
                  const rawId = String(autoPayGoal.id).replace(/^g/, '')
                  await api.put(`/api/v1/dashboard/goals/${rawId}/auto_pay`, {
                    auto_pay_amount: parseFloat(autoPayAmount) || 0,
                    auto_pay_date: parseInt(autoPayDate) || 1,
                    auto_pay_status: 'inactive'
                  })
                  setAutoPayGoal(null)
                  loadData()
                } catch { alert('Failed to update auto pay') }
              }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #ff4444', background: 'transparent', color: '#ff4444', fontWeight: 'bold' }}>Pause / Remove</button>
              <button onClick={async () => {
                try {
                  const rawId = String(autoPayGoal.id).replace(/^g/, '')
                  await api.put(`/api/v1/dashboard/goals/${rawId}/auto_pay`, {
                    auto_pay_amount: parseFloat(autoPayAmount) || 0,
                    auto_pay_date: parseInt(autoPayDate) || 1,
                    auto_pay_status: 'active'
                  })
                  setAutoPayGoal(null)
                  loadData()
                } catch { alert('Failed to update auto pay') }
              }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: 'var(--color-primary)', color: 'white', fontWeight: 'bold' }}>Save Auto Pay</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
