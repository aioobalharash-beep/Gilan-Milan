import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Home } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { useProperty } from '../contexts/PropertyContext';
import { useTranslation } from 'react-i18next';
import { bl } from '../utils/bilingual';

export type PropertyToggleVariant = 'light' | 'dark';

interface PropertyToggleProps {
  /** Visual style — `light` for bright headers, `dark` for navy headers. */
  variant?: PropertyToggleVariant;
  /**
   * Layout hint. `auto` (default) renders a pill switch when there are exactly
   * two properties and a dropdown for 3+. Force `dropdown` when horizontal
   * space is tight regardless of count.
   */
  layout?: 'auto' | 'dropdown';
  className?: string;
}

/**
 * Lets a guest (or admin) flip between properties from the header. When two
 * properties exist it renders an animated pill switch; with three or more it
 * collapses to a dropdown. Wraps the global PropertyContext so any consumer
 * (Sanctuary, Booking, etc.) re-renders against the newly selected property.
 */
/**
 * Trim a noisy "Chalet" / "شاليه" suffix or prefix from the property name so
 * the toggle stays compact on small screens — "Gilan Chalet" becomes "Gilan",
 * "شاليه ميلان" becomes "ميلان". Falls back to the full label if stripping
 * leaves it empty.
 */
const shortPropertyLabel = (full: string): string => {
  if (!full) return '';
  const trimmed = full
    .replace(/\s*chalet\s*$/i, '')
    .replace(/^شاليه\s+/u, '')
    .replace(/\s*شاليه\s*$/u, '')
    .trim();
  return trimmed || full;
};

export const PropertyToggle: React.FC<PropertyToggleProps> = ({
  variant = 'light',
  layout = 'auto',
  className,
}) => {
  const { properties, activePropertyId, setActivePropertyId, loading } = useProperty();
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (loading || properties.length === 0) return null;
  // No point rendering a toggle for a single property.
  if (properties.length < 2) return null;

  const usePillLayout = layout === 'auto' && properties.length === 2;

  const baseColors = variant === 'dark'
    ? {
        track: 'bg-white/10 border border-white/15',
        inactive: 'text-white/70 hover:text-white',
        activeBg: 'bg-secondary-gold',
        activeText: 'text-primary-navy',
        chevron: 'text-white/70',
        menuBg: 'bg-primary-navy text-white border border-white/10',
        menuItem: 'text-white/70 hover:bg-white/5',
        menuItemActive: 'bg-secondary-gold/20 text-secondary-gold',
      }
    : {
        track: 'bg-pearl-white border border-primary-navy/10',
        inactive: 'text-primary-navy/50 hover:text-primary-navy',
        activeBg: 'bg-primary-navy',
        activeText: 'text-white',
        chevron: 'text-primary-navy/50',
        menuBg: 'bg-white text-primary-navy border border-primary-navy/10 shadow-xl',
        menuItem: 'text-primary-navy/70 hover:bg-primary-navy/5',
        menuItemActive: 'bg-secondary-gold/15 text-primary-navy',
      };

  if (usePillLayout) {
    return (
      <div
        role="tablist"
        aria-label="Property selector"
        className={cn(
          // Equal-width grid columns keep both pills the same size so the
          // animated active background doesn't jump width when switching.
          'relative inline-grid grid-cols-2 items-center rounded-full p-1 text-[11px] sm:text-xs font-bold uppercase tracking-wider',
          baseColors.track,
          className,
        )}
      >
        {properties.map(p => {
          const isActive = p.id === activePropertyId;
          const label = shortPropertyLabel(bl(p.name as any, lang));
          return (
            <button
              key={p.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActivePropertyId(p.id)}
              className={cn(
                'relative whitespace-nowrap px-3 sm:px-4 py-1.5 rounded-full transition-colors duration-200 z-10',
                isActive ? baseColors.activeText : baseColors.inactive,
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="property-toggle-pill"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  className={cn('absolute inset-0 rounded-full -z-10', baseColors.activeBg)}
                />
              )}
              <span className="relative">{label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Dropdown layout (3+ properties or forced).
  const activeName = shortPropertyLabel(
    bl((properties.find(p => p.id === activePropertyId)?.name) as any, lang),
  );
  return (
    <div ref={wrapperRef} className={cn('relative inline-block', className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'inline-flex items-center gap-1.5 sm:gap-2 rounded-full px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-colors',
          baseColors.track,
          variant === 'dark' ? 'text-white' : 'text-primary-navy',
        )}
      >
        <Home size={14} className={baseColors.chevron} />
        <span className="max-w-[100px] sm:max-w-[140px] truncate whitespace-nowrap">{activeName || 'Select property'}</span>
        <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className={cn(
              'absolute end-0 mt-2 min-w-[180px] rounded-2xl py-1.5 z-50 overflow-hidden',
              baseColors.menuBg,
            )}
          >
            {properties.map(p => {
              const isActive = p.id === activePropertyId;
              const label = shortPropertyLabel(bl(p.name as any, lang));
              return (
                <li key={p.id} role="option" aria-selected={isActive}>
                  <button
                    type="button"
                    onClick={() => { setActivePropertyId(p.id); setOpen(false); }}
                    className={cn(
                      'w-full text-start px-4 py-2.5 text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-colors',
                      isActive ? baseColors.menuItemActive : baseColors.menuItem,
                    )}
                  >
                    {label}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
};
