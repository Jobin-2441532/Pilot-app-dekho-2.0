import { useState, useEffect } from 'react'
import { X, Info, ChevronRight } from 'lucide-react'

const POINTS = [
  {
    icon: '📂',
    title: 'Sample Data Period',
    body: 'This app is pre-loaded with CSV transaction data ranging from April 1 – May 3. This data was chosen during the initial setup to power the analytics.',
  },
  {
    icon: '🧪',
    title: 'Prototype — Not Everything Works',
    body: 'This is an early-stage prototype. Some buttons, charts, and sections are still under development and may not respond or display real data.',
  },
  {
    icon: '⏳',
    title: 'Loading May Take Time',
    body: 'The backend runs on free cloud infrastructure. Some sections (AI insights, analytics) may take a few extra seconds to load after first opening.',
  },
  {
    icon: '📊',
    title: 'Assets & Grow Are Static Demos',
    body: 'The Assets and Grow sections are illustrative demos only. Live investment data will depend on future licensing agreements and financial data partnerships.',
  },
  {
    icon: '📱',
    title: 'Install Dekho on Your Phone',
    body: 'To add this app to your home screen: tap the ⋮ three-dot menu in your browser → "Add to Home Screen" → "Install Dekho". It works just like a native app!',
  },
]

interface Props {
  /** When true, shows as a bottom-sheet overlay (from info button). When false, full-screen splash. */
  mode: 'splash' | 'sheet'
  onClose: () => void
}

export default function DisclaimerModal({ mode, onClose }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(t)
  }, [])

  const close = () => {
    setVisible(false)
    setTimeout(onClose, 300)
  }

  if (mode === 'splash') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'var(--bg-base)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
        padding: '0 0 env(safe-area-inset-bottom, 0)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }}>
        {/* Top decorative gradient blob */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '45%',
          background: 'linear-gradient(160deg, #6B3A2A 0%, #9A4F38 60%, transparent 100%)',
          borderRadius: '0 0 48px 48px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
          padding: '40px 24px 48px',
        }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Info size={28} color="#fff" />
          </div>
          <p style={{ fontFamily: 'var(--font-headline)', fontSize: 26, fontWeight: 800, color: '#fff', margin: 0, textAlign: 'center', lineHeight: 1.2 }}>
            Before You Begin
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'rgba(255,255,255,0.75)', margin: 0, textAlign: 'center', maxWidth: 260 }}>
            A few things to know about this prototype
          </p>
        </div>

        {/* Card sheet */}
        <div style={{
          width: '100%', maxWidth: 480,
          background: 'var(--bg-surface)',
          borderRadius: '32px 32px 0 0',
          padding: '28px 24px 32px',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.12)',
          display: 'flex', flexDirection: 'column', gap: 20,
          transform: visible ? 'translateY(0)' : 'translateY(40px)',
          transition: 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-outline-var)', margin: '0 auto 4px' }} />

          {POINTS.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 24, flexShrink: 0, width: 40, height: 40, background: 'var(--bg-surface-high)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {p.icon}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontFamily: 'var(--font-headline)', fontSize: 14, fontWeight: 700, color: 'var(--color-on-surface)', margin: '0 0 3px' }}>
                  {p.title}
                </p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-muted)', margin: 0, lineHeight: 1.5 }}>
                  {p.body}
                </p>
              </div>
            </div>
          ))}

          <button
            onClick={close}
            style={{
              marginTop: 4,
              width: '100%', padding: '15px',
              background: '#6B3A2A',
              color: '#fff',
              border: 'none', borderRadius: 16,
              fontFamily: 'var(--font-headline)', fontSize: 16, fontWeight: 700,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 4px 20px rgba(107,58,42,0.35)',
            }}
          >
            I Understand — Take Me In
            <ChevronRight size={18} />
          </button>

          <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)', textAlign: 'center', margin: 0 }}>
            You can view this again anytime via the ℹ️ icon on the home screen
          </p>
        </div>
      </div>
    )
  }

  // Sheet mode (from info button)
  return (
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.25s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: 'var(--bg-surface)',
          borderRadius: '28px 28px 0 0',
          padding: '20px 24px 40px',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
          display: 'flex', flexDirection: 'column', gap: 18,
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.34,1.2,0.64,1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: '#6B3A2A20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Info size={18} color="#6B3A2A" />
            </div>
            <p style={{ fontFamily: 'var(--font-headline)', fontSize: 18, fontWeight: 700, color: 'var(--color-on-surface)', margin: 0 }}>
              About This App
            </p>
          </div>
          <button onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={20} color="var(--color-muted)" />
          </button>
        </div>

        {POINTS.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ fontSize: 20, flexShrink: 0, width: 38, height: 38, background: 'var(--bg-surface-high)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {p.icon}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: 'var(--font-headline)', fontSize: 13.5, fontWeight: 700, color: 'var(--color-on-surface)', margin: '0 0 2px' }}>
                {p.title}
              </p>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', margin: 0, lineHeight: 1.5 }}>
                {p.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
