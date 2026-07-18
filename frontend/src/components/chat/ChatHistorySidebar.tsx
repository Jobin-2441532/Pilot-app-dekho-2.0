import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, Plus, Trash2, Edit2, X, Check, Menu } from 'lucide-react'
import { api } from '../../lib/api'
import styles from './ChatHistorySidebar.module.css'

export interface ChatSession {
  session_id: string
  title: string
  created_at: string
  updated_at: string
}

interface ChatHistorySidebarProps {
  isOpen: boolean
  onClose: () => void
  onSelectSession: (sessionId: string) => void
  onNewChat: () => void
  currentSessionId: string
}

export default function ChatHistorySidebar({ isOpen, onClose, onSelectSession, onNewChat, currentSessionId }: ChatHistorySidebarProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

  const loadSessions = async () => {
    setIsLoading(true)
    try {
      const data = await api.get<ChatSession[]>('/api/chat/sessions')
      setSessions(data)
    } catch (err) {
      console.error('Failed to load sessions', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadSessions()
    }
  }, [isOpen])

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    try {
      await api.delete(`/api/chat/sessions/${sessionId}`)
      setSessions(prev => prev.filter(s => s.session_id !== sessionId))
      if (currentSessionId === sessionId) {
        onNewChat()
      }
    } catch (err) {
      console.error('Failed to delete session', err)
    }
  }

  const startEditing = (e: React.MouseEvent, session: ChatSession) => {
    e.stopPropagation()
    setEditingId(session.session_id)
    setEditTitle(session.title)
  }

  const saveEdit = async (e: React.MouseEvent | React.KeyboardEvent, sessionId: string) => {
    e.stopPropagation()
    if (!editTitle.trim()) {
      setEditingId(null)
      return
    }
    
    try {
      await api.put(`/api/chat/sessions/${sessionId}`, { title: editTitle.trim() })
      setSessions(prev => prev.map(s => s.session_id === sessionId ? { ...s, title: editTitle.trim() } : s))
    } catch (err) {
      console.error('Failed to rename session', err)
    } finally {
      setEditingId(null)
    }
  }

  // Grouping logic
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const last7Days = new Date(today)
  last7Days.setDate(last7Days.getDate() - 7)
  const last30Days = new Date(today)
  last30Days.setDate(last30Days.getDate() - 30)

  const grouped: Record<string, ChatSession[]> = {
    'Today': [],
    'Yesterday': [],
    'Previous 7 Days': [],
    'Previous 30 Days': [],
    'Older': []
  }

  sessions.forEach(s => {
    // Attempt to parse properly assuming UTC
    const dStr = s.updated_at.endsWith('Z') ? s.updated_at : s.updated_at + 'Z'
    const d = new Date(dStr)
    if (d >= today) grouped['Today'].push(s)
    else if (d >= yesterday) grouped['Yesterday'].push(s)
    else if (d >= last7Days) grouped['Previous 7 Days'].push(s)
    else if (d >= last30Days) grouped['Previous 30 Days'].push(s)
    else grouped['Older'].push(s)
  })

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className={styles.sidebar}
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
          >
            <div className={styles.header}>
              <h2 className={styles.title}>Chat History</h2>
              <button className={styles.closeBtn} onClick={onClose}>
                <X size={18} />
              </button>
            </div>
            
            <div className={styles.newChatBtnContainer}>
              <button 
                className={styles.newChatBtn}
                onClick={() => {
                  onNewChat();
                  onClose();
                }}
              >
                <Plus size={16} />
                <span>New Chat</span>
              </button>
            </div>

            <div className={styles.sessionList}>
              {isLoading && sessions.length === 0 ? (
                <div className={styles.loading}>Loading sessions...</div>
              ) : sessions.length === 0 ? (
                <div className={styles.empty}>No past chats found</div>
              ) : (
                Object.entries(grouped).map(([groupName, groupSessions]) => {
                  if (groupSessions.length === 0) return null
                  return (
                    <div key={groupName} className={styles.group}>
                      <div className={styles.groupTitle}>{groupName}</div>
                      {groupSessions.map(session => (
                        <div 
                          key={session.session_id}
                          className={`${styles.sessionItem} ${currentSessionId === session.session_id ? styles.active : ''}`}
                          onClick={() => {
                            if (editingId !== session.session_id) {
                              onSelectSession(session.session_id)
                              onClose()
                            }
                          }}
                        >
                          <MessageSquare size={14} className={styles.sessionIcon} />
                          
                          {editingId === session.session_id ? (
                            <div className={styles.editWrapper} onClick={e => e.stopPropagation()}>
                              <input 
                                autoFocus
                                value={editTitle}
                                onChange={e => setEditTitle(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && saveEdit(e, session.session_id)}
                                className={styles.editInput}
                              />
                              <button className={styles.actionBtn} onClick={e => saveEdit(e, session.session_id)}>
                                <Check size={12} />
                              </button>
                              <button className={styles.actionBtn} onClick={() => setEditingId(null)}>
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <>
                              <span className={styles.sessionTitle}>{session.title}</span>
                              <div className={styles.actions}>
                                <button 
                                  className={styles.actionBtn} 
                                  onClick={e => startEditing(e, session)}
                                  title="Rename"
                                >
                                  <Edit2 size={12} />
                                </button>
                                <button 
                                  className={styles.actionBtn} 
                                  onClick={e => handleDelete(e, session.session_id)}
                                  title="Delete"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                })
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
