import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bug, Lightbulb, MessageSquare, PhoneCall } from 'lucide-react';
import api from '../utils/api';

const feedbackOptions = [
  { id: 'bug', icon: Bug, title: 'Report a Bug 🐞', description: 'Allow users to report problems.' },
  { id: 'feature', icon: Lightbulb, title: 'Suggest a Feature 💡', description: "Let users tell you what they'd like to see." },
  { id: 'general', icon: MessageSquare, title: 'General Feedback ❤️', description: "For comments that aren't bugs." },
  { id: 'support', icon: PhoneCall, title: 'Contact Support', description: 'Simple form for assistance.' },
];

export default function Feedback() {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  
  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expectedBehavior, setExpectedBehavior] = useState('');
  const [rating, setRating] = useState<number>(5);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType) return;
    
    setIsSubmitting(true);
    
    // Automatically capture device info if possible
    const deviceInfo = `${navigator.userAgent}`;

    const payload = {
      feedback_type: selectedType,
      title: title || undefined,
      description,
      expected_behavior: expectedBehavior || undefined,
      device_info: deviceInfo,
      rating: selectedType === 'general' ? rating : undefined,
    };

    try {
      await api.post('/api/v1/feedback/app', payload);
      alert('Thank you for your feedback!');
      navigate('/settings');
    } catch (error) {
      console.error('Error submitting feedback:', error);
      alert('Failed to submit feedback. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderForm = () => {
    if (!selectedType) return null;

    if (selectedType === 'bug') {
      return (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Bug Title</label>
            <input required type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full p-3 bg-surface-high rounded-xl outline-none" placeholder="What happened?" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Steps to reproduce (optional)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full p-3 bg-surface-high rounded-xl outline-none min-h-[100px]" placeholder="1. Go to...&#10;2. Click on..." />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Expected behavior</label>
            <textarea required value={expectedBehavior} onChange={(e) => setExpectedBehavior(e.target.value)} className="w-full p-3 bg-surface-high rounded-xl outline-none min-h-[80px]" placeholder="What should have happened?" />
          </div>
          <p className="text-xs text-text-muted">Device Information will be automatically included.</p>
          <button type="submit" disabled={isSubmitting} className="w-full py-4 bg-primary text-primary-content rounded-xl font-medium mt-4">
            {isSubmitting ? 'Submitting...' : 'Submit Bug Report'}
          </button>
        </form>
      );
    }

    if (selectedType === 'feature') {
      return (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Feature Title</label>
            <input required type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full p-3 bg-surface-high rounded-xl outline-none" placeholder="Short name for the feature" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description & Why would this help you?</label>
            <textarea required value={description} onChange={(e) => setDescription(e.target.value)} className="w-full p-3 bg-surface-high rounded-xl outline-none min-h-[150px]" placeholder="Describe the feature and its benefits..." />
          </div>
          <button type="submit" disabled={isSubmitting} className="w-full py-4 bg-primary text-primary-content rounded-xl font-medium mt-4">
            {isSubmitting ? 'Submitting...' : 'Suggest Feature'}
          </button>
        </form>
      );
    }

    if (selectedType === 'general') {
      return (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 text-center">How has your experience been with Dekho?</label>
            <div className="flex justify-center space-x-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button type="button" key={star} onClick={() => setRating(star)} className={`text-3xl ${rating >= star ? 'text-yellow-500' : 'text-gray-300'}`}>
                  ★
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Comments</label>
            <textarea required value={description} onChange={(e) => setDescription(e.target.value)} className="w-full p-3 bg-surface-high rounded-xl outline-none min-h-[150px]" placeholder="Tell us what you think..." />
          </div>
          <button type="submit" disabled={isSubmitting} className="w-full py-4 bg-primary text-primary-content rounded-xl font-medium mt-4">
            {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </form>
      );
    }

    if (selectedType === 'support') {
      return (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input type="text" className="w-full p-3 bg-surface-high rounded-xl outline-none" placeholder="Your name (optional)" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Message</label>
            <textarea required value={description} onChange={(e) => setDescription(e.target.value)} className="w-full p-3 bg-surface-high rounded-xl outline-none min-h-[150px]" placeholder="How can we help you?" />
          </div>
          <button type="submit" disabled={isSubmitting} className="w-full py-4 bg-primary text-primary-content rounded-xl font-medium mt-4">
            {isSubmitting ? 'Submitting...' : 'Send Message'}
          </button>
        </form>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-bg-surface text-text-primary pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-bg-surface/80 backdrop-blur-md px-6 py-4 flex items-center shadow-sm">
        <button onClick={() => selectedType ? setSelectedType(null) : navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-surface-high transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold ml-2">Feedback & Support</h1>
      </div>

      <div className="px-6 pt-6">
        {!selectedType ? (
          <div className="space-y-4">
            <p className="text-text-secondary mb-6">
              We'd love to hear your thoughts! Select an option below to let us know how we can improve.
            </p>
            {feedbackOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => {
                  setSelectedType(option.id);
                  setTitle('');
                  setDescription('');
                  setExpectedBehavior('');
                  setRating(5);
                }}
                className="w-full flex items-center p-4 bg-surface-high rounded-2xl hover:bg-surface-high/80 transition-colors text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mr-4 flex-shrink-0">
                  <option.icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{option.title}</h3>
                  <p className="text-sm text-text-secondary">{option.description}</p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="animate-in fade-in duration-300">
            <h2 className="text-2xl font-bold mb-6">
              {feedbackOptions.find(o => o.id === selectedType)?.title}
            </h2>
            {renderForm()}
          </div>
        )}
      </div>
    </div>
  );
}
