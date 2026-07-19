import { motion, AnimatePresence } from 'framer-motion'

interface CustomDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel?: () => void
  isDestructive?: boolean
}

export default function CustomDialog({
  isOpen,
  title,
  message,
  confirmText = 'OK',
  cancelText,
  onConfirm,
  onCancel,
  isDestructive = false
}: CustomDialogProps) {
  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div style={{ position: 'fixed', inset: 0, zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ position: 'absolute', inset: 0, background: 'rgba(0, 0, 0, 0.4)' }}
          onClick={onCancel || onConfirm}
        />
        
        {/* Dialog Content */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', duration: 0.3 }}
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '340px',
            background: 'var(--bg-base, #f9f6f0)',
            borderRadius: '16px',
            padding: '20px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            color: '#4a4238',
            fontFamily: 'inherit'
          }}
        >
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#4a4238' }}>{title}</h3>
          <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, color: '#7e7368' }}>{message}</p>
          
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            {cancelText && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid var(--color-outline-var, #eae5dd)',
                  background: 'transparent',
                  color: '#7e7368',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                {cancelText}
              </button>
            )}
            <button
              type="button"
              onClick={onConfirm}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '10px',
                border: 'none',
                background: isDestructive ? '#ff4d4f' : 'var(--color-primary, #6b4e71)',
                color: 'white',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              {confirmText}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
