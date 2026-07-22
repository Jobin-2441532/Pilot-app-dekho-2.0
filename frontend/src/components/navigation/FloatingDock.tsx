import { NavLink } from 'react-router-dom'
import {
  Home,
  Receipt,
  PiggyBank,
  Landmark,
  TrendingUp,
} from 'lucide-react'
import styles from './FloatingDock.module.css'

const navItems = [
  { to: '/budgets',  icon: PiggyBank,   label: 'Budgets'  },
  { to: '/expenses', icon: Receipt,     label: 'Expenses' },
  { to: '/home',     icon: Home,        label: 'Home',    center: true },
  { to: '#grow',     icon: TrendingUp,  label: 'Grow',    comingSoon: true },
]

export default function FloatingDock() {
  return (
    <nav className={styles.dock} aria-label="Main navigation">
      <div className={styles.inner}>
        {navItems.map(({ to, icon: Icon, label, center, comingSoon }) => (
          <NavLink
            id={to === '/budgets' ? 'tour-budgets-nav' : undefined}
            key={to}
            to={to}
            className={({ isActive }) =>
              [styles.item, center ? styles.center : '', isActive && !comingSoon ? styles.active : '']
                .filter(Boolean)
                .join(' ')
            }
            onClick={(e) => {
              if (comingSoon) {
                e.preventDefault()
              }
            }}
            aria-label={label}
            style={{ position: 'relative' }}
          >
            <span className={styles.iconWrap}>
              <Icon size={center ? 22 : 20} strokeWidth={1.75} />
            </span>
            <span className={styles.label}>{label}</span>
            {comingSoon && (
              <span className={styles.comingSoonBadge}>Soon</span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
