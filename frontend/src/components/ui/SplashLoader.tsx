import { motion } from 'framer-motion'
import styles from './SplashLoader.module.css'

export default function SplashLoader() {
  return (
    <motion.div
      className={styles.loaderScreen}
      initial={{ opacity: 1 }}
      exit={{ 
        opacity: 0,
        transition: { duration: 0.4, ease: 'easeInOut' } 
      }}
    >
      <div className={styles.logoColumn}>
        <img 
          src="/logo-nobg.png" 
          alt="Dekho Logo" 
          className={styles.staticLogo} 
        />
        <div className={styles.tagline}>the habit is the plan</div>
      </div>
    </motion.div>
  )
}
