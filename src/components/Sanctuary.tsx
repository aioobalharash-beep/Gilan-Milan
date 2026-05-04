import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Calendar as CalendarIcon, Instagram, MessageCircle, MapPin, Check } from 'lucide-react';
import { OptimizedImage } from './OptimizedImage';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useTranslation } from 'react-i18next';
import { bl, type BilingualField } from '../utils/bilingual';
import { getClientConfig, whatsappHref } from '../config/clientConfig';

interface DayUseSlotRates {
  sunday_rate?: number;
  monday_rate?: number;
  tuesday_rate?: number;
  wednesday_rate?: number;
  thursday_rate?: number;
  friday_rate?: number;
  saturday_rate?: number;
}

interface PricingSettings {
  sunday_rate?: number;
  monday_rate?: number;
  tuesday_rate?: number;
  wednesday_rate?: number;
  thursday_rate?: number;
  friday_rate?: number;
  saturday_rate?: number;
  day_use_rate?: number;
  weekday_rate?: number;
  event_rate?: number;
  day_use_slots?: DayUseSlotRates[];
  special_dates?: { date: string; day_use_price?: number; night_stay_price?: number; price?: number }[];
  discount?: { enabled: boolean; type: 'percent' | 'flat'; value: number; start_date: string; end_date: string };
}

const getMinPrice = (pricing: PricingSettings | undefined, fallback: number): number => {
  if (!pricing) return fallback;
  const nightRates = [
    pricing.sunday_rate, pricing.monday_rate, pricing.tuesday_rate,
    pricing.wednesday_rate, pricing.thursday_rate, pricing.friday_rate,
    pricing.saturday_rate,
    pricing.weekday_rate, // legacy
  ];
  const slotRates = (pricing.day_use_slots || []).flatMap(slot => [
    slot.sunday_rate, slot.monday_rate, slot.tuesday_rate,
    slot.wednesday_rate, slot.thursday_rate, slot.friday_rate, slot.saturday_rate,
  ]);
  const specialPrices = (pricing.special_dates || []).flatMap(s => [s.day_use_price, s.night_stay_price, s.price]);
  const allRates = [
    ...nightRates,
    pricing.day_use_rate,
    ...slotRates,
    pricing.event_rate,
    ...specialPrices,
  ].filter((r): r is number => typeof r === 'number' && r > 0);

  if (allRates.length === 0) return fallback;
  let minRate = Math.min(...allRates);
  if (pricing.discount?.enabled && pricing.discount.value > 0) {
    if (pricing.discount.type === 'percent') {
      minRate = Math.round(minRate * (1 - pricing.discount.value / 100));
    } else {
      minRate = Math.max(0, minRate - pricing.discount.value);
    }
  }
  return minRate;
};

interface FeatureItem {
  en: string;
  ar: string;
}

interface FeatureSection {
  titleEn: string;
  titleAr: string;
  items: FeatureItem[];
}

interface PropertyDetails {
  name: string | BilingualField;
  capacity: number;
  area_sqm: number;
  nightly_rate: number;
  headline: string | BilingualField;
  description: string | BilingualField;
  featureSections: FeatureSection[];
  gallery: { url: string; label: string }[];
  pricing?: PricingSettings;
  footerText?: string | BilingualField;
  whatsappNumber?: string;
  licenseNumber?: string;
}

const DEFAULTS: PropertyDetails = {
  name: 'Woody Chalete',
  capacity: 12,
  area_sqm: 850,
  nightly_rate: 120,
  headline: 'Curated Excellence',
  description: 'Nestled in the heart of the Omani landscape, Woody Chalete offers an unparalleled blend of modern luxury and heritage-inspired architecture. Every corner of this estate has been curated to provide a seamless flow between indoor relaxation and outdoor majesty.',
  featureSections: [],
  gallery: [
    { url: 'https://picsum.photos/seed/oman-bedroom-1/800/1000', label: 'Master Suite: Serene Sands' },
    { url: 'https://picsum.photos/seed/oman-bedroom-2/800/1000', label: 'Guest Wing: Golden Hour' },
    { url: 'https://picsum.photos/seed/oman-kitchen/800/1000', label: 'Culinary Studio' },
  ],
};

interface FooterProps {
  chaletName: string;
  footerText: string;
  whatsappNumber: string;
  licenseNumber: string;
  termsLabel: string;
  aboutLabel: string;
  onTerms: () => void;
  onAbout: () => void;
}

const Footer = React.memo<FooterProps>(({ chaletName, footerText, whatsappNumber, licenseNumber, termsLabel, aboutLabel, onTerms, onAbout }) => {
  const { t } = useTranslation();
  const config = getClientConfig();
  const waHref = whatsappHref(config.social.whatsapp) || whatsappHref(whatsappNumber);
  const year = new Date().getFullYear();
  return (
    <footer className="w-full py-12 px-8 bg-white border-t border-primary-navy/5 flex flex-col items-center gap-6">
      <div className="text-secondary-gold font-bold font-headline text-xl">{chaletName}</div>
      {footerText ? (
        <p className="text-xs text-center text-primary-navy/60 leading-relaxed max-w-xs whitespace-pre-line">
          {footerText}
        </p>
      ) : (
        <p className="text-xs text-center text-primary-navy/60 leading-relaxed max-w-xs">
          &copy; {year} {chaletName}
        </p>
      )}
      {licenseNumber && (
        <div className="text-[10px] text-primary-navy/30 uppercase font-bold tracking-widest text-center">
          {t('sanctuary.tourismLicense')}: {licenseNumber}
        </div>
      )}
      <div className="flex gap-6 items-center">
        <button onClick={onTerms} className="text-xs text-primary-navy/60 underline font-bold">{termsLabel}</button>
        <button onClick={onAbout} className="text-xs text-primary-navy/60 underline font-bold">{aboutLabel}</button>
      </div>
      <div className="flex gap-6 mt-2 items-center">
        {waHref && (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="WhatsApp"
            className="flex items-center gap-2 text-primary-navy/60 hover:text-secondary-gold transition-colors"
          >
            <MessageCircle size={20} />
            <span className="text-xs font-bold">WhatsApp</span>
          </a>
        )}
        <a
          href="https://www.instagram.com/wooody_chalete/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram"
          className="flex items-center gap-2 text-primary-navy/60 hover:text-secondary-gold transition-colors"
        >
          <Instagram size={20} />
          <span className="text-xs font-bold">Instagram</span>
        </a>
        <a
          href={getClientConfig().location.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Location"
          className="flex items-center gap-2 text-primary-navy/60 hover:text-secondary-gold transition-colors"
        >
          <MapPin size={20} />
          <span className="text-xs font-bold">
            <span dir="rtl" lang="ar">الموقع</span>
            <span className="mx-1 text-secondary-gold/70" aria-hidden="true">|</span>
            <span dir="ltr" lang="en">Location</span>
          </span>
        </a>
      </div>
      {footerText && (
        <p className="text-[10px] text-center text-primary-navy/40 font-bold">
          &copy; {year} {chaletName}
        </p>
      )}
    </footer>
  );
});
Footer.displayName = 'Footer';

export const Sanctuary: React.FC = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [data, setData] = useState<PropertyDetails>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'settings', 'property_details'),
      (snap) => {
        if (snap.exists()) {
          setData({ ...DEFAULTS, ...snap.data() as PropertyDetails });
        }
        setLoading(false);
      },
      (error) => {
        console.error('Property details listener error:', error);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="space-y-8 pb-12 animate-pulse">
        <div className="px-6 mt-8 space-y-4">
          <div className="h-4 bg-primary-navy/5 rounded w-32" />
          <div className="h-8 bg-primary-navy/5 rounded w-64" />
          <div className="flex gap-4 overflow-hidden">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex-none w-[85vw] md:w-[600px]">
                <div className="aspect-[4/5] md:aspect-video rounded-[20px] bg-primary-navy/5" />
                <div className="mt-3 h-3.5 bg-primary-navy/5 rounded w-40 mx-1" />
              </div>
            ))}
          </div>
        </div>
        <div className="px-6 space-y-3">
          <div className="h-6 bg-primary-navy/5 rounded w-48" />
          <div className="h-4 bg-primary-navy/5 rounded w-full" />
          <div className="h-4 bg-primary-navy/5 rounded w-3/4" />
        </div>
        <div className="px-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-full bg-white p-6 rounded-2xl border border-primary-navy/5 shadow-sm space-y-4">
              <div className="h-5 bg-primary-navy/5 rounded w-24" />
              <div className="space-y-2.5">
                <div className="h-4 bg-primary-navy/5 rounded w-full" />
                <div className="h-4 bg-primary-navy/5 rounded w-3/4" />
                <div className="h-4 bg-primary-navy/5 rounded w-5/6" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-12">
      {/* Hero Gallery */}
      <section className="px-6 mt-8">
        <div className="flex justify-between items-end mb-6">
          <div>
            <span className="text-secondary-gold font-bold tracking-widest text-[10px] uppercase block mb-1">{t('sanctuary.estatePreview')}</span>
            <h2 className="font-headline text-3xl font-bold text-primary-navy">{bl(data.name, lang)}</h2>
          </div>
        </div>

        <div className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar gap-4 pb-4">
          {data.gallery.map((img, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex-none w-[85vw] md:w-[600px] snap-center"
            >
              <OptimizedImage
                src={img.url}
                alt={img.label || ''}
                className="aspect-[4/5] md:aspect-video rounded-[20px] bg-primary-navy/5 shadow-sm"
              />
              {img.label && img.label.trim() !== '' && (
                <p className="mt-3 font-bold text-primary-navy/80 text-sm px-1">{img.label}</p>
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* Description */}
      <section className="px-6">
        <h3 className="font-headline text-xl font-bold mb-4">{bl(data.headline, lang)}</h3>
        <p className="text-primary-navy/60 leading-relaxed text-sm">{bl(data.description, lang)}</p>
        <div className="mt-4 text-sm text-primary-navy/60">
          <span className="font-bold text-secondary-gold">{t('sanctuary.from')} {getMinPrice(data.pricing, data.nightly_rate)} {t('common.omr')}</span> {t('common.perNight')}
        </div>
      </section>

      {/* Resort Guide — Categorized Feature Tiles */}
      {data.featureSections && data.featureSections.length > 0 && (
        <section className="px-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
            {data.featureSections.map((section, i) => {
              const title = lang === 'ar' ? (section.titleAr || section.titleEn) : (section.titleEn || section.titleAr);
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  dir={lang === 'ar' ? 'rtl' : 'ltr'}
                  className="h-full bg-white p-6 rounded-2xl border border-primary-navy/5 shadow-sm"
                >
                  <h4 className="font-headline text-lg font-bold text-secondary-gold mb-4">
                    {title}
                  </h4>
                  <ul className="space-y-2.5">
                    {section.items.map((item, j) => {
                      const label = lang === 'ar' ? (item.ar || item.en) : (item.en || item.ar);
                      return (
                        <li key={j} className="flex items-start gap-3">
                          <Check size={14} strokeWidth={2.5} className="text-secondary-gold shrink-0 mt-[5px]" />
                          <span className="text-base font-medium text-primary-navy/85 leading-relaxed">
                            {label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* Footer Info */}
      <Footer
        chaletName={bl(data.name, lang)}
        footerText={data.footerText ? bl(data.footerText, lang) : ''}
        whatsappNumber={data.whatsappNumber || ''}
        licenseNumber={data.licenseNumber || ''}
        termsLabel={t('sanctuary.termsOfStay')}
        aboutLabel={t('sanctuary.aboutUs')}
        onTerms={() => navigate('/terms')}
        onAbout={() => navigate('/about')}
      />

      {/* Floating Book Now */}
      <button
        onClick={() => navigate('/booking')}
        className="fixed bottom-[104px] end-[24px] z-[60] flex items-center gap-2 bg-secondary-gold text-primary-navy px-6 py-3.5 rounded-[20px] shadow-[0px_10px_25px_rgba(212,175,55,0.3)] hover:scale-105 transition-transform active:scale-95"
      >
        <CalendarIcon size={20} />
        <span className="font-bold text-sm tracking-wide">{t('sanctuary.bookNow')}</span>
      </button>
    </div>
  );
};
