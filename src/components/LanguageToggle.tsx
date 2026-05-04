import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';

export const LanguageToggle: React.FC<{ variant?: 'light' | 'dark' }> = ({ variant = 'light' }) => {
  const { language, toggleLanguage } = useLanguage();

  return (
    <button
      onClick={toggleLanguage}
      className={`
        relative flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold tracking-wide
        transition-all active:scale-95 select-none
        ${variant === 'dark'
          ? 'bg-white/10 text-white/70 hover:bg-white/15 hover:text-white'
          : 'bg-primary-navy/5 text-primary-navy/60 hover:bg-primary-navy/10 hover:text-primary-navy'
        }
      `}
      title={language === 'en' ? 'التبديل إلى العربية' : 'Switch to English'}
    >
      <span className={language === 'en' ? 'text-secondary-gold font-extrabold' : ''}>EN</span>
      <span className={variant === 'dark' ? 'text-white/30' : 'text-primary-navy/20'}>|</span>
      <span className={language === 'ar' ? 'text-secondary-gold font-extrabold' : ''}>AR</span>
    </button>
  );
};
