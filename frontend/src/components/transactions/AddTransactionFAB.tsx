import { useState, useMemo, useEffect } from 'react'
import { Plus, X, Check, Calculator, Wallet, Tag, FileText, Calendar, Clock, Delete, Utensils, Car, ShoppingBag, ReceiptText, ChevronDown, Trash2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../../lib/api'
import { useCategoryEmoji } from '../../utils/categoryUtils'
import styles from './AddTransactionFAB.module.css'
import CustomDialog from '../ui/CustomDialog'

const DEFAULT_CATEGORIES = [
  'Housing & Household', 'Utilities', 'Bills', 'Food & Dining', 'Groceries', 
  'Transport', 'Health', 'Personal Care', 'Insurance', 'Loan EMI', 'Credit Card',
  'Shopping', 'Entertainment', 'Travel', 'Subscriptions', 'Telecom', 
  'Investment', 'Others', 'Services', 'Uncategorised'
]

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
  const [showAccountSelector, setShowAccountSelector] = useState(false)
  const [showCategorySelector, setShowCategorySelector] = useState(false)
  const [isSavingCategory, setIsSavingCategory] = useState(false)
  
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
      showDialog("Invalid Amount", "Please enter a valid amount")
      return
    }
    
    setSubmitStatus('saving')
    try {
      const paymentMode = account === 'Select Account' ? 'Cash' : account
      let finalCat = category === 'Select Category' ? 'Others' : category
      
      if (finalCat === 'Others' || finalCat === 'Select Category') {
        const cleanedNotes = notes.trim().toLowerCase()
        if (cleanedNotes) {
          for (const section of budgets) {
            if (Array.isArray(section.subcategories)) {
              const matchedSub = section.subcategories.find(
                (sub: any) => sub.label && sub.label.toLowerCase() === cleanedNotes
              )
              if (matchedSub) {
                finalCat = matchedSub.label
                break
              }
            }
          }
        }
      }

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
      showDialog("Error", "Failed to add expense.")
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
          id="tour-add-transaction"
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
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-on-surface)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    </motion.div>
                    <p style={{ marginTop: '16px', fontWeight: 'bold', color: 'var(--color-on-surface)' }}>Adding expense...</p>
                  </>
                ) : (
                  <>
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }}>
                      <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--color-positive, #10B981)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Check size={32} color="var(--bg-base)" />
                      </div>
                    </motion.div>
                    <p style={{ marginTop: '16px', fontWeight: 'bold', color: 'var(--color-on-surface)' }}>Successfully added!</p>
                  </>
                )}
              </div>
            )}

            {/* Header */}
            <div className={styles.headerRow}>
              <button onClick={() => setIsOpen(false)} className={styles.iconBtn}>
                <X size={24} color="var(--color-on-surface)" />
              </button>
              <h2 className={styles.title}>Add Expense</h2>
              <button onClick={handleSubmit} className={styles.iconBtn} disabled={submitStatus !== 'idle'}>
                <Check size={24} color="var(--color-on-surface)" />
              </button>
            </div>

            <div className={styles.contentScroll}>
              {/* Amount Card */}
              <div className={styles.amountCard}>
                <p className={styles.amountLabel}>AMOUNT</p>
                <div className={styles.amountRow}>
                  <div className={styles.amountValue}>₹{amountStr}</div>
                  <div className={styles.calcIconWrap}>
                    <Calculator size={20} color="var(--color-muted)" />
                  </div>
                </div>
              </div>

              {/* Selectors Row */}
              {!isAddingCustomCategory && (
                <div className={styles.selectorsRow}>
                  <div className={styles.selectCard} onClick={() => setShowAccountSelector(true)}>
                    <Wallet size={20} className={styles.selectIcon} fill="var(--color-muted)" stroke="var(--bg-surface)" />
                    <div className={styles.selectInfo}>
                      <p>Account</p>
                      <span>{account}</span>
                    </div>
                    <ChevronDown size={16} color="var(--color-muted)" />
                  </div>
                  
                  <div className={styles.selectCard} onClick={() => setShowCategorySelector(true)}>
                    <Tag size={20} className={styles.selectIcon} fill="var(--color-muted)" stroke="var(--bg-surface)" />
                    <div className={styles.selectInfo}>
                      <p>Category</p>
                      <span>{category}</span>
                    </div>
                    <ChevronDown size={16} color="var(--color-muted)" />
                  </div>
                </div>
              )}

              {isAddingCustomCategory && (
                <div style={{ padding: '16px', background: '#f5f3ef', borderRadius: '16px', marginBottom: '16px', border: '1px solid var(--color-outline-var)' }}>
                  <p style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: '#554d44' }}>New Custom Category</p>
                  <input
                    type="text"
                    placeholder="Category Name"
                    value={newCustomCategoryName}
                    onChange={e => setNewCustomCategoryName(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #dcd7d1', marginBottom: '10px', background: '#fff', outline: 'none' }}
                  />
                  <p style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '6px', color: '#7e7368' }}>Select Section</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                    {budgets.map(section => (
                      <button
                        key={section.label}
                        type="button"
                        onClick={() => setNewCustomCategorySection(section.label)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '20px',
                          border: `1px solid ${newCustomCategorySection === section.label ? 'var(--color-primary)' : '#dcd7d1'}`,
                          background: newCustomCategorySection === section.label ? 'var(--color-primary)' : 'transparent',
                          color: newCustomCategorySection === section.label ? 'white' : '#554d44',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        {section.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setIsAddingCustomCategory(false)}
                      style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #dcd7d1', background: 'transparent', color: '#554d44', fontWeight: '500' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (!newCustomCategoryName.trim() || isSavingCategory) return;
                        setIsSavingCategory(true);
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
                          showDialog("Error", "Failed to add category")
                        } finally {
                          setIsSavingCategory(false);
                        }
                      }}
                      disabled={isSavingCategory}
                      style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: isSavingCategory ? '#ccc' : 'var(--color-primary, #6b4e71)', color: 'white', fontWeight: 'bold', cursor: isSavingCategory ? 'default' : 'pointer' }}
                    >
                      {isSavingCategory ? 'Adding...' : 'Add'}
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

      {showAccountSelector && (
        <div className={styles.customSelectOverlay} onClick={() => setShowAccountSelector(false)}>
          <div className={styles.customSelectContent} onClick={e => e.stopPropagation()}>
            <div className={styles.customSelectHeader}>
              <h3>Select Account</h3>
              <button onClick={() => setShowAccountSelector(false)} className={styles.closeBtn}>×</button>
            </div>
            <div className={styles.customSelectList}>
              {['Cash', 'UPI', 'Credit Card', 'Debit Card', 'Net Banking'].map(acc => (
                <button
                  key={acc}
                  className={`${styles.customSelectItem} ${account === acc ? styles.customSelectItemActive : ''}`}
                  onClick={() => {
                    setAccount(acc)
                    setShowAccountSelector(false)
                  }}
                >
                  <span>{acc}</span>
                  {account === acc && <Check size={16} />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showCategorySelector && (
        <div className={styles.customSelectOverlay} onClick={() => setShowCategorySelector(false)}>
          <div className={styles.customSelectContent} onClick={e => e.stopPropagation()}>
            <div className={styles.customSelectHeader}>
              <h3>Select Category</h3>
              <button onClick={() => setShowCategorySelector(false)} className={styles.closeBtn}>×</button>
            </div>
            <div className={styles.customSelectList}>
              {budgets.map(section => (
                <div key={section.label} className={styles.customSelectGroup}>
                  <div className={styles.customSelectGroupLabel}>{section.label}</div>
                  {section.subcategories?.map((sub: any) => (
                    <div
                      key={sub.label}
                      className={`${styles.customSelectItem} ${category === sub.label ? styles.customSelectItemActive : ''}`}
                      onClick={() => {
                        setCategory(sub.label)
                        setShowCategorySelector(false)
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{sub.emoji || getCategoryEmoji(sub.label)}</span>
                        <span>{sub.label}</span>
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {!DEFAULT_CATEGORIES.includes(sub.label) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              showDialog(
                                "Delete Custom Category",
                                `Are you sure you want to delete the custom category "${sub.label}"?`,
                                async () => {
                                  try {
                                    await api.delete(`/api/v1/dashboard/budgets/category?label=${encodeURIComponent(sub.label)}`);
                                    const updatedBudgets = await api.get<any[]>('/api/v1/dashboard/budgets');
                                    setBudgets(updatedBudgets);
                                    if (category === sub.label) {
                                      setCategory('Select Category');
                                    }
                                  } catch (err: any) {
                                    let errMsg = "Failed to delete category";
                                    try {
                                      const parsed = JSON.parse(err.message);
                                      errMsg = parsed.detail || errMsg;
                                    } catch {
                                      errMsg = err.message || errMsg;
                                    }
                                    showDialog("Cannot Delete Category", errMsg);
                                  }
                                },
                                true, // isConfirm
                                () => {},
                                true // isDestructive
                              );
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#ff4d4f',
                              cursor: 'pointer',
                              padding: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '4px',
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                        {category === sub.label && <Check size={16} />}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <div style={{ height: '1px', background: 'var(--color-outline-var, #eae5dd)', margin: '8px 0', opacity: 0.5 }} />
              <button
                className={styles.customSelectAddBtn}
                onClick={() => {
                  setShowCategorySelector(false)
                  setIsAddingCustomCategory(true)
                }}
              >
                + Add Custom Category...
              </button>
            </div>
          </div>
        </div>
      )}
      {dialogConfig && <CustomDialog {...dialogConfig} />}
    </>
  )
}
