import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';

const DEFAULT_TERMS_EN = `1. Booking & Payment
All reservations require a security deposit at the time of booking. Full payment is due upon check-in. Accepted methods include Thawani, bank transfer, and walk-in payment.

2. Check-In & Check-Out
Check-in is available from 2:00 PM. Check-out must be completed by 11:00 AM. Early check-in or late check-out may be arranged subject to availability.

3. Cancellation Policy
Cancellations made 48 hours prior to check-in are eligible for a full refund of the security deposit. Late cancellations may incur a charge equivalent to one night's stay.

4. Property Rules
Guests are expected to maintain the property in good condition. Any damages beyond normal wear and tear will be deducted from the security deposit. Smoking is permitted only in designated outdoor areas.

5. Privacy & Security
Your personal information is collected solely for the purpose of managing your reservation. We do not share guest data with third parties. The property is monitored by perimeter security for your safety.`;

const DEFAULT_TERMS_AR = `1. الحجز والدفع
تتطلب جميع الحجوزات دفع تأمين قابل للاسترداد عند الحجز. يُستحق المبلغ كاملاً عند تسجيل الوصول. وسائل الدفع المقبولة: ثواني، التحويل البنكي، والدفع المباشر.

2. تسجيل الوصول والمغادرة
تسجيل الوصول من الساعة 2:00 مساءً. تسجيل المغادرة قبل الساعة 11:00 صباحاً. يمكن ترتيب وصول مبكر أو مغادرة متأخرة حسب التوفر.

3. سياسة الإلغاء
الإلغاءات قبل 48 ساعة من تسجيل الوصول تستحق استرداداً كاملاً للتأمين. الإلغاءات المتأخرة قد يترتب عليها رسوم تعادل ليلة واحدة.

4. قواعد العقار
يُتوقع من الضيوف الحفاظ على العقار بحالة جيدة. أي أضرار تتجاوز الاستخدام الطبيعي تُخصم من مبلغ التأمين. التدخين مسموح فقط في المناطق الخارجية المخصصة.

5. الخصوصية والأمان
تُجمع بياناتك الشخصية فقط لغرض إدارة حجزك. لا نشارك بيانات الضيوف مع أي طرف ثالث. العقار مُراقب بنظام أمن محيطي لسلامتك.`;

export const Terms: React.FC = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [termsEn, setTermsEn] = useState('');
  const [termsAr, setTermsAr] = useState('');

  useEffect(() => {
    getDoc(doc(db, 'settings', 'property_details'))
      .then(snap => {
        if (!snap.exists()) return;
        const data = snap.data() as any;
        setTermsEn(typeof data.termsEn === 'string' ? data.termsEn : '');
        setTermsAr(typeof data.termsAr === 'string' ? data.termsAr : '');
      })
      .catch(console.error);
  }, []);

  const enText = termsEn.trim() || DEFAULT_TERMS_EN;
  const arText = termsAr.trim() || DEFAULT_TERMS_AR;
  const text = isAr ? arText : enText;

  return (
    <div className="p-6 space-y-8 max-w-lg mx-auto pb-24">
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-primary-navy/60 hover:text-primary-navy transition-colors text-sm font-medium"
      >
        <ArrowLeft size={18} />
        {t('login.backToHome')}
      </button>

      <section className="text-center space-y-2">
        <span className="text-secondary-gold font-bold tracking-widest text-[10px] uppercase">
          {isAr ? 'قانوني' : 'Legal'}
        </span>
        <h2 className="font-headline text-3xl font-bold text-primary-navy">
          {t('sanctuary.termsOfStay')}
        </h2>
      </section>

      <div
        dir={isAr ? 'rtl' : 'ltr'}
        className="bg-white rounded-[20px] p-6 border border-primary-navy/5 shadow-sm text-sm text-primary-navy/70 leading-relaxed whitespace-pre-wrap"
      >
        {text}
      </div>

      <p className="text-[10px] text-center text-primary-navy/30 font-bold uppercase tracking-widest">
        {isAr ? 'شاليه وودي — سلطنة عمان' : 'Woody Chalete — Oman'}
      </p>
    </div>
  );
};
