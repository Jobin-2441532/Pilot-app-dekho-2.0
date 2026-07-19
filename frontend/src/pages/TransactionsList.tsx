import { useState, useEffect } from 'react'
import { ArrowLeft, Edit2, Trash2, X, Search, Filter, ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { SkeletonCard } from '../components/ui/LoadingState'
import GlobalLoader from '../components/ui/GlobalLoader'
import { useInsights } from '../hooks/useInsights'
import styles from './Expenses.module.css'
import { useCategoryEmoji } from '../utils/categoryUtils'
import EditTransactionModal from '../components/transactions/EditTransactionModal'
import { motion, AnimatePresence } from 'framer-motion'
import { Check } from 'lucide-react'
import api from '../lib/api'
import CustomDialog from '../components/ui/CustomDialog'

const API = ''


const CATEGORIES = [
  "Food & Dining","Transport","Shopping","Groceries","Entertainment",
  "Travel","Health","Utilities","Telecom","Insurance","Investment",
  "Loan EMI","Credit Card","Refund","Cash Withdrawal",
  "Wallet","Personal Transfer","Personal Care","Household","Services","Uncategorised",
];

export default function TransactionsList() {
  const navigate = useNavigate()
  const { insights } = useInsights()
  const getCategoryEmoji = useCategoryEmoji()
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState<any[]>([])
  const [filterMode, setFilterMode] = useState<"All" | "Credit" | "Debit" | "UPI" | "Card">("All")
  const [sortMode, setSortMode] = useState<"Newest" | "Oldest" | "High to Low" | "Low to High">("Newest")
  
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const limit = 30
  const [showSortDropdown, setShowSortDropdown] = useState(false)

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
    const handleUpdate = () => {
      setPage(1)
      loadData(1)
    }
    window.addEventListener('dekho_data_updated', handleUpdate)
    return () => window.removeEventListener('dekho_data_updated', handleUpdate)
  }, [])

  const handleCorrect = async () => {
    // legacy AI teach button - removed in full edit
  }

  const handleDelete = async (id: number) => {
    showDialog(
      "Delete Transaction",
      "Are you sure you want to delete this transaction?",
      async () => {
        try {
          await api.delete(`/api/v1/dashboard/transactions/${id}`)
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

  if (loading && page === 1) return <GlobalLoader />

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
          <div className={styles.scrollRow} style={{ padding: '16px 16px 8px' }}>
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
          
          <div style={{ padding: '0 16px 12px', display: 'flex', justifyContent: 'flex-end', position: 'relative' }}>
            <button
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '16px',
                border: '1px solid var(--color-outline-var, #eae5dd)',
                background: 'var(--bg-surface-high, #eae5dd)',
                color: 'var(--color-on-surface, #4a4238)',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              <span>
                {sortMode === 'Newest' && 'Newest First'}
                {sortMode === 'Oldest' && 'Oldest First'}
                {sortMode === 'High to Low' && 'Amount: High to Low'}
                {sortMode === 'Low to High' && 'Amount: Low to High'}
              </span>
              <ChevronDown size={12} />
            </button>
            
            {showSortDropdown && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 9000 }} onClick={() => setShowSortDropdown(false)} />
                <div style={{
                  position: 'absolute',
                  right: '16px',
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
                  minWidth: '160px'
                }}>
                  {[
                    { value: 'Newest', label: 'Newest First' },
                    { value: 'Oldest', label: 'Oldest First' },
                    { value: 'High to Low', label: 'Amount: High to Low' },
                    { value: 'Low to High', label: 'Amount: Low to High' }
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setSortMode(opt.value as any);
                        setShowSortDropdown(false);
                      }}
                      style={{
                        padding: '8px 12px',
                        border: 'none',
                        background: opt.value === sortMode ? 'var(--color-primary, #6b4e71)' : 'transparent',
                        color: opt.value === sortMode ? 'white' : 'var(--color-on-surface, #4a4238)',
                        borderRadius: '8px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: opt.value === sortMode ? 'bold' : '500'
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {transactions.filter(tx => {
            if (filterMode === "All") return true;
            
            const direction = (tx.direction || tx.type || "").toLowerCase()
            if (filterMode === "Credit") return direction === "credit";
            if (filterMode === "Debit") return direction === "debit";
            
            const pm = (tx.paymentMode || tx.payment_mode || tx.payment_method || "").toLowerCase()
            if (filterMode === "UPI") return pm.includes("upi");
            if (filterMode === "Card") return pm.includes("card") || pm.includes("credit") || pm.includes("debit");
            
            return true;
          }).sort((a, b) => {
            if (sortMode === "Newest") {
              const diff = new Date(b.date || b.tx_date).getTime() - new Date(a.date || a.tx_date).getTime();
              if (diff !== 0) return diff;
              return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
            }
            if (sortMode === "Oldest") {
              const diff = new Date(a.date || a.tx_date).getTime() - new Date(b.date || b.tx_date).getTime();
              if (diff !== 0) return diff;
              return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
            }
            if (sortMode === "High to Low") {
              return (b.amount || 0) - (a.amount || 0);
            }
            if (sortMode === "Low to High") {
              return (a.amount || 0) - (b.amount || 0);
            }
            return 0;
          }).map((tx: any) => (
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
        <EditTransactionModal 
          tx={editTx} 
          onClose={() => {
            setEditTx(null);
            setPage(1);
            loadData(1);
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
