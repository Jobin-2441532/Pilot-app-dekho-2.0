import { type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import FloatingDock from '../navigation/FloatingDock'
import ChatbotFAB from '../chat/ChatbotFAB'
import AddTransactionFAB from '../transactions/AddTransactionFAB'
import ChatPanel from '../chat/ChatPanel'
import { useTheme } from '../../hooks/useTheme'
import AppTour from '../ui/AppTour'
import styles from './AppShell.module.css'

interface AppShellProps {
  children: ReactNode
}

export default function AppShell({ children }: AppShellProps) {
  // Ensure theme is applied and synced on mount
  useTheme()
  const location = useLocation()
  const isInsightsPage = location.pathname.includes('/insights')

  return (
    <div className={styles.shell}>
      {/* Main scrollable content */}
      <main id="main-scroll-container" className={styles.content}>
        {children}
      </main>

      {!isInsightsPage && (
        <>
          {/* Add Offline Spending FAB — sits above Chatbot FAB */}
          <AddTransactionFAB />

          {/* Global chatbot FAB — always rendered above the dock */}
          <ChatbotFAB />
        </>
      )}

      {/* Chat panel drawer — controlled by Zustand isChatOpen */}
      <ChatPanel />

      {/* Bottom navigation */}
      {!isInsightsPage && <FloatingDock />}

      {/* Interactive App Tour */}
      <AppTour />
    </div>
  )
}

/* ─── Page layout helpers ─── */

interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
  backHref?: string
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className={styles.pageHeader}>
      <div className={styles.pageHeaderText}>
        <h1 className={styles.pageTitle}>{title}</h1>
        {subtitle && <p className={styles.pageSubtitle}>{subtitle}</p>}
      </div>
      <div className={styles.pageHeaderAction}>
        {action}
      </div>
    </div>
  )
}

export function Section({
  label,
  actionLabel,
  actionHref,
  children,
}: {
  label?: string
  actionLabel?: string
  actionHref?: string
  children: ReactNode
}) {
  return (
    <section className={styles.section}>
      {(label || actionLabel) && (
        <div className={styles.sectionRow}>
          {label && <p className={styles.sectionLabel}>{label}</p>}
          {actionLabel && actionHref && (
            <a href={actionHref} className={styles.sectionAction}>{actionLabel}</a>
          )}
        </div>
      )}
      {children}
    </section>
  )
}

export function Grid2({ children }: { children: ReactNode }) {
  return <div className={styles.grid2}>{children}</div>
}

export function Grid3({ children }: { children: ReactNode }) {
  return <div className={styles.grid3}>{children}</div>
}

export function ScrollRow({ children }: { children: ReactNode }) {
  return <div className={styles.scrollRow}>{children}</div>
}
