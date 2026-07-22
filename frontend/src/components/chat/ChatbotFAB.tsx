import { MessageCircle, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../../store/appStore'
import styles from './ChatbotFAB.module.css'

export default function ChatbotFAB() {
  const { isChatOpen, toggleChat } = useAppStore()

  return (
    <div className={styles.wrapper}>
      <AnimatePresence mode="wait">
        <motion.button
          id="tour-chatbot"
          key={isChatOpen ? 'close' : 'open'}
          className={`${styles.fab} ${isChatOpen ? styles.open : ''}`}
          onClick={toggleChat}
          aria-label={isChatOpen ? 'Close chat' : 'Open Ask Dekho'}
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.7, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
          whileTap={{ scale: 0.92 }}
        >
          {isChatOpen
            ? <X size={22} strokeWidth={2} />
            : <MessageCircle size={22} strokeWidth={1.75} />
          }
        </motion.button>
      </AnimatePresence>

      {/* Ripple pulse when closed — draws user attention */}
      {!isChatOpen && (
        <span className={styles.pulse} aria-hidden="true" />
      )}
    </div>
  )
}
