import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Star, Send, ArrowLeft, MessageSquare } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { testimonialsApi } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface Testimonial {
  id?: string;
  guest_name: string;
  guest_phone: string;
  property_name: string;
  rating: number;
  text: string;
  stay_details: string;
  created_at: string;
}

export const Testimonials: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    guest_name: '',
    guest_phone: '',
    property_name: 'Woody Chalete',
    rating: 0,
    text: '',
    stay_details: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    testimonialsApi.list()
      .then(data => setTestimonials(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async () => {
    const errs: Record<string, string> = {};
    if (!form.guest_name.trim()) errs.guest_name = 'Name is required';
    if (!form.guest_phone.trim()) errs.guest_phone = 'Phone is required';
    if (form.rating === 0) errs.rating = 'Please select a rating';
    if (!form.text.trim()) errs.text = 'Please share your experience';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const newT = await testimonialsApi.create({
        ...form,
        guest_phone: `+968${form.guest_phone.replace(/\s/g, '')}`,
        stay_details: form.stay_details || 'Recent Stay',
      });
      setTestimonials(prev => [newT as Testimonial, ...prev]);
      setSubmitted(true);
      setShowForm(false);
      setForm({ guest_name: '', guest_phone: '', property_name: 'Woody Chalete', rating: 0, text: '', stay_details: '' });
    } catch (err) {
      console.error('Failed to submit:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-10 max-w-lg mx-auto">
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-primary-navy/60 hover:text-primary-navy transition-colors text-sm font-medium"
      >
        <ArrowLeft size={18} />
        {t('login.backToHome')}
      </button>

      <section className="text-center space-y-2">
        <span className="text-secondary-gold font-bold tracking-widest text-[10px] uppercase">{t('testimonials.guestReviews')}</span>
        <h2 className="font-headline text-4xl font-bold text-primary-navy">{t('testimonials.shareExperience')}</h2>
        <p className="text-primary-navy/60 text-sm max-w-xs mx-auto">
          {t('testimonials.feedbackHelps', { name: t('common.alMalak') })}
        </p>
      </section>

      {submitted && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-emerald-50 text-emerald-700 p-4 rounded-xl text-sm font-medium text-center"
        >
          {t('testimonials.reviewSubmitted')}
        </motion.div>
      )}

      {!showForm ? (
        <button
          onClick={() => { setShowForm(true); setSubmitted(false); }}
          className="w-full bg-primary-navy text-white py-4 rounded-[20px] font-bold text-sm uppercase tracking-widest shadow-xl shadow-primary-navy/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          <MessageSquare size={18} />
          {t('testimonials.writeReview')}
        </button>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[24px] p-6 shadow-sm border border-primary-navy/5 space-y-5"
        >
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('testimonials.yourName')} *</label>
            <input
              type="text"
              value={form.guest_name}
              onChange={(e) => setForm(p => ({ ...p, guest_name: e.target.value }))}
              placeholder={t('testimonials.placeholderName')}
              className={cn("w-full bg-surface-container-low border rounded-xl py-3 px-4 text-sm placeholder:text-primary-navy/20", errors.guest_name ? "border-red-300" : "border-transparent")}
            />
            {errors.guest_name && <p className="text-red-500 text-xs">{errors.guest_name}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('testimonials.yourPhone')} *</label>
            <div className="flex gap-2">
              <div className="bg-surface-container-low rounded-xl py-3 px-3 text-sm font-bold text-primary-navy/60">+968</div>
              <input
                type="text"
                value={form.guest_phone}
                onChange={(e) => setForm(p => ({ ...p, guest_phone: e.target.value.replace(/[^\d\s]/g, '') }))}
                placeholder="9000 0000"
                maxLength={9}
                className={cn("flex-1 bg-surface-container-low border rounded-xl py-3 px-4 text-sm placeholder:text-primary-navy/20", errors.guest_phone ? "border-red-300" : "border-transparent")}
              />
            </div>
            {errors.guest_phone && <p className="text-red-500 text-xs">{errors.guest_phone}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('testimonials.stayDetails')}</label>
            <input
              type="text"
              value={form.stay_details}
              onChange={(e) => setForm(p => ({ ...p, stay_details: e.target.value }))}
              placeholder={t('testimonials.placeholderStayDetails')}
              className="w-full bg-surface-container-low border border-transparent rounded-xl py-3 px-4 text-sm placeholder:text-primary-navy/20"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('testimonials.tapToRate')} *</label>
            <div className="flex gap-2 py-2">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  type="button"
                  onClick={() => { setForm(p => ({ ...p, rating: star })); setErrors(prev => ({ ...prev, rating: '' })); }}
                  className="transition-transform hover:scale-110 active:scale-95"
                >
                  <Star
                    size={32}
                    className={star <= form.rating ? "text-secondary-gold" : "text-primary-navy/15"}
                    fill={star <= form.rating ? "currentColor" : "none"}
                  />
                </button>
              ))}
            </div>
            {errors.rating && <p className="text-red-500 text-xs">{errors.rating}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('testimonials.yourExperience')} *</label>
            <textarea
              value={form.text}
              onChange={(e) => setForm(p => ({ ...p, text: e.target.value }))}
              placeholder={t('testimonials.placeholderExperience')}
              rows={4}
              className={cn("w-full bg-surface-container-low border rounded-xl py-3 px-4 text-sm placeholder:text-primary-navy/20 resize-none", errors.text ? "border-red-300" : "border-transparent")}
            />
            {errors.text && <p className="text-red-500 text-xs">{errors.text}</p>}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 py-3 rounded-xl border border-primary-navy/20 font-bold text-xs uppercase tracking-widest text-primary-navy"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 py-3 rounded-xl bg-primary-navy text-white font-bold text-xs uppercase tracking-widest shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Send size={14} />
                  {t('testimonials.submitReview')}
                </>
              )}
            </button>
          </div>
        </motion.div>
      )}

      {/* Existing Testimonials */}
      <section className="space-y-4">
        <h3 className="font-headline text-xl font-bold text-primary-navy">{t('testimonials.guestReviews')}</h3>
        {loading ? (
          <div className="space-y-4 animate-pulse">
            {[1, 2].map(i => <div key={i} className="h-40 bg-primary-navy/5 rounded-xl" />)}
          </div>
        ) : testimonials.length === 0 ? (
          <p className="text-center text-sm text-primary-navy/40 py-8">{t('testimonials.noReviews')}</p>
        ) : (
          testimonials.map((tm, i) => (
            <motion.div
              key={tm.id || i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white p-6 rounded-[20px] border-s-4 border-secondary-gold shadow-sm space-y-3"
            >
              <div>
                <h4 className="text-sm font-bold text-primary-navy">{tm.guest_name}</h4>
                <p className="text-[10px] text-primary-navy/50 font-medium">{tm.property_name} {tm.stay_details && `\u2022 ${tm.stay_details}`}</p>
              </div>
              <p className="text-sm italic text-primary-navy/80 leading-relaxed">"{tm.text}"</p>
              <div className="flex text-secondary-gold">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Star key={j} size={12} fill={j < tm.rating ? 'currentColor' : 'none'} />
                ))}
              </div>
            </motion.div>
          ))
        )}
      </section>
    </div>
  );
};
