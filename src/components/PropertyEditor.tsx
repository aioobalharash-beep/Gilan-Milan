import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { OptimizedImage } from './OptimizedImage';
import { ArrowLeft, ArrowRight, Upload, X, Plus, Save, Check, Calendar, Tag, Percent, Landmark, Sun, Clock, FileText, Languages, Trash2, LayoutGrid } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { uploadToCloudinary as uploadImageToCloudinary } from '../services/cloudinary';
import { migratePricing, formatTime, type PricingSettings, type DayUseSlot } from '../services/pricingUtils';
import { type BilingualField, toBilingual } from '../utils/bilingual';
import { useLanguage } from '../contexts/LanguageContext';
import { getClientConfig } from '../config/clientConfig';

interface GalleryImage { url: string; label: string; }

interface FeatureItem {
  en: string;
  ar: string;
}

interface FeatureSection {
  titleEn: string;
  titleAr: string;
  items: FeatureItem[];
}

const normalizeFeatureSections = (raw: unknown): FeatureSection[] => {
  if (!Array.isArray(raw)) return [];
  return raw.map((s: any) => ({
    titleEn: typeof s?.titleEn === 'string' ? s.titleEn : typeof s?.title === 'string' ? s.title : '',
    titleAr: typeof s?.titleAr === 'string' ? s.titleAr : '',
    items: Array.isArray(s?.items)
      ? s.items.map((it: any) =>
          typeof it === 'string'
            ? { en: it, ar: '' }
            : { en: typeof it?.en === 'string' ? it.en : '', ar: typeof it?.ar === 'string' ? it.ar : '' }
        )
      : [],
  }));
};

interface PropertyDetails {
  name: BilingualField;
  capacity: number;
  area_sqm: number;
  nightly_rate: number;
  headline: BilingualField;
  description: BilingualField;
  featureSections: FeatureSection[];
  gallery: GalleryImage[];
  pricing: PricingSettings;
  bank_name: string;
  account_name: string;
  iban: string;
  bankPhone: string;
  termsOfStay: BilingualField;
  footerText: BilingualField;
  whatsappNumber: string;
  licenseNumber: string;
  quickFacts?: { icon: string; label: string; label_ar: string }[];
  aboutEn: string;
  aboutAr: string;
  termsEn: string;
  termsAr: string;
}

const DEFAULT_PRICING: PricingSettings = {
  sunday_rate: 120,
  monday_rate: 120,
  tuesday_rate: 120,
  wednesday_rate: 120,
  thursday_rate: 140,
  friday_rate: 180,
  saturday_rate: 150,
  day_use_rate: 70,
  event_category_name: '',
  event_rate: 240,
  security_deposit: 50,
  special_dates: [],
  day_use_slots: [],
  discount: { enabled: false, type: 'percent', value: 10, start_date: '', end_date: '' },
};

const DEFAULT_DATA: PropertyDetails = {
  name: { en: 'Woody Chalete', ar: 'شاليه وودي' },
  capacity: 12,
  area_sqm: 850,
  nightly_rate: 120,
  headline: { en: 'Curated Excellence', ar: '' },
  description: { en: 'Nestled in the heart of the Omani landscape, Woody Chalete offers an unparalleled blend of modern luxury and heritage-inspired architecture. Every corner of this estate has been curated to provide a seamless flow between indoor relaxation and outdoor majesty.', ar: '' },
  featureSections: [],
  gallery: [
    { url: 'https://picsum.photos/seed/oman-bedroom-1/800/1000', label: 'Master Suite: Serene Sands' },
    { url: 'https://picsum.photos/seed/oman-bedroom-2/800/1000', label: 'Guest Wing: Golden Hour' },
    { url: 'https://picsum.photos/seed/oman-kitchen/800/1000', label: 'Culinary Studio' },
  ],
  pricing: DEFAULT_PRICING,
  bank_name: '',
  account_name: '',
  iban: '',
  bankPhone: '',
  termsOfStay: { en: '', ar: '' },
  footerText: { en: '', ar: '' },
  whatsappNumber: '',
  licenseNumber: '',
  aboutEn: '',
  aboutAr: '',
  termsEn: '',
  termsAr: '',
};

const baseInputClass = "w-full bg-pearl-white border border-primary-navy/10 rounded-xl py-3 px-4 text-sm font-medium focus:ring-1 focus:ring-secondary-gold/50 outline-none";

const PropertyEditorComponent: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isRTL } = useLanguage();
  const features = getClientConfig().features;
  const dir = isRTL ? 'rtl' : 'ltr';
  const textAlignClass = isRTL ? 'text-right' : 'text-left';
  const inputClass = cn(baseInputClass, textAlignClass);
  const [form, setForm] = useState<PropertyDetails>(DEFAULT_DATA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newItemInputs, setNewItemInputs] = useState<Record<number, { en: string; ar: string }>>({});

  // Special date form — two price points so a single date can price Day Use
  // and Overnight stays independently (same pattern as check-in / check-out).
  const [specialDate, setSpecialDate] = useState('');
  const [specialDayUsePrice, setSpecialDayUsePrice] = useState('');
  const [specialNightPrice, setSpecialNightPrice] = useState('');

  // Day-use slot form
  const [newSlotName, setNewSlotName] = useState('');
  const [newSlotNameAr, setNewSlotNameAr] = useState('');
  const [newSlotStart, setNewSlotStart] = useState('11:00');
  const [newSlotEnd, setNewSlotEnd] = useState('16:00');
  const [newFactIcon, setNewFactIcon] = useState('');
  const [newFactLabel, setNewFactLabel] = useState('');
  const [newFactLabelAr, setNewFactLabelAr] = useState('');

  // Helpers to update pricing sub-object
  const setPricing = (patch: Partial<PricingSettings>) =>
    setForm(prev => ({ ...prev, pricing: { ...prev.pricing, ...patch } }));

  const setDiscount = (patch: Partial<NonNullable<PricingSettings['discount']>>) =>
    setForm(prev => ({
      ...prev,
      pricing: { ...prev.pricing, discount: { ...prev.pricing.discount!, ...patch } },
    }));

  useEffect(() => {
    getDoc(doc(db, 'settings', 'property_details'))
      .then(snap => {
        if (snap.exists()) {
          const data = snap.data() as any;
          setForm({
            ...DEFAULT_DATA,
            ...data,
            name: toBilingual(data.name),
            headline: toBilingual(data.headline),
            description: toBilingual(data.description),
            termsOfStay: toBilingual(data.termsOfStay),
            footerText: toBilingual(data.footerText),
            featureSections: normalizeFeatureSections(data.featureSections),
            pricing: { ...DEFAULT_PRICING, ...migratePricing(data.pricing || {}) },
            aboutEn: typeof data.aboutEn === 'string' ? data.aboutEn : '',
            aboutAr: typeof data.aboutAr === 'string' ? data.aboutAr : '',
            termsEn: typeof data.termsEn === 'string' ? data.termsEn : '',
            termsAr: typeof data.termsAr === 'string' ? data.termsAr : '',
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'property_details'), form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  };

  const uploadPropertyImage = (file: File): Promise<string> =>
    uploadImageToCloudinary(file, {
      folder: 'woody-chalete-property',
      onProgress: (pct) => setUploadProgress(pct),
    }).finally(() => setUploadProgress(null));

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadPropertyImage(file);
      setForm(prev => ({ ...prev, gallery: [...prev.gallery, { url, label: newLabel.trim() }] }));
      setNewLabel('');
    } catch (err) { console.error('Upload error:', err); }
    finally { setUploading(false); }
    e.target.value = '';
  };

  const removeImage = (i: number) => setForm(prev => ({ ...prev, gallery: prev.gallery.filter((_, j) => j !== i) }));

  const addQuickFact = () => {
    const label = newFactLabel.trim();
    if (!label) return;
    setForm(prev => ({
      ...prev,
      quickFacts: [...(prev.quickFacts || []), { icon: newFactIcon || 'Star', label, label_ar: newFactLabelAr.trim() }],
    }));
    setNewFactIcon('');
    setNewFactLabel('');
    setNewFactLabelAr('');
  };
  const removeQuickFact = (i: number) => setForm(prev => ({
    ...prev,
    quickFacts: (prev.quickFacts || []).filter((_, j) => j !== i),
  }));

  const addSection = () => {
    setForm(prev => ({
      ...prev,
      featureSections: [...prev.featureSections, { titleEn: '', titleAr: '', items: [] }],
    }));
  };

  const removeSection = (idx: number) => {
    setForm(prev => ({
      ...prev,
      featureSections: prev.featureSections.filter((_, i) => i !== idx),
    }));
    setNewItemInputs(prev => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  };

  const updateSectionTitle = (idx: number, patch: Partial<Pick<FeatureSection, 'titleEn' | 'titleAr'>>) => {
    setForm(prev => ({
      ...prev,
      featureSections: prev.featureSections.map((s, i) => i === idx ? { ...s, ...patch } : s),
    }));
  };

  const addItemToSection = (idx: number) => {
    const draft = newItemInputs[idx] || { en: '', ar: '' };
    const en = draft.en.trim();
    const ar = draft.ar.trim();
    if (!en && !ar) return;
    setForm(prev => ({
      ...prev,
      featureSections: prev.featureSections.map((s, i) =>
        i === idx ? { ...s, items: [...s.items, { en, ar }] } : s
      ),
    }));
    setNewItemInputs(prev => ({ ...prev, [idx]: { en: '', ar: '' } }));
  };

  const updateItem = (sectionIdx: number, itemIdx: number, patch: Partial<FeatureItem>) => {
    setForm(prev => ({
      ...prev,
      featureSections: prev.featureSections.map((s, i) =>
        i === sectionIdx
          ? { ...s, items: s.items.map((it, j) => j === itemIdx ? { ...it, ...patch } : it) }
          : s
      ),
    }));
  };

  const removeItemFromSection = (sectionIdx: number, itemIdx: number) => {
    setForm(prev => ({
      ...prev,
      featureSections: prev.featureSections.map((s, i) =>
        i === sectionIdx ? { ...s, items: s.items.filter((_, j) => j !== itemIdx) } : s
      ),
    }));
  };

  const addSpecialDate = () => {
    const features = getClientConfig().features;
    if (!specialDate || !specialNightPrice) return;
    if (features.hasDayUse && !specialDayUsePrice) return;
    const dayUse = features.hasDayUse ? parseFloat(specialDayUsePrice) : 0;
    const night = parseFloat(specialNightPrice);
    if (features.hasDayUse && (isNaN(dayUse) || dayUse <= 0)) return;
    if (isNaN(night) || night <= 0) return;
    setPricing({
      special_dates: [
        ...form.pricing.special_dates.filter(s => s.date !== specialDate),
        { date: specialDate, day_use_price: dayUse, night_stay_price: night },
      ],
    });
    setSpecialDate('');
    setSpecialDayUsePrice('');
    setSpecialNightPrice('');
  };

  const removeSpecialDate = (date: string) =>
    setPricing({ special_dates: form.pricing.special_dates.filter(s => s.date !== date) });

  const addSlot = () => {
    if (!newSlotName.trim() || !newSlotStart || !newSlotEnd) return;
    const newSlot: DayUseSlot = {
      id: `slot_${Date.now()}`,
      name: newSlotName.trim(),
      name_ar: newSlotNameAr.trim() || undefined,
      start_time: newSlotStart,
      end_time: newSlotEnd,
      sunday_rate: 40, monday_rate: 40, tuesday_rate: 40, wednesday_rate: 40,
      thursday_rate: 50, friday_rate: 60, saturday_rate: 55,
    };
    setPricing({ day_use_slots: [...(form.pricing.day_use_slots || []), newSlot] });
    setNewSlotName(''); setNewSlotNameAr(''); setNewSlotStart('11:00'); setNewSlotEnd('16:00');
  };

  const removeSlot = (id: string) =>
    setPricing({ day_use_slots: (form.pricing.day_use_slots || []).filter(s => s.id !== id) });

  const updateSlot = (id: string, patch: Partial<DayUseSlot>) =>
    setPricing({ day_use_slots: (form.pricing.day_use_slots || []).map(s => s.id === id ? { ...s, ...patch } : s) });

  if (loading) return <div className="p-8 animate-pulse"><div className="h-96 bg-primary-navy/5 rounded-xl" /></div>;

  return (
    <div dir={dir} className={cn("px-4 py-6 sm:px-6 md:p-8 space-y-8 max-w-4xl mx-auto", textAlignClass)}>
      {/* Header */}
      <div>
        <button onClick={() => navigate('/admin')} className="flex items-center gap-2 text-primary-navy/50 hover:text-primary-navy transition-colors text-xs font-bold uppercase tracking-wider mb-3">
          {isRTL ? <ArrowRight size={14} /> : <ArrowLeft size={14} />} {t('propertyEditor.backToDashboard')}
        </button>
        <span className="text-secondary-gold font-bold tracking-widest text-[10px] uppercase">{t('propertyEditor.propertyManagement')}</span>
        <h1 className="font-headline text-2xl font-bold text-primary-navy mt-1">{t('propertyEditor.editProperty')}</h1>
      </div>

      {/* Media Gallery */}
      <section className="bg-white rounded-[20px] p-6 border border-primary-navy/5 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-primary-navy uppercase tracking-wide">{t('propertyEditor.mediaGallery')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {form.gallery.map((img, i) => (
            <div key={i} className="relative group aspect-[4/5] rounded-xl overflow-hidden bg-primary-navy/5">
              <OptimizedImage src={img.url} alt={img.label || ''} className="w-full h-full" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                <button onClick={() => removeImage(i)} className="opacity-0 group-hover:opacity-100 transition-opacity p-2 bg-white rounded-full shadow-lg"><X size={14} className="text-red-500" /></button>
              </div>
              {img.label && img.label.trim() !== '' && (
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                  <p className="text-white text-xs font-bold truncate">{img.label}</p>
                </div>
              )}
            </div>
          ))}
          <label className="aspect-[4/5] rounded-xl border-2 border-dashed border-primary-navy/15 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-secondary-gold/50 hover:bg-secondary-gold/[0.02] transition-all">
            {uploading ? (
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-primary-navy/20 border-t-secondary-gold rounded-full animate-spin mx-auto mb-2" />
                {uploadProgress !== null && <p className="text-[10px] font-bold text-primary-navy/40">{uploadProgress}%</p>}
              </div>
            ) : (
              <>
                <Upload size={20} className="text-primary-navy/25" />
                <span className="text-[10px] font-bold text-primary-navy/30 uppercase tracking-wider">{t('propertyEditor.addImage')}</span>
              </>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
          </label>
        </div>
        <div className="flex gap-2">
          <input type="text" dir={dir} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder={t('propertyEditor.labelForUpload')} className={cn("flex-1 bg-pearl-white border border-primary-navy/10 rounded-xl py-2.5 px-4 text-xs placeholder:text-primary-navy/25 focus:ring-1 focus:ring-secondary-gold/50 outline-none", textAlignClass)} />
        </div>
      </section>

      {/* Property Details */}
      <section className="bg-white rounded-[20px] p-6 border border-primary-navy/5 shadow-sm space-y-5">
        <h3 className="text-sm font-bold text-primary-navy uppercase tracking-wide">{t('propertyEditor.propertyDetails')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('propertyEditor.propertyName')}</label>
            <input type="text" dir={dir} value={form.name.en} onChange={(e) => setForm(prev => ({ ...prev, name: { ...prev.name, en: e.target.value } }))} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('propertyEditor.capacityGuests')}</label>
            <input type="number" dir={dir} value={form.capacity} onChange={(e) => setForm(prev => ({ ...prev, capacity: parseInt(e.target.value) || 0 }))} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('propertyEditor.areaM2')}</label>
            <input type="number" dir={dir} value={form.area_sqm} onChange={(e) => setForm(prev => ({ ...prev, area_sqm: parseInt(e.target.value) || 0 }))} className={inputClass} />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold flex items-center gap-1.5">
            <Languages size={12} /> {t('propertyEditor.propertyNameAr')}
          </label>
          <input type="text" dir="rtl" value={form.name.ar} onChange={(e) => setForm(prev => ({ ...prev, name: { ...prev.name, ar: e.target.value } }))} placeholder={t('propertyEditor.propertyNameArPlaceholder')} className={cn(baseInputClass, "text-right")} />
        </div>
      </section>

      {/* Dynamic Pricing — Day-of-Week Rates */}
      <section className="bg-white rounded-[20px] p-6 border border-primary-navy/5 shadow-sm space-y-5">
        <div className="flex items-center gap-2">
          <Tag size={16} className="text-secondary-gold" />
          <h3 className="text-sm font-bold text-primary-navy uppercase tracking-wide">{t('propertyEditor.dynamicPricing')}</h3>
        </div>

        <p className="text-[10px] text-primary-navy/40 font-medium mb-1">
          {t('propertyEditor.dynamicPricingHint')}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {([
            ['sunday_rate', t('propertyEditor.daySun')],
            ['monday_rate', t('propertyEditor.dayMon')],
            ['tuesday_rate', t('propertyEditor.dayTue')],
            ['wednesday_rate', t('propertyEditor.dayWed')],
            ['thursday_rate', t('propertyEditor.dayThu')],
            ['friday_rate', t('propertyEditor.dayFri')],
            ['saturday_rate', t('propertyEditor.daySat')],
          ] as [keyof PricingSettings, string][]).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{label} {t('propertyEditor.rateOmrSuffix')}</label>
              <input type="number" dir={dir} value={form.pricing[key] as number} onChange={(e) => setPricing({ [key]: parseInt(e.target.value) || 0 })} className={inputClass} />
            </div>
          ))}
        </div>

        {/* Event Booking */}
        {features.hasEvent && (
        <div className="pt-4 border-t border-primary-navy/5">
          <div className="flex items-center gap-2 mb-3">
            <Tag size={14} className="text-secondary-gold" />
            <h4 className="text-xs font-bold text-primary-navy uppercase tracking-wide">{t('propertyEditor.eventBooking')}</h4>
          </div>
          <p className="text-[10px] text-primary-navy/40 font-medium mb-3">
            {t('propertyEditor.eventBookingHint')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('propertyEditor.eventCategoryName')}</label>
              <input
                type="text"
                dir={dir}
                value={form.pricing.event_category_name || ''}
                onChange={(e) => setPricing({ event_category_name: e.target.value })}
                placeholder={t('propertyEditor.eventCategoryPlaceholder')}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('propertyEditor.eventPricePerNight')}</label>
              <input
                type="number"
                dir={dir}
                value={form.pricing.event_rate ?? 0}
                onChange={(e) => setPricing({ event_rate: parseInt(e.target.value) || 0 })}
                className={inputClass}
              />
            </div>
          </div>
        </div>
        )}

        {/* Security Deposit */}
        <div className="pt-4 border-t border-primary-navy/5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('propertyEditor.securityDeposit')}</label>
              <input type="number" dir={dir} value={form.pricing.security_deposit} onChange={(e) => setPricing({ security_deposit: parseInt(e.target.value) || 0 })} className={inputClass} />
              <p className="text-[10px] text-primary-navy/40 font-medium">{t('propertyEditor.securityDepositHint')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Day-Use Time Slots */}
      {features.hasDayUse && (
      <section className="bg-white rounded-[20px] p-6 border border-primary-navy/5 shadow-sm space-y-5">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-secondary-gold" />
          <h3 className="text-sm font-bold text-primary-navy uppercase tracking-wide">{t('propertyEditor.dayUseTimeSlots')}</h3>
        </div>
        <p className="text-[10px] text-primary-navy/40 font-medium">
          {t('propertyEditor.dayUseTimeSlotsHint')}
        </p>

        {(form.pricing.day_use_slots || []).map(slot => (
          <div key={slot.id} className="bg-pearl-white rounded-xl p-4 space-y-3 border border-primary-navy/5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-primary-navy">{slot.name}</p>
                {slot.name_ar && <p className="text-xs text-primary-navy/50 font-medium" dir="rtl">{slot.name_ar}</p>}
                <p className="text-[10px] text-primary-navy/40 font-medium">{formatTime(slot.start_time)} – {formatTime(slot.end_time)}</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  dir="rtl"
                  value={slot.name_ar || ''}
                  onChange={(e) => updateSlot(slot.id, { name_ar: e.target.value })}
                  placeholder={t('propertyEditor.slotNameArPlaceholder')}
                  className="flex-1 sm:w-40 bg-white border border-primary-navy/10 rounded-lg py-1.5 px-3 text-xs text-right focus:ring-1 focus:ring-secondary-gold/50 outline-none"
                />
                <button onClick={() => removeSlot(slot.id)} className="text-primary-navy/20 hover:text-red-500 transition-colors shrink-0"><X size={16} /></button>
              </div>
            </div>
            <div className="overflow-x-auto -mx-1 px-1">
              <div className="grid grid-cols-7 gap-2 min-w-[320px]">
                {(['sunday_rate', 'monday_rate', 'tuesday_rate', 'wednesday_rate', 'thursday_rate', 'friday_rate', 'saturday_rate'] as (keyof DayUseSlot)[]).map((key, i) => (
                  <div key={key} className="space-y-1">
                    <label className="text-[8px] font-bold uppercase text-primary-navy/30 text-center block">{[t('propertyEditor.daySun'), t('propertyEditor.dayMon'), t('propertyEditor.dayTue'), t('propertyEditor.dayWed'), t('propertyEditor.dayThu'), t('propertyEditor.dayFri'), t('propertyEditor.daySat')][i]}</label>
                    <input
                      type="number"
                      dir={dir}
                      value={slot[key] as number}
                      onChange={(e) => updateSlot(slot.id, { [key]: parseInt(e.target.value) || 0 })}
                      className="w-full bg-white border border-primary-navy/10 rounded-lg py-2 px-1 text-xs font-medium text-center focus:ring-1 focus:ring-secondary-gold/50 outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        <div className="border-t border-primary-navy/5 pt-4 space-y-3">
          <p className="text-[10px] font-bold text-primary-navy/40 uppercase tracking-widest">{t('propertyEditor.addNewSlot')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">{t('propertyEditor.slotName')}</label>
              <input type="text" dir={dir} value={newSlotName} onChange={(e) => setNewSlotName(e.target.value)} placeholder={t('propertyEditor.slotNamePlaceholder')} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40 flex items-center gap-1.5">
                <Languages size={10} /> {t('propertyEditor.slotNameAr')}
              </label>
              <input type="text" dir="rtl" value={newSlotNameAr} onChange={(e) => setNewSlotNameAr(e.target.value)} placeholder={t('propertyEditor.slotNameArPlaceholder2')} className={cn(baseInputClass, "text-right")} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">{t('propertyEditor.startTime')}</label>
              <input type="time" dir={dir} value={newSlotStart} onChange={(e) => setNewSlotStart(e.target.value)} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">{t('propertyEditor.endTime')}</label>
              <input type="time" dir={dir} value={newSlotEnd} onChange={(e) => setNewSlotEnd(e.target.value)} className={inputClass} />
            </div>
          </div>
          <button
            onClick={addSlot}
            disabled={!newSlotName.trim() || !newSlotStart || !newSlotEnd}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-navy/5 rounded-xl text-primary-navy/60 hover:bg-primary-navy/10 transition-colors disabled:opacity-30 text-xs font-bold"
          >
            <Plus size={14} /> {t('propertyEditor.addSlot')}
          </button>
        </div>
      </section>
      )}

      {/* Special Date Overrides */}
      <section className="bg-white rounded-[20px] p-6 border border-primary-navy/5 shadow-sm space-y-5">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-secondary-gold" />
          <h3 className="text-sm font-bold text-primary-navy uppercase tracking-wide">{t('propertyEditor.specialDates')}</h3>
        </div>

        <p className="text-[10px] text-primary-navy/40 font-medium">
          {t('propertyEditor.specialDatesHint')}
        </p>

        {form.pricing.special_dates.length > 0 && (
          <div className="space-y-2">
            {form.pricing.special_dates
              .sort((a, b) => a.date.localeCompare(b.date))
              .map(s => (
              <div key={s.date} className="flex items-center justify-between bg-pearl-white rounded-xl px-4 py-3 gap-3">
                <span className="text-xs font-bold text-primary-navy min-w-[120px]">
                  {new Date(s.date).toLocaleDateString(isRTL ? 'ar-OM' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <div className="flex items-center gap-4 flex-1 justify-end">
                  {features.hasDayUse && (
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">{t('propertyEditor.dayUseLabel')}</span>
                    <span className="text-sm font-bold text-secondary-gold font-headline">{s.day_use_price} {t('common.omr')}</span>
                  </div>
                  )}
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">{t('propertyEditor.nightStayLabel')}</span>
                    <span className="text-sm font-bold text-secondary-gold font-headline">{s.night_stay_price} {t('common.omr')}</span>
                  </div>
                  <button onClick={() => removeSpecialDate(s.date)} className="text-primary-navy/20 hover:text-red-500 transition-colors">
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={cn("grid gap-2 items-end", features.hasDayUse ? "grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto]" : "grid-cols-1 sm:grid-cols-[1fr_auto_auto]")}>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">{t('propertyEditor.date')}</label>
            <input type="date" dir={dir} value={specialDate} onChange={(e) => setSpecialDate(e.target.value)} className={inputClass} />
          </div>
          {features.hasDayUse && (
          <div className="w-full sm:w-40 space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">
              {t('propertyEditor.dayUsePriceOmr')}
              {!isRTL && <span className="block text-primary-navy/35 font-medium normal-case tracking-normal" dir="rtl" lang="ar">{t('propertyEditor.dayUsePriceArHint')}</span>}
            </label>
            <input
              type="number"
              dir={dir}
              value={specialDayUsePrice}
              onChange={(e) => setSpecialDayUsePrice(e.target.value)}
              placeholder="150"
              className={inputClass}
            />
          </div>
          )}
          <div className="w-full sm:w-40 space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">
              {t('propertyEditor.nightStayPriceOmr')}
              {!isRTL && <span className="block text-primary-navy/35 font-medium normal-case tracking-normal" dir="rtl" lang="ar">{t('propertyEditor.nightStayPriceArHint')}</span>}
            </label>
            <input
              type="number"
              dir={dir}
              value={specialNightPrice}
              onChange={(e) => setSpecialNightPrice(e.target.value)}
              placeholder="250"
              className={inputClass}
            />
          </div>
          <button
            onClick={addSpecialDate}
            disabled={!specialDate || !specialNightPrice || (features.hasDayUse && !specialDayUsePrice)}
            className="px-4 py-3 bg-primary-navy/5 rounded-xl text-primary-navy/60 hover:bg-primary-navy/10 transition-colors disabled:opacity-30"
          >
            <Plus size={16} />
          </button>
        </div>
      </section>

      {/* Discount Rules */}
      <section className="bg-white rounded-[20px] p-6 border border-primary-navy/5 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Percent size={16} className="text-secondary-gold" />
            <h3 className="text-sm font-bold text-primary-navy uppercase tracking-wide">{t('propertyEditor.discountRules')}</h3>
          </div>
          <button
            onClick={() => setDiscount({ enabled: !form.pricing.discount?.enabled })}
            className={cn(
              "relative w-12 h-6 rounded-full transition-colors",
              form.pricing.discount?.enabled ? "bg-secondary-gold" : "bg-primary-navy/15"
            )}
          >
            <div className={cn(
              "absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
              form.pricing.discount?.enabled ? "translate-x-6" : "translate-x-0.5"
            )} />
          </button>
        </div>

        {form.pricing.discount?.enabled && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">{t('propertyEditor.discountType')}</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDiscount({ type: 'percent' })}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all",
                      form.pricing.discount.type === 'percent' ? "bg-primary-navy text-white" : "bg-pearl-white text-primary-navy/50 border border-primary-navy/10"
                    )}
                  >
                    {t('propertyEditor.percentage')}
                  </button>
                  <button
                    onClick={() => setDiscount({ type: 'flat' })}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all",
                      form.pricing.discount.type === 'flat' ? "bg-primary-navy text-white" : "bg-pearl-white text-primary-navy/50 border border-primary-navy/10"
                    )}
                  >
                    {t('propertyEditor.flatOmr')}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">
                  {form.pricing.discount.type === 'percent' ? t('propertyEditor.discountPercent') : t('propertyEditor.discountOmr')}
                </label>
                <input
                  type="number"
                  dir={dir}
                  value={form.pricing.discount.value}
                  onChange={(e) => setDiscount({ value: parseFloat(e.target.value) || 0 })}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">{t('propertyEditor.startDate')}</label>
                <input type="date" dir={dir} value={form.pricing.discount.start_date} onChange={(e) => setDiscount({ start_date: e.target.value })} className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">{t('propertyEditor.endDate')}</label>
                <input type="date" dir={dir} value={form.pricing.discount.end_date} onChange={(e) => setDiscount({ end_date: e.target.value })} className={inputClass} />
              </div>
            </div>
          </motion.div>
        )}
      </section>

      {/* Bank Transfer Details */}
      <section className="bg-white rounded-[20px] p-6 border border-primary-navy/5 shadow-sm space-y-5">
        <div className="flex items-center gap-2">
          <Landmark size={16} className="text-secondary-gold" />
          <h3 className="text-sm font-bold text-primary-navy uppercase tracking-wide">{t('propertyEditor.bankTransferDetails')}</h3>
        </div>
        <p className="text-[10px] text-primary-navy/40 font-medium">
          {t('propertyEditor.bankTransferHint')}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('propertyEditor.bankName')}</label>
            <input type="text" dir={dir} value={form.bank_name} onChange={(e) => setForm(prev => ({ ...prev, bank_name: e.target.value }))} placeholder={t('propertyEditor.bankNamePlaceholder')} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('propertyEditor.accountName')}</label>
            <input type="text" dir={dir} value={form.account_name} onChange={(e) => setForm(prev => ({ ...prev, account_name: e.target.value }))} placeholder={t('propertyEditor.accountNamePlaceholder')} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('propertyEditor.ibanAccount')}</label>
            <input type="text" dir={dir} value={form.iban} onChange={(e) => setForm(prev => ({ ...prev, iban: e.target.value }))} placeholder={t('propertyEditor.ibanPlaceholder')} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('propertyEditor.bankPhone')}</label>
            <input type="text" dir={dir} value={form.bankPhone} onChange={(e) => setForm(prev => ({ ...prev, bankPhone: e.target.value }))} placeholder={t('propertyEditor.bankPhonePlaceholder')} className={inputClass} />
            <p className="text-[10px] text-primary-navy/40 font-medium">{t('propertyEditor.bankPhoneHint')}</p>
          </div>
        </div>
      </section>

      {/* About Us */}
      <section className="bg-white rounded-[20px] p-6 border border-primary-navy/5 shadow-sm space-y-5">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-secondary-gold" />
          <h3 className="text-sm font-bold text-primary-navy uppercase tracking-wide">{t('propertyEditor.aboutUs')}</h3>
        </div>
        <p className="text-[10px] text-primary-navy/40 font-medium">
          {t('propertyEditor.aboutHint')}
        </p>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('propertyEditor.aboutEnglish')}</label>
          <textarea
            dir="ltr"
            value={form.aboutEn}
            onChange={(e) => setForm(prev => ({ ...prev, aboutEn: e.target.value }))}
            rows={8}
            placeholder={t('propertyEditor.aboutPlaceholderEn')}
            className={cn(baseInputClass, "leading-relaxed resize-none text-left")}
          />
          <p className="text-[10px] text-primary-navy/40 font-medium">
            {form.aboutEn.length > 0 ? t('propertyEditor.charsCount', { count: form.aboutEn.length }) : t('propertyEditor.aboutEmptyEn')}
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold flex items-center gap-1.5">
            <Languages size={12} /> {t('propertyEditor.aboutArabic')}
          </label>
          <textarea
            dir="rtl"
            value={form.aboutAr}
            onChange={(e) => setForm(prev => ({ ...prev, aboutAr: e.target.value }))}
            rows={8}
            placeholder={t('propertyEditor.aboutPlaceholderAr')}
            className={cn(baseInputClass, "leading-relaxed resize-none text-right")}
          />
          <p className="text-[10px] text-primary-navy/40 font-medium">
            {form.aboutAr.length > 0 ? t('propertyEditor.charsCount', { count: form.aboutAr.length }) : t('propertyEditor.aboutEmptyAr')}
          </p>
        </div>
      </section>

      {/* Terms of Stay — Public Page */}
      <section className="bg-white rounded-[20px] p-6 border border-primary-navy/5 shadow-sm space-y-5">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-secondary-gold" />
          <h3 className="text-sm font-bold text-primary-navy uppercase tracking-wide">{t('propertyEditor.termsPublic')}</h3>
        </div>
        <p className="text-[10px] text-primary-navy/40 font-medium">
          {t('propertyEditor.termsPublicHint')}
        </p>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('propertyEditor.termsPublicEn')}</label>
          <textarea
            dir="ltr"
            value={form.termsEn}
            onChange={(e) => setForm(prev => ({ ...prev, termsEn: e.target.value }))}
            rows={12}
            placeholder={t('propertyEditor.termsPublicPlaceholderEn')}
            className={cn(baseInputClass, "leading-relaxed resize-none text-left")}
          />
          <p className="text-[10px] text-primary-navy/40 font-medium">
            {form.termsEn.length > 0 ? t('propertyEditor.charsCount', { count: form.termsEn.length }) : t('propertyEditor.termsEmptyEn')}
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold flex items-center gap-1.5">
            <Languages size={12} /> {t('propertyEditor.termsPublicAr')}
          </label>
          <textarea
            dir="rtl"
            value={form.termsAr}
            onChange={(e) => setForm(prev => ({ ...prev, termsAr: e.target.value }))}
            rows={12}
            placeholder={t('propertyEditor.termsPublicPlaceholderAr')}
            className={cn(baseInputClass, "leading-relaxed resize-none text-right")}
          />
          <p className="text-[10px] text-primary-navy/40 font-medium">
            {form.termsAr.length > 0 ? t('propertyEditor.charsCount', { count: form.termsAr.length }) : t('propertyEditor.termsEmptyAr')}
          </p>
        </div>
      </section>

      {/* Terms of Stay — Booking Checkout Popup */}
      <section className="bg-white rounded-[20px] p-6 border border-primary-navy/5 shadow-sm space-y-5">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-secondary-gold" />
          <h3 className="text-sm font-bold text-primary-navy uppercase tracking-wide">{t('propertyEditor.termsCheckout')}</h3>
        </div>
        <p className="text-[10px] text-primary-navy/40 font-medium">
          {t('propertyEditor.termsCheckoutHint')}
        </p>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('propertyEditor.termsCheckoutEn')}</label>
          <textarea
            dir="ltr"
            value={form.termsOfStay.en}
            onChange={(e) => setForm(prev => ({ ...prev, termsOfStay: { ...prev.termsOfStay, en: e.target.value } }))}
            rows={10}
            placeholder={t('propertyEditor.termsCheckoutPlaceholderEn')}
            className={cn(baseInputClass, "leading-relaxed resize-none font-mono text-xs text-left")}
          />
          <p className="text-[10px] text-primary-navy/40 font-medium">
            {form.termsOfStay.en.length > 0 ? t('propertyEditor.charsCount', { count: form.termsOfStay.en.length }) : t('propertyEditor.termsCheckoutEmptyEn')}
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold flex items-center gap-1.5">
            <Languages size={12} /> {t('propertyEditor.termsCheckoutAr')}
          </label>
          <textarea
            dir="rtl"
            value={form.termsOfStay.ar}
            onChange={(e) => setForm(prev => ({ ...prev, termsOfStay: { ...prev.termsOfStay, ar: e.target.value } }))}
            rows={10}
            placeholder={t('propertyEditor.termsCheckoutPlaceholderAr')}
            className={cn(baseInputClass, "leading-relaxed resize-none font-mono text-xs text-right")}
          />
          <p className="text-[10px] text-primary-navy/40 font-medium">
            {form.termsOfStay.ar.length > 0 ? t('propertyEditor.charsCount', { count: form.termsOfStay.ar.length }) : t('propertyEditor.termsCheckoutEmptyAr')}
          </p>
        </div>
      </section>

      {/* Footer & Contact */}
      <section className="bg-white rounded-[20px] p-6 border border-primary-navy/5 shadow-sm space-y-5">
        <h3 className="text-sm font-bold text-primary-navy uppercase tracking-wide">{t('propertyEditor.footerContact')}</h3>
        <p className="text-[10px] text-primary-navy/40 font-medium">
          {t('propertyEditor.footerHint')}
        </p>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('propertyEditor.footerDescEn')}</label>
          <textarea
            dir="ltr"
            value={form.footerText.en}
            onChange={(e) => setForm(prev => ({ ...prev, footerText: { ...prev.footerText, en: e.target.value } }))}
            rows={3}
            placeholder={t('propertyEditor.footerDescPlaceholderEn')}
            className={cn(baseInputClass, "leading-relaxed resize-none text-left")}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold flex items-center gap-1.5">
            <Languages size={12} /> {t('propertyEditor.footerDescAr')}
          </label>
          <textarea
            dir="rtl"
            value={form.footerText.ar}
            onChange={(e) => setForm(prev => ({ ...prev, footerText: { ...prev.footerText, ar: e.target.value } }))}
            rows={3}
            placeholder={t('propertyEditor.footerDescPlaceholderAr')}
            className={cn(baseInputClass, "leading-relaxed resize-none text-right")}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('propertyEditor.whatsappNumber')}</label>
          <input
            type="tel"
            dir={dir}
            value={form.whatsappNumber}
            onChange={(e) => setForm(prev => ({ ...prev, whatsappNumber: e.target.value }))}
            placeholder={t('propertyEditor.whatsappPlaceholder')}
            className={inputClass}
          />
          <p className="text-[10px] text-primary-navy/40 font-medium">{t('propertyEditor.whatsappHint')}</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('propertyEditor.tourismLicense')}</label>
          <input
            type="text"
            dir={dir}
            value={form.licenseNumber}
            onChange={(e) => setForm(prev => ({ ...prev, licenseNumber: e.target.value }))}
            placeholder={t('propertyEditor.tourismLicensePlaceholder')}
            className={inputClass}
          />
          <p className="text-[10px] text-primary-navy/40 font-medium">{t('propertyEditor.tourismLicenseHint')}</p>
        </div>
      </section>

      {/* Description */}
      <section className="bg-white rounded-[20px] p-6 border border-primary-navy/5 shadow-sm space-y-5">
        <h3 className="text-sm font-bold text-primary-navy uppercase tracking-wide">{t('propertyEditor.description')}</h3>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('propertyEditor.sectionHeadline')}</label>
          <input type="text" dir={dir} value={form.headline.en} onChange={(e) => setForm(prev => ({ ...prev, headline: { ...prev.headline, en: e.target.value } }))} placeholder={t('propertyEditor.sectionHeadlinePlaceholder')} className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold flex items-center gap-1.5">
            <Languages size={12} /> {t('propertyEditor.sectionHeadlineAr')}
          </label>
          <input type="text" dir="rtl" value={form.headline.ar} onChange={(e) => setForm(prev => ({ ...prev, headline: { ...prev.headline, ar: e.target.value } }))} placeholder={t('propertyEditor.sectionHeadlineArPlaceholder')} className={cn(baseInputClass, "text-right")} />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('propertyEditor.summaryText')}</label>
          <textarea dir="ltr" value={form.description.en} onChange={(e) => setForm(prev => ({ ...prev, description: { ...prev.description, en: e.target.value } }))} rows={4} className={cn(baseInputClass, "leading-relaxed resize-none text-left")} />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold flex items-center gap-1.5">
            <Languages size={12} /> {t('propertyEditor.summaryTextAr')}
          </label>
          <textarea dir="rtl" value={form.description.ar} onChange={(e) => setForm(prev => ({ ...prev, description: { ...prev.description, ar: e.target.value } }))} rows={4} placeholder={t('propertyEditor.summaryArPlaceholder')} className={cn(baseInputClass, "leading-relaxed resize-none text-right")} />
        </div>
      </section>

      {/* Property Quick Facts */}
      <section className="bg-white rounded-[20px] p-6 border border-primary-navy/5 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-primary-navy uppercase tracking-wide">{t('propertyEditor.quickFacts')}</h3>
        <div className="space-y-2">
          {(form.quickFacts || []).map((fact, i) => (
            <div key={i} className="flex items-center gap-2 bg-pearl-white border border-primary-navy/10 rounded-xl px-4 py-2.5">
              <span className="text-xs font-bold text-secondary-gold min-w-[60px]">{fact.icon}</span>
              <span className="text-xs font-bold text-primary-navy min-w-[120px]">{fact.label}</span>
              <span className="text-xs text-primary-navy/50 flex-1" dir="rtl">{fact.label_ar || '—'}</span>
              <button onClick={() => removeQuickFact(i)} className="text-primary-navy/30 hover:text-red-500 transition-colors"><X size={14} /></button>
            </div>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            dir={dir}
            value={newFactIcon}
            onChange={(e) => setNewFactIcon(e.target.value)}
            className={cn("w-full sm:w-36 bg-pearl-white border border-primary-navy/10 rounded-xl py-2.5 px-3 text-xs font-bold focus:ring-1 focus:ring-secondary-gold/50 outline-none", textAlignClass)}
          >
            <option value="">{t('propertyEditor.iconStar')}</option>
            {[
              { key: 'Users', label: 'Users' },
              { key: 'Ruler', label: 'Ruler' },
              { key: 'Bed', label: 'Bed' },
              { key: 'Bath', label: 'Bath' },
              { key: 'Car', label: 'Car' },
              { key: 'Wifi', label: 'Wifi' },
              { key: 'Wind', label: 'Wind' },
              { key: 'Flame', label: 'Flame' },
              { key: 'Waves', label: 'Waves' },
              { key: 'TreePalm', label: 'TreePalm' },
              { key: 'Shield', label: 'Shield' },
              { key: 'Star', label: 'Star' },
              { key: 'Coffee', label: 'Coffee' },
              { key: 'Utensils', label: 'Utensils' },
              { key: 'Tv', label: 'Tv' },
              { key: 'Dumbbell', label: 'Dumbbell' },
              { key: 'Baby', label: 'Baby' },
              { key: 'BBQ', label: 'BBQ' },
              { key: 'Pool', label: 'Pool' },
              { key: 'GardenLounge', label: 'Garden Lounge' },
            ].map(ic => (
              <option key={ic.key} value={ic.key}>{ic.label}</option>
            ))}
          </select>
          <div className="flex flex-1 gap-2 min-w-0">
            <input type="text" dir={dir} value={newFactLabel} onChange={(e) => setNewFactLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addQuickFact()} placeholder={t('propertyEditor.labelEnglish')} className={cn("flex-1 bg-pearl-white border border-primary-navy/10 rounded-xl py-2.5 px-4 text-xs placeholder:text-primary-navy/25 focus:ring-1 focus:ring-secondary-gold/50 outline-none", textAlignClass)} />
            <input type="text" dir="rtl" value={newFactLabelAr} onChange={(e) => setNewFactLabelAr(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addQuickFact()} placeholder={t('propertyEditor.labelArabic')} className="flex-1 bg-pearl-white border border-primary-navy/10 rounded-xl py-2.5 px-4 text-xs text-right placeholder:text-primary-navy/25 focus:ring-1 focus:ring-secondary-gold/50 outline-none" />
          </div>
          <button onClick={addQuickFact} disabled={!newFactLabel.trim()} className="sm:self-auto self-end px-4 py-2.5 bg-primary-navy/5 rounded-xl text-primary-navy/60 hover:bg-primary-navy/10 transition-colors disabled:opacity-30">
            <Plus size={16} />
          </button>
        </div>
      </section>

      {/* Feature Sections */}
      <section className="bg-white rounded-[20px] p-6 border border-primary-navy/5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <LayoutGrid size={16} className="text-secondary-gold" />
          <h3 className="text-sm font-bold text-primary-navy uppercase tracking-wide">{t('propertyEditor.featureSections')}</h3>
        </div>
        <p className="text-[10px] text-primary-navy/40 font-medium">
          {t('propertyEditor.featureSectionsHint')}
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {form.featureSections.map((section, idx) => {
            const draft = newItemInputs[idx] || { en: '', ar: '' };
            const canAddItem = !!(draft.en.trim() || draft.ar.trim());
            return (
              <div key={idx} className="bg-pearl-white border border-primary-navy/10 rounded-2xl p-4 space-y-4">
                <div className="flex items-start gap-2">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('propertyEditor.titleEnglish')}</label>
                      <input
                        type="text"
                        dir={dir}
                        value={section.titleEn}
                        onChange={(e) => updateSectionTitle(idx, { titleEn: e.target.value })}
                        placeholder={t('propertyEditor.titleEnPlaceholder')}
                        className={cn("w-full bg-white border border-primary-navy/10 rounded-lg py-2 px-3 text-sm font-bold text-primary-navy placeholder:text-primary-navy/25 focus:ring-1 focus:ring-secondary-gold/50 outline-none", textAlignClass)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold flex items-center gap-1">
                        <Languages size={10} /> {t('propertyEditor.titleArabic')}
                      </label>
                      <input
                        type="text"
                        dir="rtl"
                        value={section.titleAr}
                        onChange={(e) => updateSectionTitle(idx, { titleAr: e.target.value })}
                        placeholder={t('propertyEditor.titleArPlaceholder')}
                        className="w-full bg-white border border-primary-navy/10 rounded-lg py-2 px-3 text-sm font-bold text-primary-navy text-right placeholder:text-primary-navy/25 focus:ring-1 focus:ring-secondary-gold/50 outline-none"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => removeSection(idx)}
                    aria-label={t('propertyEditor.deleteSection')}
                    className="mt-5 p-2 text-primary-navy/30 hover:text-red-500 hover:bg-red-500/5 rounded-lg transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="space-y-1.5">
                  {section.items.map((item, j) => (
                    <div key={j} className="flex items-start gap-2">
                      <div className="flex-1 flex flex-col sm:flex-row gap-2 min-w-0">
                        <input
                          type="text"
                          dir={dir}
                          value={item.en}
                          onChange={(e) => updateItem(idx, j, { en: e.target.value })}
                          placeholder={t('propertyEditor.english')}
                          className={cn("flex-1 bg-white border border-primary-navy/10 rounded-lg py-2 px-3 text-xs font-bold text-primary-navy/80 placeholder:text-primary-navy/25 focus:ring-1 focus:ring-secondary-gold/50 outline-none", textAlignClass)}
                        />
                        <input
                          type="text"
                          dir="rtl"
                          value={item.ar}
                          onChange={(e) => updateItem(idx, j, { ar: e.target.value })}
                          placeholder={t('propertyEditor.arabic')}
                          className="flex-1 bg-white border border-primary-navy/10 rounded-lg py-2 px-3 text-xs font-bold text-primary-navy/80 text-right placeholder:text-primary-navy/25 focus:ring-1 focus:ring-secondary-gold/50 outline-none"
                        />
                      </div>
                      <button
                        onClick={() => removeItemFromSection(idx, j)}
                        aria-label={t('propertyEditor.removeItem')}
                        className="mt-1.5 sm:mt-0 p-1.5 text-primary-navy/25 hover:text-red-500 transition-colors shrink-0"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {section.items.length === 0 && (
                    <p className="text-[10px] text-primary-navy/30 font-medium italic px-1">{t('propertyEditor.noItemsYet')}</p>
                  )}
                </div>

                <div className="border-t border-primary-navy/5 pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40 mb-1.5">{t('propertyEditor.addItem')}</p>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 flex flex-col sm:flex-row gap-2 min-w-0">
                      <input
                        type="text"
                        dir={dir}
                        value={draft.en}
                        onChange={(e) => setNewItemInputs(prev => ({ ...prev, [idx]: { ...(prev[idx] || { en: '', ar: '' }), en: e.target.value } }))}
                        onKeyDown={(e) => e.key === 'Enter' && addItemToSection(idx)}
                        placeholder={t('propertyEditor.addItemEnPlaceholder')}
                        className={cn("flex-1 bg-white border border-primary-navy/10 rounded-lg py-2 px-3 text-xs placeholder:text-primary-navy/25 focus:ring-1 focus:ring-secondary-gold/50 outline-none", textAlignClass)}
                      />
                      <input
                        type="text"
                        dir="rtl"
                        value={draft.ar}
                        onChange={(e) => setNewItemInputs(prev => ({ ...prev, [idx]: { ...(prev[idx] || { en: '', ar: '' }), ar: e.target.value } }))}
                        onKeyDown={(e) => e.key === 'Enter' && addItemToSection(idx)}
                        placeholder={t('propertyEditor.addItemArPlaceholder')}
                        className="flex-1 bg-white border border-primary-navy/10 rounded-lg py-2 px-3 text-xs text-right placeholder:text-primary-navy/25 focus:ring-1 focus:ring-secondary-gold/50 outline-none"
                      />
                    </div>
                    <button
                      onClick={() => addItemToSection(idx)}
                      disabled={!canAddItem}
                      className="mt-1.5 sm:mt-0 px-3 py-2 bg-primary-navy/5 rounded-lg text-primary-navy/60 hover:bg-primary-navy/10 transition-colors disabled:opacity-30 shrink-0"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={addSection}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-primary-navy/15 rounded-2xl text-primary-navy/50 hover:border-secondary-gold/50 hover:text-secondary-gold hover:bg-secondary-gold/[0.02] transition-all text-xs font-bold uppercase tracking-widest"
        >
          <Plus size={14} /> {t('propertyEditor.addNewSection')}
        </button>
      </section>

      {/* Save */}
      <div className="flex justify-end gap-3 pt-2">
        <AnimatePresence>
          {saved && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="flex items-center gap-2 text-emerald-600 text-sm font-bold">
              <Check size={16} /> {t('propertyEditor.changesSaved')}
            </motion.div>
          )}
        </AnimatePresence>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-primary-navy text-white px-8 py-3.5 rounded-xl font-bold text-xs uppercase tracking-widest active:scale-[0.98] transition-all disabled:opacity-60 shadow-lg shadow-primary-navy/20">
          {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={16} />}
          {saving ? t('propertyEditor.saving') : t('propertyEditor.saveChanges')}
        </button>
      </div>
    </div>
  );
};

export const PropertyEditor = React.memo(PropertyEditorComponent);
