import { useEffect, useState } from 'react'
import { Joyride, EventData, STATUS, Step, ACTIONS, EVENTS } from 'react-joyride'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import api from '../../lib/api'

export default function AppTour() {
  const navigate = useNavigate()
  const location = useLocation()
  const [run, setRun] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [hasChecked, setHasChecked] = useState(false)
  const { isChatOpen } = useAppStore()

  useEffect(() => {
    if (hasChecked) return
    if (location.pathname === '/login' || location.pathname === '/register') return

    // Check backend if user has completed tour, bypass frontend caching
    api.get<{has_completed_tour: boolean}>('/api/v1/dashboard/profile', { _t: Date.now() })
      .then(res => {
        setHasChecked(true)
        if (res && res.has_completed_tour === false) {
          // Check if we are not on home, redirect
          if (window.location.pathname !== '/home') {
            navigate('/home')
          }
          // Delay slightly to let the home screen render
          setTimeout(() => setRun(true), 1500)
        }
      })
      .catch(console.error)
  }, [location.pathname, navigate, hasChecked])

  // Automatically advance tour if user clicks the actual UI elements instead of "Next"
  useEffect(() => {
    if (run) {
      if (location.pathname === '/settings' && stepIndex === 3) {
        setStepIndex(4)
      } else if (location.pathname === '/expenses' && stepIndex === 5) {
        setStepIndex(6)
      } else if (location.pathname === '/budgets' && stepIndex === 6) {
        setStepIndex(7) // Final step or advance further
      }
    }
  }, [location.pathname, run, stepIndex])

  const steps: Step[] = [
    {
      target: 'body',
      content: 'Hey there! 👋 Welcome to Dekho! Let’s take a quick spin around your new financial assistant so you can make the most of it.',
      placement: 'center',
      skipBeacon: true,
    },
    {
      target: '#tour-add-transaction',
      content: 'Here’s where the magic happens! ✨ You can add all your expenses here, not just the manual ones.',
      placement: 'top',
    },
    {
      target: '#tour-chatbot',
      content: "Meet the Ask Dekho Chatbot! 🤖 I'll help clarify things beyond just your expenses and assist you in making better financial decisions.",
      placement: 'top',
    },
    {
      target: '#tour-settings',
      content: 'Let’s set things up just for you! Click the Settings gear icon (or hit NEXT) to configure your app.',
      placement: 'bottom',
      blockTargetInteraction: false,
    },
    {
      target: '#tour-notifications',
      content: 'Toggle this on so Dekho can tap you on the shoulder with helpful updates on your budgets and financial insights! 🔔',
      placement: 'bottom',
      blockTargetInteraction: false,
    },
    {
      target: '#tour-theme',
      content: 'Prefer the dark side? 🌙 You can easily toggle between Light and Dark mode here. Click the Expenses tab (or NEXT) when you are done.',
      placement: 'bottom',
      blockTargetInteraction: false,
    },
    {
      target: '#tour-expenses-nav', 
      content: 'All your expense details live right here. 📊 Click the Budgets tab (or NEXT) to keep going!',
      placement: 'top',
      blockTargetInteraction: false,
    },
    {
      target: '#tour-budgets-nav', // We will add this ID to FloatingDock
      content: 'And finally, here’s where you can set up and track your monthly budgets! 🎉',
      placement: 'top',
      blockTargetInteraction: false,
    },
  ]

  const handleJoyrideCallback = (data: EventData) => {
    const { status, type, index, action } = data

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRun(false)
      // Mark as completed in backend
      api.post('/api/v1/dashboard/profile/tour-completed', {})
        .catch(console.error)
      return
    }

    if (type === EVENTS.STEP_AFTER) {
      const nextIndex = index + (action === ACTIONS.PREV ? -1 : 1)
      
      // Programmatic navigation if they clicked the NEXT button instead of the spotlight element
      if (action === ACTIONS.NEXT) {
        if (index === 3) {
          navigate('/settings')
        } else if (index === 5) {
          navigate('/expenses')
        } else if (index === 6) {
          navigate('/budgets')
        }
      }
      
      setStepIndex(nextIndex)
    }
  }

  return (
    <Joyride
      steps={steps}
      run={run}
      stepIndex={stepIndex}
      continuous
      scrollToFirstStep
      onEvent={handleJoyrideCallback}
      options={{
        showProgress: true,
        buttons: ['back', 'close', 'primary', 'skip'],
        primaryColor: 'var(--color-primary, #6C482D)',
        textColor: 'var(--text-primary, #1D1B18)',
        backgroundColor: 'var(--bg-surface-high, #EDE7E1)',
        arrowColor: 'var(--bg-surface-high, #EDE7E1)',
        zIndex: 10000,
        blockTargetInteraction: true, // Default to true, overridden on specific steps
      }}
      styles={{
        options: {
          zIndex: 10000,
        },
        tooltip: {
          fontFamily: 'Inter, system-ui, sans-serif',
          borderRadius: '12px',
        },
        tooltipContainer: {
          textAlign: 'left',
          fontSize: '14px',
          lineHeight: '1.5',
        },
        buttonPrimary: {
          borderRadius: '8px',
          fontWeight: 600,
        },
        buttonBack: {
          marginRight: 10,
          color: 'var(--text-secondary)',
        },
      }}
    />
  )
}
