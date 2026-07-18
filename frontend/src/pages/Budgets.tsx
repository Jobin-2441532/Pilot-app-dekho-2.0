import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Bell, Plus, Edit2, Trash2, Wallet, Shield, Percent, Home, ShoppingBag, Target, PiggyBank, Settings2, Activity, ChevronDown, TrendingUp, X } from 'lucide-react'
import { useCategoryEmoji } from '../utils/categoryUtils'
import { useAppStore } from '../store/appStore'
import { SkeletonCard } from '../components/ui/LoadingState'
import GlobalLoader from '../components/ui/GlobalLoader'
import { useInsights } from '../hooks/useInsights'
import api from '../lib/api'
import styles from './Budgets.module.css'

const API = import.meta.env.PROD ? (import.meta.env.VITE_API_URL || '') : ''

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

const PULSE_GRADIENTS: Record<string, string> = {
  cruising: 'linear-gradient(135deg, #3d675d 0%, #2f4d45 100%)',
  on_track: 'linear-gradient(135deg, #2E5C46 0%, #1A3C2A 100%)',
  mindful: 'linear-gradient(135deg, #7A612D 0%, #4D3D18 100%)',
  tight: 'linear-gradient(135deg, #8B4A23 0%, #572A10 100%)',
  stretched: 'linear-gradient(135deg, #8B2323 0%, #571010 100%)',
  underspent: 'linear-gradient(135deg, #2A495E 0%, #182C3A 100%)',
}

const pulseBgStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  zIndex: 1,
  pointerEvents: 'none'
}

const PulseIllustration = ({ mood }: { mood: string }) => {
  if (mood === 'cruising') {
    return (
      <svg style={pulseBgStyle} viewBox="0 0 400 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="340" cy="50" r="20" fill="#fceb9c" opacity="0.9" />
        <path d="M100 140 Q 200 120 300 140 T 400 140 L 400 200 L 0 200 L 0 140 Q 50 150 100 140 Z" fill="rgba(255,255,255,0.05)" />
        <path d="M50 160 Q 150 140 250 160 T 400 160 L 400 200 L 0 200 L 0 160 Q 25 170 50 160 Z" fill="rgba(255,255,255,0.1)" />
        {/* Boat */}
        <path d="M240 145 L 340 145 L 315 170 L 255 170 Z" fill="#4B3B36" />
        <path d="M290 145 L 290 50 L 220 135 Z" fill="#FFFFFF" opacity="0.9" />
        <path d="M300 145 L 300 70 L 350 135 Z" fill="#F0F0F0" opacity="0.8" />
      </svg>
    )
  }
  if (mood === 'on_track') {
    return (
      <svg style={pulseBgStyle} viewBox="0 0 400 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="330" cy="60" r="24" fill="#fceb9c" opacity="0.8" />
        <path d="M 0 200 L 400 200 L 400 120 Q 300 90 200 140 T 0 150 Z" fill="rgba(255,255,255,0.05)" />
        <path d="M 0 200 L 400 200 L 400 150 Q 240 120 120 170 T 0 180 Z" fill="rgba(255,255,255,0.1)" />
        {/* Trees */}
        <path d="M330 150 L 330 180" stroke="#4B3B36" strokeWidth="6" />
        <circle cx="330" cy="130" r="25" fill="#5E8C6A" />
        <circle cx="310" cy="140" r="18" fill="#4A7555" />
        <circle cx="350" cy="140" r="18" fill="#4A7555" />
      </svg>
    )
  }
  if (mood === 'mindful') {
    return (
      <svg style={pulseBgStyle} viewBox="0 0 400 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="300" cy="100" r="70" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
        <circle cx="300" cy="100" r="55" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" strokeDasharray="8,8" />
        <path d="M300 30 L 300 170" stroke="#fceb9c" strokeWidth="3" opacity="0.8" />
        <circle cx="300" cy="30" r="6" fill="#fceb9c" />
        <circle cx="300" cy="170" r="6" fill="#fceb9c" />
      </svg>
    )
  }
  if (mood === 'tight') {
    return (
      <svg style={pulseBgStyle} viewBox="0 0 400 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M 240 200 L 340 200 L 320 60 L 260 60 Z" fill="rgba(255,255,255,0.1)" />
        <path d="M 180 200 L 230 200 L 250 90 L 200 90 Z" fill="rgba(255,255,255,0.05)" />
        <path d="M 360 200 L 310 200 L 290 90 L 340 90 Z" fill="rgba(255,255,255,0.05)" />
        <circle cx="290" cy="40" r="14" fill="#FFB085" opacity="0.9" />
      </svg>
    )
  }
  if (mood === 'stretched') {
    return (
      <svg style={pulseBgStyle} viewBox="0 0 400 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M 0 200 L 400 200 L 400 150 Q 300 100 200 170 T 0 130 Z" fill="rgba(255,255,255,0.05)" />
        <path d="M 0 200 L 400 200 L 400 170 Q 240 180 100 150 T 0 170 Z" fill="rgba(255,255,255,0.1)" />
        {/* Warning shape */}
        <circle cx="330" cy="60" r="30" fill="#FFA5A5" opacity="0.8" />
        <path d="M 290 80 L 370 80" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
        <path d="M 300 100 L 360 100" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
      </svg>
    )
  }
  // underspent
  return (
    <svg style={pulseBgStyle} viewBox="0 0 400 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M 0 200 L 400 200 L 400 100 C 300 100 240 70 200 70 C 120 70 80 130 0 130 Z" fill="rgba(255,255,255,0.05)" />
      <path d="M 0 200 L 400 200 L 400 130 C 320 130 280 100 200 100 C 100 100 60 170 0 170 Z" fill="rgba(255,255,255,0.1)" />
      <circle cx="100" cy="50" r="16" fill="#A5D6FF" opacity="0.8" />
      <path d="M 280 60 Q 300 40 320 60 Q 340 60 340 80 L 260 80 Q 260 60 280 60 Z" fill="#FFFFFF" opacity="0.2" />
      <path d="M 360 30 Q 370 20 380 30 Q 390 30 390 40 L 350 40 Q 350 30 360 30 Z" fill="#FFFFFF" opacity="0.2" />
    </svg>
  )
}

export default function Budgets() {
  const navigate = useNavigate()
  const { toggleChat } = useAppStore()
  const getCategoryEmoji = useCategoryEmoji()
  const [loading, setLoading] = useState(true)
  const [goals, setGoals] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [profile, setProfile] = useState<any>(null)

  const { insights, loading: insightsLoading } = useInsights()

  const [totalSpent, setTotalSpent] = useState(0)
  // Unified Edit Category Budget State
  const [editingCatData, setEditingCatData] = useState<any | null>(null)
  const [newCatLabel, setNewCatLabel] = useState('')
  const [newCatEmoji, setNewCatEmoji] = useState('📌')
  const [newCatBudget, setNewCatBudget] = useState('')
  const [isAddingGoal, setIsAddingGoal] = useState(false)
  const [showBudgetNudge, setShowBudgetNudge] = useState(false)
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


  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)

  const [categoriesData, setCategoriesData] = useState<any[]>([
    {
      label: 'Essentials', subtitle: 'NON-NEGOTIABLE', spent: 0, budget: 0,
      subcategories: [
        { label: 'Housing & Household', emoji: getCategoryEmoji('Housing'), amount: 0, budget: 0, match: ['Housing', 'Household'] },
        { label: 'Utilities', emoji: getCategoryEmoji('Utilities'), amount: 0, budget: 0, match: ['Utilities'] },
        { label: 'Bills', emoji: getCategoryEmoji('Bills'), amount: 0, budget: 0, match: ['Bills'] },
        { label: 'Food & Dining', emoji: getCategoryEmoji('Food & Dining'), amount: 0, budget: 0, match: ['Food & Dining'] },
        { label: 'Groceries', emoji: getCategoryEmoji('Groceries'), amount: 0, budget: 0, match: ['Groceries'] },
        { label: 'Transport', emoji: getCategoryEmoji('Transport'), amount: 0, budget: 0, match: ['Transport'] },
        { label: 'Health', emoji: getCategoryEmoji('Health'), amount: 0, budget: 0, match: ['Health'] },
        { label: 'Personal Care', emoji: getCategoryEmoji('Personal Care'), amount: 0, budget: 0, match: ['Personal Care'] },
        { label: 'Insurance', emoji: getCategoryEmoji('Insurance'), amount: 0, budget: 0, match: ['Insurance'] },
        { label: 'Loan EMI', emoji: getCategoryEmoji('Loan EMI'), amount: 0, budget: 0, match: ['Loan EMI'] },
        { label: 'Credit Card', emoji: getCategoryEmoji('Credit Card'), amount: 0, budget: 0, match: ['Credit Card'] },
      ]
    },
    {
      label: 'Lifestyle', subtitle: 'FLEXIBLE', spent: 0, budget: 0,
      subcategories: [
        { label: 'Shopping', emoji: getCategoryEmoji('Shopping'), amount: 0, budget: 0, match: ['Shopping'] },
        { label: 'Entertainment', emoji: getCategoryEmoji('Entertainment'), amount: 0, budget: 0, match: ['Entertainment'] },
        { label: 'Travel', emoji: getCategoryEmoji('Travel'), amount: 0, budget: 0, match: ['Travel'] },
        { label: 'Subscriptions', emoji: getCategoryEmoji('Subscriptions'), amount: 0, budget: 0, match: ['Subscriptions'] },
        { label: 'Telecom', emoji: getCategoryEmoji('Telecom'), amount: 0, budget: 0, match: ['Telecom'] },
      ]
    },
    {
      label: 'Future-oriented', subtitle: 'GOALS', spent: 0, budget: 0,
      subcategories: [
        { label: 'Investment', emoji: getCategoryEmoji('Investment'), amount: 0, budget: 0, match: ['Investment'] },
      ]
    },
    {
      label: 'Buffer', subtitle: 'FLEXIBILITY', spent: 0, budget: 0,
      subcategories: [
        { label: 'Others', emoji: getCategoryEmoji('Others'), amount: 0, budget: 0, match: ['Others'] },
        { label: 'Services', emoji: getCategoryEmoji('Services'), amount: 0, budget: 0, match: ['Services'] },
        { label: 'Uncategorised', emoji: getCategoryEmoji('Uncategorised'), amount: 0, budget: 0, match: ['Uncategorised'] },
      ]
    },
  ])

  const totalBudget = categoriesData.reduce((sum, cat) => sum + (cat.budget || 0), 0)
  const buffer = Math.max(totalBudget - totalSpent, 0)
  const overallPct = Math.min(Math.round((totalSpent / (totalBudget || 1)) * 100), 100)

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
    cruising:   totalBudget > 0 ? 'Cruising smoothly this month.' : 'Budgeting starts with a goal.',
    on_track:   'Pacing well. Right where you should be.',
    mindful:    'Getting into the second half. Stay mindful.',
    tight:      'The month is tightening up a little.',
    stretched:  'A stretched month. It happens — reset is coming.',
    underspent: "You're running very lean this month."
  }
  const PULSE_SUBS: Record<string, string> = {
    cruising:   totalBudget > 0 ? `₹${buffer.toLocaleString('en-IN')} remaining — you're well in control.` : 'Set a budget to start receiving AI-driven financial insights.',
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
      api.get<any[]>('/api/v1/dashboard/budgets').catch(() => []),
      api.get<any>('/api/v1/dashboard/transactions', { limit: 200 }).catch(() => ({ data: [] })),
    ]).then(([g, p, bRes, txRes]) => {
      if (Array.isArray(g)) setGoals(g)
      if (p) setProfile(p)
      
      if (Array.isArray(bRes) && bRes.length > 0) {
        const legacyBudgets: Record<string, number> = {
          'Housing & Household': 12000, 'Utilities': 2000, 'Bills': 1500,
          'Food & Dining': 6000, 'Groceries': 2000, 'Transport': 1500,
          'Shopping': 4000, 'Entertainment': 2000, 'Travel': 3000,
          'Subscriptions': 500, 'Telecom': 500, 'Investment': 5000,
          'Others': 2000, 'Services': 2000, 'Uncategorised': 1000
        };
        
        bRes.forEach(cat => {
          if (Array.isArray(cat.subcategories)) {
            cat.subcategories.forEach((sub: any) => {
              if (legacyBudgets[sub.label] && sub.budget === legacyBudgets[sub.label]) {
                sub.budget = 0;
              }
            });
          }
          cat.budget = cat.subcategories ? cat.subcategories.reduce((s:number, sub:any)=> s + (sub.budget||0), 0) : 0;
        });
        setCategoriesData(bRes)
        
        const customEmojis: Record<string, string> = {};
        bRes.forEach(cat => {
          if (Array.isArray(cat.subcategories)) {
            cat.subcategories.forEach((sub: any) => {
              if (sub.label && sub.emoji) customEmojis[sub.label] = sub.emoji;
            });
          }
        });
        useAppStore.getState().setCategoryEmojis(customEmojis);
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
      }
    }).finally(() => setLoading(false))
  }

  useEffect(() => {
    loadData()
    const handleUpdate = () => loadData()
    window.addEventListener('dekho_data_updated', handleUpdate)
    return () => window.removeEventListener('dekho_data_updated', handleUpdate)
  }, [])

  const location = useLocation()
  useEffect(() => {
    if (location.hash === '#goals' && !loading) {
      setTimeout(() => {
        document.getElementById('goals-section')?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
  }, [location.hash, loading])

  const fmt = (n: number | null | undefined) => {
    if (n == null || isNaN(n)) return '₹0';
    return '₹' + n.toLocaleString('en-IN');
  }

  if (loading && transactions.length === 0) return <GlobalLoader />

  const displayGoals = goals

  return (
    <div className={styles.page}>
      {/* ── Top bar ── */}
      <div className={styles.topBar}>
        <p style={{ fontFamily: 'var(--font-headline)', fontSize: '24px', fontWeight: 'bold', color: 'var(--color-on-surface)', margin: 0 }}>Budgets</p>
      </div>

      <div className={styles.px}>
        <div className={styles.pulseCard} style={{ background: PULSE_GRADIENTS[pulseMood] || PULSE_GRADIENTS['cruising'] }}>
          <PulseIllustration mood={pulseMood} />

          <div className={styles.pulseHeader}>
            <div className={styles.pulseLabel}>
              Monthly Pulse <Activity size={16} />
            </div>
          </div>
          <div className={styles.pulseHeadlineText}>{PULSE_HEADLINES[pulseMood]}</div>
          <div className={styles.pulseSublineText}>{PULSE_SUBS[pulseMood]}</div>
          <div className={styles.pulseAmounts}>
            <div className={styles.pulseAmountCol}>
              <span className={styles.pulseAmountLabel}>Spent</span>
              <span className={styles.pulseAmountVal}>{fmt(totalSpent)}</span>
            </div>
            <div className={`${styles.pulseAmountCol} ${styles.right}`}>
              <span className={styles.pulseAmountLabel}>Budget</span>
              <span className={styles.pulseAmountVal}>{totalBudget > 0 ? fmt(totalBudget) : 'Not Set'}</span>
            </div>
          </div>
          <div className={styles.pulseBar}>
            <div className={styles.pulseBarFill} style={{ width: totalBudget > 0 ? `${overallPct}%` : '0%' }}>
              {totalBudget > 0 && <div className={styles.pulseBarDot} />}
            </div>
          </div>
          <div className={styles.pulseSafeRow}>
            <div className={styles.pulseSafe}>
              {totalBudget > 0 ? `Safe to spend: ${fmt(buffer)}` : 'Safe to spend: N/A'}
            </div>
            <div className={styles.pulseUsedPct}>
              {totalBudget > 0 ? `${overallPct}% used` : 'Budget Not Set'}
            </div>
          </div>
        </div>

        {/* ── Summary Row ── */}
        <div className={styles.summaryRow}>
          <div className={styles.summaryCol}>
            <div className={`${styles.summaryIcon} ${styles.spent}`}><Wallet size={16} strokeWidth={2.5} /></div>
            <div className={styles.summaryText}>
              <span className={styles.summaryLabel}>Spent</span>
              <span className={styles.summaryVal}>{fmt(totalSpent)}</span>
            </div>
          </div>
          <div className={styles.summaryCol}>
            <div className={`${styles.summaryIcon} ${styles.rem}`}><Shield size={16} strokeWidth={2.5} /></div>
            <div className={styles.summaryText}>
              <span className={styles.summaryLabel}>Remaining</span>
              <span className={styles.summaryVal}>{totalBudget > 0 ? fmt(buffer) : 'N/A'}</span>
            </div>
          </div>
          <div className={styles.summaryCol}>
            <div className={`${styles.summaryIcon} ${styles.used}`}><Percent size={16} strokeWidth={2.5} /></div>
            <div className={styles.summaryText}>
              <span className={styles.summaryLabel}>Used</span>
              <span className={styles.summaryVal} style={totalBudget === 0 ? {fontSize: '11px', whiteSpace: 'nowrap'} : {}}>
                {totalBudget > 0 ? `${overallPct}%` : 'Budget Not Set'}
              </span>
            </div>
          </div>
        </div>

        {/* ── Categories ── */}
        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>Your Budget</p>
        </div>

        <div className={styles.categoryList}>
          {categoriesData.map((cat) => {
            const pct = Math.min(Math.round((cat.spent / (cat.budget || 1)) * 100), 100)
            const isOver = cat.spent > cat.budget
            const isExpanded = expandedCategory === cat.label
            
            let IconComponent = Home
            if (cat.label === 'Lifestyle') IconComponent = ShoppingBag
            if (cat.label === 'Future-oriented') IconComponent = Target
            if (cat.label === 'Buffer') IconComponent = PiggyBank

            return (
              <div 
                key={cat.label} 
                className={styles.categoryCard}
                onClick={() => setExpandedCategory(isExpanded ? null : cat.label)}
              >
                <div className={styles.categoryRow}>
                  <div className={`${styles.catIcon} ${styles['cat_' + cat.label]}`}>
                    <IconComponent size={20} strokeWidth={2.5} />
                  </div>
                  
                  <div className={styles.catInfo}>
                    <span className={styles.catName}>{cat.label}</span>
                    <span className={styles.catSub}>{cat.subtitle}</span>
                  </div>
                  
                  <div className={styles.catProgressCol}>
                    <div className={styles.catAmts}>
                      {cat.budget > 0 ? (
                        <>{fmt(cat.spent)} <span>/ {fmt(cat.budget)}</span></>
                      ) : (
                        <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '13px' }}>Budget Not Set</span>
                      )}
                    </div>
                    {cat.budget > 0 && (
                      <div className={styles.catTrack}>
                        <div
                          className={`${styles.catFill} ${styles['cat_' + cat.label]}`}
                          style={{ width: `${pct}%`, background: isOver ? 'var(--color-negative)' : '' }}
                        />
                      </div>
                    )}
                  </div>
                  
                  {cat.budget > 0 && (
                    <div className={`${styles.catPctPill} ${styles['cat_' + cat.label]}`}>
                      {pct}%
                    </div>
                  )}
                  
                  <button 
                    className={styles.catEditBtn}
                    onClick={(e) => { e.stopPropagation(); setEditingCatData(JSON.parse(JSON.stringify(cat))) }}
                    aria-label="Edit Section Budget"
                  >
                    <Edit2 size={14} />
                  </button>
                </div>
                
                {isExpanded && (
                  <div className={styles.subCatList}>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 'bold', color: 'var(--color-on-surface)', paddingLeft: '12px', gridColumn: '1 / -1' }}>Subcategories</p>
                    {cat.subcategories.map((sub: any) => {
                      const hasBudget = sub.budget > 0;
                      const subPct = hasBudget ? Math.min(Math.round((sub.amount / sub.budget) * 100), 100) : 0;
                      const isOver = hasBudget && sub.amount > sub.budget;
                      const dashOffset = 87.96 - (subPct / 100) * 87.96;
                      
                      return (
                        <div key={sub.label} className={styles.subCatGridItem}>
                          <div style={{ position: 'relative', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {hasBudget ? (
                              <svg width="32" height="32" viewBox="0 0 32 32" style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}>
                                <circle cx="16" cy="16" r="14" stroke="var(--bg-surface-high)" strokeWidth="3" fill="none" />
                                <circle cx="16" cy="16" r="14" stroke={isOver ? 'var(--color-negative)' : 'var(--color-primary)'} strokeWidth="3" fill="none" strokeDasharray="87.96" strokeDashoffset={dashOffset} style={{ transition: 'stroke-dashoffset 0.4s ease' }} />
                              </svg>
                            ) : (
                              <div style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', background: 'var(--bg-surface-high)' }} />
                            )}
                            <span style={{ fontSize: '14px', zIndex: 1 }}>{sub.emoji}</span>
                          </div>
                          <span className={styles.subCatLabel}>{sub.label}</span>
                          {hasBudget ? (
                            <span className={styles.subCatAmt}>{fmt(sub.amount)}<br/><span style={{ color: 'var(--color-muted)', fontWeight: 'normal' }}>/ {fmt(sub.budget)}</span></span>
                          ) : (
                            <span className={styles.subCatAmt}>{fmt(sub.amount)}<br/><span style={{ color: 'var(--color-muted)', fontWeight: 'normal', fontSize: '10px' }}>Budget Not Set</span></span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Insight Card ── */}
        <div className={styles.insightCard}>
          <div className={styles.insightIcon}>🪴</div>
          <div className={styles.insightContent}>
            <span className={styles.insightTitle}>You're doing great! 🌟</span>
            <span className={styles.insightText}>Keep going like this and you'll stay comfortably within budget.</span>
          </div>
          <button className={styles.insightBtn} onClick={() => {
            if (totalBudget === 0) {
              setShowBudgetNudge(true);
            } else {
              navigate('/budgets/insights');
            }
          }}>View Insights</button>
        </div>
      </div>

      {/* Budget Motivation Modal */}
      {showBudgetNudge && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px' }} onClick={() => setShowBudgetNudge(false)}>
          <div style={{ background: 'var(--bg-surface)', padding: '32px 24px', borderRadius: '24px', width: '100%', maxWidth: '340px', display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '48px', marginBottom: '8px' }}>🎯</div>
            <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--color-on-surface)' }}>Set Your Intention</h3>
            <p style={{ margin: 0, fontSize: '15px', color: 'var(--color-muted)', lineHeight: 1.5 }}>
              Insights are only meaningful when they guide you toward a goal. Setting a budget isn't about restricting yourself — it's about telling your money where to go.
            </p>
            <div style={{ height: '8px' }} />
            <button 
              style={{
                background: 'var(--color-primary)',
                color: 'black',
                border: 'none',
                padding: '16px 24px',
                borderRadius: '16px',
                fontSize: '16px',
                fontWeight: 600,
                width: '100%',
                cursor: 'pointer'
              }}
              onClick={() => {
                setShowBudgetNudge(false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              Set My Budget Now
            </button>
            <button 
              style={{
                background: 'transparent',
                color: 'var(--color-muted)',
                border: 'none',
                padding: '8px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer'
              }}
              onClick={() => setShowBudgetNudge(false)}
            >
              Maybe Later
            </button>
          </div>
        </div>
      )}

      {/* Edit Budget Modal */}
      {editingCatData && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '400px', maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0 }}>Edit {editingCatData.label} Budget</h3>
            {editingCatData.subcategories.map((sub: any, idx: number) => (
              <div key={sub.label} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '20px' }}>{sub.emoji}</span>
                <span style={{ flex: 1, fontSize: '14px', color: 'var(--color-on-surface)' }}>{sub.label}</span>
                <input
                  type="number"
                  value={sub.budget === 0 && !sub._edited ? '' : (sub.budget === '' ? '' : sub.budget)}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : (e.target.value.startsWith('0') && e.target.value.length > 1 ? parseFloat(e.target.value) : e.target.value);
                    const newData = { ...editingCatData };
                    newData.subcategories[idx].budget = val === '' ? '' : parseFloat(val as string);
                    if (isNaN(newData.subcategories[idx].budget)) newData.subcategories[idx].budget = '';
                    newData.subcategories[idx]._edited = true;
                    setEditingCatData(newData);
                  }}
                  placeholder="₹0"
                  style={{ width: '100px', padding: '8px', borderRadius: '8px', border: '1px solid var(--color-outline)' }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button onClick={() => setEditingCatData(null)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--color-outline)', background: 'transparent' }}>Cancel</button>
              <button onClick={async () => {
                try {
                  await Promise.all(editingCatData.subcategories.map((sub: any) =>
                    api.post('/api/v1/dashboard/budgets/category', {
                      section: editingCatData.label,
                      label: sub.label,
                      emoji: sub.emoji,
                      budget: sub.budget || 0
                    })
                  ));
                  setEditingCatData(null);
                  loadData();
                } catch { alert('Failed to save budgets') }
              }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: 'var(--color-primary)', color: 'white', fontWeight: 'bold' }}>Save</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
