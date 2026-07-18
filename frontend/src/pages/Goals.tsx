import { useState, useEffect } from 'react'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import ProgressBar from '../components/ui/ProgressBar'
import MetricBlock from '../components/ui/MetricBlock'
import Chip from '../components/ui/Chip'
import FloatingInput from '../components/ui/FloatingInput'
import { PageHeader, Section, Grid2 } from '../components/layout/AppShell'
import { SkeletonCard, ErrorState } from '../components/ui/LoadingState'
import GlobalLoader from '../components/ui/GlobalLoader'
import { api } from '../lib/api'
import { BUDGETS, CATEGORY_BG, CATEGORY_COLOR, type SavingsGoal } from '../data/mockData'
import { useCategoryEmoji } from '../utils/categoryUtils'
import { Plus, X } from 'lucide-react'

export default function Goals() {
  const getCategoryEmoji = useCategoryEmoji()
  const [showForm, setShowForm] = useState(false)
  const [goalName, setGoalName] = useState('')
  const [goalTarget, setGoalTarget] = useState('')

  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get<SavingsGoal[]>('/api/goals')
      .then(setGoals)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const totalSaved = goals.reduce((s, g) => s + g.currentAmount, 0)
  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0)

  if (loading) return <GlobalLoader />

  if (error) return (
    <div>
      <PageHeader title="Goals & Budget" subtitle="Track your savings and spending limits" />
      <ErrorState message={error} />
    </div>
  )
  return (
    <div>
      <PageHeader
        title="Goals & Budget"
        subtitle="Track your savings and spending limits"
        action={
          <Button size="sm" onClick={() => setShowForm(v => !v)}>
            New goal
          </Button>
        }
      />

      {/* Add Goal Form */}
      {showForm && (
        <Section>
          <Card variant="elevated">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
              <p style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: 'var(--text-base)', color: 'var(--color-text-primary)' }}>Create a savings goal</p>
              <button
                onClick={() => setShowForm(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex' }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <FloatingInput
                label="Goal name"
                value={goalName}
                onChange={e => setGoalName(e.target.value)}
                helper="e.g. Emergency fund, Travel to Goa, New phone"
              />
              <FloatingInput
                label="Target amount (₹)"
                type="number"
                value={goalTarget}
                onChange={e => setGoalTarget(e.target.value)}
              />
              <FloatingInput label="Deadline (optional)" type="month" />
              <Button fullWidth onClick={() => { setShowForm(false); setGoalName(''); setGoalTarget('') }}>
                Save goal
              </Button>
            </div>
          </Card>
        </Section>
      )}

      {/* Goals summary */}
      <Section label="All goals">
        <Card variant="brand" padding="spacious" style={{ marginBottom: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
            <MetricBlock label="Total saved" value={totalSaved} size="md" inverted />
            <MetricBlock label="Total target" value={totalTarget} size="md" inverted />
          </div>
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.15)', margin: 'var(--space-4) 0' }} />
          <ProgressBar
            label="Overall progress"
            current={totalSaved}
            target={totalTarget}
            color="positive"
            height="thick"
            showPercentage
          />
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {goals.map(goal => {
            const pct = Math.round((goal.currentAmount / goal.targetAmount) * 100)
            const remaining = goal.targetAmount - goal.currentAmount
            const deadline = new Date(goal.deadline)
            const months = Math.max(1, Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)))
            const needed = Math.ceil(remaining / months)

            return (
              <Card key={goal.id} hoverable>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  {/* Goal header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <span style={{
                        width: '48px', height: '48px', borderRadius: '12px',
                        background: 'var(--color-surface-2)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0,
                      }}>
                        {goal.emoji}
                      </span>
                      <div>
                        <p style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: 'var(--text-base)', color: 'var(--color-text-primary)' }}>{goal.name}</p>
                        <p style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                          Due {deadline.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <Chip variant={pct >= 75 ? 'positive' : pct >= 40 ? 'filter' : 'warning'}>
                      {pct}%
                    </Chip>
                  </div>

                  <ProgressBar
                    current={goal.currentAmount}
                    target={goal.targetAmount}
                    color={pct >= 75 ? 'positive' : 'brand'}
                    height="thick"
                  />

                  {/* Stats row */}
                  <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                    <div>
                      <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>SAVED</p>
                      <p style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>₹{goal.currentAmount.toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>TARGET</p>
                      <p style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>₹{goal.targetAmount.toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>NEEDED/MONTH</p>
                      <p style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-brand)' }}>₹{needed.toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      </Section>

      {/* Budget overview */}
      <Section label="Monthly budget">
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            {BUDGETS.map(b => {
              const over = b.spent > b.limit
              return (
                <div key={b.category} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span style={{
                        width: '28px', height: '28px', borderRadius: '7px',
                        background: CATEGORY_BG[b.category] ?? '#F3F4F6',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px',
                      }}>
                        {getCategoryEmoji(b.category)}
                      </span>
                      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>{b.category}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: 'var(--text-xs)', color: over ? 'var(--color-negative)' : 'var(--color-text-primary)' }}>
                        ₹{b.spent.toLocaleString('en-IN')}
                      </span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>/ ₹{b.limit.toLocaleString('en-IN')}</span>
                      {over && <Chip variant="negative">Over</Chip>}
                    </div>
                  </div>
                  <ProgressBar
                    current={b.spent}
                    target={b.limit}
                    color={over ? 'negative' : b.spent / b.limit > 0.8 ? 'warning' : 'brand'}
                    height="medium"
                  />
                </div>
              )
            })}
          </div>
        </Card>
      </Section>
    </div>
  )
}
