import { useState, useMemo, useEffect } from 'react'
import { X, Check, Calculator, Wallet, Tag, FileText, Calendar, Clock, Delete } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../../lib/api'
import { useCategoryEmoji } from '../../utils/categoryUtils'
import styles from './AddTransactionFAB.module.css'

interface EditTransactionModalProps {
  tx: any;
  onClose: () => void;
}

export default function EditTransactionModal({ tx, onClose }: EditTransactionModalProps) {
  // Form State
  const [amountStr, setAmountStr] = useState(String(tx.amount || '0'))
  const [account, setAccount] = useState(tx.paymentMode || tx.payment_mode || tx.payment_method || 'Select Account')
  const [category, setCategory] = useState(tx.category || 'Select Category')
  const [notes, setNotes] = useState(tx.notes || tx.merchant || '')
  
  const [date, setDate] = useState(() => {
    try {
      if (tx.date) {
        if (tx.date.includes('-')) return tx.date.split('T')[0];
        const d = new Date(tx.date);
        return d.toISOString().split('T')[0];
      }
    } catch {}
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })
  
  const [time, setTime] = useState(() => {
    try {
      if (tx.created_at) {
        const d = new Date(tx.created_at);
        return d.toTimeString().slice(0, 5);
      }
    } catch {}
    const now = new Date();
    return now.toTimeString().slice(0, 5);
  })
  
  const [budgets, setBudgets] = useState<any[]>([])
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'saving' | 'success'>('idle')
  const getCategoryEmoji = useCategoryEmoji()
  
  useEffect(() => {
    api.get<any[]>('/api/v1/dashboard/budgets')
      .then(res => setBudgets(res))
      .catch(() => setBudgets([]))
  }, [])

  const handleNumpad = (val: string) => {
    if (val === 'DEL') {
      setAmountStr(prev => prev.length > 1 ? prev.slice(0, -1) : '0')
      return
    }
    if (val === '=') {
      try {
        const sanitized = amountStr.replace(/x/g, '*').replace(/[^0-9+\-*/.]/g, '')
        // eslint-disable-next-line no-new-func
        const result = new Function('return ' + sanitized)()
        setAmountStr(String(Number(result.toFixed(2))))
      } catch (e) {
        // ignore
      }
      return
    }
    setAmountStr(prev => {
      if (prev === '0' && val !== '.') return val
      return prev + val
    })
  }

  const handleSubmit = async () => {
    let finalAmount = 0
    try {
      const sanitized = amountStr.replace(/x/g, '*').replace(/[^0-9+\-*/.]/g, '')
      // eslint-disable-next-line no-new-func
      finalAmount = Number(new Function('return ' + sanitized)())
    } catch {
      finalAmount = parseFloat(amountStr) || 0
    }

    if (finalAmount <= 0) {
      alert("Please enter a valid amount")
      return
    }
    
    setSubmitStatus('saving')
    try {
      const paymentMode = account === 'Select Account' ? 'Cash' : account
      const finalCat = category === 'Select Category' ? 'Others' : category
      await api.put(`/api/v1/dashboard/transactions/${tx.id}`, {
        amount: finalAmount,
        merchant: notes || finalCat,
        category: finalCat,
        date: date,
        notes: notes,
        direction: tx.type || 'debit',
        payment_mode: paymentMode,
        source_type: tx.source_type || 'Manual'
      })
      
      setSubmitStatus('success')
      window.dispatchEvent(new Event('dekho_data_updated'))
      
      setTimeout(() => {
        setSubmitStatus('idle')
        onClose()
      }, 1500)

    } catch (err) {
      console.error('Failed to update transaction', err)
      alert('Failed to update expense.')
      setSubmitStatus('idle')
    }
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      
      <motion.div 
        className={styles.modalFull}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
        style={{ position: 'relative', width: '100%', maxWidth: '450px', height: '90vh', background: 'var(--bg-base)', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        {submitStatus !== 'idle' && (
          <div style={{ position: 'absolute', inset: 0, background: 'var(--bg-surface)', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {submitStatus === 'saving' ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-on-surface)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                </motion.div>
                <p style={{ marginTop: '16px', fontWeight: 'bold', color: 'var(--color-on-surface)' }}>Updating expense...</p>
              </>
            ) : (
              <>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Check size={32} color="white" />
                  </div>
                </motion.div>
                <p style={{ marginTop: '16px', fontWeight: 'bold', color: 'var(--color-on-surface)' }}>Successfully updated!</p>
              </>
            )}
          </div>
        )}

        <div className={styles.headerRow}>
          <button onClick={onClose} className={styles.iconBtn}>
            <X size={24} color="var(--color-on-surface)" />
          </button>
          <h2 className={styles.title}>Edit Expense</h2>
          <button onClick={handleSubmit} className={styles.iconBtn} disabled={submitStatus !== 'idle'}>
            <Check size={24} color="var(--color-on-surface)" />
          </button>
        </div>

        <div className={styles.contentScroll}>
          <div className={styles.amountCard}>
            <p className={styles.amountLabel}>AMOUNT</p>
            <div className={styles.amountRow}>
              <div className={styles.amountValue}>₹{amountStr}</div>
              <div className={styles.calcIconWrap}>
                <Calculator size={20} color="var(--color-muted)" />
              </div>
            </div>
          </div>

          <div className={styles.selectorsRow}>
            <label className={styles.selectCard}>
              <Wallet size={20} className={styles.selectIcon} fill="var(--color-muted)" stroke="var(--bg-surface)" />
              <div className={styles.selectInfo}>
                <p>Account</p>
                <span>{account}</span>
              </div>
              <select className={styles.hiddenSelect} value={account} onChange={e => setAccount(e.target.value)}>
                <option value="Select Account" disabled>Select Account</option>
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Debit Card">Debit Card</option>
                <option value="Net Banking">Net Banking</option>
              </select>
            </label>
            
            <label className={styles.selectCard}>
              <Tag size={20} className={styles.selectIcon} fill="var(--color-muted)" stroke="var(--bg-surface)" />
              <div className={styles.selectInfo}>
                <p>Category</p>
                <span>{category}</span>
              </div>
              <select className={styles.hiddenSelect} value={category} onChange={e => setCategory(e.target.value)}>
                <option value="Select Category" disabled>Select Category</option>
                {budgets.map(section => (
                  <optgroup key={section.label} label={section.label}>
                    {section.subcategories?.map((sub: any) => (
                      <option key={sub.label} value={sub.label}>{sub.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.footerRow}>
            <div className={styles.footerItemNative}>
              <Calendar size={18} color="var(--color-muted)" />
              <div className={styles.footerInfoNative}>
                <span>Date</span>
                <input type="date" className={styles.visibleInput} value={date} onChange={e => setDate(e.target.value)} />
              </div>
            </div>
            <div className={styles.footerDivider} />
            <div className={styles.footerItemNative}>
              <Clock size={18} color="var(--color-muted)" />
              <div className={styles.footerInfoNative}>
                <span>Time</span>
                <input type="time" className={styles.visibleInput} value={time} onChange={e => setTime(e.target.value)} />
              </div>
            </div>
          </div>

          <div className={styles.notesCard}>
            <div className={styles.notesHeader}>
              <FileText size={18} color="var(--color-muted)" />
              <span>Notes (optional)</span>
            </div>
            <textarea 
              className={styles.notesArea}
              placeholder="Add notes..."
              value={notes}
              onChange={e => setNotes(e.target.value.slice(0, 250))}
            />
            <div className={styles.notesCount}>{notes.length}/250</div>
          </div>

          <div className={styles.numpadGrid}>
            {['7','8','9','+','4','5','6','-','1','2','3','x','0','.'].map(btn => (
              <button 
                key={btn} 
                className={`${styles.numBtn} ${['+','-','x'].includes(btn) ? styles.numBtnOp : ''}`}
                onClick={() => handleNumpad(btn)}
              >
                {btn}
              </button>
            ))}
            <button className={styles.numBtn} onClick={() => handleNumpad('DEL')}>
              <Delete size={20} />
            </button>
            <button className={styles.numBtnEquals} onClick={() => handleNumpad('=')}>
              =
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
