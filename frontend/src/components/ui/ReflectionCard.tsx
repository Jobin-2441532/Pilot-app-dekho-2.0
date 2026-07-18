import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';

interface BreakdownData {
  title: string;
  points: string[];
}

interface ReflectionData {
  mode: string;
  greeting: string;
  headline: string;
  subtext: string;
  breakdown_type: string;
  breakdown_data?: BreakdownData;
}

export function ReflectionCard() {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery<ReflectionData>({
    queryKey: ['home-reflection'],
    queryFn: () => api.get('/api/home/reflection').then((res: any) => res?.data || res),
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  React.useEffect(() => {
    if (data && !isLoading && !isError) {
      const today = new Date().toDateString();
      if (localStorage.getItem('ph_last_reflection_viewed') !== today) {
        import('posthog-js').then((ph) => {
          ph.default.capture('daily_reflection_viewed', { platform: 'web' });
          localStorage.setItem('ph_last_reflection_viewed', today);
        });
      }
    }
  }, [data, isLoading, isError]);

  React.useEffect(() => {
    const handleUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ['home-reflection'] });
    };
    window.addEventListener('dekho_data_updated', handleUpdate);
    return () => window.removeEventListener('dekho_data_updated', handleUpdate);
  }, [queryClient]);

  const bgColor = "#4A2E1B"; // More brownish instead of orangish

  if (isLoading) {
    return (
      <div style={{ padding: '24px', backgroundColor: bgColor, borderRadius: '24px', color: 'white' }}>
         <motion.div animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ repeat: Infinity, duration: 1.5 }} style={{ height: '20px', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '6px', width: '50%', marginBottom: '16px' }} />
         <motion.div animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.2 }} style={{ height: '32px', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '6px', width: '85%' }} />
      </div>
    );
  }

  if (isError || !data) return null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0, backgroundColor: bgColor }}
      style={{
        borderRadius: 'var(--radius-xl, 24px)',
        padding: 'var(--space-6, 24px)',
        color: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        overflow: 'hidden'
      }}
    >
      <motion.p 
        layout="position"
        style={{ 
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-xs, 12px)', 
          fontWeight: 600, 
          letterSpacing: '0.1em', 
          color: 'rgba(255,255,255,0.65)', 
          textTransform: 'uppercase',
          marginBottom: '4px'
        }}
      >
        {data.greeting}
      </motion.p>
      
      <motion.div 
        layout="position"
        style={{ 
          fontFamily: 'var(--font-headline)',
          fontSize: 'var(--text-2xl, 24px)', 
          fontWeight: 700, 
          lineHeight: 1.25,
          letterSpacing: '-0.01em'
        }}
      >
        {data.headline}
      </motion.div>
      
      <motion.div 
        layout="position"
        style={{ 
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-base, 16px)', 
          lineHeight: 1.5, 
          color: 'rgba(255,255,255,0.75)'
        }}
      >
        {data.subtext}
      </motion.div>

      {data.breakdown_data && (
        <>
          <motion.div layout="position" style={{ marginTop: '8px' }}>
            <motion.button 
              layout="position"
              onClick={() => setExpanded(!expanded)}
              style={{ 
                background: 'transparent', 
                border: '1px solid rgba(255,255,255,0.3)', 
                borderRadius: '999px', 
                padding: '6px 14px', 
                color: '#FFFFFF', 
                fontSize: '13px',
                cursor: 'pointer'
              }}
              whileTap={{ scale: 0.98 }}
            >
              {expanded ? 'Hide breakdown' : 'Tap to see why'}
            </motion.button>
          </motion.div>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.15)' }}>
                  <div style={{ fontWeight: 600, marginBottom: '8px' }}>{data.breakdown_data.title}</div>
                  <ul style={{ paddingLeft: '20px', margin: 0, color: 'rgba(255,255,255,0.85)', fontSize: '14px', lineHeight: 1.6 }}>
                    {data.breakdown_data.points.map((pt, i) => (
                      <li key={i}>{pt}</li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
}
