/* ── Expenses Page — Stitch "Expenses with Spending Heatmap" ── */

import { useState, useEffect } from 'react'
import { Filter, Search, Edit2, Trash2, X, ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { SkeletonCard } from '../components/ui/LoadingState'
import GlobalLoader from '../components/ui/GlobalLoader'
import api from '../lib/api'
import styles from './Expenses.module.css'
import { useCategoryEmoji, normalizeCategory } from '../utils/categoryUtils'
import CustomDialog from '../components/ui/CustomDialog'

type InsightTab = 'Total' | 'By Category' | 'Ad hoc Period' | 'None'

const CATEGORY_COLOR: Record<string, string> = {
  'Food & Dining': '#8B6347', 'Shopping': '#6C482D', 'Transport': '#A0785A',
  'Entertainment': '#C49478', 'Bills': '#D4B8A0', 'Health': '#B89070',
  'Housing': '#9E7355', 'Travel': '#7A5840', 'Others': '#E8D5C4', 'Uncategorised': '#A0A0A0'
}

const CATEGORIES = [
  "Food & Dining","Transport","Shopping","Groceries","Entertainment",
  "Travel","Health","Utilities","Telecom","Insurance","Investment",
  "Loan EMI","Credit Card","Refund","Cash Withdrawal",
  "Wallet","Personal Transfer","Personal Care","Household","Services","Uncategorised",
];

const PIE_COLORS = [
  '#8B6347', '#C49478', '#6C482D', '#A0785A',
  '#D4B8A0', '#9E7355', '#B89070', '#E8D5C4'
]

const PM_COLORS: Record<string, string> = {
  UPI: '#8B6347', CARD: '#A0785A', ATM: '#D4B8A0',
  WALLET: '#C49478', NEFT: '#6C482D', IMPS: '#9E7355',
  UNKNOWN: '#E8D5C4',
}

type HeatmapCell = { date: number | null, amount: number }

/* Heatmap — Dynamic grid based on calendar */
function SpendingHeatmap({ data }: { data: HeatmapCell[][] }) {
  const allAmounts = data.flat().map(c => c.amount).filter(Boolean)
  const max = allAmounts.length > 0 ? Math.max(...allAmounts) : 0
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  return (
    <div className={styles.heatmap}>
      <div className={styles.heatmapDays}>
        {days.map((d, i) => <span key={i} className={styles.heatmapDay}>{d}</span>)}
      </div>
      <div className={styles.heatmapGrid} style={{ gridTemplateRows: `repeat(${data.length}, 1fr)` }}>
        {data.map((week, wi) =>
          week.map((cell, di) => {
            if (!cell.date) {
               return <div key={`${wi}-${di}`} className={styles.heatmapCellEmpty} />
            }
            const val = cell.amount
            const intensity = max > 0 ? val / max : 0
            return (
              <div
                key={`${wi}-${di}`}
                className={styles.heatmapCell}
                title={`₹${val.toLocaleString('en-IN')}`}
                style={{
                  background: val === 0
                    ? 'var(--bg-surface-high)'
                    : `rgba(108,72,45,${0.15 + intensity * 0.85})`,
                  color: intensity > 0.5 ? '#FFFFFF' : 'var(--color-muted)'
                }}
              >
                <span className={styles.heatmapDate}>{cell.date}</span>
                {val > 0 && (
                  <span className={styles.heatmapAmount}>
                    {val >= 1000 ? `₹${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k` : `₹${Math.round(val)}`}
                  </span>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

/* Category bar (horizontal) */
function CategoryBar({ label, amount, total, emoji }: { label: string; amount: number; total: number; emoji: string }) {
  const pct = total > 0 ? (amount / total) * 100 : 0
  return (
    <div className={styles.catRow}>
      <div className={styles.catLeft}>
        <span className={styles.catEmoji}>{emoji}</span>
        <div>
          <p className={styles.catName}>{label}</p>
          <div className={styles.catTrack}>
            <div
              className={styles.catFill}
              style={{ width: `${pct}%`, background: CATEGORY_COLOR[label] ?? 'var(--color-primary)' }}
            />
          </div>
        </div>
      </div>
      <p className={styles.catAmt}>₹{amount.toLocaleString('en-IN')}</p>
    </div>
  )
}

import { useInsights } from '../hooks/useInsights'
import EditTransactionModal from '../components/transactions/EditTransactionModal'
import { motion, AnimatePresence } from 'framer-motion'
import { Check } from 'lucide-react'
export default function Expenses() {
  const navigate = useNavigate()
  const { insights } = useInsights()
  const getCategoryEmoji = useCategoryEmoji()
  const [loading, setLoading] = useState(true)
  const [insightTab, setInsightTab] = useState<InsightTab>('Total')
  const [listFilter, setListFilter] = useState<'Month' | 'By Category'>('Month')

  // All transactions fetched (unfiltered)
  const [allTransactions, setAllTransactions] = useState<any[]>([])
  // Month filter — default to CURRENT month; user can switch to earlier months via dropdown
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const saved = sessionStorage.getItem('dekho_selected_month')
    if (saved) return saved
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const [showMonthDropdown, setShowMonthDropdown] = useState(false)

  // ML analytics state
  const [dashboardSummary, setDashboardSummary] = useState<any>(null)
  const [paymentMethods, setPaymentMethods] = useState<any[]>([])
  const [reviewCount, setReviewCount] = useState(0)
  const [monthTotal, setMonthTotal] = useState(0)
  const [trendPct, setTrendPct] = useState(0)
  const [trendDir, setTrendDir] = useState<'up'|'down'>('up')

  // Transaction editing state
  const [editTx, setEditTx] = useState<any>(null)
  const [newCat, setNewCat] = useState("")
  const [isReimbursement, setIsReimbursement] = useState(false)
  const [deleteSuccess, setDeleteSuccess] = useState(false)

  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    onConfirm: () => void
    onCancel?: () => void
    isDestructive?: boolean
  } | null>(null)

  const showDialog = (title: string, message: string, onConfirm: () => void = () => {}, isConfirm = false, onCancel = () => {}, isDestructive = false) => {
    setDialogConfig({
      isOpen: true,
      title,
      message,
      confirmText: isConfirm ? 'Yes, Delete' : 'OK',
      cancelText: isConfirm ? 'Cancel' : undefined,
      onConfirm: () => {
        onConfirm();
        setDialogConfig(null);
      },
      onCancel: () => {
        onCancel();
        setDialogConfig(null);
      },
      isDestructive
    });
  }

  // Dynamic heatmap data
  const [heatmapData, setHeatmapData] = useState<HeatmapCell[][]>([])
  
  // Dynamic outflow history
  const [outflowHistory, setOutflowHistory] = useState<{label: string, total: number, height: number}[]>([])

  const loadData = () => {
    setLoading(true)
    Promise.all([
      // Fetch ALL transactions — no direction filter, large limit to capture both months
      api.get<any>('/api/v1/dashboard/transactions', { limit: 500 }).catch(() => ({ data: [] })),
      // Review queue count
      api.get<any>('/api/v1/dashboard/review/queue').catch(() => []),
    ]).then(([txRes, revData]) => {
      const txList: any[] = txRes?.data || []
      if (Array.isArray(txList)) {
        setAllTransactions(txList)
      }
      if (Array.isArray(revData)) setReviewCount(revData.length)
    }).finally(() => setLoading(false))
  }

  // Initial load
  useEffect(() => { 
    loadData() 
    const handleUpdate = () => loadData()
    window.addEventListener('dekho_data_updated', handleUpdate)
    return () => window.removeEventListener('dekho_data_updated', handleUpdate)
  }, [])

  // ── Derived: all debit transactions for the selected month ─────────────────
  const transactions = allTransactions.filter(tx => {
    const txMonth = tx.date ? String(tx.date).slice(0, 7) : ''
    return txMonth === selectedMonth && tx.direction === 'debit'
  })

  // ── Derived: Transactions list to display based on filter ─────────────────
  let displayTransactions = allTransactions.filter(tx => tx.direction === 'debit');

  if (listFilter === 'Month') {
    displayTransactions = displayTransactions.filter(tx => String(tx.date || '').startsWith(selectedMonth));
    displayTransactions.sort((a, b) => {
      const dateA = new Date(a.date).getTime()
      const dateB = new Date(b.date).getTime()
      if (dateA !== dateB) return dateB - dateA
      const createA = new Date(a.created_at || a.date).getTime()
      const createB = new Date(b.created_at || b.date).getTime()
      return createB - createA
    });
  } else if (listFilter === 'By Category') {
    displayTransactions = displayTransactions.filter(tx => String(tx.date || '').startsWith(selectedMonth));
    displayTransactions.sort((a, b) => (a.category || '').localeCompare(b.category || ''));
  }

  // ── Available months from all transactions (newest first) ──────────────────
  const availableMonths: string[] = Array.from(
    new Set(allTransactions.map(tx => String(tx.date || '').slice(0, 7)).filter(Boolean))
  ).sort((a, b) => b.localeCompare(a))

  const formatMonthLabel = (ym: string) => {
    const [y, m] = ym.split('-')
    return new Date(Number(y), Number(m) - 1, 1)
      .toLocaleString('en-IN', { month: 'long', year: 'numeric' })
  }

  // ── Reactive: recompute everything when month or data changes ──────────────
  useEffect(() => {
    const monthDebits = allTransactions.filter(tx =>
      String(tx.date || '').startsWith(selectedMonth) && tx.direction === 'debit'
    )

    // Total spend
    const total = monthDebits.reduce((s: number, t: any) => s + (t.amount ?? 0), 0)
    setMonthTotal(total)

    // Calculate previous month total
    const [selYear, selMon] = selectedMonth.split('-').map(Number)
    if (selYear && selMon) {
      let prevM = selMon - 1
      let prevY = selYear
      if (prevM === 0) {
        prevM = 12
        prevY -= 1
      }
      const prevMonthStr = `${prevY}-${String(prevM).padStart(2, '0')}`
      const prevMonthDebits = allTransactions.filter(tx =>
        String(tx.date || '').startsWith(prevMonthStr) && tx.direction === 'debit'
      )
      const prevTotal = prevMonthDebits.reduce((s: number, t: any) => s + (t.amount ?? 0), 0)
      
      if (prevTotal > 0) {
        const diff = total - prevTotal
        setTrendPct(Math.round(Math.abs((diff / prevTotal) * 100)))
        setTrendDir(diff >= 0 ? 'up' : 'down')
      } else {
        setTrendPct(0)
        setTrendDir('up')
      }
    }

    sessionStorage.setItem('dekho_selected_month', selectedMonth)

    // Calculate last 6 months history for outflow chart
    if (selYear && selMon) {
      const historyData = []
      const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
      for (let i = 5; i >= 0; i--) {
        let m = selMon - i
        let y = selYear
        if (m <= 0) { m += 12; y -= 1; }
        const monthStr = `${y}-${String(m).padStart(2, '0')}`
        const totalForMonth = allTransactions.filter(tx => String(tx.date || '').startsWith(monthStr) && tx.direction === 'debit').reduce((s, t) => s + (t.amount ?? 0), 0)
        historyData.push({ label: monthNames[m - 1], total: totalForMonth })
      }
      const maxTotal = Math.max(...historyData.map(d => d.total), 1)
      const normalizedHistory = historyData.map(d => ({ ...d, height: (d.total / maxTotal) * 100 }))
      setOutflowHistory(normalizedHistory)
    }

    // Payment methods breakdown
    const pmTotals: Record<string, number> = {}
    monthDebits.forEach((tx: any) => {
      const raw = tx.paymentMode || tx.payment_mode || 'Unknown'
      const upperRaw = raw.toUpperCase()
      const key = upperRaw.includes('UPI')        ? 'UPI'
                : upperRaw.includes('CREDIT')     ? 'Credit Card'
                : upperRaw.includes('DEBIT')      ? 'Debit Card'
                : upperRaw.includes('CARD')       ? 'Card'
                : upperRaw.includes('NEFT')       ? 'NEFT'
                : upperRaw.includes('NETBANKING') || upperRaw.includes('NET BANKING') ? 'Net Banking'
                : upperRaw.includes('AUTOPAY')    ? 'AutoPay'
                : upperRaw.includes('IMPS')       ? 'IMPS'
                : upperRaw.includes('ATM')        ? 'ATM'
                : upperRaw.includes('CASH')       ? 'Cash'
                : 'Other'
      pmTotals[key] = (pmTotals[key] || 0) + (tx.amount || 0)
    })
    setPaymentMethods(
      Object.entries(pmTotals)
        .map(([method, amount]) => ({ method, amount }))
        .sort((a, b) => b.amount - a.amount)
    )

    // Heatmap for selected month
    if (!selYear || !selMon) return
    const firstDayOfMonth = new Date(selYear, selMon - 1, 1).getDay()
    const daysInMonth     = new Date(selYear, selMon, 0).getDate()
    const numWeeks        = Math.ceil((firstDayOfMonth + daysInMonth) / 7)

    const newHeatmap: HeatmapCell[][] = Array.from({ length: numWeeks }, () =>
      Array(7).fill(null).map(() => ({ date: null, amount: 0 }))
    )
    let currentDay = 1
    for (let w = 0; w < numWeeks; w++) {
      for (let d = 0; d < 7; d++) {
        if (w === 0 && d < firstDayOfMonth) {
          newHeatmap[w][d] = { date: null, amount: 0 }
        } else if (currentDay <= daysInMonth) {
          newHeatmap[w][d] = { date: currentDay, amount: 0 }
          currentDay++
        } else {
          newHeatmap[w][d] = { date: null, amount: 0 }
        }
      }
    }
    monthDebits.forEach((tx: any) => {
      const txDate = new Date(tx.date)
      if (txDate.getFullYear() === selYear && txDate.getMonth() === selMon - 1) {
        const dateObj = txDate.getDate()
        const week    = Math.floor((firstDayOfMonth + dateObj - 1) / 7)
        const day     = (firstDayOfMonth + dateObj - 1) % 7
        if (week < numWeeks && day < 7) newHeatmap[week][day].amount += (tx.amount || 0)
      }
    })
    setHeatmapData(newHeatmap)

    // Fetch category summary for this month from backend
    if (allTransactions.length > 0) {
      const fromDate = `${selectedMonth}-01`
      const lastDay  = new Date(selYear, selMon, 0).getDate()
      const toDate   = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`
      api.get<any>('/api/v1/dashboard/transactions/summary', { from_date: fromDate, to_date: toDate })
        .then(sumData => {
          if (!sumData?.category_breakdown) return
          const normalized = sumData.category_breakdown.map((c: any) => ({
            category: c.category,
            amount: c.total ?? c.amount ?? 0,
          }))
          const totalExpense = sumData.total_spend  ?? 0
          setDashboardSummary({
            ...sumData,
            category_breakdown: normalized,
            total_expense: totalExpense,
          })
        })
        .catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, allTransactions])


  const handleCorrect = async () => {
    if (!newCat || !editTx) return
    // Get numeric id (strip leading 't' if present from dashboard format)
    const rawId = String(editTx.id).replace(/^t/, '')
    try {
      await api.post('/api/v1/ml/feedback/correct', {
        transaction_id: parseInt(rawId),
        category: newCat,
        sub_category: 'General',
        is_reimbursement: isReimbursement,
      })
      setEditTx(null)
      loadData()
    } catch {
      showDialog("Error", "Failed to update category")
    }
  }

  const handleDelete = async (id: number | string) => {
    showDialog(
      "Delete Transaction",
      "Are you sure you want to delete this transaction?",
      async () => {
        const rawId = String(id).replace(/^t/, '')
        try {
          await api.delete(`/api/v1/dashboard/transactions/${rawId}`)
          window.dispatchEvent(new Event('dekho_data_updated'))
          setDeleteSuccess(true)
          setTimeout(() => setDeleteSuccess(false), 2000)
        } catch {
          showDialog("Error", "Failed to delete transaction")
        }
      },
      true, // isConfirm
      () => {},
      true // isDestructive
    )
  }

  const pieData = dashboardSummary?.category_breakdown?.slice(0, 8) || []
  const COMMITTED_CATEGORIES = ["Bills", "Subscriptions", "Loan EMI", "Utilities", "Insurance"]
  const committedSpend = transactions.reduce((sum, tx) => {
      if (COMMITTED_CATEGORIES.includes(tx.category)) {
          return sum + (tx.amount || 0)
      }
      return sum
  }, 0)
  
  const subscriptionsAmount = transactions.reduce((sum, tx) => tx.category === "Subscriptions" ? sum + (tx.amount || 0) : sum, 0)
  const emiBillsAmount = transactions.reduce((sum, tx) => ["Loan EMI", "Bills", "Utilities", "Insurance"].includes(tx.category) ? sum + (tx.amount || 0) : sum, 0)
  const subPct = committedSpend > 0 ? (subscriptionsAmount / committedSpend) * 100 : 0
  const emiPct = committedSpend > 0 ? (emiBillsAmount / committedSpend) * 100 : 0

  const topCat = pieData.length > 0 ? pieData[0] : { category: 'None', amount: 0 }
  const topCatPct = monthTotal > 0 ? Math.round((topCat.amount / monthTotal) * 100) : 0

  if (loading && allTransactions.length === 0) return <GlobalLoader />

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <p className={styles.pageTitle}>Expenses</p>
        <div className={styles.headerRight}>
          {/* Working month selector — custom options built from real transaction data */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowMonthDropdown(!showMonthDropdown)}
              className={styles.monthPill}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', border: 'none', background: 'var(--bg-surface-high, #eae5dd)', padding: '6px 12px', borderRadius: '20px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--color-on-surface, #4a4238)', fontWeight: '600' }}
            >
              <span>{formatMonthLabel(selectedMonth)}</span>
              <ChevronDown size={14} />
            </button>
            
            {showMonthDropdown && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 9000 }} onClick={() => setShowMonthDropdown(false)} />
                <div style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: '4px',
                  background: 'var(--bg-base, #f9f6f0)',
                  border: '1px solid var(--color-outline-var, #eae5dd)',
                  borderRadius: '12px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                  zIndex: 9001,
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '6px',
                  minWidth: '140px'
                }}>
                  {availableMonths.length === 0 ? (
                    <button
                      onClick={() => setShowMonthDropdown(false)}
                      style={{
                        padding: '8px 12px',
                        border: 'none',
                        background: 'var(--color-primary, #6b4e71)',
                        color: 'white',
                        borderRadius: '8px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 'bold'
                      }}
                    >
                      {formatMonthLabel(selectedMonth)}
                    </button>
                  ) : (
                    availableMonths.map(ym => (
                      <button
                        key={ym}
                        onClick={() => {
                          setSelectedMonth(ym);
                          setShowMonthDropdown(false);
                        }}
                        style={{
                          padding: '8px 12px',
                          border: 'none',
                          background: ym === selectedMonth ? 'var(--color-primary, #6b4e71)' : 'transparent',
                          color: ym === selectedMonth ? 'white' : 'var(--color-on-surface, #4a4238)',
                          borderRadius: '8px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: ym === selectedMonth ? 'bold' : '500'
                        }}
                      >
                        {formatMonthLabel(ym)}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Total Outflow Card ── */}
      <div className={styles.px}>
        <div className={styles.outflowCard}>
          <div className={styles.outflowHeader}>
            <span className={styles.outflowLabel}>TOTAL OUTFLOW</span>
            {trendPct > 0 && (
              <div className={styles.trendBadge}>
                <span className={styles.trendIcon}>{trendDir === 'up' ? '↗' : '↘'}</span> {trendPct}% {trendDir === 'up' ? 'higher' : 'lower'}
              </div>
            )}
          </div>
          <div className={styles.outflowAmounts}>
            <p className={styles.bigAmount}>₹{monthTotal.toLocaleString('en-IN')}</p>
            <p className={styles.bigAmountSub}>Spent this month</p>
          </div>
          <div className={styles.barChart}>
            {outflowHistory.map((h, i) => (
                <div key={i} className={styles.barCol}>
                  <div
                    className={styles.bar}
                    style={{ height: `${h.height}%`, background: i === 5 ? 'var(--color-primary)' : 'var(--bg-surface-highest)' }}
                    title={`₹${h.total.toLocaleString('en-IN')}`}
                  />
                  <span className={styles.barLabel}>{h.label}</span>
                </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── AI Insight card ── */}
      <div className={styles.px}>
        <div className={styles.aiCard}>
          <div className={styles.aiWatermark}>{getCategoryEmoji(insights?.expenses?.hero_insight?.category_icon || topCat.category)}</div>
          <p className={styles.aiCardLabel}>INSIGHT</p>
          <div className={styles.aiCardContent}>
            <p className={styles.aiCardTitle}>
              {insights?.expenses?.hero_insight?.headline || `${topCat.category} is your highest expense (₹${(topCat.amount || 0).toLocaleString('en-IN')})`}
            </p>
            {insights?.expenses?.hero_insight?.tag ? (
              <div className={styles.aiCardBadgeWrap}>
                <span className={styles.aiCardBadge}>{insights.expenses.hero_insight.tag}</span>
              </div>
            ) : topCatPct > 0 ? (
              <div className={styles.aiCardBadgeWrap}>
                <span className={styles.aiCardBadge}>+{topCatPct}%</span>
              </div>
            ) : null}
          </div>
          
          <p className={styles.aiCardSub}>
            {insights?.expenses?.hero_insight?.lines ? (
              <>
                {insights.expenses.hero_insight.lines.map((l: string, i: number) => (
                  <span key={i} style={{ display: 'block', marginBottom: i === 0 ? 4 : 0 }}>{l}</span>
                ))}
              </>
            ) : (
              `Try reducing ${topCat.category === 'None' ? 'expenses' : topCat.category} to save money this month.`
            )}
          </p>

          {insights?.expenses?.hero_insight?.saving_hint && (
            <div className={styles.aiTarget}>
              <div className={styles.aiTargetHeader}>
                <span>TARGET SAVINGS</span>
                <span>{insights.expenses.hero_insight.saving_hint}</span>
              </div>
              <div className={styles.aiTargetTrack}>
                <div className={styles.aiTargetFill} style={{ width: '25%' }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Insight Tabs + Categories ── */}
      <div className={styles.px}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>Spending Insights</p>
        </div>

        {/* ── New ML Recharts Dashboard Integration ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Pie Chart & Bar Chart (Dekho styling) */}
          <div style={{ display: 'flex', gap: '16px', flexDirection: 'column' }}>
            {/* <div style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: '16px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontFamily: 'var(--font-headline)', fontWeight: 'bold', fontSize: '14px', color: 'var(--color-on-surface)', marginBottom: '8px' }}>Spending by Category</div>
              {pieData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="amount"
                        nameKey="category"
                        cx="50%" cy="50%"
                        outerRadius={80} innerRadius={40}
                      >
                        {pieData.map((_: any, i: number) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: any) => `₹${Number(val).toLocaleString("en-IN")}`}
                        contentStyle={{
                          background: "var(--bg-surface-highest)", border: "none",
                          borderRadius: 8, color: "var(--color-on-surface)", fontFamily: 'var(--font-body)', fontSize: '12px'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {pieData.map((d: any, i: number) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--color-muted)", fontFamily: 'var(--font-body)' }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: PIE_COLORS[i % PIE_COLORS.length], display: "inline-block" }} />
                        {d.category}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ color: 'var(--color-muted)', fontSize: '12px', textAlign: 'center', padding: '20px' }}>No data</div>
              )}
            </div> */}

            <div style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: '16px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontFamily: 'var(--font-headline)', fontWeight: 'bold', fontSize: '14px', color: 'var(--color-on-surface)', marginBottom: '8px' }}>Top Spending Categories</div>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={pieData.slice(0, 6)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline-var)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "var(--color-muted)", fontSize: 10 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="category" tick={{ fill: "var(--color-muted)", fontSize: 10 }} width={80} />
                    <Tooltip
                      formatter={(val: any) => `₹${Number(val).toLocaleString("en-IN")}`}
                      contentStyle={{ background: "var(--bg-surface-highest)", border: "none", borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: '12px' }}
                    />
                    <Bar dataKey="amount" fill="var(--color-primary)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ color: 'var(--color-muted)', fontSize: '12px', textAlign: 'center', padding: '20px' }}>No data</div>
              )}
            </div>
          </div>

          {/* Payment Method & Monthly Health */}
          <div style={{ display: 'flex', gap: '16px', flexDirection: 'column' }}>
            <div style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: '16px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontFamily: 'var(--font-headline)', fontWeight: 'bold', fontSize: '14px', color: 'var(--color-on-surface)', marginBottom: '16px' }}>💳 Spending by Payment Method</div>
              {paymentMethods.length > 0 ? (
                paymentMethods.map((m, i) => {
                  const max = paymentMethods[0]?.amount || 1;
                  const color = "var(--color-primary)";
                  return (
                    <div key={i} style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5, fontFamily: 'var(--font-body)' }}>
                        <span style={{ color: "var(--color-muted)", fontWeight: 500 }}>{m.method}</span>
                        <span style={{ color, fontWeight: 700 }}>₹{Number(m.amount).toLocaleString("en-IN")}</span>
                      </div>
                      <div style={{ height: 6, background: "var(--bg-surface-high)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 3, background: color, width: `${(m.amount / max) * 100}%`, transition: "width 0.6s ease" }} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ color: 'var(--color-muted)', fontSize: '12px', textAlign: 'center', padding: '20px' }}>No payment data yet</div>
              )}
            </div>


          </div>
        </div>
      </div>

      {/* ── Committed Spend & Review Cards ── */}
      <div className={styles.px}>
        <div className={styles.committedCardsContainer}>



        </div>
      </div>


      {/* ── Heatmap ── */}
      <div className={styles.px}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>Spending Pattern</p>
          <p className={styles.heatmapSub}></p>
        </div>
        <div className={styles.heatmapCard}>
          <SpendingHeatmap data={heatmapData} />
          <p className={styles.heatmapLegend}>↳ Darker = higher spend</p>
        </div>
      </div>

      {/* ── Transactions ── */}
      <div className={styles.px}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>Transactions</p>
          <button className={styles.seeAll} onClick={() => navigate('/transactions')}>See All</button>
        </div>
        
        {/* Transaction Filters */}
        <div className={styles.scrollRow}>
          {['Month', 'By Category'].map(f => (
            <button 
              key={f}
              className={`${styles.filterPill} ${listFilter === f ? styles.filterPillActive : ''}`}
              onClick={() => setListFilter(f as any)}
            >
              {f}
            </button>
          ))}
        </div>

        <div className={styles.txList}>
          {displayTransactions.map((tx: any) => (
            <div key={tx.id} className={styles.txRow}>
              <div className={styles.txIcon}>
                {getCategoryEmoji(tx.category)}
              </div>
              <div className={styles.txInfo}>
                <p className={styles.txMerchant}>{tx.merchant}</p>
                <p className={styles.txMeta}>
                  {tx.category} • {typeof tx.date === 'string' && !tx.date.includes('-')
                    ? tx.date
                    : new Date(tx.date || tx.tx_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  {' • '}<span style={{background: 'var(--bg-surface-highest)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px'}}>{tx.paymentMode || tx.payment_mode || tx.payment_method || 'UPI'}</span>
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <span className={tx.direction === "credit" ? styles.amountCredit : styles.txAmt}>
                  {tx.direction === "credit" ? "+" : "−"}₹{(tx.amount || 0).toLocaleString('en-IN')}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={() => { setEditTx(tx); setNewCat(tx.category); setIsReimbursement(tx.tags?.includes("reimbursement") || false) }}
                    style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', padding: '2px' }}
                  >
                    <Edit2 size={14} />
                  </button>
                  <button 
                    onClick={() => handleDelete(tx.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--color-negative)', cursor: 'pointer', padding: '2px' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit Modal */}
      {editTx && (
        <EditTransactionModal 
          tx={editTx} 
          onClose={() => {
            setEditTx(null);
            loadData();
          }} 
        />
      )}

      {/* Delete Success Modal */}
      <AnimatePresence>
        {deleteSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              style={{
                background: 'var(--bg-surface)', padding: '32px', borderRadius: '24px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px'
              }}
            >
              <div style={{
                width: '64px', height: '64px', borderRadius: '32px', background: 'var(--color-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Check size={32} color="white" />
              </div>
              <p style={{ margin: 0, fontFamily: 'var(--font-headline)', fontWeight: 'bold', fontSize: '18px', color: 'var(--color-on-surface)' }}>
                Transaction Deleted
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {dialogConfig && <CustomDialog {...dialogConfig} />}
    </div>
  )
}
