import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bug, Lightbulb, MessageSquare, PhoneCall } from 'lucide-react';
import { api } from '../lib/api';
import CustomDialog from '../components/ui/CustomDialog';

const feedbackOptions = [
  { id: 'bug', icon: Bug, title: 'Report a Bug 🐞', description: 'Allow users to report problems.' },
  { id: 'feature', icon: Lightbulb, title: 'Suggest a Feature 💡', description: "Let users tell you what they'd like to see." },
  { id: 'general', icon: MessageSquare, title: 'General Feedback ❤️', description: "For comments that aren't bugs." },
  { id: 'support', icon: PhoneCall, title: 'Contact Support', description: 'Simple form for assistance.' },
];

export default function Feedback() {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rating, setRating] = useState<number>(5);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [dialogConfig, setDialogConfig] = useState<{isOpen: boolean, title: string, message: string, isSuccess: boolean}>({
    isOpen: false,
    title: '',
    message: '',
    isSuccess: false
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType) return;
    
    setIsSubmitting(true);
    const deviceInfo = `${navigator.userAgent}`;

    const payload = {
      feedback_type: selectedType,
      title: title || undefined,
      description,
      device_info: deviceInfo,
      rating: selectedType === 'general' ? rating : undefined,
    };

    try {
      await api.post('/api/v1/feedback/app', payload);
      setDialogConfig({
        isOpen: true,
        title: 'Thank You!',
        message: 'Your feedback has been successfully submitted.',
        isSuccess: true
      });
    } catch (error) {
      console.error('Error submitting feedback:', error);
      setDialogConfig({
        isOpen: true,
        title: 'Submission Failed',
        message: 'Failed to submit feedback. Please try again later.',
        isSuccess: false
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeDialog = () => {
    if (dialogConfig.isSuccess) {
      navigate('/settings');
    } else {
      setDialogConfig({ ...dialogConfig, isOpen: false });
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    background: 'var(--bg-surface-high)',
    border: '1px solid var(--bg-surface-highest, transparent)',
    borderRadius: '12px',
    outline: 'none',
    boxSizing: 'border-box' as const,
    fontFamily: 'inherit',
    fontSize: '14px',
    marginTop: '6px'
  };

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-on-surface)'
  };

  const btnStyle = {
    width: '100%',
    padding: '14px',
    background: 'var(--color-primary)',
    color: 'var(--color-on-primary)',
    border: 'none',
    borderRadius: '12px',
    fontWeight: 600,
    marginTop: '16px',
    cursor: 'pointer',
    fontSize: '15px'
  };

  const renderForm = () => {
    if (!selectedType) return null;

    if (selectedType === 'bug') {
      return (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Bug Title</label>
            <input required type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} placeholder="What happened?" />
          </div>
          <div>
            <label style={labelStyle}>Explain the issue</label>
            <textarea required value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, minHeight: '150px' }} placeholder="Please describe the problem you encountered..." />
          </div>
          <p style={{ fontSize: '12px', color: 'var(--color-muted)', margin: 0 }}>Device Information will be automatically included.</p>
          <button type="submit" disabled={isSubmitting} style={{ ...btnStyle, opacity: isSubmitting ? 0.7 : 1 }}>
            {isSubmitting ? 'Submitting...' : 'Submit Bug Report'}
          </button>
        </form>
      );
    }

    if (selectedType === 'feature') {
      return (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Feature Title</label>
            <input required type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} placeholder="Short name for the feature" />
          </div>
          <div>
            <label style={labelStyle}>Description & Why would this help you?</label>
            <textarea required value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, minHeight: '150px' }} placeholder="Describe the feature and its benefits..." />
          </div>
          <button type="submit" disabled={isSubmitting} style={{ ...btnStyle, opacity: isSubmitting ? 0.7 : 1 }}>
            {isSubmitting ? 'Submitting...' : 'Suggest Feature'}
          </button>
        </form>
      );
    }

    if (selectedType === 'general') {
      return (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ textAlign: 'center', marginBottom: '8px' }}>
            <label style={{ ...labelStyle, marginBottom: '12px', fontSize: '15px' }}>How has your experience been with Dekho?</label>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button 
                  type="button" 
                  key={star} 
                  onClick={() => setRating(star)} 
                  style={{ 
                    background: 'none', border: 'none', fontSize: '32px', cursor: 'pointer', padding: 0,
                    color: rating >= star ? '#F59E0B' : '#D1D5DB' 
                  }}>
                  ★
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Comments</label>
            <textarea required value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, minHeight: '150px' }} placeholder="Tell us what you think..." />
          </div>
          <button type="submit" disabled={isSubmitting} style={{ ...btnStyle, opacity: isSubmitting ? 0.7 : 1 }}>
            {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </form>
      );
    }

    if (selectedType === 'support') {
      return (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Name</label>
            <input type="text" style={inputStyle} placeholder="Your name (optional)" />
          </div>
          <div>
            <label style={labelStyle}>Message</label>
            <textarea required value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, minHeight: '150px' }} placeholder="How can we help you?" />
          </div>
          <button type="submit" disabled={isSubmitting} style={{ ...btnStyle, opacity: isSubmitting ? 0.7 : 1 }}>
            {isSubmitting ? 'Submitting...' : 'Send Message'}
          </button>
        </form>
      );
    }

    return null;
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      color: 'var(--color-on-surface)',
      fontFamily: 'var(--font-body, system-ui, sans-serif)'
    }}>
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'var(--bg-base)',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        borderBottom: '1px solid var(--bg-surface-high)'
      }}>
        <button 
          onClick={() => selectedType ? setSelectedType(null) : navigate(-1)} 
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', marginLeft: '-8px' }}
        >
          <ArrowLeft size={24} />
        </button>
        <h1 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 0 12px' }}>Feedback & Support</h1>
      </div>

      <div style={{ padding: '24px' }}>
        {!selectedType ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ color: 'var(--color-muted)', fontSize: '14px', margin: '0 0 8px 0', lineHeight: 1.5 }}>
              We'd love to hear your thoughts! Select an option below to let us know how we can improve.
            </p>
            {feedbackOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => {
                  setSelectedType(option.id);
                  setTitle('');
                  setDescription('');
                  setRating(5);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '16px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--bg-surface-high)',
                  borderRadius: '16px',
                  textAlign: 'left',
                  cursor: 'pointer'
                }}
              >
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'var(--bg-surface-highest)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '16px',
                  flexShrink: 0
                }}>
                  <option.icon size={24} color="var(--color-primary)" />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 4px 0', color: 'var(--color-on-surface)' }}>{option.title}</h3>
                  <p style={{ fontSize: '13px', color: 'var(--color-muted)', margin: 0 }}>{option.description}</p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 24px 0' }}>
              {feedbackOptions.find(o => o.id === selectedType)?.title}
            </h2>
            {renderForm()}
          </div>
        )}
      </div>

      <CustomDialog
        isOpen={dialogConfig.isOpen}
        title={dialogConfig.title}
        message={dialogConfig.message}
        onConfirm={closeDialog}
        confirmText="OK"
      />
    </div>
  );
}
