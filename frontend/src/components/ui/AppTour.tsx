import { useEffect, useState } from 'react'
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import api from '../../lib/api'

export default function AppTour() {
  const navigate = useNavigate()
  const location = useLocation()
  const [run, setRun] = useState(false)
  const { isChatOpen } = useAppStore()

  useEffect(() => {
    // Only check if we are authenticated and not on login page
    if (location.pathname === '/login' || location.pathname === '/register') return

    // Check backend if user has completed tour
    api.get<{has_completed_tour: boolean}>('/api/v1/dashboard/profile')
      .then(res => {
        if (res && res.has_completed_tour === false) {
          // If on home, start tour immediately. Else, let's navigate to home to start.
          if (location.pathname !== '/home') {
            navigate('/home')
          }
          setRun(true)
        }
      })
      .catch(console.error)
  }, [location.pathname, navigate])

  const steps: Step[] = [
    {
      target: 'body',
      content: 'Welcome to Dekho! Let us take a quick tour to help you get started with your new financial assistant.',
      placement: 'center',
      disableBeacon: true,
    },
    {
      target: '#tour-add-transaction',
      content: 'Tap here to quickly add any offline transaction like cash spent or received.',
      placement: 'top',
    },
    {
      target: '#tour-chatbot',
      content: 'This is the Ask Dekho Chatbot. You can chat with it to ask any financial question, log expenses, or get personalized advice!',
      placement: 'top',
    },
    {
      target: '#tour-settings',
      content: 'Let us head over to Settings to configure your app.',
      placement: 'bottom',
    },
    {
      target: '#tour-notifications',
      content: 'Please enable Push Notifications so Dekho can proactively update you on your budgets and financial insights! (This is highly recommended)',
      placement: 'bottom',
    },
    {
      target: '#tour-theme',
      content: 'You can easily toggle between Light and Dark mode here.',
      placement: 'bottom',
    },
    {
      target: '#tour-budgets-nav', // We will add this ID to FloatingDock
      content: 'Finally, tap here to visit the Budgets tab where you can set up your monthly budgets!',
      placement: 'top',
    },
  ]

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status, type, index, action } = data

    if (type === 'step:after' && action === 'next') {
      // Cross-page navigation handling
      if (index === 2) {
        // Going from home to settings
        navigate('/settings')
      }
      if (index === 5) {
        // Going from settings to budgets or home (to show dock)
        navigate('/home')
      }
    }

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRun(false)
      // Mark as completed in backend
      api.post('/api/v1/dashboard/profile/tour-completed', {})
        .catch(console.error)
    }
  }

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      scrollToFirstStep
      showProgress
      showSkipButton
      callback={handleJoyrideCallback}
      styles={{
        options: {
          primaryColor: '#000000',
          textColor: '#333333',
          backgroundColor: '#ffffff',
          zIndex: 10000,
        },
        tooltipContainer: {
          textAlign: 'left',
        },
        buttonNext: {
          backgroundColor: 'var(--color-primary)',
        },
        buttonBack: {
          marginRight: 10,
        },
      }}
    />
  )
}
