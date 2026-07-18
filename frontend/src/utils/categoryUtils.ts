export const CATEGORY_EMOJIS: Record<string, string> = {
  'Housing & Household': '🏠',
  'Utilities': '⚡',
  'Bills': '🧾',
  'Food & Dining': '🍴',
  'Food': '🍴', // alias
  'Groceries': '🛒',
  'Transport': '🚗',
  'Health': '💊',
  'Personal Care': '🧴',
  'Insurance': '🛡️',
  'Loan EMI': '💳',
  'Credit Card': '💳',
  'Shopping': '🛍️',
  'Entertainment': '🎬',
  'Travel': '✈️',
  'Subscriptions': '📺',
  'Telecom': '📱',
  'Investment': '💰',
  'Others': '🔮',
  'Services': '🛠️',
  'Uncategorised': '❓'
};

export const normalizeCategory = (category: string): string => {
  if (!category) return 'Others';
  const lowerCat = category.toLowerCase().trim();
  if (lowerCat === 'food' || lowerCat === 'food & dining') return 'Food & Dining';
  if (lowerCat === 'transport') return 'Transport';
  if (lowerCat === 'shopping') return 'Shopping';
  if (lowerCat === 'bills') return 'Bills';
  // Add other normalizations if needed
  
  // Try to find a case-insensitive match
  const exactMatch = Object.keys(CATEGORY_EMOJIS).find(k => k.toLowerCase() === lowerCat);
  if (exactMatch) return exactMatch;
  
  return category;
};

import { useAppStore } from '../store/appStore';

export const getCategoryEmoji = (category: string): string => {
  const normalized = normalizeCategory(category);
  const customEmojis = useAppStore.getState().categoryEmojis || {};
  return customEmojis[normalized] || customEmojis[category] || CATEGORY_EMOJIS[normalized] || '📦';
};

export const useCategoryEmoji = () => {
  const customEmojis = useAppStore(state => state.categoryEmojis) || {};
  
  return (category: string): string => {
    const normalized = normalizeCategory(category);
    return customEmojis[normalized] || customEmojis[category] || CATEGORY_EMOJIS[normalized] || '📦';
  };
};
