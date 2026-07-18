import { useState, useMemo, useEffect } from 'react'
import { Plus, X, Check, Calculator, Wallet, Tag, FileText, Calendar, Clock, Delete, Utensils, Car, ShoppingBag, ReceiptText, ChevronDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../../lib/api'
import { useCategoryEmoji } from '../../utils/categoryUtils'
import styles from './AddTransactionFAB.module.css'

export default function AddTransactionFAB() {
  const [isOpen, setIsOpen] = useState(false)
  
  // Form State
  const [amountStr, setAmountStr] = useState('0')
  const [account, setAccount] = useState('Select Account')
  const [category, setCategory] = useState('Select Category')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })
  const [time, setTime] = useState(() => {
    const now = new Date();
    return now.toTimeString().slice(0, 5); // HH:MM
  })
  
  // Dynamic categories state
  const [budgets, setBudgets] = useState<any[]>([])
  const [isAddingCustomCategory, setIsAddingCustomCategory] = useState(false)
  const [newCustomCategoryName, setNewCustomCategoryName] = useState('')
  const [newCustomCategorySection, setNewCustomCategorySection] = useState('Essentials')
  
  // Fetch budgets when modal opens
  useEffect(() => {
    if (isOpen) {
      api.get<any[]>('/api/v1/dashboard/budgets')
        .then(res => setBudgets(res))
        .catch(() => setBudgets([]))
    }
  }, [isOpen])
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

  const [isNotesOpen, setIsNotesOpen] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'saving' | 'success'>('idle')

  const getCategoryEmoji = useCategoryEmoji()

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
      await api.post('/api/v1/dashboard/transactions', {
        amount: finalAmount,
        merchant: notes || finalCat,
        category: finalCat,
        date: date,
        notes: notes,
        direction: 'debit',
        payment_mode: paymentMode,
        source_type: 'Manual'
      })
      
      if (!localStorage.getItem('ph_first_transaction_logged')) {
        import('posthog-js').then((ph) => {
          ph.default.capture('first_transaction_logged', { platform: 'web' });
          localStorage.setItem('ph_first_transaction_logged', 'true');
        });
      }

      setSubmitStatus('success')
      window.dispatchEvent(new Event('dekho_data_updated'))
      
      setTimeout(() => {
        setIsOpen(false)
        setAmountStr('0')
        setNotes('')
        setCategory('Select Category')
        setAccount('Select Account')
        setSubmitStatus('idle')
        // window.location.reload() // Removed this hard reload to make it smoother
      }, 1500) // Show success for 1.5 seconds

    } catch (err) {
      console.error('Failed to add transaction', err)
      alert('Failed to add expense.')
      setSubmitStatus('idle')
    }
  }

  const QUICK_CATS = [
    { label: 'Food & Dining', category: 'Food & Dining' },
    { label: 'Transport', category: 'Transport' },
    { label: 'Shopping', category: 'Shopping' },
    { label: 'Bills', category: 'Bills' },
  ]

  const formattedDate = useMemo(() => {
    const d = new Date(date)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }, [date])
  
  const formattedTime = useMemo(() => {
    const [h, m] = time.split(':')
    const d = new Date()
    d.setHours(Number(h) || 0, Number(m) || 0)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }, [time])

  return (
    <>
      <div className={styles.wrapper}>
        <motion.button
          className={`${styles.fab} ${isOpen ? styles.open : ''}`}
          onClick={() => setIsOpen(true)}
          aria-label="Add offline transaction"
          whileTap={{ scale: 0.92 }}
        >
          <Plus size={22} strokeWidth={2} />
        </motion.button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            className={styles.modalFull}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
          >
            {submitStatus !== 'idle' && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(249, 246, 240, 0.9)', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                {submitStatus === 'saving' ? (
                  <>
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#554d44" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    </motion.div>
                    <p style={{ marginTop: '16px', fontWeight: 'bold', color: '#554d44' }}>Adding expense...</p>
                  </>
                ) : (
                  <>
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }}>
                      <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Check size={32} color="white" />
                      </div>
                    </motion.div>
                    <p style={{ marginTop: '16px', fontWeight: 'bold', color: '#554d44' }}>Successfully added!</p>
                  </>
                )}
              </div>
            )}

            {/* Header */}
            <div className={styles.headerRow}>
              <button onClick={() => setIsOpen(false)} className={styles.iconBtn}>
                <X size={24} color="#554d44" />
              </button>
              <h2 className={styles.title}>Add Expense</h2>
              <button onClick={handleSubmit} className={styles.iconBtn} disabled={submitStatus !== 'idle'}>
                <Check size={24} color="#554d44" />
              </button>
            </div>

            <div className={styles.contentScroll}>
              {/* Amount Card */}
              <div className={styles.amountCard}>
                <p className={styles.amountLabel}>AMOUNT</p>
                <div className={styles.amountRow}>
                  <div className={styles.amountValue}>₹{amountStr}</div>
                  <div className={styles.calcIconWrap}>
                    <Calculator size={20} color="#7e7368" />
                  </div>
                </div>
              </div>

              {/* Selectors Row */}
              {!isAddingCustomCategory && (
                <div className={styles.selectorsRow}>
                  <label className={styles.selectCard}>
                    <Wallet size={20} className={styles.selectIcon} fill="#7e7368" stroke="#f9f6f0" />
                    <div className={styles.selectInfo}>
                      <p>Account</p>
                      <span>{account}</span>
                    </div>
                    <ChevronDown size={16} color="#7e7368" />
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
                    <Tag size={20} className={styles.selectIcon} fill="#7e7368" stroke="#f9f6f0" />
                    <div className={styles.selectInfo}>
                      <p>Category</p>
                      <span>{category}</span>
                    </div>
                    <ChevronDown size={16} color="#7e7368" />
                    <select className={styles.hiddenSelect} value={category} onChange={e => {
                      if (e.target.value === 'ADD_CUSTOM') {
                        setIsAddingCustomCategory(true)
                      } else {
                        setCategory(e.target.value)
                      }
                    }}>
                      <option value="Select Category" disabled>Select Category</option>
                      {budgets.map(section => (
                        <optgroup key={section.label} label={section.label}>
                          {section.subcategories?.map((sub: any) => (
                            <option key={sub.label} value={sub.label}>{sub.label}</option>
                          ))}
                        </optgroup>
                      ))}
                      <option value="ADD_CUSTOM">+ Add Custom Category...</option>
                    </select>
                  </label>
                </div>
              )}

              {isAddingCustomCategory && (
                <div style={{ padding: '12px', background: '#f5f3ef', borderRadius: '12px', marginBottom: '16px' }}>
                  <p style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: '#554d44' }}>New Custom Category</p>
                  <input
                    type="text"
                    placeholder="Category Name"
                    value={newCustomCategoryName}
                    onChange={e => setNewCustomCategoryName(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #dcd7d1', marginBottom: '8px' }}
                  />
                  <select
                    value={newCustomCategorySection}
                    onChange={e => setNewCustomCategorySection(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #dcd7d1', marginBottom: '8px', appearance: 'none', background: 'white' }}
                  >
                    {budgets.map(section => (
                      <option key={section.label} value={section.label}>{section.label}</option>
                    ))}
                  </select>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setIsAddingCustomCategory(false)}
                      style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #dcd7d1', background: 'transparent' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (!newCustomCategoryName.trim()) return;
                        try {
                          await api.post('/api/v1/dashboard/budgets/category', {
                            section: newCustomCategorySection,
                            label: newCustomCategoryName.trim(),
                            emoji: '📌',
                            budget: 0
                          });
                          
                          if (!localStorage.getItem('ph_first_budget_created')) {
                            import('posthog-js').then((ph) => {
                              ph.default.capture('first_budget_created', { platform: 'web' });
                              localStorage.setItem('ph_first_budget_created', 'true');
                            });
                          }

                          // Refresh budgets
                          const updatedBudgets = await api.get<any[]>('/api/v1/dashboard/budgets');
                          setBudgets(updatedBudgets);
                          setCategory(newCustomCategoryName.trim());
                          setIsAddingCustomCategory(false);
                          setNewCustomCategoryName('');
                        } catch (err) {
                          alert('Failed to add category');
                        }
                      }}
                      style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: 'var(--color-primary, #6b4e71)', color: 'white', fontWeight: 'bold' }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}

              {/* Footer Date/Time */}
              <div className={styles.footerRow}>
                <div className={styles.footerItemNative}>
                  <Calendar size={18} color="#7e7368" />
                  <div className={styles.footerInfoNative}>
                    <span>Date</span>
                    <input type="date" className={styles.visibleInput} value={date} onChange={e => setDate(e.target.value)} />
                  </div>
                </div>
                <div className={styles.footerDivider} />
                <div className={styles.footerItemNative}>
                  <Clock size={18} color="#7e7368" />
                  <div className={styles.footerInfoNative}>
                    <span>Time</span>
                    <input type="time" className={styles.visibleInput} value={time} onChange={e => setTime(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Quick Categories */}
              {!isAddingCustomCategory && (
                <div className={styles.quickCats}>
                  {QUICK_CATS.map(q => (
                    <button 
                      key={q.label} 
                      className={`${styles.quickCatItem} ${category === q.category ? styles.quickCatActive : ''}`}
                      onClick={() => {
                        setCategory(q.category)
                        setIsAddingCustomCategory(false)
                      }}
                    >
                      <span style={{ fontSize: '18px', lineHeight: 1 }}>{getCategoryEmoji(q.category)}</span>
                      <span>{q.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Notes */}
              <div className={styles.notesCard}>
                <div className={styles.notesHeader}>
                  <FileText size={18} color="#aaa299" />
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

              {/* Numpad */}
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
        )}
      </AnimatePresence>
    </>
  )
}
