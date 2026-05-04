import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, UserPlus, Check, Gift, Upload, IdCard, AlertCircle, Moon, Sun } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useTranslation } from 'react-i18next';
import { firestoreBookings } from '../services/firestore';
import { uploadToCloudinary } from '../services/cloudinary';
import { getClientConfig } from '../config/clientConfig';
import { formatTime } from '../services/pricingUtils';
import type { Property } from '../types';

interface AddWalkInGuestProps {
  open: boolean;
  onClose: () => void;
  properties: Property[];
}

type PaymentMode = 'paid' | 'free';
type StayType = 'night' | 'sameday';

interface WalkInForm {
  name: string;
  phone: string;
  email: string;
  check_in: string;
  check_out: string;
  property_id: string;
  property_name: string;
}

const EMPTY_FORM: WalkInForm = {
  name: '',
  phone: '',
  email: '',
  check_in: '',
  check_out: '',
  property_id: '',
  property_name: '',
};

// Default check-in / check-out labels come from clientConfig.checkInOut, so each
// client owns their standard times in one place.
function defaultCheckInLabel(): string {
  return formatTime(getClientConfig().checkInOut.checkInTime);
}
function defaultCheckOutLabel(): string {
  return formatTime(getClientConfig().checkInOut.checkOutTime);
}

export const AddWalkInGuest: React.FC<AddWalkInGuestProps> = ({ open, onClose, properties }) => {
  const { t } = useTranslation();

  const [form, setForm] = useState<WalkInForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const [stayType, setStayType] = useState<StayType>('night');
  const [checkInTime, setCheckInTime] = useState(defaultCheckInLabel());
  const [checkOutTime, setCheckOutTime] = useState(defaultCheckOutLabel());

  const [paymentMode, setPaymentMode] = useState<PaymentMode>('paid');
  const [amountPaid, setAmountPaid] = useState('');

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptFileName, setReceiptFileName] = useState('');
  const [receiptProgress, setReceiptProgress] = useState<number | null>(null);

  const [idFile, setIdFile] = useState<File | null>(null);
  const [idFileName, setIdFileName] = useState('');
  const [idProgress, setIdProgress] = useState<number | null>(null);

  const [depositUpfront, setDepositUpfront] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');

  // When stayType becomes same-day, sync check_out = check_in
  useEffect(() => {
    if (stayType === 'sameday' && form.check_in) {
      setForm(p => ({ ...p, check_out: p.check_in }));
    }
  }, [stayType, form.check_in]);

  // Auto-populate times based on stayType. Night stays use the configured
  // standard window; same-day defaults to the configured check-in + 11 PM
  // (admin can override either input directly).
  useEffect(() => {
    setCheckInTime(defaultCheckInLabel());
    setCheckOutTime(stayType === 'sameday' ? '11:00 PM' : defaultCheckOutLabel());
  }, [stayType, form.check_out]);

  const reset = () => {
    setForm(EMPTY_FORM);
    setErrors({});
    setStayType('night');
    setCheckInTime(defaultCheckInLabel());
    setCheckOutTime(defaultCheckOutLabel());
    setPaymentMode('paid');
    setAmountPaid('');
    setReceiptFile(null);
    setReceiptFileName('');
    setReceiptProgress(null);
    setIdFile(null);
    setIdFileName('');
    setIdProgress(null);
    setDepositUpfront(false);
    setDepositAmount('');
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.phone.trim()) errs.phone = 'Phone is required';
    if (!form.check_in) errs.check_in = 'Check-in date is required';
    if (!form.check_out) errs.check_out = 'Check-out date is required';
    if (paymentMode === 'paid') {
      const amt = parseFloat(amountPaid);
      if (!amountPaid || isNaN(amt) || amt <= 0) errs.amount = 'Amount paid is required';
    }
    const parsedDeposit = parseFloat(depositAmount);
    if (!depositAmount || isNaN(parsedDeposit) || parsedDeposit < 0) {
      errs.deposit = 'Deposit amount is required';
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      let receiptURL = '';
      if (paymentMode === 'paid' && receiptFile) {
        try {
          receiptURL = await uploadToCloudinary(receiptFile, {
            folder: 'woody-chalete-receipts',
            onProgress: setReceiptProgress,
          });
        } catch (err) {
          console.error('Receipt upload failed:', err);
          setErrors({ receipt: 'Receipt upload failed. Please try again.' });
          setSubmitting(false);
          setReceiptProgress(null);
          return;
        } finally {
          setReceiptProgress(null);
        }
      }

      let idImageUrl = '';
      if (idFile) {
        try {
          idImageUrl = await uploadToCloudinary(idFile, {
            folder: 'guest_ids',
            onProgress: setIdProgress,
          });
        } catch (err) {
          console.error('Guest ID upload failed:', err);
          setErrors({ idDoc: 'Guest ID upload failed. Please try again.' });
          setSubmitting(false);
          setIdProgress(null);
          return;
        } finally {
          setIdProgress(null);
        }
      }

      const prop = properties[0];
      const parsedAmount = paymentMode === 'paid' ? parseFloat(amountPaid) : 0;

      await firestoreBookings.create({
        property_id: prop?.id || 'default',
        property_name: prop?.name || 'Woody Chalete',
        guest_name: form.name.trim(),
        guest_phone: `+968${form.phone.replace(/\s/g, '')}`,
        guest_email: form.email || undefined,
        check_in: form.check_in,
        check_out: form.check_out,
        check_in_time: checkInTime,
        check_out_time: checkOutTime,
        nightly_rate: prop?.nightly_rate || 120,
        security_deposit: parsedDeposit,
        depositAmount: parsedDeposit,
        payment_method: 'walk_in',
        payment_mode: paymentMode,
        amount_paid: parsedAmount,
        deposit_paid: depositUpfront,
        receiptURL,
        idImageUrl,
        isManual: true,
      });

      reset();
      onClose();
    } catch (err) {
      console.error('Failed to add walk-in guest:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-[24px] w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        <div className="flex items-center justify-between p-6 border-b border-primary-navy/5">
          <div>
            <h3 className="font-headline text-lg font-bold text-primary-navy">{t('guests.addWalkInGuest')}</h3>
            <p className="text-xs text-primary-navy/50 font-medium">{t('guests.manualGuestEntry')}</p>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-primary-navy/5 rounded-full">
            <X size={20} className="text-primary-navy/40" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">
              {t('guests.fullName')} *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder={t('guests.placeholderName')}
              className={cn(
                "w-full bg-surface-container-low border rounded-xl py-3 px-4 text-sm placeholder:text-primary-navy/20",
                errors.name ? "border-red-300" : "border-transparent"
              )}
            />
            {errors.name && <p className="text-red-500 text-xs">{errors.name}</p>}
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">
              {t('guests.phone')} *
            </label>
            <div className="flex gap-2">
              <div className="bg-surface-container-low rounded-xl py-3 px-3 text-sm font-bold text-primary-navy/60">+968</div>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm(p => ({ ...p, phone: e.target.value.replace(/[^\d\s]/g, '') }))}
                placeholder="9000 0000"
                maxLength={9}
                className={cn(
                  "flex-1 bg-surface-container-low border rounded-xl py-3 px-4 text-sm placeholder:text-primary-navy/20",
                  errors.phone ? "border-red-300" : "border-transparent"
                )}
              />
            </div>
            {errors.phone && <p className="text-red-500 text-xs">{errors.phone}</p>}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">
              {t('guests.emailOptional')}
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
              placeholder="guest@email.com"
              className="w-full bg-surface-container-low border border-transparent rounded-xl py-3 px-4 text-sm placeholder:text-primary-navy/20"
            />
          </div>

          {/* Stay Type */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">
              {t('guests.stayType')}
            </label>
            <div className="grid grid-cols-2 gap-2 bg-surface-container-low rounded-xl p-1">
              <button
                type="button"
                onClick={() => setStayType('night')}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all active:scale-[0.98]",
                  stayType === 'night'
                    ? "bg-primary-navy text-white shadow-sm"
                    : "text-primary-navy/50 hover:text-primary-navy/70"
                )}
              >
                <Moon size={12} />
                {t('guests.nightStay')}
              </button>
              <button
                type="button"
                onClick={() => setStayType('sameday')}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all active:scale-[0.98]",
                  stayType === 'sameday'
                    ? "bg-secondary-gold text-primary-navy shadow-sm"
                    : "text-primary-navy/50 hover:text-primary-navy/70"
                )}
              >
                <Sun size={12} />
                {t('guests.sameDay')}
              </button>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">
                {t('guests.checkIn')} *
              </label>
              <input
                type="date"
                value={form.check_in}
                onChange={(e) => setForm(p => ({ ...p, check_in: e.target.value }))}
                className={cn(
                  "w-full bg-surface-container-low border rounded-xl py-3 px-4 text-sm",
                  errors.check_in ? "border-red-300" : "border-transparent"
                )}
              />
              {errors.check_in && <p className="text-red-500 text-xs">{errors.check_in}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">
                {t('guests.checkOut')} *
              </label>
              <input
                type="date"
                value={form.check_out}
                onChange={(e) => setForm(p => ({ ...p, check_out: e.target.value }))}
                disabled={stayType === 'sameday'}
                className={cn(
                  "w-full bg-surface-container-low border rounded-xl py-3 px-4 text-sm",
                  stayType === 'sameday' && "opacity-50 cursor-not-allowed",
                  errors.check_out ? "border-red-300" : "border-transparent"
                )}
              />
              {errors.check_out && <p className="text-red-500 text-xs">{errors.check_out}</p>}
            </div>
          </div>

          {/* Times — auto-populated, editable */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">
                {t('guests.checkInTime')}
              </label>
              <input
                type="text"
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
                placeholder={defaultCheckInLabel()}
                className="w-full bg-surface-container-low border border-transparent rounded-xl py-3 px-4 text-sm placeholder:text-primary-navy/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">
                {t('guests.checkOutTime')}
              </label>
              <input
                type="text"
                value={checkOutTime}
                onChange={(e) => setCheckOutTime(e.target.value)}
                placeholder={defaultCheckOutLabel()}
                className="w-full bg-surface-container-low border border-transparent rounded-xl py-3 px-4 text-sm placeholder:text-primary-navy/20"
              />
            </div>
          </div>

          {/* Guest ID upload */}
          <div className="space-y-1.5">
            <label className="block text-start text-[10px] font-bold uppercase tracking-widest text-secondary-gold">
              {t('guests.attachGuestId')}
            </label>
            <label className="flex items-center gap-3 bg-surface-container-low border border-transparent rounded-xl py-3 px-4 cursor-pointer hover:border-secondary-gold/40 transition-colors">
              <IdCard size={16} className="text-primary-navy/50 flex-shrink-0" />
              <span className="text-sm text-primary-navy/60 truncate flex-1 text-start">
                {idFileName || t('guests.uploadIdFile')}
              </span>
              {idProgress !== null && (
                <span className="text-[10px] font-bold text-secondary-gold">{idProgress}%</span>
              )}
              <input
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { setIdFile(f); setIdFileName(f.name); }
                }}
              />
            </label>
            {errors.idDoc && <p className="text-red-500 text-xs">{errors.idDoc}</p>}
          </div>

          {/* Payment Mode */}
          <div className="space-y-3 pt-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">
              {t('guests.paymentMode')}
            </label>
            <div className="grid grid-cols-2 gap-2 bg-surface-container-low rounded-xl p-1">
              <button
                type="button"
                onClick={() => setPaymentMode('paid')}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all active:scale-[0.98]",
                  paymentMode === 'paid'
                    ? "bg-primary-navy text-white shadow-sm"
                    : "text-primary-navy/50 hover:text-primary-navy/70"
                )}
              >
                <Check size={13} />
                {t('guests.paid')}
              </button>
              <button
                type="button"
                onClick={() => setPaymentMode('free')}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all active:scale-[0.98]",
                  paymentMode === 'free'
                    ? "bg-secondary-gold text-primary-navy shadow-sm"
                    : "text-primary-navy/50 hover:text-primary-navy/70"
                )}
              >
                <Gift size={13} />
                {t('guests.free')}
              </button>
            </div>

            {paymentMode === 'paid' && (
              <div className="space-y-3 pt-1">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">
                    {t('guests.amountPaid')} *
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                      placeholder="0.00"
                      className={cn(
                        "flex-1 bg-surface-container-low border rounded-xl py-3 px-4 text-sm placeholder:text-primary-navy/20",
                        errors.amount ? "border-red-300" : "border-transparent"
                      )}
                    />
                    <div className="bg-surface-container-low rounded-xl py-3 px-3 text-sm font-bold text-primary-navy/60">{t('common.omr')}</div>
                  </div>
                  {errors.amount && <p className="text-red-500 text-xs">{errors.amount}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('guests.attachReceipt')}</label>
                  <label className="flex items-center gap-3 bg-surface-container-low border border-transparent rounded-xl py-3 px-4 cursor-pointer hover:border-secondary-gold/40 transition-colors">
                    <Upload size={16} className="text-primary-navy/50 flex-shrink-0" />
                    <span className="text-sm text-primary-navy/60 truncate flex-1">
                      {receiptFileName || t('guests.chooseFile')}
                    </span>
                    {receiptProgress !== null && (
                      <span className="text-[10px] font-bold text-secondary-gold">{receiptProgress}%</span>
                    )}
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) { setReceiptFile(f); setReceiptFileName(f.name); }
                      }}
                    />
                  </label>
                  {errors.receipt && <p className="text-red-500 text-xs">{errors.receipt}</p>}
                </div>
              </div>
            )}

            {paymentMode === 'free' && (
              <div className="bg-secondary-gold/10 border border-secondary-gold/30 rounded-xl p-3 flex items-start gap-2">
                <Gift size={14} className="text-secondary-gold mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-primary-navy/70 font-medium leading-relaxed">
                  {t('guests.freeBookingNote')}
                </p>
              </div>
            )}
          </div>

          {/* Deposit Block */}
          <div className="space-y-3 pt-2">
            <label className="block text-start text-[10px] font-bold uppercase tracking-widest text-secondary-gold">
              {t('guests.depositAmount')} *
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="0.00"
                className={cn(
                  "flex-1 bg-surface-container-low border rounded-xl py-3 px-4 text-sm placeholder:text-primary-navy/20",
                  errors.deposit ? "border-red-300" : "border-transparent"
                )}
              />
              <div className="bg-surface-container-low rounded-xl py-3 px-3 text-sm font-bold text-primary-navy/60">{t('common.omr')}</div>
            </div>
            {errors.deposit && <p className="text-red-500 text-xs">{errors.deposit}</p>}

            {/* Deposit Paid Upfront toggle */}
            <label className="flex items-start gap-3 cursor-pointer group select-none">
              <div className="relative mt-0.5 flex-shrink-0">
                <input
                  type="checkbox"
                  checked={depositUpfront}
                  onChange={(e) => setDepositUpfront(e.target.checked)}
                  className="sr-only"
                />
                <div className={cn(
                  "w-10 h-6 rounded-full transition-colors",
                  depositUpfront ? "bg-primary-navy" : "bg-primary-navy/20"
                )}>
                  <div className={cn(
                    "absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform",
                    depositUpfront ? "translate-x-5" : "translate-x-1"
                  )} />
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-primary-navy leading-tight">
                  {t('guests.depositPaidUpfront')}
                </p>
                <p className="text-[10px] text-primary-navy/50 font-medium mt-0.5">
                  {t('guests.depositPaidUpfrontHint')}
                </p>
              </div>
            </label>

            {!depositUpfront && parseFloat(depositAmount) > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                <AlertCircle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-red-700 font-bold leading-relaxed text-start">
                  {t('guests.depositDueOnArrivalMsg', {
                    amount: parseFloat(depositAmount).toFixed(2),
                    currency: t('common.omr'),
                  })}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-primary-navy/5 flex gap-3">
          <button
            onClick={handleClose}
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
                <UserPlus size={14} />
                {t('guests.addGuest')}
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
