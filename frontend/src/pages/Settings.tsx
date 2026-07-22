import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Moon, Sun, ChevronRight, User, LogOut } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import { useState, useEffect } from 'react'
import api from '../lib/api'
import styles from './Settings.module.css'

import { subscribeUserToPush, unsubscribeUserFromPush } from '../services/pushService'

export default function Settings() {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [profile, setProfile] = useState<{ name: string, email: string }>({ name: 'User', email: '' })
  const [pushEnabled, setPushEnabled] = useState(typeof Notification !== 'undefined' && Notification.permission === 'granted')

  useEffect(() => {
    api.get<any>('/api/v1/dashboard/profile')
      .then(res => {
        if (res) {
          setProfile({
            name: res.fullName || res.name || 'User',
            email: res.email || ''
          })
        }
      })
      .catch(() => {})
  }, [])

  const togglePush = async () => {
    if (pushEnabled) {
      try {
        await unsubscribeUserFromPush()
        setPushEnabled(false)
      } catch (e: any) {
        console.error(e)
        alert(`Could not disable push notifications: ${e.message}`)
      }
    } else {
      try {
        await subscribeUserToPush()
        setPushEnabled(true)
      } catch (e: any) {
        console.error(e)
        alert(`Could not enable push notifications: ${e.message}`)
      }
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft size={20} strokeWidth={1.75} />
        </button>
        <p className={styles.headerTitle}>Settings</p>
        <div style={{ width: 36 }} />
      </div>

      <div className={styles.px}>
        <div className={styles.profileSection}>
          <div className={styles.avatar}>
            <User size={32} />
          </div>
          <div>
            <h2 className={styles.userName}>{profile.name}</h2>
            {profile.email && <p className={styles.userPhone}>{profile.email}</p>}
          </div>
        </div>
      </div>

      <div className={styles.px}>
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Preferences</p>
          <div className={styles.card}>
            <div id="tour-theme" className={styles.row}>
              <div className={styles.rowLeft}>
                {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
                <span>Dark Mode</span>
              </div>
              <label className={styles.switch}>
                <input type="checkbox" checked={theme === 'dark'} onChange={toggleTheme} />
                <span className={styles.slider}></span>
              </label>
            </div>
            <div style={{ height: '1px', background: 'var(--bg-surface-high, #eae5dd)', margin: '0 16px', opacity: 0.5 }} />
            <div id="tour-notifications" className={styles.row}>
              <div className={styles.rowLeft}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
                <span>Push Notifications</span>
              </div>
              <label className={styles.switch}>
                <input 
                  type="checkbox" 
                  checked={pushEnabled} 
                  onChange={togglePush} 
                />
                <span className={styles.slider}></span>
              </label>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <p className={styles.sectionTitle}>Highlights</p>
          <div className={styles.card}>
            <div className={styles.rowBtn} style={{ cursor: 'default' }}>
              <div className={styles.rowLeft}>
                <span>Monthly Wrap</span>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--color-primary)', background: 'var(--color-primary-bg)', padding: '2px 8px', borderRadius: '12px' }}>Coming soon</span>
            </div>

          </div>
        </div>

        <div className={styles.section} style={{ marginTop: 'var(--space-6)' }}>
          <p className={styles.sectionTitle}>Support</p>
          <div className={styles.card}>
            <button className={styles.rowBtn} onClick={() => navigate('/settings/feedback')}>
              <div className={styles.rowLeft}>
                <span>Feedback & Support</span>
              </div>
              <ChevronRight size={16} color="var(--text-tertiary)" />
            </button>
          </div>
        </div>

        <div className={styles.section} style={{ marginTop: 'var(--space-6)' }}>
          <div className={styles.card}>
            <button className={styles.rowBtn} onClick={() => {
              localStorage.clear();
              navigate('/login');
            }} style={{ color: 'var(--color-negative)' }}>
              <div className={styles.rowLeft}>
                <LogOut size={20} />
                <span>Sign Out</span>
              </div>
            </button>
          </div>
        </div>

        <div className={styles.versionInfo}>
          <p>Dekho v1.0.0</p>
        </div>
      </div>
    </div>
  )
}
