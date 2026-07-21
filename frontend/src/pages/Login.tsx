/* ── Login / Sign-up with mandatory bank statement selection ── */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, CheckCircle2, FileText, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import Button from '../components/ui/Button'
import FloatingInput from '../components/ui/FloatingInput'
import styles from './Onboarding.module.css'

const BASE_URL = ''


/* ── Types ───────────────────────────────────────────────────────────────── */
interface StatementMeta {
  id:           string
  label:        string
  salary:       string
  date_range:   string
  transactions: number
  profile:      string
  icon:         string
  color:        string
}

function parseApiError(data: any, fallback: string): string {
  if (!data) return fallback
  if (Array.isArray(data.detail)) return data.detail.map((e: any) => e.msg || JSON.stringify(e)).join(', ')
  if (typeof data.detail  === 'string') return data.detail
  if (typeof data.message === 'string') return data.message
  return fallback
}

/* ── Slogan Animation ────────────────────────────────────────────────────── */
const SLOGAN = "the habit is the plan"
const sloganContainerVariant = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.2 }
  }
}
const sloganLetterVariant = {
  hidden: { opacity: 0, y: 3 },
  visible: { opacity: 1, y: 0 }
}

/* ── Statement Card ──────────────────────────────────────────────────────── */
function StatementCard({
  meta, selected, onClick,
}: { meta: StatementMeta; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        background: selected ? `${meta.color}18` : 'var(--bg-surface)',
        border: `2px solid ${selected ? meta.color : 'var(--bg-surface-high)'}`,
        borderRadius: 16,
        padding: '14px 16px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: selected ? `0 0 0 3px ${meta.color}22` : 'none',
        transform: selected ? 'scale(1.01)' : 'scale(1)',
      }}
    >
      {/* Icon */}
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: `${meta.color}22`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, flexShrink: 0,
      }}>
        {meta.icon}
      </div>

      {/* Details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{
            fontWeight: 700, fontSize: 13,
            color: selected ? meta.color : 'var(--color-on-surface)',
            fontFamily: 'var(--font-headline)',
          }}>
            {meta.label}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600,
            color: meta.color,
            background: `${meta.color}18`,
            borderRadius: 6, padding: '2px 7px',
          }}>
            {meta.date_range}
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>
          Profile: {meta.profile}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
            📊 {meta.transactions} transactions
          </span>
        </div>
        {/* Sample data highlight */}
        <div style={{
          marginTop: 7,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          background: 'rgba(245,158,11,0.13)',
          border: '1px solid rgba(245,158,11,0.35)',
          borderRadius: 6,
          padding: '3px 8px',
          fontSize: 11,
          fontWeight: 600,
          color: '#d97706',
          fontFamily: 'var(--font-body)',
        }}>
          📅 Sample data · 1 Apr – 3 May 2026
        </div>
      </div>

      {/* Check */}
      <div style={{ flexShrink: 0 }}>
        {selected
          ? <CheckCircle2 size={20} color={meta.color} fill={`${meta.color}22`} />
          : <ChevronRight size={18} color="var(--color-muted)" />}
      </div>
    </button>
  )
}

/* ── Main Component ──────────────────────────────────────────────────────── */
export default function Login() {
  const navigate = useNavigate()

  // Step: 'pick' = choosing statement | 'auth' = credentials form
  const [step,      setStep]      = useState<'pick' | 'auth'>('auth')
  const [isLogin,   setIsLogin]   = useState(true)
  const [name,      setName]      = useState('')
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [importing, setImporting] = useState(false)

  const [statements, setStatements] = useState<StatementMeta[]>([])
  const [selected,   setSelected]   = useState<string>('')

  // Load statement metadata from backend
  useEffect(() => {
    fetch(`${BASE_URL}/api/v1/import/statements`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`)
        return r.json()
      })
      .then(data => {
        if (Array.isArray(data)) {
          setStatements(data)
        } else {
          throw new Error('Data is not an array')
        }
      })
      .catch((e) => {
        console.error('Failed to fetch statements:', e)
        // Fallback static metadata if backend unreachable
        setStatements([
          { id: 'Statement9',  label: 'Statement 9',  salary: 'Variable', date_range: 'Apr – May 2026', transactions: 64, profile: 'Mid-tier, Bangalore',    icon: '🏙️', color: '#8B6347' },
          { id: 'Statement10', label: 'Statement 10', salary: 'Variable', date_range: 'Apr – May 2026', transactions: 64, profile: 'Upper-mid, Hyderabad',    icon: '💼', color: '#6C8B47' },
          { id: 'Statement11', label: 'Statement 11', salary: 'Variable', date_range: 'Apr – May 2026', transactions: 64, profile: 'Moderate spend, Chennai', icon: '🌊', color: '#47688B' },
        ])
      })
  }, [])

  const selectedMeta = statements.find(s => s.id === selected)

  const handleSubmit = async () => {
    if (!email || !password) { setError('Please enter your email and password'); return }
    if (!isLogin && !name.trim()) { setError('Please enter your name'); return }

    setLoading(true)
    setError('')

    try {
      let token = ''

      if (isLogin) {
        const formData = new URLSearchParams()
        formData.append('username', email)
        formData.append('password', password)
        const res  = await fetch(`${BASE_URL}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString(),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(parseApiError(data, 'Login failed'))
        token = data.access_token
      } else {
        const res  = await fetch(`${BASE_URL}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), email, password, monthly_budget: 0 }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(parseApiError(data, 'Registration failed'))
        token = data.access_token
        
        // Track signup
        import('posthog-js').then((ph) => {
          ph.default.capture('signup_completed', { platform: 'web', source: 'signup_form' })
        })
      }

      localStorage.setItem('dekho_token', token)
      localStorage.setItem('dekho_onboarded', 'true')

      // ── ONLY import the selected bank statement on registration ──────────────
      if (!isLogin && selected) {
        setLoading(false)
        setImporting(true)
        const importRes = await fetch(`${BASE_URL}/api/v1/import/statement`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ statement: selected }),
        })
        if (!importRes.ok) {
          const errData = await importRes.json()
          console.warn('Import warning:', errData)
          // Non-fatal — still proceed to home
        }
      }

      navigate('/home')
    } catch (e: any) {
      setError(e.message || 'Something went wrong')
    } finally {
      setLoading(false)
      setImporting(false)
    }
  }

  // ── Step 1: Statement Picker ───────────────────────────────────────────────
  if (step === 'pick') {
    return (
      <div className={styles.screen}>
        <div className={styles.inner}>
          {/* Logo */}
          <div className={styles.logo} style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <img src="/logo-nobg.png" alt="Dekho Logo" style={{ width: 120, height: 120, objectFit: 'contain', marginBottom: '-28px' }} />
            <span className={styles.logoName}>Dekho</span>
            <motion.div
              variants={sloganContainerVariant}
              initial="hidden"
              animate="visible"
              style={{
                marginTop: 2,
                display: 'flex',
                fontSize: '13px',
                color: 'var(--color-muted)',
                fontFamily: 'var(--font-body)',
                fontStyle: 'italic'
              }}
            >
              {SLOGAN.split('').map((char, i) => (
                <motion.span key={i} variants={sloganLetterVariant}>
                  {char === ' ' ? '\u00A0' : char}
                </motion.span>
              ))}
            </motion.div>
          </div>

          {/* Heading */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6 }}>
              <FileText size={18} color="var(--color-primary)" />
              <h1 style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
                Choose your bank statement
              </h1>
            </div>
            <p style={{ fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>
              Your transactions will be loaded from the selected statement
            </p>
          </div>

          {/* Statement cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {statements.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--color-muted)', padding: 20, fontSize: 13 }}>
                Loading statements...
              </div>
            ) : statements.map(s => (
              <StatementCard
                key={s.id}
                meta={s}
                selected={selected === s.id}
                onClick={() => setSelected(s.id)}
              />
            ))}
          </div>

          {/* Selected badge */}
          {selectedMeta && (
            <div style={{
              background: `${selectedMeta.color}12`,
              border: `1px solid ${selectedMeta.color}30`,
              borderRadius: 10,
              padding: '10px 14px',
              fontSize: 12,
              color: selectedMeta.color,
              fontWeight: 600,
              textAlign: 'center',
              marginBottom: 16,
              fontFamily: 'var(--font-body)',
            }}>
              ✓ {selectedMeta.label} selected — {selectedMeta.transactions} transactions will be loaded
            </div>
          )}

          {/* Continue button */}
          <Button
            fullWidth
            onClick={() => setStep('auth')}
            disabled={!selected}
          >
            Continue →
          </Button>

          {/* Skip button */}
          <button
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-primary)',
              fontSize: '0.875rem',
              cursor: 'pointer',
              fontWeight: 500,
              marginTop: 12,
              textAlign: 'center',
              width: '100%',
              fontFamily: 'var(--font-body)',
            }}
            onClick={() => {
              setSelected('')
              setStep('auth')
            }}
          >
            Skip statement import (Start empty)
          </button>

          <div className={styles.privacyNote} style={{ marginTop: 20 }}>
            <Lock size={12} />
            <span>Statement data stays on your device only.</span>
          </div>
        </div>
      </div>
    )
  }

  // ── Step 2: Credentials Form ──────────────────────────────────────────────
  return (
    <div className={styles.screen}>
      <div className={styles.inner}>
        {/* Logo */}
        <div className={styles.logo} style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <img src="/logo-nobg.png" alt="Dekho Logo" style={{ width: 120, height: 120, objectFit: 'contain', marginBottom: '-28px' }} />
          <span className={styles.logoName}>Dekho</span>
          <motion.div
            variants={sloganContainerVariant}
            initial="hidden"
            animate="visible"
            style={{
              marginTop: 2,
              display: 'flex',
              fontSize: '13px',
              color: 'var(--color-muted)',
              fontFamily: 'var(--font-body)',
              fontStyle: 'italic'
            }}
          >
            {SLOGAN.split('').map((char, i) => (
              <motion.span key={i} variants={sloganLetterVariant}>
                {char === ' ' ? '\u00A0' : char}
              </motion.span>
            ))}
          </motion.div>
        </div>

        {/* Selected statement chip (only for signup) */}
        {!isLogin && selectedMeta && (
          <button
            onClick={() => setStep('pick')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: `${selectedMeta.color}15`,
              border: `1.5px solid ${selectedMeta.color}40`,
              borderRadius: 12, padding: '8px 14px',
              marginBottom: 20, cursor: 'pointer', width: '100%',
            }}
          >
            <span style={{ fontSize: 18 }}>{selectedMeta.icon}</span>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: selectedMeta.color, fontFamily: 'var(--font-headline)' }}>
                {selectedMeta.label}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                {selectedMeta.transactions} transactions · Tap to change
              </div>
            </div>
            <CheckCircle2 size={16} color={selectedMeta.color} />
          </button>
        )}

        <div className={styles.heading} style={{ marginBottom: 24 }}>
          <h1>{isLogin ? 'Welcome back' : 'Create account'}</h1>
          <p>Your calm finance companion</p>
        </div>

        {/* Form fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginBottom: 24 }}>
          {!isLogin && (
            <FloatingInput label="Full name" type="text" value={name} onChange={e => setName(e.target.value)} />
          )}
          <FloatingInput label="Email address" type="email"    value={email}    onChange={e => setEmail(e.target.value)}    />
          <FloatingInput label="Password"      type="password" value={password} onChange={e => setPassword(e.target.value)} />
        </div>

        {error && (
          <p style={{ color: 'var(--color-critical)', fontSize: '0.875rem', marginBottom: 16, textAlign: 'center' }}>
            {error}
          </p>
        )}

        {importing && (
          <div style={{
            background: 'var(--bg-surface)', borderRadius: 12, padding: '12px 16px',
            marginBottom: 16, textAlign: 'center', fontSize: 13, color: 'var(--color-primary)',
            fontWeight: 600, fontFamily: 'var(--font-body)',
          }}>
            ⏳ Loading your {selectedMeta?.transactions} transactions...
          </div>
        )}

        <div className={styles.navRow} style={{ flexDirection: 'column', gap: 16 }}>
          <Button fullWidth onClick={handleSubmit} disabled={loading || importing}>
            {importing ? 'Importing data...' : loading ? 'Please wait...' : (isLogin ? 'Sign In' : selected ? 'Sign Up & Load Data' : 'Sign Up')}
          </Button>

          <button
            style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 500 }}
            onClick={() => { 
              if (isLogin) {
                setIsLogin(false)
                setSelected('')
                setStep('auth')
              } else {
                setIsLogin(true)
                setStep('auth')
              }
              setError('')
            }}
          >
            {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>

          <div className={styles.privacyNote} style={{ marginTop: 8 }}>
            <Lock size={12} />
            <span>Secure authentication via FinanceAI.</span>
          </div>
        </div>
      </div>
    </div>
  )
}
