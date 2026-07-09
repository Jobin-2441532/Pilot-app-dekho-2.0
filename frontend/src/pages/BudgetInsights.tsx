import { useState, useEffect } from 'react'
import { ArrowLeft, ArrowDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ComposedChart, Area, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine } from 'recharts'
import api from '../lib/api'
import styles from './BudgetInsights.module.css'

const LIGHT_PULSE_GRADIENTS: Record<string, string> = {
  cruising: 'linear-gradient(135deg, #E6F3F0 0%, #CDE6DF 100%)',
  on_track: 'linear-gradient(135deg, #E2F0E9 0%, #C8E1D2 100%)',
  mindful: 'linear-gradient(135deg, #FDF7E7 0%, #F5E6C4 100%)',
  tight: 'linear-gradient(135deg, #FDECE1 0%, #F5D3BB 100%)',
  stretched: 'linear-gradient(135deg, #FDE1E1 0%, #F5C6C6 100%)',
  underspent: 'linear-gradient(135deg, #EBF3F8 0%, #D4E5EF 100%)',
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

const LightPulseIllustration = ({ mood }: { mood: string }) => {
  if (mood === 'cruising' || mood === 'on_track') {
    return (
      <svg style={pulseBgStyle} viewBox="0 0 400 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="340" cy="50" r="40" fill="#2E445E" opacity="0.05" />
        <path d="M100 140 Q 200 120 300 140 T 400 140 L 400 200 L 0 200 L 0 140 Z" fill="rgba(0,0,0,0.03)" />
        <path d="M50 160 Q 150 140 250 160 T 400 160 L 400 200 L 0 200 L 0 160 Z" fill="rgba(0,0,0,0.05)" />
      </svg>
    )
  }
  if (mood === 'underspent') {
    return (
      <svg style={pulseBgStyle} viewBox="0 0 400 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M 0 200 L 400 200 L 400 100 C 300 100 240 70 200 70 C 120 70 80 130 0 130 Z" fill="rgba(0,0,0,0.03)" />
        <path d="M 0 200 L 400 200 L 400 130 C 320 130 280 100 200 100 C 100 100 60 170 0 170 Z" fill="rgba(0,0,0,0.05)" />
        <circle cx="100" cy="50" r="30" fill="#2A495E" opacity="0.05" />
      </svg>
    )
  }
  if (mood === 'mindful' || mood === 'tight') {
    return (
      <svg style={pulseBgStyle} viewBox="0 0 400 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="300" cy="100" r="70" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="6" />
        <path d="M 240 200 L 340 200 L 320 60 L 260 60 Z" fill="rgba(0,0,0,0.03)" />
      </svg>
    )
  }
  // stretched
  return (
    <svg style={pulseBgStyle} viewBox="0 0 400 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M 0 200 L 400 200 L 400 150 Q 300 100 200 170 T 0 130 Z" fill="rgba(0,0,0,0.03)" />
      <path d="M 0 200 L 400 200 L 400 170 Q 240 180 100 150 T 0 170 Z" fill="rgba(0,0,0,0.05)" />
      <circle cx="330" cy="60" r="40" fill="#8B2323" opacity="0.05" />
    </svg>
  )
}

export default function BudgetInsights() {
  const navigate = useNavigate()

  const [viewMode, setViewMode] = useState<'bubbles' | 'gauges'>('bubbles')
  const [paceData, setPaceData] = useState<any[]>([])
  const [momData, setMomData] = useState<any[]>([])
  const [currentMonthStr, setCurrentMonthStr] = useState<string>('')
  const [currentSpendDay, setCurrentSpendDay] = useState(1)
  const [daysInMonth, setDaysInMonth] = useState(30)
  const [totalSpent, setTotalSpent] = useState(0)
  const [totalBudget, setTotalBudget] = useState(0)
  const [categoriesData, setCategoriesData] = useState<any[]>([
    { label: 'Essentials', budget: 25000, spent: 0, color: '#F59E0B', rgb: '245, 158, 11' },
    { label: 'Lifestyle', budget: 10000, spent: 0, color: '#8B5CF6', rgb: '139, 92, 246' },
    { label: 'Future', budget: 5000, spent: 0, color: '#10B981', rgb: '16, 185, 129' },
    { label: 'Buffer', budget: 5000, spent: 0, color: '#EC4899', rgb: '236, 72, 153' }
  ])

  useEffect(() => {
    const loadData = () => {
      Promise.all([
        api.get<any>('/api/v1/dashboard/transactions', { limit: 200 }).catch(() => ({ data: [] })),
        api.get<any[]>('/api/v1/dashboard/budgets').catch(() => [])
      ]).then(([txRes, bRes]) => {
        const txList = txRes?.data || []
       const now = new Date()
       const dims = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
       const cd = now.getDate()
       setDaysInMonth(dims)
       setCurrentSpendDay(cd)
       
       const monthName = now.toLocaleString('en-US', { month: 'long' }).toUpperCase()
       setCurrentMonthStr(`${monthName} ${now.getFullYear()}`)

       const thisMonthTxs = txList.filter((tx: any) => {
         const d = new Date(tx.date)
         return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
       })
       
       let prevM = now.getMonth() - 1
       let prevY = now.getFullYear()
       if (prevM < 0) { prevM = 11; prevY -= 1; }
       const lastMonthTxs = txList.filter((tx: any) => {
         const d = new Date(tx.date)
         return d.getMonth() === prevM && d.getFullYear() === prevY
       })
       const initialCats = [
         { label: 'Essentials', budget: 0, spent: 0, color: '#F59E0B', rgb: '245, 158, 11' },
         { label: 'Lifestyle', budget: 0, spent: 0, color: '#8B5CF6', rgb: '139, 92, 246' },
         { label: 'Future-oriented', budget: 0, spent: 0, color: '#10B981', rgb: '16, 185, 129' },
         { label: 'Buffer', budget: 0, spent: 0, color: '#EC4899', rgb: '236, 72, 153' }
       ]

       // Handle legacy "Future" label from local storage vs "Future-oriented" from backend
       if (Array.isArray(bRes) && bRes.length > 0) {
         const totalB = bRes.reduce((s, cat) => s + (cat.budget || 0), 0)
         if (totalB !== 45000) {
           initialCats.forEach(cat => {
             const bCat = bRes.find((b: any) => b.label === cat.label || (b.label === 'Future-oriented' && cat.label === 'Future'))
             if (bCat) {
               cat.budget = bCat.budget
             }
           })
         }
       }

       const matchRules: Record<string, string[]> = {
         'Essentials': ['Housing', 'Household', 'Utilities', 'Bills', 'Food & Dining', 'Groceries', 'Transport', 'Health', 'Personal Care', 'Insurance', 'Loan EMI', 'Credit Card'],
         'Lifestyle': ['Shopping', 'Entertainment', 'Travel', 'Subscriptions', 'Telecom'],
         'Future-oriented': ['Investment']
       }
       
       let tSpent = 0
       const spendByDay = new Array(32).fill(0)

       thisMonthTxs.forEach((tx: any) => {
          if (tx.direction === 'credit' || (tx.amount ?? 0) < 0) return
          let found = false
          tSpent += (tx.amount || 0)
          const day = new Date(tx.date).getDate()
          spendByDay[day] += (tx.amount || 0)

          for (const cat of initialCats) {
             if (matchRules[cat.label]?.includes(tx.category)) {
                 cat.spent += (tx.amount || 0)
                 found = true
             }
          }
          if (!found) {
             initialCats[3].spent += (tx.amount || 0)
          }
       })
       setCategoriesData(initialCats)
       setTotalSpent(tSpent)
       
       const tBudget = initialCats.reduce((acc, cat) => acc + cat.budget, 0)
       setTotalBudget(tBudget)

        let cumulativeSpend = 0
       const newPaceData = []
       for (let i = 1; i <= dims; i++) {
         const ideal = (tBudget / dims) * i
         let actual = null
         if (i <= cd) {
           cumulativeSpend += spendByDay[i]
           actual = cumulativeSpend
         }
         newPaceData.push({ day: i, ideal, actual })
       }
       setPaceData(newPaceData)
       
       // Calculate MoM Data
       const newMomData = []
       const prevMonthShort = new Date(prevY, prevM, 1).toLocaleString('en-US', { month: 'short' })
       const curMonthShort = now.toLocaleString('en-US', { month: 'short' })

       for (const cat of initialCats) {
         let lastSpent = 0
         lastMonthTxs.forEach((tx: any) => {
           if (tx.direction === 'credit' || (tx.amount ?? 0) < 0) return
           let isCat = false
           if (matchRules[cat.label]?.includes(tx.category)) isCat = true
           if (!isCat && cat.label === 'Buffer' && !Object.values(matchRules).flat().includes(tx.category)) isCat = true
           
           if (isCat) lastSpent += (tx.amount || 0)
         })
         
         const current = cat.spent
         let changeText = '0% change'
         let isGood = true
         if (lastSpent > 0) {
           const diff = current - lastSpent
           const pct = Math.round(Math.abs(diff / lastSpent * 100))
           if (diff > 0) {
             changeText = `${pct}% more`
             isGood = false // spending more is generally bad
           } else {
             changeText = `${pct}% less`
             isGood = true
           }
         } else if (current > 0) {
           changeText = `100% more`
           isGood = false
         }
         
         newMomData.push({ name: cat.label, last: lastSpent, current, change: changeText, isGood, prevMonthShort, curMonthShort })
       }
       setMomData(newMomData)
      })
    }
    
    loadData()
    window.addEventListener('dekho_data_updated', loadData)
    return () => window.removeEventListener('dekho_data_updated', loadData)
  }, [])

  // Diverging Dot Plot Data (MoM)
  // Computed dynamically in loadData
  const maxSpend = 10000

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          <ArrowLeft size={24} color="var(--color-on-surface)" />
        </button>
        <div className={styles.monthPill}>{currentMonthStr}</div>
      </header>

      {/* Section 1 — Hero Narrative Card */}
      <section className={styles.cardHero} style={{ background: LIGHT_PULSE_GRADIENTS[totalSpent > totalBudget ? 'stretched' : 'underspent'] }}>
        <LightPulseIllustration mood={totalSpent > totalBudget ? 'stretched' : 'underspent'} />
        <div className={styles.heroContent}>
          <div className={styles.heroTitleRow}>
            <div>
              <span className={`${styles.microLabel} ${styles.heroMicroLabel}`}>Budget Health</span>
              <h1 className={`${styles.cardTitle} ${styles.heroTitle}`}>You've used {totalBudget ? Math.round((totalSpent / totalBudget) * 100) : 0}% of your budget.</h1>
            </div>
            <div className={styles.heroBadge}>{totalSpent > totalBudget ? 'OVER BUDGET' : 'ON TRACK'}</div>
          </div>
          <p className={`${styles.cardSubtitle} ${styles.heroSubtitle}`}>{currentSpendDay} days in, ₹{Math.max(0, totalBudget - totalSpent).toLocaleString('en-IN')} still in your corner.</p>
          <div className={styles.heroStats}>
            <div className={styles.heroStat}>
              <span className={styles.heroStatLabel}>Safe to spend / day</span>
              <span className={styles.heroStatValue}>₹{Math.max(0, Math.round((totalBudget - totalSpent) / (daysInMonth - currentSpendDay + 1))).toLocaleString('en-IN')}</span>
            </div>
            <div className={styles.heroStat}>
              <span className={styles.heroStatLabel}>Days remaining</span>
              <span className={styles.heroStatValue}>{daysInMonth - currentSpendDay + 1}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2 — Bubble Cluster Chart / Gauges Toggle */}
      <section className={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span className={styles.microLabel}>Bucket Breakdown</span>
            <h2 className={styles.cardTitle}>Where your budget lives</h2>
            <p className={styles.cardSubtitle}>Size = budget allocated. Shade = how much used.</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-base)', padding: '4px', borderRadius: '12px' }}>
            <button onClick={() => setViewMode('bubbles')} style={{ padding: '6px 10px', borderRadius: '8px', border: 'none', background: viewMode === 'bubbles' ? 'var(--bg-card)' : 'transparent', fontWeight: viewMode === 'bubbles' ? 'bold' : 'normal', fontSize: '12px', cursor: 'pointer', boxShadow: viewMode === 'bubbles' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none', color: 'var(--color-on-surface)' }}>Bubbles</button>
            <button onClick={() => setViewMode('gauges')} style={{ padding: '6px 10px', borderRadius: '8px', border: 'none', background: viewMode === 'gauges' ? 'var(--bg-card)' : 'transparent', fontWeight: viewMode === 'gauges' ? 'bold' : 'normal', fontSize: '12px', cursor: 'pointer', boxShadow: viewMode === 'gauges' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none', color: 'var(--color-on-surface)' }}>Gauges</button>
          </div>
        </div>

        {viewMode === 'bubbles' ? (
          <div className={styles.bubbleContainer}>
            <div className={styles.bubbleCluster}>
              {categoriesData.map((cat, idx) => {
                const pct = Math.min(Math.round((cat.spent / cat.budget) * 100), 100)
                const sizes = [110, 85, 90, 70]
                const positions = [{left: 10, top: 20}, {left: 130, top: 10}, {left: 80, top: 120}, {left: 205, top: 100}]
                const size = sizes[idx]
                const pos = positions[idx]
                return (
                  <div key={cat.label} className={styles.bubble} style={{ width: size, height: size, backgroundColor: `rgba(${cat.rgb}, 0.25)`, border: `2px solid ${cat.color}`, left: pos.left, top: pos.top }}>
                    <span className={styles.bubbleName}>{cat.label}</span>
                    <span className={styles.bubbleAmount}>₹{(cat.budget/1000)}k</span>
                    <div className={styles.bubbleBadge}>{cat.budget > 0 ? Math.round((cat.spent / cat.budget) * 100) : 0}%</div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className={styles.gaugeGrid}>
            {categoriesData.map((cat, i) => {
              const radius = 40;
              const circumference = Math.PI * radius;
              const pct = Math.min(Math.round((cat.spent / cat.budget) * 100), 100)
              const strokeDashoffset = circumference - (pct / 100) * circumference;

              return (
                <div key={i} className={styles.gaugeItem}>
                  <div className={styles.gaugeWrapper}>
                    <svg className={styles.gaugeSvg} viewBox="0 0 100 50">
                      <path className={styles.gaugeBg} d="M 10 50 A 40 40 0 0 1 90 50" />
                      <path 
                        className={styles.gaugeFill} 
                        d="M 10 50 A 40 40 0 0 1 90 50" 
                        stroke={cat.color}
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                      />
                    </svg>
                    <div className={styles.gaugeContent}>
                      <span className={styles.gaugeName}>{cat.label}</span>
                      <span className={styles.gaugePct}>{pct}%</span>
                    </div>
                  </div>
                  <div className={styles.gaugeVerdict}>₹{(cat.budget - cat.spent).toLocaleString('en-IN')} left</div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Section 3 — Spending Velocity Chart */}
      <section className={styles.card}>
        <span className={styles.microLabel}>Pace Tracker</span>
        <h2 className={styles.cardTitle}>Are you spending too fast?</h2>
        <p className={styles.cardSubtitle}>Your actual spend vs. ideal pace for the month.</p>
        
        <div className={styles.paceChartWrapper}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={paceData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="day" ticks={[1, 7, 14, 21, 30]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#8A7F74' }} />
              <YAxis ticks={[0, 25000, 50000]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#8A7F74' }} tickFormatter={(val) => val === 0 ? '₹0' : `₹${val/1000}k`} />
              
              {/* Ideal Pace Line */}
              <Line type="monotone" dataKey="ideal" stroke="#8A7F74" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={true} />
              
              {/* Actual Spend Area */}
              <Line type="monotone" dataKey="actual" stroke="#6B3010" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: '#6B3010' }} isAnimationActive={true} />
              
              {/* Today marker */}
              <ReferenceLine x={currentSpendDay} stroke="#8A7F74" strokeDasharray="3 3" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        
        {/* Custom floating label for "Today" */}
        <div style={{ position: 'relative', height: 20 }}>
          <div style={{ position: 'absolute', left: `${(currentSpendDay / daysInMonth) * 100}%`, top: -90, transform: 'translateX(-50%)' }} className={styles.paceLabel}>
            <span className={styles.paceAmount}>₹{totalSpent.toLocaleString('en-IN')} spent</span>
            <span className={styles.paceStatus}><ArrowDown size={12} /> {(totalBudget / daysInMonth) * currentSpendDay > totalSpent ? 'below pace' : 'above pace'}</span>
          </div>
        </div>
      </section>





      {/* Section 7 — Month Comparison Strip */}
      <section className={styles.card}>
        <span className={styles.microLabel}>Trend</span>
        <h2 className={styles.cardTitle}>This month vs. last</h2>
        
        <div className={styles.dotPlotContainer}>
          {momData.map((d, i) => {
            const minVal = Math.min(d.last, d.current);
            const maxVal = Math.max(d.last, d.current);
            const leftPct = (minVal / maxSpend) * 100;
            const widthPct = ((maxVal - minVal) / maxSpend) * 100;
            
            const lastPct = (d.last / maxSpend) * 100;
            const currentPct = (d.current / maxSpend) * 100;

            return (
              <div key={i} className={styles.dotPlotRow}>
                <div className={styles.dotPlotLabel}>{d.name}</div>
                <div className={styles.dotPlotArea}>
                  <div 
                    className={`${styles.dotLine} ${d.isGood ? styles.dotLineImprove : styles.dotLineWorse}`} 
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }} 
                  />
                  <div className={`${styles.dot} ${styles.dotMay}`} style={{ left: `calc(${lastPct}% - 6px)` }}>
                    <div className={styles.dotTooltip}>{d.prevMonthShort}</div>
                  </div>
                  <div className={`${styles.dot} ${styles.dotJun}`} style={{ left: `calc(${currentPct}% - 6px)` }}>
                    <div className={`${styles.dotTooltip} ${styles.dotTooltipCurrent}`}>{d.curMonthShort}</div>
                  </div>
                </div>
                <div className={`${styles.dotChange} ${d.isGood ? styles.changeGood : styles.changeBad}`}>
                  {d.isGood ? <ArrowDown size={12} /> : <ArrowLeft size={12} style={{ transform: 'rotate(135deg)' }} />}
                  {d.change}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
