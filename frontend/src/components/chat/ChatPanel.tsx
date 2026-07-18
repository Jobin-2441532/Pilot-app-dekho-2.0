import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, Sparkles, Trash2, Menu } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { api } from '../../lib/api'
import ChatBubble from './ChatBubble'
import ChatHistorySidebar from './ChatHistorySidebar'
import styles from './ChatPanel.module.css'

interface Message {
  role: 'user' | 'assistant'
  content: string
  id?: string
  timestamp?: string
}

const WELCOME: Message = {
  role: 'assistant',
  content:
    "Hi, I'm Ask Dekho. I can help you understand your spending, track your savings goals, or answer questions about your finances. What's on your mind?",
  id: 'welcome',
  timestamp: new Date().toISOString(),
}

const API_URL = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000`

interface Goal {
  id: number
  name: string
  current_amount: number
  target_amount: number
}

interface DisambiguationState {
  type: 'ADD_TO_GOAL'
  amount: number
  options: Goal[]
}

export default function ChatPanel() {
  const { isChatOpen, closeChat } = useAppStore()
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [userGoals, setUserGoals] = useState<Goal[]>([])
  const [disambiguation, setDisambiguation] = useState<DisambiguationState | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  }

  const [sessionId, setSessionId] = useState<string>(() => generateId())
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  // Phase 6: Load chat history from DB when panel opens
  useEffect(() => {
    if (!isChatOpen) return

    import('posthog-js').then((ph) => {
      ph.default.capture('chatbot_opened', { platform: 'web' })
    })

    // Fetch goals for disambiguation
    api.get<any[]>('/api/v1/dashboard/goals')
      .then(rows => setUserGoals(
        rows.map(r => ({
          id: typeof r.id === 'string' ? parseInt(r.id.replace('g', '')) : r.id,
          name: r.name,
          current_amount: r.currentAmount ?? r.current_amount ?? 0,
          target_amount: r.targetAmount ?? r.target_amount ?? 0,
        }))
      ))
      .catch(() => setUserGoals([]))

    // Fetch persisted session history
    const loadCurrentSession = async () => {
      try {
        const rows = await api.get<any[]>(`/api/chat/sessions/${sessionId}`)
        if (rows.length === 0) {
          setMessages([WELCOME])
        } else {
          setMessages(rows.map(r => ({
            role: r.role as 'user' | 'assistant',
            content: r.content,
            id: r.id || generateId(),
            timestamp: r.timestamp,
          })))
        }
      } catch {
        setMessages([WELCOME])
      }
    }
    
    // We only load if it's an existing session. If it's a brand new one (messages.length === 1), we don't need to fetch.
    if (messages.length === 1 && messages[0].id === 'welcome') {
      // Try to load the latest session if possible
      api.get<any[]>('/api/chat/sessions').then(sessions => {
        if (sessions.length > 0) {
          handleSelectSession(sessions[0].session_id)
        }
      }).catch(() => {})
    } else {
      loadCurrentSession()
    }
  }, [isChatOpen])

  const handleSelectSession = async (newSessionId: string) => {
    setSessionId(newSessionId)
    setIsLoading(true)
    try {
      const rows = await api.get<any[]>(`/api/chat/sessions/${newSessionId}`)
      if (rows.length === 0) {
        setMessages([WELCOME])
      } else {
        setMessages(rows.map(r => ({
          role: r.role as 'user' | 'assistant',
          content: r.content,
          id: r.id || generateId(),
          timestamp: r.timestamp,
        })))
      }
    } catch {
      setMessages([WELCOME])
    } finally {
      setIsLoading(false)
    }
  }

  const handleNewChat = () => {
    setSessionId(generateId())
    setMessages([WELCOME])
    setDisambiguation(null)
  }

  // Scroll to bottom on new message
  useEffect(() => {
    if (isChatOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isChatOpen])

  // Focus input when panel opens
  useEffect(() => {
    if (isChatOpen) {
      setTimeout(() => inputRef.current?.focus(), 350)
    }
  }, [isChatOpen])

  // ---------------------------------------------------------------------------
  // Frontend intent parser — extracts goal info from user's own message.
  // Phase 3: Guarantees DB saves even if AI tags fail.
  // Phase 4: Uses real goal list to detect ambiguous references.
  // ---------------------------------------------------------------------------
  const parseGoalIntent = (text: string): { action: 'ADD_GOAL' | 'ADD_TO_GOAL' | null; goalName: string; amount: number; isAmbiguous: boolean } => {
    const lower = text.toLowerCase()

    const hasGoalIntent = ['save', 'saving', 'goal', 'target', 'buy', 'purchase', 'fund'].some(kw => lower.includes(kw))
    const hasCreateIntent = ['create', 'set', 'add', 'make', 'start', 'new', 'help me', 'i want to', 'i need to', 'plan'].some(kw => lower.includes(kw))
    const hasAddIntent = ['add', 'put', 'contribute', 'transfer'].some(kw => lower.includes(kw)) && lower.includes('goal')

    // Detect ADD_TO_GOAL first (more specific)
    if (hasAddIntent) {
      const amountMatch = lower.match(/(\d[\d,]*(?:\.\d+)?)\s*k\b/) || lower.match(/(\d[\d,]*(?:\.\d+)?)/)
      const rawAmount = amountMatch ? parseFloat(amountMatch[1].replace(',', '')) : 0
      const amount = lower.includes('k') && rawAmount < 1000 ? rawAmount * 1000 : rawAmount
      const goalNameMatch = lower.match(/(?:to|into|for)\s+(?:my\s+)?([a-z][a-z\s]{2,25}?)\s*(?:goal|fund|target|$)/)
      const rawGoalName = goalNameMatch ? goalNameMatch[1].trim() : ''

      // Phase 4: Check ambiguity against real goal list
      if (rawGoalName && userGoals.length > 0) {
        const matches = userGoals.filter(g => g.name.toLowerCase().includes(rawGoalName) || rawGoalName.includes(g.name.toLowerCase()))
        if (matches.length > 1) {
          // Multiple goals match — ambiguous
          return { action: 'ADD_TO_GOAL', goalName: rawGoalName, amount, isAmbiguous: true }
        }
      }

      // No name in message + multiple goals = ambiguous
      if (!rawGoalName && userGoals.length > 1) {
        return { action: 'ADD_TO_GOAL', goalName: '', amount, isAmbiguous: true }
      }

      const goalName = rawGoalName.replace(/\b\w/g, c => c.toUpperCase())
      if (amount > 0 && goalName) return { action: 'ADD_TO_GOAL', goalName, amount, isAmbiguous: false }
    }

    // Detect ADD_GOAL
    if (hasGoalIntent && hasCreateIntent) {
      // Extract amount — prefer lakh, then k, then largest number > 500
      let amount = 0
      const lakhMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lakhs)\b/)
      const kMatch = lower.match(/(\d+(?:\.\d+)?)\s*k\b/)
      if (lakhMatch) {
        amount = parseFloat(lakhMatch[1]) * 100000
      } else if (kMatch) {
        amount = parseFloat(kMatch[1]) * 1000
      } else {
        const allNums = [...lower.matchAll(/\b(\d[\d,]*)\b/g)]
          .map(m => parseFloat(m[1].replace(',', '')))
          .filter(n => n > 500)
        amount = allNums.length ? Math.max(...allNums) : 0
      }

      // Extract goal name
      let goalName = ''
      const namePatterns = [
        /for\s+(?:a|an|the|my)\s+([a-z][a-z\s]{2,25}?)(?:\s+(?:for|in|over|within|by|target|goal)|$)/,
        /to\s+(?:buy|get|purchase)\s+(?:a|an|the|my)?\s*([a-z][a-z\s]{2,25}?)(?:\s+(?:for|in|over|within|by)|$)/,
        /saving\s+for\s+(?:a|an|the|my)?\s*([a-z][a-z\s]{2,25}?)(?:\s+(?:for|in|over|within|by)|$)/,
      ]
      for (const pat of namePatterns) {
        const m = lower.match(pat)
        if (m) {
          const candidate = m[1].trim().replace(/\s+/g, ' ')
          if (!['goal', 'saving', 'savings', 'money', 'fund', 'target', 'months', 'years'].includes(candidate)) {
            goalName = candidate.replace(/\b\w/g, c => c.toUpperCase())
            break
          }
        }
      }

      // Fallback: find a capitalised noun in original text
      if (!goalName) {
        const words = text.split(/\s+/)
        for (const word of words) {
          if (word[0]?.toUpperCase() === word[0] && word.length > 3 &&
              !['Create', 'Goal', 'Help', 'Save', 'Month', 'Year', 'The', 'For', 'Next', 'That', 'This'].includes(word)) {
            goalName = word
            break
          }
        }
      }

      if (amount > 0 && goalName) return { action: 'ADD_GOAL', goalName, amount, isAmbiguous: false }
    }

    return { action: null, goalName: '', amount: 0, isAmbiguous: false }
  }


  const sendMessage = async () => {
    const text = input.trim()
    if (!text || isLoading) return

    const userMsg: Message = {
      role: 'user',
      content: text,
      id: generateId(),
      timestamp: new Date().toISOString(),
    }

    // Parse intent from user's message BEFORE sending to AI
    const intent = parseGoalIntent(text)

    // Phase 4: If ambiguous ADD_TO_GOAL, pause and ask which goal before doing anything
    if (intent.action === 'ADD_TO_GOAL' && intent.isAmbiguous && userGoals.length > 0) {
      setMessages(prev => [...prev, userMsg])
      setInput('')
      setDisambiguation({ type: 'ADD_TO_GOAL', amount: intent.amount, options: userGoals })
      return
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    import('posthog-js').then((ph) => {
      ph.default.capture('chatbot_message_sent', { 
        platform: 'web', 
        intent: intent.action 
      })
    })

    try {
      const botMsgId = generateId()
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '',
        id: botMsgId,
        timestamp: new Date().toISOString(),
      }])

      const token = localStorage.getItem('dekho_token')
      const res = await fetch(`${API_URL}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        // We pass empty user_id if token is used, or a dummy if testing
        body: JSON.stringify({ user_id: 'user_1', message: text, session_id: sessionId }),
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      let fullText = ''
      if (res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          
          const events = buffer.split('\n\n')
          buffer = events.pop() ?? ''

          for (const eventStr of events) {
            if (!eventStr.trim()) continue
            const lines = eventStr.split('\n')
            let evType = 'message'
            let evData = ''
            for (const line of lines) {
              if (line.startsWith('event: ')) evType = line.slice(7).trim()
              if (line.startsWith('data: ')) evData = line.slice(6).trim()
            }
            if (!evData) continue
            try {
              const payload = JSON.parse(evData)
              if (evType === 'token') {
                fullText += (payload.text ?? '')
                setMessages(prev => {
                  const newArr = [...prev]
                  const last = newArr[newArr.length - 1]
                  if (last && last.role === 'assistant' && last.id === botMsgId) {
                    last.content = fullText
                  }
                  return newArr
                })
              } else if (evType === 'chart_data') {
                // If chart data is returned, we can format it as a macro for ChatBubble to parse
                // The ChatBubble parses [UI: CHART | type | title | label:value,label:value]
                let type = payload.type === 'pie' ? 'Pie' : 'Bar'
                let title = payload.title
                let dataStr = ''
                
                if (payload.type === 'progress' && payload.data && payload.data.length > 0) {
                  type = 'Pie'
                  const goal = payload.data[0]
                  const saved = goal.current || 0
                  const target = goal.target || 0
                  const remaining = Math.max(target - saved, 0)
                  dataStr = `Saved:${saved},Remaining:${remaining}`
                  title = `${goal.name || 'Goal'} Progress`
                } else {
                  dataStr = (payload.data || []).map((d: any) => {
                    const label = d.date || d.name || d.category || 'Item';
                    const val = d.value || d.thisMonth || d.spend || 0;
                    return `${label}:${val}`;
                  }).join(',')
                }
                
                const macro = `\n[UI: CHART | ${type} | ${title} | ${dataStr}]`
                fullText += macro
                setMessages(prev => {
                  const newArr = [...prev]
                  const last = newArr[newArr.length - 1]
                  if (last && last.role === 'assistant' && last.id === botMsgId) {
                    last.content = fullText
                  }
                  return newArr
                })
              }
            } catch (err) {}
          }
        }
      }

      // If the backend already saved it via AI tags, don't double-save
      if (intent.action) {
        // Phase 3 guarantee: call the dedicated action endpoint directly
        try {
          const actionResult = await api.post<any>('/api/v1/chat/action', {
            action_type: intent.action,
            goal_name: intent.goalName,
            amount: intent.amount,
          })
          if (actionResult.success) {
            console.log('[Ask Dekho] Action endpoint saved:', actionResult.message)
          }
        } catch (actionErr) {
          console.warn('[Ask Dekho] Action endpoint failed, goal may not have saved:', actionErr)
        }
      }

      // Always trigger UI refresh after any chat with goal-related content
      const responseText = fullText.toLowerCase()
      const goalKeywords = ['goal', 'saving', 'added', 'created', 'target', 'progress', 'watch', 'laptop', 'trip']
      if (intent.action || goalKeywords.some(kw => responseText.includes(kw))) {
        window.dispatchEvent(new Event('dekho_data_updated'))
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error('[Ask Dekho] Chat error:', errMsg)
      setMessages((prev) => {
        const arr = [...prev]
        if (arr.length > 0 && arr[arr.length - 1].content === '') {
           arr[arr.length - 1].content = `Something went wrong: ${errMsg}`
        } else {
           arr.push({
             role: 'assistant',
             content: `Something went wrong: ${errMsg}`,
             id: crypto.randomUUID(),
             timestamp: new Date().toISOString(),
           })
        }
        return arr
      })
    } finally {
      setMessages((prev) => {
        const arr = [...prev]
        if (arr.length > 0 && arr[arr.length - 1].content === '' && arr[arr.length - 1].role === 'assistant') {
          arr[arr.length - 1].content = "Sorry, I couldn't generate a response. Please try again."
        }
        return arr
      })
      setIsLoading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Phase 6: Clear session memory and reset to welcome state
  const clearHistory = async () => {
    try {
      await api.delete<any>(`/api/chat/sessions/${sessionId}`)
    } catch {
      // Non-fatal — reset UI regardless
    }
    handleNewChat()
  }

  // Phase 4: Called when user picks a specific goal from the disambiguation picker
  const handleDisambiguationChoice = async (goal: Goal) => {
    if (!disambiguation) return
    const { amount } = disambiguation
    setDisambiguation(null)

    // Show confirmation in chat
    const confirmMsg: Message = {
      role: 'assistant',
      content: `Adding ₹${amount.toLocaleString('en-IN')} to your ${goal.name} goal.`,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, confirmMsg])

    try {
      const result = await api.post<any>('/api/v1/chat/action', {
        action_type: 'ADD_TO_GOAL',
        goal_name: goal.name,
        amount,
      })
      if (result.success) {
        setUserGoals(prev => prev.map(g =>
          g.id === goal.id ? { ...g, current_amount: g.current_amount + amount } : g
        ))
        window.dispatchEvent(new Event('dekho_data_updated'))
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Something went wrong saving that. Please try again.",
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      }])
    }
  }

  const QUICK_PROMPTS = [
    'How much did I spend this month?',
    'What are my top spending categories?',
    'How are my savings goals doing?',
    'Am I on budget?',
  ]

  return (
    <AnimatePresence>
      {isChatOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeChat}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            className={styles.panel}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            role="dialog"
            aria-label="Ask Dekho chatbot"
            aria-modal="true"
          >
            <ChatHistorySidebar 
              isOpen={isSidebarOpen} 
              onClose={() => setIsSidebarOpen(false)}
              onSelectSession={handleSelectSession}
              onNewChat={handleNewChat}
              currentSessionId={sessionId}
            />

            {/* Header */}
            <div className={styles.header}>
              <div className={styles.headerLeft}>
                <button 
                  className={styles.closeBtn} 
                  onClick={() => setIsSidebarOpen(true)}
                  aria-label="Menu"
                  style={{ marginRight: '0.5rem' }}
                >
                  <Menu size={18} strokeWidth={2} />
                </button>
                <div className={styles.avatar}>
                  <Sparkles size={16} strokeWidth={2} />
                </div>
                <div>
                  <p className={styles.headerTitle}>Ask Dekho</p>
                  <p className={styles.headerSubtitle}>
                    {messages.length > 1 ? `${messages.length} messages` : 'Your AI finance companion'}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                {messages.length > 1 && (
                  <button
                    className={styles.closeBtn}
                    onClick={clearHistory}
                    aria-label="Clear chat history"
                    title="Start a new conversation"
                  >
                    <Trash2 size={15} strokeWidth={2} />
                  </button>
                )}
                <button
                  className={styles.closeBtn}
                  onClick={closeChat}
                  aria-label="Close chat"
                >
                  <X size={18} strokeWidth={2} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className={styles.messages}>
              {messages.map((msg) => {
                if (msg.role === 'assistant' && !msg.content) return null;
                return (
                  <ChatBubble
                    key={msg.id}
                    role={msg.role}
                    content={msg.content}
                    timestamp={msg.timestamp}
                    showAvatar={msg.role === 'assistant'}
                  />
                );
              })}
              {isLoading && <ChatBubble isTyping showAvatar />}

              {/* Phase 4: Disambiguation picker */}
              {disambiguation && (
                <div style={{
                  margin: '0.75rem 0.5rem',
                  padding: '0.875rem 1rem',
                  background: 'var(--color-surface-2, rgba(255,255,255,0.05))',
                  borderRadius: '12px',
                  border: '1px solid var(--color-border, rgba(255,255,255,0.1))'
                }}>
                  <p style={{ fontSize: '0.85rem', marginBottom: '0.625rem', opacity: 0.8 }}>
                    Which goal should I add ₹{disambiguation.amount.toLocaleString('en-IN')} to?
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {disambiguation.options.map(goal => (
                      <button
                        key={goal.id}
                        onClick={() => handleDisambiguationChoice(goal)}
                        style={{
                          textAlign: 'left',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '8px',
                          border: '1px solid var(--color-border, rgba(255,255,255,0.15))',
                          background: 'transparent',
                          color: 'inherit',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span>{goal.name}</span>
                        <span style={{ opacity: 0.55, fontSize: '0.78rem' }}>
                          ₹{(goal.current_amount || 0).toLocaleString('en-IN')} / ₹{(goal.target_amount || 0).toLocaleString('en-IN')}
                        </span>
                      </button>
                    ))}
                    <button
                      onClick={() => setDisambiguation(null)}
                      style={{
                        textAlign: 'left',
                        padding: '0.4rem 0.75rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'transparent',
                        color: 'inherit',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        opacity: 0.5,
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Quick prompts — shown only on welcome state */}
            {messages.length === 1 && (
              <div className={styles.quickPrompts}>
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q}
                    className={styles.quickBtn}
                    onClick={() => {
                      setInput(q)
                      setTimeout(() => sendMessage(), 50)
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className={styles.inputRow}>
              <input
                ref={inputRef}
                className={styles.input}
                type="text"
                placeholder="Ask about your finances..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                disabled={isLoading}
                aria-label="Chat message input"
                maxLength={500}
              />
              <button
                className={`${styles.sendBtn} ${input.trim() && !isLoading ? styles.sendActive : ''}`}
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                aria-label="Send message"
              >
                <Send size={18} strokeWidth={2} />
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
