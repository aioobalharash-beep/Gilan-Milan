import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { CheckCircle2, MapPin, FileText } from 'lucide-react';
import { generateInvoicePDF } from '../services/pdf';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useTranslation } from 'react-i18next';
import { getClientConfig } from '../config/clientConfig';
import { formatTime } from '../services/pricingUtils';

export const Confirmation: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const state = location.state as { booking?: any; propertyName?: string } | null;

  const booking = state?.booking;
  const propertyName = state?.propertyName || 'Woody Chalete';

  const [bankPhone, setBankPhone] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');

  // Auto-redirect if no valid booking
  useEffect(() => {
    if (!booking) {
      navigate('/', { replace: true });
    }
  }, [booking, navigate]);

  // Load property details from Firestore (bankPhone for bank transfers, licenseNumber for PDFs)
  useEffect(() => {
    if (!booking) return;
    getDoc(doc(db, 'settings', 'property_details'))
      .then(snap => {
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.bankPhone) setBankPhone(data.bankPhone);
        if (data.licenseNumber) setLicenseNumber(data.licenseNumber);
      })
      .catch(console.error);
  }, [booking]);

  if (!booking) return null;

  const isThawani = booking.payment_method === 'thawani';
  const isBankTransfer = booking.payment_method === 'bank_transfer';

  const deposit = Number(booking.depositAmount) || Number(booking.security_deposit) || 0;
  const stayTotal = Number(booking.stayTotal) || (Number(booking.grandTotal || booking.total_amount) - deposit);
  const grandTotal = Number(booking.grandTotal) || Number(booking.total_amount) || (stayTotal + deposit);

  const isDayUse = booking.check_in === booking.check_out;
  const lang = i18n.language;
  const isFullDay = isDayUse && (!booking.slot_name || /full\s*day/i.test(booking.slot_name));
  const localizedProperty = lang === 'ar' ? 'شاليه وودي' : propertyName;

  const stayLabel = (() => {
    if (isDayUse) {
      if (isFullDay) {
        const fullDayLabel = lang === 'ar' ? 'يوم كامل بدون مبيت' : 'Full Day';
        return `${fullDayLabel} — ${localizedProperty}`;
      }
      const slotDisplay = booking.slot_name
        ? (lang === 'ar' && booking.slot_name_ar ? booking.slot_name_ar : booking.slot_name)
        : (lang === 'ar' ? 'حجز جزئي' : 'Partial Booking');
      return `${slotDisplay} — ${localizedProperty}`;
    }
    const nightWord = lang === 'ar'
      ? (booking.nights > 1 ? t('common.nights') : t('common.night'))
      : (booking.nights > 1 ? 'Nights' : 'Night');
    return `${booking.nights} ${nightWord} — ${localizedProperty}`;
  })();

  const handleViewInvoice = async () => {
    try {
      const depositLabel = lang === 'ar' ? 'مبلغ التأمين المسترد' : 'Refundable Security Deposit';
      const config = getClientConfig();
      const pdfDoc = await generateInvoicePDF({
        id: booking.id,
        guest_name: booking.guest_name,
        room_type: localizedProperty,
        issued_date: booking.created_at,
        subtotal: grandTotal,
        vat_amount: 0,
        total_amount: grandTotal,
        items: [
          { description: stayLabel, amount: stayTotal },
          ...(deposit > 0 ? [{ description: depositLabel, amount: deposit }] : []),
        ],
        licenseNumber,
        chaletName: config.chaletName,
        adminName: config.admin.name,
      }, lang);
      const blobUrl = pdfDoc.output('bloburl');
      window.open(blobUrl as string, '_blank');
    } catch (err) {
      console.error('[Confirmation] Failed to generate invoice PDF:', err);
      alert(lang === 'ar' ? 'حدث خطأ أثناء إنشاء الفاتورة.' : 'Failed to generate invoice.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20 sm:py-16">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-md text-center space-y-10"
      >
        {/* Success Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
        >
          <div className="w-24 h-24 bg-secondary-gold/10 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="text-secondary-gold" size={48} />
          </div>
        </motion.div>

        {/* Heading */}
        <div className="space-y-3">
          <h1 className="font-headline text-3xl font-bold text-primary-navy leading-tight">
            {t('confirmation.bookingConfirmed')}
          </h1>
          <p className="text-primary-navy/40 text-sm leading-relaxed max-w-xs mx-auto">
            {t('confirmation.thankYou')}
          </p>
        </div>

        {/* Booking Details */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-[24px] p-6 border border-primary-navy/5 shadow-sm space-y-5"
        >
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40 mb-1">{t('guests.checkIn')}</p>
              <p className="font-bold text-primary-navy text-sm">
                {new Date(booking.check_in).toLocaleDateString(lang === 'ar' ? 'ar-OM' : 'en-GB', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
              <p className="text-[11px] font-bold text-secondary-gold mt-0.5">
                {formatTime(booking.check_in_time || getClientConfig().checkInOut.checkInTime, lang)}
              </p>
            </div>
            <div className="text-end">
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40 mb-1">{t('guests.checkOut')}</p>
              <p className="font-bold text-primary-navy text-sm">
                {isDayUse
                  ? new Date(booking.check_in).toLocaleDateString(lang === 'ar' ? 'ar-OM' : 'en-GB', { month: 'short', day: 'numeric', year: 'numeric' })
                  : new Date(booking.check_out).toLocaleDateString(lang === 'ar' ? 'ar-OM' : 'en-GB', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
              <p className="text-[11px] font-bold text-secondary-gold mt-0.5">
                {formatTime(booking.check_out_time || getClientConfig().checkInOut.checkOutTime, lang)}
              </p>
            </div>
          </div>

          <div className="border-t border-primary-navy/5 pt-3 -mt-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">
              {isDayUse
                ? isFullDay
                  ? t('common.dayUse')
                  : (lang === 'ar' && booking.slot_name_ar ? booking.slot_name_ar : (booking.slot_name || t('common.partialBooking')))
                : `${booking.nights} ${booking.nights > 1 ? t('common.nights') : t('common.night')}`}
            </p>
          </div>

          <div className="border-t border-primary-navy/5 pt-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-primary-navy/50">{t('confirmation.stayTotal')}</span>
              <span className="font-bold text-primary-navy">{stayTotal} {t('common.omr')}</span>
            </div>
            {deposit > 0 && (
              <div className="flex justify-between items-start text-xs">
                <div>
                  <span className="text-primary-navy/50">{t('confirmation.securityDeposit')}</span>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-primary-navy/40 mt-0.5">{t('booking.dueOnArrival')}</p>
                </div>
                <span className="font-bold text-primary-navy/40">{deposit} {t('common.omr')}</span>
              </div>
            )}
            <div className="flex justify-between text-sm pt-2 border-t border-primary-navy/5">
              <span className="font-bold text-primary-navy">{t('confirmation.grandTotal')}</span>
              <span className="font-bold text-secondary-gold font-headline text-lg">{grandTotal} {t('common.omr')}</span>
            </div>
          </div>

          <p className="text-[10px] text-primary-navy/30 font-bold uppercase tracking-widest">
            Ref: {booking.id.slice(0, 8).toUpperCase()}
          </p>
        </motion.div>

        {/* Get Location — primary action below summary */}
        <motion.a
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          href={getClientConfig().location.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full bg-secondary-gold text-primary-navy py-4 rounded-[20px] font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-2.5 active:scale-[0.98] transition-all shadow-lg shadow-secondary-gold/20"
        >
          <MapPin size={18} />
          {t('confirmation.getLocation')}
        </motion.a>

        {/* Conditional Invoice / Bank Transfer Note */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="space-y-3"
        >
          {isThawani && (
            <button
              onClick={handleViewInvoice}
              className="w-full bg-primary-navy text-white py-4 rounded-[20px] font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-2.5 active:scale-[0.98] transition-all shadow-lg shadow-primary-navy/15"
            >
              <FileText size={18} />
              {t('confirmation.viewInvoice')}
            </button>
          )}

          {isBankTransfer && (
            <div className="bg-amber-50/60 border border-amber-200/60 rounded-[16px] px-5 py-4 space-y-2">
              <p className="text-xs text-amber-700/80 leading-relaxed font-medium">
                {t('confirmation.bankTransferPending')}
              </p>
              {bankPhone.trim() && (
                <p className="text-xs text-amber-700/80 leading-relaxed font-medium">
                  <span className="font-bold">{t('confirmation.mobileTransfer')}</span> {bankPhone}
                </p>
              )}
            </div>
          )}

          <button
            onClick={() => navigate('/')}
            className="w-full text-primary-navy/40 py-3 font-bold text-xs uppercase tracking-widest hover:text-primary-navy/60 transition-colors"
          >
            {t('confirmation.returnHome')}
          </button>
        </motion.div>

        {/* Minimal Footer */}
        <div className="pt-8 space-y-3">
          <p className="text-secondary-gold font-headline font-bold text-lg">{t('common.alMalak')}</p>
          <div className="flex gap-5 items-center justify-center">
            <button onClick={() => navigate('/terms')} className="text-[10px] text-primary-navy/40 underline font-bold uppercase tracking-widest">{t('sanctuary.termsOfStay')}</button>
            <span className="text-primary-navy/15">|</span>
            <button onClick={() => navigate('/about')} className="text-[10px] text-primary-navy/40 underline font-bold uppercase tracking-widest">{t('sanctuary.aboutUs')}</button>
          </div>
          <p className="text-[9px] text-primary-navy/25 font-bold uppercase tracking-widest">
            &copy; Woody Chalete. 2024
          </p>
        </div>
      </motion.div>
    </div>
  );
};
