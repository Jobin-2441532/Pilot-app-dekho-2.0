import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../../lib/api'
import styles from './AddTransactionFAB.module.css'

export default function AddTransactionFAB() {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [amount, setAmount] = useState('')
  const [merchant, setMerchant] = useState('')
  const [category, setCategory] = useState('Others')
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || !merchant) return
    
    setIsSubmitting(true)
    try {
      await api.post('/api/v1/dashboard/transactions', {
        amount: parseFloat(amount),
        merchant,
        category,
        date: date + 'T12:00:00Z', // Basic ISO
        notes: 'Added offline',
        direction: 'debit',
        payment_mode: 'Cash',
        source_type: 'Manual'
      })
      setIsOpen(false)
      setAmount('')
      setMerchant('')
      // Optionally trigger a refresh or toast here
      window.location.reload()
    } catch (err) {
      console.error('Failed to add transaction', err)
      alert('Failed to add offline spending.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <div className={styles.wrapper}>
        <motion.button
          className={`${styles.fab} ${isOpen ? styles.open : ''}`}
          onClick={() => setIsOpen(true)}
          aria-label="Add offline spending"
          whileTap={{ scale: 0.92 }}
        >
          <Plus size={22} strokeWidth={2} />
        </motion.button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            className={styles.overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div 
              className={styles.modal}
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
            >
              <div className={styles.modalHeader}>
                <h3>Add Offline Spending</h3>
                <button onClick={() => setIsOpen(false)} className={styles.closeBtn}>
                  <X size={20} />
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.inputGroup}>
                  <label>Amount (₹)</label>
                  <input 
                    type="number" 
                    value={amount} 
                    onChange={e => setAmount(e.target.value)} 
                    placeholder="0.00" 
                    required 
                    autoFocus
                    step="0.01"
                  />
                </div>
                
                <div className={styles.inputGroup}>
                  <label>Merchant / Note</label>
                  <input 
                    type="text" 
                    value={merchant} 
                    onChange={e => setMerchant(e.target.value)} 
                    placeholder="e.g. Local Grocery" 
                    required 
                  />
                </div>
                
                <div className={styles.inputGroup}>
                  <label>Category</label>
                  <select value={category} onChange={e => setCategory(e.target.value)}>
                    <option value="Food & Dining">Food & Dining</option>
                    <option value="Shopping">Shopping</option>
                    <option value="Transportation">Transportation</option>
                    <option value="Groceries">Groceries</option>
                    <option value="Health">Health</option>
                    <option value="Entertainment">Entertainment</option>
                    <option value="Housing">Housing</option>
                    <option value="Bills & Utilities">Bills & Utilities</option>
                    <option value="Travel">Travel</option>
                    <option value="Others">Others</option>
                  </select>
                </div>
                
                <div className={styles.inputGroup}>
                  <label>Date</label>
                  <input 
                    type="date" 
                    value={date} 
                    onChange={e => setDate(e.target.value)} 
                    required 
                  />
                </div>
                
                <button 
                  type="submit" 
                  className={styles.submitBtn} 
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Adding...' : 'Save Transaction'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
