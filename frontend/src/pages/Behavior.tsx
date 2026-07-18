import { useState, useMemo, useEffect } from 'react'
import Card from '../components/ui/Card'
import MetricBlock from '../components/ui/MetricBlock'
import Chip from '../components/ui/Chip'
import { PageHeader, Section, Grid2 } from '../components/layout/AppShell'
import { SkeletonCard, ErrorState } from '../components/ui/LoadingState'
import GlobalLoader from '../components/ui/GlobalLoader'
import { api } from '../lib/api'
import { CATEGORY_COLOR, CATEGORY_BG, getCategoryTotals, type Transaction } from '../data/mockData'
import { useCategoryEmoji } from '../utils/categoryUtils'

// Weekly day labels
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

// Build a simple 4-week heatmap
function buildHeatmap(txns: Transaction[]): number[][] {
  const grid: number[][] = Array.from({ length: 4 }, () => Array(7).fill(0))
  txns.forEach(tx => {
    const d = new Date(tx.date)
    const day = (d.getDay() + 6) % 7 // Mon=0
    const week = Math.min(Math.floor((d.getDate() - 1) / 7), 3)
    grid[week][day] += tx.amount
  })
  return grid
}

function heatColor(val: number, maxHeat: number): string {
  if (val === 0) return 'var(--color-surface-2)'
  const pct = maxHeat === 0 ? 0 : val / maxHeat
  if (pct < 0.25) return '#F9ECD9'
  if (pct < 0.5)  return '#D4956A'
  if (pct < 0.75) return '#A67C5B'
  return '#5C3D2E'
}

const PATTERNS = [
  { emoji: '🔁', title: 'You order food every ~2 days', text: 'Zomato and Swiggy show up more than any other merchant. That\'s ₹4,165 in 14 days — consistent but manageable.' },
  { emoji: '📱', title: 'Subscriptions auto-renew quietly', text: '3 subscriptions renewed this month: Netflix, Spotify, YouTube. Together: ₹957/month, ₹11,484/year.' },
  { emoji: '🏋️', title: 'Health spend is steady', text: 'Cult.fit at ₹1,999 renews every month. You\'ve maintained this for at least 2 months — that\'s a strong habit.' },
]

export default function Behavior() {
  const [period, setPeriod] = useState<'current' | 'prev'>('current')
  
  const getCategoryEmoji = useCategoryEmoji()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get<any>('/api/v1/dashboard/transactions', { limit: 500 })
      .then(res => setTransactions(res.data || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const now = new Date()
  const currentMonthStr = now.toISOString().slice(0, 7)
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthStr = prevDate.toISOString().slice(0, 7)

  const currentMonthName = now.toLocaleString('default', { month: 'short' }) + ' ' + now.getFullYear()
  const prevMonthName = prevDate.toLocaleString('default', { month: 'short' }) + ' ' + prevDate.getFullYear()
  const currentMonthShort = now.toLocaleString('default', { month: 'short' })
  const prevMonthShort = prevDate.toLocaleString('default', { month: 'short' })

  const currentTx = useMemo(() => transactions.filter(t => t.date && t.date.startsWith(currentMonthStr)), [transactions, currentMonthStr])
  const prevTx = useMemo(() => transactions.filter(t => t.date && t.date.startsWith(prevMonthStr)), [transactions, prevMonthStr])

  const currentTotal = currentTx.reduce((s,t) => s+(t.direction !== 'credit' ? t.amount : 0), 0)
  const prevTotal = prevTx.reduce((s,t) => s+(t.direction !== 'credit' ? t.amount : 0), 0)

  const currentCats = useMemo(() => getCategoryTotals(currentTx.filter(t => t.direction !== 'credit')), [currentTx])
  const prevCats = useMemo(() => getCategoryTotals(prevTx.filter(t => t.direction !== 'credit')), [prevTx])

  const cats = period === 'current' ? currentCats : prevCats
  const maxCatAmt  = cats[0]?.total ?? 1
  const total = period === 'current' ? currentTotal : prevTotal

  const heatmap = useMemo(() => buildHeatmap(currentTx.filter(t => t.direction !== 'credit')), [currentTx])
  const maxHeat = Math.max(...heatmap.flat())

  if (loading) return <GlobalLoader />
  if (error) return <div><PageHeader title="Behavior" subtitle="Your spending patterns and habits" /><ErrorState message={error} /></div>

  return (
    <div>
      <PageHeader
        title="Behavior"
        subtitle="Your spending patterns and habits"
      />

      {/* Month picker */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-6)' }}>
        <Chip variant="filter" active={period === 'current'} onClick={() => setPeriod('current')}>{currentMonthName}</Chip>
        <Chip variant="filter" active={period === 'prev'} onClick={() => setPeriod('prev')}>{prevMonthName}</Chip>
      </div>

      {/* Summary row */}
      <Section>
        <Grid2>
          <Card variant="brand">
            <MetricBlock
              label={period === 'current' ? `Spent so far (${currentMonthShort})` : `Total spend (${prevMonthShort})`}
              value={total}
              size="md"
              inverted
              subtext={period === 'current' ? `${currentMonthShort} so far` : `Full ${prevMonthShort}`}
            />
          </Card>
          <Card>
            <MetricBlock
              label="Month-over-month"
              value={Math.abs(currentTotal - prevTotal)}
              size="md"
              change={{
                value: `${prevTotal > 0 ? Math.round(Math.abs((currentTotal - prevTotal) / prevTotal) * 100) : 100}% ${currentTotal <= prevTotal ? 'less' : 'more'} than ${prevMonthShort}`,
                direction: currentTotal <= prevTotal ? 'down' : 'up',
              }}
              subtext={`Comparing ${currentMonthShort} vs ${prevMonthShort}`}
            />
          </Card>
        </Grid2>
      </Section>

      {/* Spending heatmap */}
      <Section label={`Daily spending intensity — ${currentMonthName}`}>
        <Card>
          <div style={{ overflowX: 'auto' }}>
            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '40px repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
              <span />
              {DAYS.map((d, i) => (
                <span key={i} style={{ textAlign: 'center', fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', fontWeight: 500 }}>{d}</span>
              ))}
            </div>
            {heatmap.map((week, wi) => (
              <div key={wi} style={{ display: 'grid', gridTemplateColumns: '40px repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center' }}>W{wi + 1}</span>
                {week.map((val, di) => (
                  <div
                    key={di}
                    title={val > 0 ? `₹${val.toLocaleString('en-IN')}` : 'No spend'}
                    style={{
                      height: '28px',
                      borderRadius: '6px',
                      background: heatColor(val, maxHeat),
                      transition: 'background 0.2s',
                    }}
                  />
                ))}
              </div>
            ))}
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: 'var(--space-2)', fontFamily: 'var(--font-body)' }}>
              Darker = higher spend. Weekends tend to show more transactions.
            </p>
          </div>
        </Card>
      </Section>

      {/* Category breakdown */}
      <Section label="Where your money went">
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {cats.map(({ category, total: amt }) => {
              const prevAmt = prevCats.find(c => c.category === category)?.total ?? 0
              const pct = Math.round((amt / (period === 'current' ? maxCatAmt : prevCats[0]?.total ?? 1)) * 100)
              return (
                <div key={category} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span style={{
                        width: '32px', height: '32px', borderRadius: '8px',
                        background: CATEGORY_BG[category] ?? '#F3F4F6',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '14px', flexShrink: 0,
                      }}>
                        {getCategoryEmoji(category)}
                      </span>
                      <div>
                        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>{category}</p>
                        {period === 'current' && prevAmt > 0 && (
                          <p style={{ fontSize: '11px', color: amt > prevAmt ? 'var(--color-warning)' : 'var(--color-positive)' }}>
                            {amt > prevAmt ? '↑' : '↓'} vs ₹{prevAmt.toLocaleString('en-IN')} in {prevMonthShort}
                          </p>
                        )}
                      </div>
                    </div>
                    <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                      ₹{amt.toLocaleString('en-IN')}
                    </span>
                  </div>
                  {/* Category bar */}
                  <div style={{ height: '6px', background: 'var(--color-surface-3)', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${pct}%`,
                      background: CATEGORY_COLOR[category] ?? '#9CA3AF',
                      borderRadius: '999px',
                      transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </Section>

      {/* Spending patterns */}
      <Section label="Patterns we noticed">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {PATTERNS.map(p => (
            <Card key={p.emoji} hoverable>
              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 'var(--text-2xl)', flexShrink: 0 }}>{p.emoji}</span>
                <div>
                  <p style={{ fontFamily: 'var(--font-headline)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', marginBottom: 'var(--space-1)' }}>{p.title}</p>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>{p.text}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Section>
    </div>
  )
}
