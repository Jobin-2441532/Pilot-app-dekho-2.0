import { motion } from 'framer-motion'
import styles from './SplashLoader.module.css'

export default function SplashLoader() {
  return (
    <motion.div
      className={styles.loaderScreen}
      initial={{ opacity: 1 }}
      exit={{ 
        opacity: 0,
        transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } 
      }}
    >
      <div className={styles.logoColumn}>
        <motion.div 
          className={styles.logoWrap}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <svg viewBox="0 0 400 400" width="220" height="220" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="walnutGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#5C3A21" />
                <stop offset="100%" stopColor="#B8834E" />
              </linearGradient>
            </defs>

            {/* Outer D arc */}
            <path d="M 175 90
                     L 175 310
                     C 260 310, 320 265, 320 200
                     C 320 135, 260 90, 175 90 Z"
                  fill="none" stroke="url(#walnutGradient)" strokeWidth="26" strokeLinejoin="round"/>
            
            {/* Inner D arc */}
            <path d="M 195 130
                     L 195 270
                     C 245 270, 280 240, 280 200
                     C 280 160, 245 130, 195 130 Z"
                  fill="none" stroke="url(#walnutGradient)" strokeWidth="14" strokeLinejoin="round"/>

            {/* Vertical spine */}
            <rect x="163" y="90" width="24" height="220" fill="url(#walnutGradient)" rx="4"/>

            {/* Top-left flourish */}
            <rect x="110" y="140" width="14" height="70" fill="url(#walnutGradient)" rx="4"/>
            <rect x="88" y="192" width="90" height="16" fill="url(#walnutGradient)" rx="4"/>

            {/* Bottom-left foot */}
            <rect x="118" y="255" width="60" height="16" fill="url(#walnutGradient)" rx="4"/>

            {/* Center dot */}
            <circle cx="223" cy="200" r="15" fill="#5C3A21"/>
          </svg>
        </motion.div>
        
        <motion.div 
          className={styles.tagline}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          the habit is the plan
        </motion.div>
      </div>
    </motion.div>
  )
}
