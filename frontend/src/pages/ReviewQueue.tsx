import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import styles from './ReviewQueue.module.css'

const CATEGORIES = [
  "Food & Dining", "Transport", "Shopping", "Groceries", "Entertainment",
  "Travel", "Health", "Utilities", "Telecom", "Insurance", "Investment",
  "Loan EMI", "Credit Card", "Income", "Refund", "Cash Withdrawal",
  "Services", "Uncategorised",
];
import { useCategoryEmoji } from '../utils/categoryUtils'

export default function ReviewQueue() {
  const navigate = useNavigate()
  const getCategoryEmoji = useCategoryEmoji()
  const [txs, setTxs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selections, setSelections] = useState<Record<number, string>>({})
  const [reimbursements, setReimbursements] = useState<Record<number, boolean>>({})

  const load = () => {
    setLoading(true)
    // JWT-scoped — no user_id needed in the URL
    api.get<any[]>('/api/v1/dashboard/review/queue')
      .then(items => {
        if (!Array.isArray(items)) { setTxs([]); return }
        setTxs(items)
        const sel: Record<number, string> = {}
        const reimbs: Record<number, boolean> = {}
        items.forEach((tx: any) => {
          sel[tx.id] = tx.category || 'Uncategorised'
          reimbs[tx.id] = false
        })
        setSelections(sel)
        setReimbursements(reimbs)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleApprove = async (tx: any) => {
    try {
      // Send correction to ML learning loop via our proxy
      await api.post('/api/v1/ml/feedback/correct', {
        transaction_id: tx.id,
        category: selections[tx.id],
        sub_category: 'General',
        is_reimbursement: !!reimbursements[tx.id],
      })
      setTxs(prev => prev.filter(t => t.id !== tx.id))
    } catch {
      alert('Failed to approve')
    }
  }

  // Family tag — optimistic UI update (persisted next time ML enriches the transaction)
  const handleFamilyTag = (tx: any) => {
    setTxs(prev => prev.map(t =>
      t.id === tx.id ? { ...t, is_family_expense: !t.is_family_expense } : t
    ))
  }

  const conf = (tx: any) => Math.round((tx.confidence || 0) * 100)

  return (
    <div className={styles.page}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <ArrowLeft size={24} color="var(--color-on-surface)" />
        </button>
        <h1 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--color-on-surface)', margin: 0 }}>Review Queue</h1>
      </div>

      <div className={styles.banner}>
        <AlertCircle size={22} className={styles.bannerIcon} />
        <div className={styles.bannerContent}>
          <div className={styles.bannerTitle}>
            {txs.length} transaction{txs.length !== 1 ? "s" : ""} need review
          </div>
          <div className={styles.bannerSub}>
            Auto-classified with low confidence. Your input teaches the AI.
          </div>
        </div>
        <button className={styles.refreshBtn} onClick={load}>Refresh</button>
      </div>

      {loading ? (
        <div className={styles.loading}>⏳ Loading review queue...</div>
      ) : txs.length === 0 ? (
        <div className={styles.emptyState}>
          <CheckCircle2 size={44} color="var(--color-primary)" style={{ margin: "0 auto", display: "block" }} />
          <p className={styles.emptyTitle}>All caught up!</p>
          <p className={styles.emptySub}>No transactions need review right now.</p>
        </div>
      ) : (
        <div className={styles.cardList}>
          {txs.map((tx) => {
            const c = conf(tx)
            const isHighConf = c >= 65

            return (
              <div key={tx.id} className={styles.card}>
                <div className={styles.cardLeft}>
                  <div className={styles.titleRow}>
                    <span className={styles.merchant}>{tx.merchant || tx.vpa || "Unknown Merchant"}</span>
                    <span className={tx.direction === "credit" ? styles.amountCredit : styles.amountDebit}>
                      {tx.direction === "credit" ? "+" : "−"}₹{(tx.amount || 0).toLocaleString("en-IN")}
                    </span>
                    {tx.is_family_expense && (
                      <span className={styles.familyBadge}>👨‍👩‍👧 Family</span>
                    )}
                  </div>

                  <div className={styles.meta}>
                    {tx.date
                      ? new Date(tx.date).toLocaleDateString("en-IN", {
                          day: "numeric", month: "short", year: "numeric",
                        })
                      : "—"}
                    {" · "}
                    {tx.paymentMode || tx.payment_mode || "Unknown method"}
                    {tx.vpa && ` · ${tx.vpa}`}
                  </div>

                  <div className={styles.aiSuggestion}>
                    <span className={styles.aiLabel}>AI suggested:</span>
                    <span className={styles.tag}>{getCategoryEmoji(tx.category)} {tx.category}</span>
                    <span className={isHighConf ? styles.confidenceHigh : styles.confidenceLow}>
                      {c}% confident
                    </span>
                  </div>

                  {tx.explanation && (
                    <div className={styles.explanation}>💡 "{tx.explanation}"</div>
                  )}

                  {tx.raw_sms && (
                    <div className={styles.rawSms}>💬 {tx.raw_sms}</div>
                  )}

                  <div className={styles.tagList}>
                    {(tx.tags || []).map((tag: string) => (
                      <span key={tag} className={styles.tag}>{tag}</span>
                    ))}
                  </div>
                </div>

                <div className={styles.cardRight}>
                  {tx.direction === "credit" && (
                    <div className={styles.checkboxRow}>
                      <input
                        type="checkbox"
                        id={`reimb-${tx.id}`}
                        checked={reimbursements[tx.id] || false}
                        onChange={(e) =>
                          setReimbursements((s) => ({ ...s, [tx.id]: e.target.checked }))
                        }
                      />
                      <label htmlFor={`reimb-${tx.id}`} className={styles.checkboxLabel}>
                        Reimbursement
                      </label>
                    </div>
                  )}

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Correct Category</label>
                    <select
                      className={styles.select}
                      value={selections[tx.id] || "Uncategorised"}
                      onChange={(e) =>
                        setSelections((s) => ({ ...s, [tx.id]: e.target.value }))
                      }
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <button className={styles.btnPrimary} onClick={() => handleApprove(tx)}>
                    <CheckCircle2 size={16} /> Confirm & Learn
                  </button>

                  <button
                    className={`${styles.btnSecondary} ${tx.is_family_expense ? styles.btnSecondaryActive : ''}`}
                    onClick={() => handleFamilyTag(tx)}
                  >
                    {tx.is_family_expense ? "✅ Family Expense" : "👨‍👩‍👧 Tag as Family"}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
