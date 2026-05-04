import { useState, useEffect } from 'react'
import { ArrowLeft, Edit2, Trash2, X, Search, Filter } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { SkeletonCard } from '../components/ui/LoadingState'
import { useInsights } from '../hooks/useInsights'
import styles from './Expenses.module.css'

const API = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8000`

const CATEGORY_EMOJI: Record<string, string> = {
  'Food & Dining': '🍴', 'Shopping': '🛍️', 'Transport': '🚗',
  'Entertainment': '🎬', 'Bills': '⚡', 'Health': '💊',
  'Housing': '🏠', 'Travel': '✈️', 'Others': '💰', 'Uncategorised': '❓'
}

const CATEGORIES = [
  "Food & Dining","Transport","Shopping","Groceries","Entertainment",
  "Travel","Health","Utilities","Telecom","Insurance","Investment",
  "Loan EMI","Credit Card","Income","Refund","Cash Withdrawal",
  "Wallet","Personal Transfer","Personal Care","Household","Services","Uncategorised",
];

export default function TransactionsList() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState<any[]>([])
  const [filterMode, setFilterMode] = useState<"All" | "Credit" | "Debit" | "UPI" | "Card">("All")
  
  const { insights } = useInsights()
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const limit = 30

  // Transaction editing state
  const [editTx, setEditTx] = useState<any>(null)
  const [newCat, setNewCat] = useState("")
  const [isReimbursement, setIsReimbursement] = useState(false)

  const loadData = async (pageNum: number) => {
    const userId = localStorage.getItem('dekho_user_id') || 1
    try {
      const res = await fetch(`${API}/api/v1/dashboard/transactions?limit=${limit}&offset=${(pageNum - 1) * limit}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('dekho_token')}` }
      })
      if (res.ok) {
        const data = await res.json()
        const txList = data.data || data.transactions || (Array.isArray(data) ? data : [])
        
        if (pageNum === 1) {
          setTransactions(txList)
        } else {
          setTransactions(prev => [...prev, ...txList])
        }
        
        if (txList.length < limit) {
          setHasMore(false)
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData(1)
  }, [])

  const handleCorrect = async () => {
    if (!newCat || !editTx) return
    const userId = localStorage.getItem('dekho_user_id') || 1
    try {
      await fetch(`${API}/ml/api/feedback/correct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          transaction_id: editTx.id,
          category: newCat,
          sub_category: "General",
          is_reimbursement: isReimbursement
        })
      })
      setEditTx(null)
      setPage(1)
      loadData(1)
    } catch {
      alert("Failed to update category")
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm("Delete this transaction?")) return
    const userId = localStorage.getItem('dekho_user_id') || 1
    try {
      await fetch(`${API}/ml/api/transactions/${id}?user_id=${userId}`, {
        method: 'DELETE'
      })
      setPage(1)
      loadData(1)
    } catch {
      alert("Failed to delete")
    }
  }

  if (loading && page === 1) return (
    <div style={{ padding: 'var(--space-5)' }}>
      <SkeletonCard />
      <div style={{ height: 'var(--space-4)' }} />
      <SkeletonCard />
    </div>
  )

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className={styles.iconBtn} onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <p className={styles.pageTitle}>All Transactions</p>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.iconBtn} aria-label="Search"><Search size={16} /></button>
          <button className={styles.iconBtn} aria-label="Filter"><Filter size={16} /></button>
        </div>
      </div>

      <div className={styles.px}>
        {insights?.expenses.hero_insight && (
          <div className={styles.insightCard}>
            <div className={styles.insightWatermark}>✨</div>
            <p className={styles.insightLabel}>SMART INSIGHT</p>
            <p className={styles.insightHeadline}>{insights.expenses.hero_insight.headline}</p>
            {insights.expenses.hero_insight.lines?.[0] && (
              <p className={styles.insightSubtext}>{insights.expenses.hero_insight.lines[0]}</p>
            )}
          </div>
        )}

        {insights?.expenses.pattern_caption && (
          <p className={styles.patternCaption}>{insights.expenses.pattern_caption}</p>
        )}

        {insights?.expenses.subscription_audit && (
          <div className={styles.auditCard}>
            <div className={styles.auditIcon}>🔍</div>
            <div className={styles.auditContent}>
              <p className={styles.auditTitle}>Subscription Audit</p>
              <p className={styles.auditText}>
                {typeof insights.expenses.subscription_audit === 'string'
                  ? insights.expenses.subscription_audit
                  : (insights.expenses.subscription_audit as any).headline}
              </p>
            </div>
          </div>
        )}

        <div className={styles.txList} style={{ marginTop: '16px' }}>
          <div className={styles.scrollRow} style={{ padding: '16px 16px 0' }}>
            {["All", "Credit", "Debit", "UPI", "Card"].map((f) => (
              <button
                key={f}
                className={`${styles.filterPill} ${filterMode === f ? styles.filterPillActive : ''}`}
                onClick={() => setFilterMode(f as any)}
              >
                {f}
              </button>
            ))}
          </div>

          {transactions.filter(tx => {
            if (filterMode === "All") return true;
            if (filterMode === "Credit") return (tx.type || "").toLowerCase() === "credit";
            if (filterMode === "Debit") return (tx.type || "").toLowerCase() === "debit";
            if (filterMode === "UPI") return (tx.payment_method || "").toLowerCase().includes("upi");
            if (filterMode === "Card") return (tx.payment_method || "").toLowerCase().includes("card");
            return true;
          }).map((tx: any) => (
            <div key={tx.id} className={styles.txRow}>
              <div className={styles.txIcon}>
                {CATEGORY_EMOJI[tx.category] ?? '💰'}
              </div>
              <div className={styles.txInfo}>
                <p className={styles.txMerchant}>{tx.merchant}</p>
                <p className={styles.txMeta}>
                  {tx.category} • {typeof tx.date === 'string' && !tx.date.includes('-')
                    ? tx.date
                    : new Date(tx.date || tx.tx_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  {' • '}<span style={{background: 'var(--bg-surface-highest)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px'}}>{tx.payment_method || 'UPI'}</span>
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <span className={tx.type === "credit" ? styles.amountCredit : styles.txAmt}>
                  {tx.type === "credit" ? "+" : "−"}₹{(tx.amount || 0).toLocaleString('en-IN')}
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
          {hasMore && (
            <button 
              onClick={() => { setPage(p => p + 1); loadData(page + 1); }}
              style={{ width: '100%', padding: '12px', background: 'var(--bg-surface-high)', border: 'none', borderRadius: '8px', color: 'var(--color-primary)', fontWeight: 'bold', cursor: 'pointer', marginTop: '16px' }}
            >
              {loading ? 'Loading...' : 'Load More'}
            </button>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editTx && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '20px'
        }} onClick={() => setEditTx(null)}>
          <div style={{
            background: 'var(--bg-surface)', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '400px',
            display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative'
          }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setEditTx(null)} style={{ position: 'absolute', right: '16px', top: '16px', background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={20} color="var(--color-muted)" />
            </button>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>Edit Category</h3>
            
            <div style={{ color: 'var(--color-muted)', fontSize: '14px', fontFamily: 'var(--font-body)' }}>
              <div style={{ fontWeight: 'bold', color: 'var(--color-on-surface)' }}>{editTx.merchant}</div>
              ₹{(editTx.amount || 0).toLocaleString('en-IN')} • Current: {editTx.category}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-muted)', textTransform: 'uppercase' }}>New Category</label>
              <select 
                value={newCat} 
                onChange={e => setNewCat(e.target.value)}
                style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--color-outline)', background: 'var(--bg-surface)', color: 'var(--color-on-surface)' }}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {editTx.type === "credit" && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" id="reimb" checked={isReimbursement} onChange={e => setIsReimbursement(e.target.checked)} />
                <label htmlFor="reimb" style={{ fontSize: '14px', color: 'var(--color-on-surface)', cursor: 'pointer' }}>Reimbursement for earlier spending</label>
              </div>
            )}

            <button 
              onClick={handleCorrect}
              style={{ background: 'var(--color-primary)', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', marginTop: '8px' }}
            >
              Save & Learn
            </button>
            <div style={{ fontSize: '11px', color: 'var(--color-muted)', textAlign: 'center' }}>
              💡 This will teach the AI to auto-categorise this merchant in future.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
