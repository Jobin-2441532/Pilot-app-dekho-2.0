import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  ArrowLeft, 
  Users, 
  Receipt, 
  Coins, 
  TrendingUp, 
  Calendar, 
  User as UserIcon,
  Search,
  CheckCircle,
  AlertCircle
} from 'lucide-react'
import api from "./lib/api";
import Button from './components/ui/Button'

interface AdminStats {
  total_users: number
  total_transactions: number
  total_sms: number
  total_files: number
  volume_debit: number
  volume_credit: number
}

interface UserSummary {
  id: number
  name: string
  email: string
  monthly_budget: number
  goal_type: string
  risk_comfort: string
  financial_stage: string
  created_at: string
  transaction_count: number
  sms_count: number
  file_count: number
}

interface UserDetails {
  user: {
    id: number
    name: string
    email: string
    monthly_budget: number
    goal_type: string
    risk_comfort: string
    financial_stage: string
    created_at: string
    stats?: {
      streak_days: number
      spends_logged: number
      safe_budgets: string
      check_ins: number
      ai_chats: number
    }
  }
  transactions: Array<{
    id: number
    date: string
    merchant: string
    amount: number
    direction: string
    category: string
    payment_mode: string
    confidence: number
    review_status: string
    created_at: string
  }>
  sms_logs: Array<{
    id: number
    raw_text: string
    parsed_status: string
    created_at: string
  }>
  category_breakdown: Array<{
    category: string
    amount: number
  }>
}

interface FeedbackItem {
  id: number
  user_name: string
  user_email: string
  feedback_type: string
  title: string
  description: string
  expected_behavior: string
  device_info: string
  rating: number
  created_at: string
}

export default function AdminPortal() {
  const navigate = useNavigate()
  const [adminUser, setAdminUser] = useState('')
  const [adminPass, setAdminPass] = useState('')
  const [adminError, setAdminError] = useState('')
  const [isAdminAuthorized, setIsAdminAuthorized] = useState(() => {
    return sessionStorage.getItem('dekho_admin_auth') === 'true'
  })

  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<UserSummary[]>([])
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null)
  const [loadingStats, setLoadingStats] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(false)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [txSearch, setTxSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'feedback'>('overview')
  const [detailTab, setDetailTab] = useState<'transactions' | 'sms'>('transactions')

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedUser = adminUser.trim()
    if (trimmedUser === 'kulkarni99' && adminPass === 'iamironman@iloveyou3000') {
      sessionStorage.setItem('dekho_admin_auth', 'true')
      sessionStorage.setItem('dekho_admin_user', trimmedUser)
      sessionStorage.setItem('dekho_admin_pass', adminPass)
      setIsAdminAuthorized(true)
      setAdminError('')
    } else {
      setAdminError('Invalid credentials. Access Denied.')
    }
  }

  // Load overall stats
  useEffect(() => {
    if (!isAdminAuthorized) return
    setLoadingStats(true)
    api.get<AdminStats>('/api/v1/admin/stats')
      .then(res => setStats(res))
      .catch(err => console.error('Failed to fetch admin stats:', err))
      .finally(() => setLoadingStats(false))
  }, [isAdminAuthorized])

  // Load users list
  useEffect(() => {
    if (!isAdminAuthorized) return
    setLoadingUsers(true)
    api.get<UserSummary[]>('/api/v1/admin/users')
      .then(res => setUsers(res))
      .catch(err => console.error('Failed to fetch users:', err))
      .finally(() => setLoadingUsers(false))
  }, [isAdminAuthorized])

  // Load specific user details
  useEffect(() => {
    if (!isAdminAuthorized || selectedUserId === null) {
      setUserDetails(null)
      return
    }
    setLoadingDetails(true)
    api.get<UserDetails>(`/api/v1/admin/users/${selectedUserId}/details`)
      .then(res => {
        setUserDetails(res)
        setTxSearch('')
      })
      .catch(err => console.error('Failed to fetch user details:', err))
      .finally(() => setLoadingDetails(false))
  }, [selectedUserId, isAdminAuthorized])

  // Load feedback list
  useEffect(() => {
    if (!isAdminAuthorized || activeTab !== 'feedback') return
    setLoadingFeedbacks(true)
    api.get<FeedbackItem[]>('/api/v1/admin/feedback')
      .then(res => setFeedbacks(res))
      .catch(err => console.error('Failed to fetch feedback:', err))
      .finally(() => setLoadingFeedbacks(false))
  }, [activeTab, isAdminAuthorized])

  if (!isAdminAuthorized) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--bg-app, #fbf9f6)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        boxSizing: 'border-box',
        fontFamily: 'var(--font-body, system-ui, sans-serif)'
      }}>
        <form onSubmit={handleAdminLogin} style={{
          maxWidth: '400px',
          width: '100%',
          background: 'var(--bg-surface, #ffffff)',
          border: '1px solid var(--bg-surface-high, #eae5dd)',
          borderRadius: '24px',
          padding: '40px 32px',
          boxShadow: '0 12px 32px rgba(139, 99, 71, 0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          boxSizing: 'border-box'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '8px' }}>
            <h1 style={{
              fontFamily: 'var(--font-headline, Georgia, serif)',
              fontSize: '24px',
              fontWeight: 700,
              color: 'var(--color-on-surface, #2d2621)',
              margin: '0 0 8px 0'
            }}>
              Admin Access Required
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--color-muted, #7e7368)', margin: 0 }}>
              Verify credentials to access administrative dashboard
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)' }}>Admin Username</label>
            <input
              type="text"
              required
              value={adminUser}
              onChange={e => setAdminUser(e.target.value)}
              style={{
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1px solid var(--bg-surface-high, #eae5dd)',
                background: 'var(--bg-app, #fbf9f6)',
                fontSize: '14px',
                fontFamily: 'inherit'
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)' }}>Admin Password</label>
            <input
              type="password"
              required
              value={adminPass}
              onChange={e => setAdminPass(e.target.value)}
              style={{
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1px solid var(--bg-surface-high, #eae5dd)',
                background: 'var(--bg-app, #fbf9f6)',
                fontSize: '14px',
                fontFamily: 'inherit'
              }}
            />
          </div>

          {adminError && (
            <p style={{ color: 'var(--color-critical, #b91c1c)', fontSize: '12px', textAlign: 'center', margin: 0, fontWeight: 500 }}>
              {adminError}
            </p>
          )}

          <Button type="submit" fullWidth>
            Verify &amp; Enter
          </Button>

          <button
            type="button"
            onClick={() => navigate('/settings')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-muted, #7e7368)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px',
              fontFamily: 'inherit',
              marginTop: '4px'
            }}
          >
            <ArrowLeft size={14} /> Back to App
          </button>
        </form>
      </div>
    )
  }

  const formatINR = (n: number) => {
    return '₹' + n.toLocaleString('en-IN')
  }

  const filteredUsers = users.filter(u => 
    u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(userSearch.toLowerCase())
  )

  const filteredTxs = userDetails?.transactions.filter(t => 
    t.merchant?.toLowerCase().includes(txSearch.toLowerCase()) ||
    t.category?.toLowerCase().includes(txSearch.toLowerCase())
  ) || []

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-app, #fbf9f6)',
      color: 'var(--color-on-surface, #2d2621)',
      fontFamily: 'var(--font-body, system-ui, sans-serif)',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* ── Top Admin Header ── */}
      <header style={{
        background: 'var(--bg-surface, #ffffff)',
        borderBottom: '1px solid var(--bg-surface-high, #eae5dd)',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            onClick={() => navigate('/settings')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-muted, #7e7368)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px',
              borderRadius: '8px',
              transition: 'background 0.2s'
            }}
            title="Return to Settings"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 style={{
              fontFamily: 'var(--font-headline, Georgia, serif)',
              fontSize: '20px',
              fontWeight: 700,
              margin: 0
            }}>
              Dekho Pilot Admin Portal
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--color-muted, #7e7368)', margin: '2px 0 0 0' }}>
              System administration and user metrics workspace
            </p>
          </div>
        </div>

        {/* Tab Selection */}
        <div style={{
          display: 'flex',
          background: 'var(--bg-app, #fbf9f6)',
          borderRadius: '12px',
          padding: '4px',
          border: '1px solid var(--bg-surface-high, #eae5dd)'
        }}>
          <button
            onClick={() => { setActiveTab('overview'); setSelectedUserId(null) }}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '8px',
              background: activeTab === 'overview' ? 'var(--bg-surface, #ffffff)' : 'transparent',
              color: activeTab === 'overview' ? 'var(--color-primary, #8B6347)' : 'var(--color-muted, #7e7368)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              boxShadow: activeTab === 'overview' ? '0 2px 6px rgba(0,0,0,0.04)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('users')}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '8px',
              background: activeTab === 'users' ? 'var(--bg-surface, #ffffff)' : 'transparent',
              color: activeTab === 'users' ? 'var(--color-primary, #8B6347)' : 'var(--color-muted, #7e7368)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              boxShadow: activeTab === 'users' ? '0 2px 6px rgba(0,0,0,0.04)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            Users Directory
          </button>
          <button
            onClick={() => setActiveTab('feedback')}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '8px',
              background: activeTab === 'feedback' ? 'var(--bg-surface, #ffffff)' : 'transparent',
              color: activeTab === 'feedback' ? 'var(--color-primary, #8B6347)' : 'var(--color-muted, #7e7368)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              boxShadow: activeTab === 'feedback' ? '0 2px 6px rgba(0,0,0,0.04)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            Feedback
          </button>
        </div>
      </header>

      {/* ── Main Workspace ── */}
      <main style={{ padding: '24px', flex: 1, boxSizing: 'border-box', maxWidth: '1440px', width: '100%', margin: '0 auto' }}>
        
        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Stats Cards Row */}
            {loadingStats ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                {[1, 2, 3, 4].map(i => (
                  <div key={i} style={{ height: '110px', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--bg-surface-high)', opacity: 0.6 }} />
                ))}
              </div>
            ) : stats && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px'
              }}>
                <div style={cardStyle}>
                  <div style={cardHeaderStyle}>
                    <span style={statLabelStyle}>Total Pilot Users</span>
                    <Users size={20} color="#8B6347" />
                  </div>
                  <p style={statValueStyle}>{stats.total_users}</p>
                </div>
                
                <div style={cardStyle}>
                  <div style={cardHeaderStyle}>
                    <span style={statLabelStyle}>Total Transactions</span>
                    <Receipt size={20} color="#6C8B47" />
                  </div>
                  <p style={statValueStyle}>{stats.total_transactions}</p>
                </div>

              </div>
            )}

            {/* Ingestion volume detail */}
            {!loadingStats && stats && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '24px'
              }}>
                <div style={boxStyle}>
                  <h3 style={boxTitleStyle}>Debit / Expenditure Volume</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
                    <Coins size={28} color="var(--color-critical, #b91c1c)" />
                    <div>
                      <p style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>{formatINR(stats.volume_debit)}</p>
                      <p style={{ fontSize: '12px', color: 'var(--color-muted)', margin: '2px 0 0 0' }}>Accumulated debit records across all users</p>
                    </div>
                  </div>
                </div>

                <div style={boxStyle}>
                  <h3 style={boxTitleStyle}>Credit Volume</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
                    <TrendingUp size={28} color="#6C8B47" />
                    <div>
                      <p style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>{formatINR(stats.volume_credit)}</p>
                      <p style={{ fontSize: '12px', color: 'var(--color-muted)', margin: '2px 0 0 0' }}>Accumulated credit records across all users</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Pilot Instructions */}
            <div style={boxStyle}>
              <h3 style={boxTitleStyle}>Dekho Pilot Monitoring Instructions</h3>
              <p style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--color-muted)', margin: '12px 0 0 0' }}>
                Use this dashboard to monitor participant actions during testing. When users sign up, they have the option to import pre-bundled bank statements or start with blank profiles. As they type questions in the AI Chatbot or create saving goals and budgets, you will see transaction data counts populate here. 
                <br /><br />
                Go to the <strong>Users Directory</strong> tab to drill down into a user's detailed list of expenses and see category charts.
              </p>
            </div>
          </div>
        )}

        {/* ── USERS DIRECTORY TAB ── */}
        {activeTab === 'users' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Split layout: Users List on left, details on right if selected */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: selectedUserId ? '380px 1fr' : '1fr',
              gap: '24px',
              alignItems: 'start',
              transition: 'grid-template-columns 0.3s ease'
            }}>
              
              {/* Users Column */}
              <div style={boxStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <h3 style={{ ...boxTitleStyle, margin: 0 }}>Active User Profiles ({filteredUsers.length})</h3>
                </div>

                {/* Search Bar */}
                <div style={{
                  position: 'relative',
                  marginBottom: '16px'
                }}>
                  <Search size={16} color="var(--color-muted)" style={{ position: 'absolute', left: '12px', top: '10px' }} />
                  <input
                    type="text"
                    placeholder="Search by name or email..."
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 36px',
                      borderRadius: '8px',
                      border: '1px solid var(--bg-surface-high, #eae5dd)',
                      background: 'var(--bg-app, #fbf9f6)',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>

                {loadingUsers ? (
                  <p style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '24px' }}>Loading directory...</p>
                ) : filteredUsers.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '24px' }}>No users found matching query</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '600px', overflowY: 'auto' }}>
                    {filteredUsers.map(u => {
                      const isSelected = selectedUserId === u.id
                      return (
                        <button
                          key={u.id}
                          onClick={() => setSelectedUserId(u.id)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            background: isSelected ? 'rgba(139, 99, 71, 0.08)' : 'var(--bg-surface)',
                            border: `1px solid ${isSelected ? 'var(--color-primary, #8B6347)' : 'var(--bg-surface-high, #eae5dd)'}`,
                            borderRadius: '12px',
                            padding: '12px 16px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 700, fontSize: '14px' }}>{u.name || 'Anonymous User'}</span>
                            <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>ID: {u.id}</span>
                          </div>
                          <span style={{ fontSize: '12px', color: 'var(--color-muted)', wordBreak: 'break-all' }}>{u.email}</span>
                          
                          <div style={{ display: 'flex', gap: '12px', fontSize: '11px', marginTop: '4px', opacity: 0.8 }}>
                            <span>📊 <strong>{u.transaction_count}</strong> txs</span>
                            <span>💬 <strong>{u.sms_count}</strong> SMS</span>
                            <span>📂 <strong>{u.file_count}</strong> files</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Detail Column */}
              {selectedUserId && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  
                  {loadingDetails || !userDetails ? (
                    <div style={boxStyle}>
                      <p style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '48px' }}>Loading user details...</p>
                    </div>
                  ) : (
                    <>
                      {/* User Profile Overview */}
                      <div style={boxStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                            <div style={{
                              width: '56px',
                              height: '56px',
                              borderRadius: '16px',
                              background: 'rgba(139, 99, 71, 0.1)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--color-primary, #8B6347)'
                            }}>
                              <UserIcon size={24} />
                            </div>
                            <div>
                              <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>{userDetails.user.name}</h2>
                              <p style={{ fontSize: '13px', color: 'var(--color-muted)', margin: '2px 0 0 0' }}>{userDetails.user.email}</p>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
                            <div style={badgeStyle}>
                              Goal: {userDetails.user.goal_type || 'Not Set'}
                            </div>
                            <div style={badgeStyle}>
                              Risk Level: {userDetails.user.risk_comfort || 'Not Set'}
                            </div>
                          </div>
                        </div>

                        {/* Profile metrics grid */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                          gap: '16px',
                          marginTop: '20px',
                          borderTop: '1px solid var(--bg-surface-high, #eae5dd)',
                          paddingTop: '16px'
                        }}>
                          <div>
                            <span style={{ fontSize: '11px', color: 'var(--color-muted)', display: 'block', textTransform: 'uppercase' }}>Financial Stage</span>
                            <span style={{ fontWeight: 600, fontSize: '14px' }}>{userDetails.user.financial_stage || 'Not Set'}</span>
                          </div>
                          <div>
                            <span style={{ fontSize: '11px', color: 'var(--color-muted)', display: 'block', textTransform: 'uppercase' }}>Monthly Budget Target</span>
                            <span style={{ fontWeight: 600, fontSize: '14px' }}>{userDetails.user.monthly_budget ? formatINR(userDetails.user.monthly_budget) : 'Not Set'}</span>
                          </div>
                          <div>
                            <span style={{ fontSize: '11px', color: 'var(--color-muted)', display: 'block', textTransform: 'uppercase' }}>Signup Date</span>
                            <span style={{ fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Calendar size={13} />
                              {userDetails.user.created_at ? new Date(userDetails.user.created_at).toLocaleDateString() : 'N/A'}
                            </span>
                          </div>
                        </div>

                        {/* Gamification and App Stats */}
                        {userDetails.user.stats && (
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(5, 1fr)',
                            gap: '12px',
                            marginTop: '20px',
                            borderTop: '1px solid var(--bg-surface-high, #eae5dd)',
                            paddingTop: '16px',
                            textAlign: 'center'
                          }}>
                            <div>
                              <span style={{ fontSize: '11px', color: 'var(--color-muted)', display: 'block', textTransform: 'uppercase' }}>Mindful Streak</span>
                              <span style={{ fontWeight: 600, fontSize: '16px', color: '#FF6347' }}>🔥 {userDetails.user.stats.streak_days}</span>
                            </div>
                            <div>
                              <span style={{ fontSize: '11px', color: 'var(--color-muted)', display: 'block', textTransform: 'uppercase' }}>Spends Logged</span>
                              <span style={{ fontWeight: 600, fontSize: '16px' }}>{userDetails.user.stats.spends_logged}</span>
                            </div>
                            <div>
                              <span style={{ fontSize: '11px', color: 'var(--color-muted)', display: 'block', textTransform: 'uppercase' }}>Safe Budgets</span>
                              <span style={{ fontWeight: 600, fontSize: '16px' }}>{userDetails.user.stats.safe_budgets}</span>
                            </div>
                            <div>
                              <span style={{ fontSize: '11px', color: 'var(--color-muted)', display: 'block', textTransform: 'uppercase' }}>Check-ins</span>
                              <span style={{ fontWeight: 600, fontSize: '16px' }}>{userDetails.user.stats.check_ins}</span>
                            </div>
                            <div>
                              <span style={{ fontSize: '11px', color: 'var(--color-muted)', display: 'block', textTransform: 'uppercase' }}>AI Chats</span>
                              <span style={{ fontWeight: 600, fontSize: '16px' }}>{userDetails.user.stats.ai_chats}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Spend Breakdown & Data Tabs */}
                      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', alignItems: 'start' }}>
                        
                        {/* Left: Spend Category breakdown */}
                        <div style={boxStyle}>
                          <h3 style={boxTitleStyle}>Expenses by Category</h3>
                          {userDetails.category_breakdown.length === 0 ? (
                            <p style={{ fontSize: '13px', color: 'var(--color-muted)', textAlign: 'center', padding: '16px 0' }}>No spending records found.</p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
                              {userDetails.category_breakdown.map((item, idx) => {
                                const maxAmount = userDetails.category_breakdown[0].amount || 1
                                const percentage = Math.round((item.amount / maxAmount) * 100)
                                return (
                                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                      <span style={{ fontWeight: 600 }}>{item.category}</span>
                                      <span style={{ color: 'var(--color-muted)' }}>{formatINR(item.amount)}</span>
                                    </div>
                                    <div style={{ width: '100%', height: '6px', background: 'var(--bg-app, #fbf9f6)', borderRadius: '3px' }}>
                                      <div style={{ width: `${percentage}%`, height: '100%', background: 'var(--color-primary, #8B6347)', borderRadius: '3px' }} />
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>

                        {/* Right: Data log tables */}
                        <div style={boxStyle}>
                          {/* Inner Tabs */}
                          <div style={{ display: 'flex', borderBottom: '1px solid var(--bg-surface-high, #eae5dd)', marginBottom: '16px', gap: '16px' }}>
                            <button
                              onClick={() => setDetailTab('transactions')}
                              style={{
                                padding: '8px 4px 12px 4px',
                                border: 'none',
                                background: 'none',
                                color: detailTab === 'transactions' ? 'var(--color-primary, #8B6347)' : 'var(--color-muted, #7e7368)',
                                borderBottom: detailTab === 'transactions' ? '2.5px solid var(--color-primary, #8B6347)' : '2.5px solid transparent',
                                fontWeight: 700,
                                fontSize: '13px',
                                cursor: 'pointer'
                              }}
                            >
                              Transactions ({userDetails.transactions.length})
                            </button>
                            <button
                              onClick={() => setDetailTab('sms')}
                              style={{
                                padding: '8px 4px 12px 4px',
                                border: 'none',
                                background: 'none',
                                color: detailTab === 'sms' ? 'var(--color-primary, #8B6347)' : 'var(--color-muted, #7e7368)',
                                borderBottom: detailTab === 'sms' ? '2.5px solid var(--color-primary, #8B6347)' : '2.5px solid transparent',
                                fontWeight: 700,
                                fontSize: '13px',
                                cursor: 'pointer'
                              }}
                            >
                              Raw SMS Logs ({userDetails.sms_logs.length})
                            </button>
                          </div>

                          {/* ── Inner Tab 1: Transactions Table ── */}
                          {detailTab === 'transactions' && (
                            <div>
                              {/* Search Table */}
                              <div style={{ position: 'relative', marginBottom: '12px' }}>
                                <Search size={14} color="var(--color-muted)" style={{ position: 'absolute', left: '10px', top: '8px' }} />
                                <input
                                  type="text"
                                  placeholder="Filter by merchant or category..."
                                  value={txSearch}
                                  onChange={e => setTxSearch(e.target.value)}
                                  style={{
                                    width: '100%',
                                    padding: '6px 10px 6px 30px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--bg-surface-high, #eae5dd)',
                                    background: 'var(--bg-app, #fbf9f6)',
                                    fontSize: '12px',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </div>

                              {filteredTxs.length === 0 ? (
                                <p style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '24px', fontSize: '13px' }}>No transactions recorded.</p>
                              ) : (
                                <div style={{ overflowX: 'auto', maxHeight: '420px', overflowY: 'auto' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                                    <thead>
                                      <tr style={{ borderBottom: '1px solid var(--bg-surface-high, #eae5dd)', color: 'var(--color-muted)' }}>
                                        <th style={{ padding: '8px' }}>Date</th>
                                        <th style={{ padding: '8px' }}>Merchant</th>
                                        <th style={{ padding: '8px' }}>Amount</th>
                                        <th style={{ padding: '8px' }}>Category</th>
                                        <th style={{ padding: '8px' }}>Method</th>
                                        <th style={{ padding: '8px' }}>Confidence</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {filteredTxs.map(t => (
                                        <tr key={t.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.03)', background: t.direction === 'credit' ? 'rgba(108, 139, 71, 0.03)' : 'transparent' }}>
                                          <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{t.date}</td>
                                          <td style={{ padding: '8px', fontWeight: 600 }}>{t.merchant}</td>
                                          <td style={{ padding: '8px', color: t.direction === 'credit' ? '#6C8B47' : 'inherit' }}>
                                            {t.direction === 'credit' ? '+' : '-'}{formatINR(t.amount)}
                                          </td>
                                          <td style={{ padding: '8px' }}>
                                            <span style={{
                                              background: 'var(--bg-app, #fbf9f6)',
                                              padding: '2px 6px',
                                              borderRadius: '4px',
                                              border: '1px solid var(--bg-surface-high, #eae5dd)'
                                            }}>{t.category}</span>
                                          </td>
                                          <td style={{ padding: '8px' }}>{t.payment_mode}</td>
                                          <td style={{ padding: '8px', color: t.confidence >= 0.8 ? '#6C8B47' : '#B45309' }}>
                                            {(t.confidence * 100).toFixed(0)}%
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )}

                          {/* ── Inner Tab 2: SMS logs ── */}
                          {detailTab === 'sms' && (
                            <div>
                              {userDetails.sms_logs.length === 0 ? (
                                <p style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '24px', fontSize: '13px' }}>No SMS messages processed.</p>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto' }}>
                                  {userDetails.sms_logs.map(log => (
                                    <div 
                                      key={log.id} 
                                      style={{
                                        background: 'var(--bg-app, #fbf9f6)',
                                        border: '1px solid var(--bg-surface-high, #eae5dd)',
                                        borderRadius: '8px',
                                        padding: '10px 12px',
                                        fontSize: '12px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '6px'
                                      }}
                                    >
                                      <p style={{ margin: 0, fontFamily: 'monospace', color: '#443f3b', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{log.raw_text}</p>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: 'var(--color-muted)' }}>
                                        <span>Processed: {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}</span>
                                        <span style={{ 
                                          display: 'flex', 
                                          alignItems: 'center', 
                                          gap: '4px',
                                          fontWeight: 600,
                                          color: log.parsed_status === 'processed' ? '#6C8B47' : '#B45309'
                                        }}>
                                          {log.parsed_status === 'processed' ? <CheckCircle size={10} /> : <AlertCircle size={10} />}
                                          {log.parsed_status}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {/* ── FEEDBACK TAB ── */}
        {activeTab === 'feedback' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700 }}>User Feedback & Support</h2>
            </div>

            {loadingFeedbacks ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)' }}>Loading feedback...</div>
            ) : (
              <div style={{
                background: 'var(--bg-surface)',
                borderRadius: '16px',
                border: '1px solid var(--bg-surface-high)',
                overflow: 'hidden'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--bg-surface-high)' }}>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: 'var(--color-muted)', fontWeight: 600 }}>Date</th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: 'var(--color-muted)', fontWeight: 600 }}>User</th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: 'var(--color-muted)', fontWeight: 600 }}>Type</th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: 'var(--color-muted)', fontWeight: 600 }}>Title</th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: 'var(--color-muted)', fontWeight: 600 }}>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedbacks.map(fb => (
                      <tr key={fb.id} style={{ borderBottom: '1px solid var(--bg-surface-high)' }}>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          {new Date(fb.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 500 }}>{fb.user_name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>{fb.user_email}</div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: 
                              fb.feedback_type === 'bug' ? '#fee2e2' :
                              fb.feedback_type === 'feature' ? '#fef3c7' :
                              fb.feedback_type === 'general' ? '#e0e7ff' : '#dcfce7',
                            color:
                              fb.feedback_type === 'bug' ? '#991b1b' :
                              fb.feedback_type === 'feature' ? '#92400e' :
                              fb.feedback_type === 'general' ? '#3730a3' : '#166534'
                          }}>
                            {fb.feedback_type.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 500 }}>
                          {fb.title || '-'}
                          {fb.rating && <span style={{ marginLeft: '8px', color: '#eab308' }}>{'★'.repeat(fb.rating)}</span>}
                        </td>
                        <td style={{ padding: '12px 16px', maxWidth: '300px' }}>
                          <div style={{ whiteSpace: 'pre-wrap', marginBottom: fb.expected_behavior ? '8px' : '0' }}>{fb.description}</div>
                          {fb.expected_behavior && (
                            <div style={{ fontSize: '11px', background: 'var(--bg-app)', padding: '6px', borderRadius: '4px' }}>
                              <strong>Expected:</strong> {fb.expected_behavior}
                            </div>
                          )}
                          {fb.device_info && (
                            <div style={{ fontSize: '10px', color: 'var(--color-muted)', marginTop: '4px' }}>
                              {fb.device_info}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {feedbacks.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)' }}>
                          No feedback found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}

// ── CSS Style Mappings ──

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-surface, #ffffff)',
  border: '1px solid var(--bg-surface-high, #eae5dd)',
  borderRadius: '16px',
  padding: '20px',
  boxShadow: '0 4px 16px rgba(139, 99, 71, 0.02)',
  boxSizing: 'border-box'
}

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '10px'
}

const statLabelStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 700,
  color: 'var(--color-muted, #7e7368)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em'
}

const statValueStyle: React.CSSProperties = {
  fontSize: '32px',
  fontWeight: 700,
  margin: 0,
  color: 'var(--color-on-surface, #2d2621)'
}

const boxStyle: React.CSSProperties = {
  background: 'var(--bg-surface, #ffffff)',
  border: '1px solid var(--bg-surface-high, #eae5dd)',
  borderRadius: '16px',
  padding: '24px',
  boxSizing: 'border-box'
}

const boxTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-headline, Georgia, serif)',
  fontSize: '16px',
  fontWeight: 700,
  margin: '0 0 16px 0',
  color: 'var(--color-on-surface, #2d2621)'
}

const badgeStyle: React.CSSProperties = {
  background: 'var(--bg-app, #fbf9f6)',
  border: '1px solid var(--bg-surface-high, #eae5dd)',
  borderRadius: '20px',
  padding: '4px 10px',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--color-muted, #7e7368)'
}
