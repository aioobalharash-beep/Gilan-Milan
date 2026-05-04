import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, Receipt, Download, MessageCircle, X, Calendar, Building2, Edit3, Paperclip, IdCard, AlertCircle, Home, Printer } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { collection, query, orderBy, onSnapshot, doc, getDoc, setDoc, limit } from 'firebase/firestore';
import { db } from '../services/firebase';
import { generateVATReportPDF } from '../services/vatReport';
import type { Invoice } from '../types';
import { useTranslation } from 'react-i18next';
import { getClientConfig, whatsappHref } from '../config/clientConfig';
import { BrandMark } from './BrandMark';
import { PrintableInvoice } from './PrintableInvoice';

interface RealtimeBooking {
  id: string;
  property_name: string;
  guest_name: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  nights: number;
  total_amount: number;
  nightly_rate: number;
  security_deposit: number;
  stayTotal?: number;
  depositAmount?: number;
  grandTotal?: number;
  balance_due?: number;
  deposit_paid?: boolean;
  isManual?: boolean;
  status: string;
  payment_status: string;
  payment_method: string;
  receiptURL: string;
  idImageUrl?: string;
  slot_name?: string;
  slot_name_ar?: string;
  check_in_time?: string;
  check_out_time?: string;
  created_at: string;
}

/** Format phone to international 968 format */
function formatPhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  if (digits.startsWith('968')) return digits;
  return `968${digits}`;
}

export const Invoices: React.FC = () => {
  const { t, i18n } = useTranslation();
  const config = getClientConfig();
  const [bookings, setBookings] = useState<RealtimeBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<RealtimeBooking | null>(null);
  const [whatsappTemplate, setWhatsappTemplate] = useState<string>(
    `Assalamu Alaikum {{guest_name}},\n\nHere is your invoice for your stay at Woody Chalete:\n\nBooking Ref: {{booking_id}}\nStay: {{stay_amount}} OMR\n{{deposit_line}}\nTotal: {{total_amount}} OMR\n{{receipt_line}}\n\nThank you for choosing Woody Chalete.`
  );
  const [licenseNumber, setLicenseNumber] = useState('');
  const [termsEn, setTermsEn] = useState('');
  const [termsAr, setTermsAr] = useState('');
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [viewer, setViewer] = useState<{ url: string; kind: 'receipt' | 'id' } | null>(null);

  // Pagination
  const PAGE_SIZE = 20;
  const [pageLimit, setPageLimit] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(true);

  // Load WhatsApp template + property licenseNumber from Firestore on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [notifSnap, propSnap] = await Promise.all([
          getDoc(doc(db, 'settings', 'notifications')),
          getDoc(doc(db, 'settings', 'property_details')),
        ]);
        if (notifSnap.exists() && notifSnap.data().whatsappTemplate) {
          setWhatsappTemplate(notifSnap.data().whatsappTemplate);
        }
        if (propSnap.exists()) {
          const pd = propSnap.data() as { licenseNumber?: string; termsEn?: string; termsAr?: string };
          if (pd.licenseNumber) setLicenseNumber(pd.licenseNumber);
          if (typeof pd.termsEn === 'string') setTermsEn(pd.termsEn);
          if (typeof pd.termsAr === 'string') setTermsAr(pd.termsAr);
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'bookings'), orderBy('created_at', 'desc'), limit(pageLimit));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHasMore(snapshot.docs.length >= pageLimit);
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RealtimeBooking));
      setBookings(data);
      setLoading(false);
    }, (error) => {
      console.error('Bookings listener error:', error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [pageLimit]);

  // Convert booking to Invoice (no VAT for guest invoices — Grand Total = Subtotal)
  const bookingToInvoice = (b: RealtimeBooking): Invoice => {
    const lang = i18n.language;
    const isAr = lang === 'ar';
    const propName = isAr ? 'شاليه وودي' : b.property_name;
    const deposit = Number(b.depositAmount) || Number(b.security_deposit) || 0;
    const stayTotal = Number(b.stayTotal) || (Number(b.grandTotal || b.total_amount) - deposit);
    const total = Number(b.grandTotal) || Number(b.total_amount) || (stayTotal + deposit);
    const isDayUse = b.check_in === b.check_out;
    const isFullDay = isDayUse && (!b.slot_name || /full\s*day/i.test(b.slot_name));
    let stayLabel: string;
    if (isDayUse) {
      if (isFullDay) {
        stayLabel = isAr ? `يوم كامل بدون مبيت — ${propName}` : `Full Day — ${b.property_name}`;
      } else {
        const slotDisplay = isAr && b.slot_name_ar ? b.slot_name_ar : (b.slot_name || (isAr ? 'حجز جزئي' : 'Partial Booking'));
        stayLabel = `${slotDisplay} — ${propName}`;
      }
    } else {
      const nightWord = isAr ? (b.nights > 1 ? 'ليالٍ' : 'ليلة') : (b.nights > 1 ? 'Nights' : 'Night');
      stayLabel = `${b.nights} ${nightWord} — ${propName}`;
    }
    // deposit_paid = true  → deposit collected upfront; include in Grand Total
    // deposit_paid = false → deposit payable on entry; Grand Total = stay only
    const isDepositUpfront = b.deposit_paid !== false;
    const depositLabel = isDepositUpfront
      ? (isAr ? 'مبلغ التأمين' : 'Security Deposit')
      : (isAr ? 'مبلغ التأمين يدفع عند الدخول' : 'Security Deposit – Payable on Entry');
    const invoiceTotal = isDepositUpfront ? stayTotal + deposit : stayTotal;
    const items: Invoice['items'] = [
      { id: 1, invoice_id: b.id, description: stayLabel, amount: stayTotal },
    ];
    if (deposit > 0) {
      items.push({ id: 2, invoice_id: b.id, description: depositLabel, amount: deposit });
    }
    return {
      id: b.id,
      guest_name: b.guest_name,
      booking_ref: b.id.slice(0, 8).toUpperCase(),
      room_type: propName,
      subtotal: stayTotal,
      vat_amount: 0,
      total_amount: invoiceTotal,
      status: b.status === 'confirmed' ? 'paid' : 'pending',
      vat_compliant: false,
      issued_date: b.created_at,
      items,
    };
  };

  const getInvoiceStatus = (b: RealtimeBooking) => {
    if (b.status === 'confirmed' || b.status === 'checked-in') return 'sent';
    return 'pending';
  };

  // Last 6 months for VAT reports
  const getLastSixMonths = () => {
    const months: { label: string; month: number; year: number }[] = [];
    const now = new Date();
    const locale = i18n.language === 'ar' ? 'ar-OM' : 'en-US';
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        label: d.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
        month: d.getMonth(),
        year: d.getFullYear(),
      });
    }
    return months;
  };

  const getMonthlyConfirmedBookings = (month: number, year: number) => {
    return bookings.filter(b => {
      if (b.status === 'cancelled') return false;
      if (b.status !== 'confirmed' && b.status !== 'checked-in') return false;
      const d = new Date(b.check_in);
      return d.getMonth() === month && d.getFullYear() === year;
    });
  };

  const handleDownloadVAT = (month: number, year: number, label: string) => {
    const monthBookings = getMonthlyConfirmedBookings(month, year);
    const totalRevenue = monthBookings.reduce((sum, b) => sum + (Number(b.stayTotal) || (Number(b.total_amount) - (Number(b.depositAmount) || Number(b.security_deposit) || 0))), 0);
    const vatCollected = +(totalRevenue * 0.05).toFixed(2);

    generateVATReportPDF({
      month: label,
      taxId: '1009283746',
      licenseNumber,
      chaletName: config.chaletName,
      adminName: config.admin.name,
      totalRevenue,
      vatRate: 5,
      vatCollected,
      bookingCount: monthBookings.length,
      bookings: monthBookings.map(b => ({
        guest_name: b.guest_name,
        check_in: b.check_in,
        nights: b.nights,
        amount: Number(b.stayTotal) || (Number(b.total_amount) - (Number(b.depositAmount) || Number(b.security_deposit) || 0)),
      })),
    });
  };

  const handleViewPDF = (b: RealtimeBooking) => {
    setSelectedInvoice(bookingToInvoice(b));
    setSelectedBooking(b);
  };

  const handleSendWhatsApp = (b: RealtimeBooking) => {
    const phone = formatPhone(b.guest_phone);
    const deposit = Number(b.depositAmount) || Number(b.security_deposit) || 0;
    const stayAmount = Number(b.stayTotal) || (Number(b.grandTotal || b.total_amount) - deposit);
    const total = Number(b.grandTotal) || Number(b.total_amount) || (stayAmount + deposit);
    const receiptLink = b.receiptURL || '';
    const rendered = whatsappTemplate
      .replace(/\{\{guest_name\}\}/g, b.guest_name)
      .replace(/\{\{booking_id\}\}/g, b.id.slice(0, 8).toUpperCase())
      .replace(/\{\{stay_amount\}\}/g, stayAmount.toFixed(2))
      .replace(/\{\{deposit_line\}\}/g, deposit > 0 ? `Refundable Deposit: ${deposit.toFixed(2)} OMR` : '')
      .replace(/\{\{total_amount\}\}/g, total.toFixed(2))
      .replace(/\{\{receipt_line\}\}/g, receiptLink ? `Receipt: ${receiptLink}` : '');
    const message = encodeURIComponent(rendered);
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
  };

  const closeModal = () => {
    setSelectedInvoice(null);
    setSelectedBooking(null);
  };

  const handlePrint = () => {
    window.print();
  };

  const nonCancelledBookings = bookings.filter(b => b.status !== 'cancelled');
  const lastSixMonths = getLastSixMonths();

  if (loading) return <div className="p-8 animate-pulse"><div className="h-96 bg-primary-navy/5 rounded-xl" /></div>;

  return (
    <div className="p-6 md:p-8 space-y-10 max-w-4xl mx-auto">
      {/* Page Header */}
      <div>
        <span className="text-secondary-gold font-bold tracking-widest text-[10px] uppercase">{t('common.administration')}</span>
        <h1 className="font-headline text-2xl font-bold text-primary-navy mt-1">{t('invoices.invoiceCenter')}</h1>
        <p className="text-primary-navy/50 text-xs font-medium mt-1">{nonCancelledBookings.length} total invoices generated</p>
      </div>

      {/* WhatsApp Template Editor */}
      <div className="bg-white rounded-[20px] p-6 border border-primary-navy/5 shadow-sm space-y-4">
        <button
          onClick={() => setShowTemplateEditor(!showTemplateEditor)}
          className="flex items-center gap-2 text-sm font-bold text-primary-navy hover:text-secondary-gold transition-colors"
        >
          <Edit3 size={16} />
          Edit WhatsApp Template
        </button>

        {showTemplateEditor && (
          <div className="space-y-3">
            <textarea
              value={whatsappTemplate}
              onChange={(e) => setWhatsappTemplate(e.target.value)}
              rows={10}
              className="w-full border border-primary-navy/10 rounded-xl p-4 text-sm text-primary-navy font-mono resize-y focus:outline-none focus:ring-2 focus:ring-secondary-gold/30 focus:border-secondary-gold/50"
            />
            <div className="flex flex-wrap gap-2">
              {['{{guest_name}}', '{{booking_id}}', '{{stay_amount}}', '{{deposit_line}}', '{{total_amount}}', '{{receipt_line}}'].map((ph) => (
                <span key={ph} className="text-[10px] font-mono bg-primary-navy/5 text-primary-navy/60 px-2 py-1 rounded-md">{ph}</span>
              ))}
            </div>
            <p className="text-[10px] text-primary-navy/40 font-medium">
              Use the placeholders above in your template. They will be replaced with actual booking data when sending.
            </p>
            <button
              onClick={async () => {
                setTemplateSaving(true);
                try {
                  await setDoc(doc(db, 'settings', 'notifications'), { whatsappTemplate }, { merge: true });
                } catch (err) {
                  console.error('Failed to save template:', err);
                }
                setTemplateSaving(false);
              }}
              disabled={templateSaving}
              className="px-6 py-2.5 bg-primary-navy text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-primary-navy/90 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {templateSaving ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        )}
      </div>

      {/* SECTION 1: Latest Booking Invoices */}
      <section className="space-y-4">
        <div className="px-1">
          <h3 className="font-headline text-lg text-primary-navy font-bold">{t('invoices.latestBookingInvoices')}</h3>
          <p className="text-primary-navy/50 text-xs font-medium">{t('invoices.latestBookingInvoicesDesc')}</p>
        </div>

        <div className="bg-white rounded-[20px] border border-primary-navy/5 shadow-sm overflow-hidden">
          {/* Table Header */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 bg-surface-container-low border-b border-primary-navy/5">
            <span className="col-span-4 text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">{t('invoices.guest')}</span>
            <span className="col-span-2 text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">{t('invoices.bookingId')}</span>
            <span className="col-span-2 text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">{t('common.date')}</span>
            <span className="col-span-2 text-[10px] font-bold uppercase tracking-widest text-primary-navy/40 text-end">{t('common.amount')}</span>
            <span className="col-span-2 text-[10px] font-bold uppercase tracking-widest text-primary-navy/40 text-end">{t('common.actions')}</span>
          </div>

          {nonCancelledBookings.length === 0 ? (
            <p className="text-center text-sm text-primary-navy/40 py-12">No invoices yet</p>
          ) : (
            nonCancelledBookings.map((b, i) => {
              const status = getInvoiceStatus(b);
              return (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className={cn(
                    "px-6 py-4 border-b border-primary-navy/5 last:border-b-0 transition-colors hover:bg-primary-navy/[0.02] cursor-default",
                    "md:grid md:grid-cols-12 md:gap-4 md:items-center",
                    "flex flex-col gap-3"
                  )}
                >
                  {/* Guest Name + Status Badge + Attachments */}
                  <div className="col-span-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-primary-navy text-sm">{b.guest_name}</p>
                      {b.isManual && (
                        <span
                          title="Walk-in / manual entry"
                          className="inline-flex items-center gap-1 bg-secondary-gold/15 text-secondary-gold px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest"
                        >
                          <Home size={8} />
                          Manual
                        </span>
                      )}
                      {/* Guest ID thumbnail — shown next to the receipt icon so the
                          admin can eyeball the attached document at a glance. */}
                      {b.idImageUrl && !b.idImageUrl.toLowerCase().endsWith('.pdf') && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setViewer({ url: b.idImageUrl!, kind: 'id' }); }}
                          title="View guest ID"
                          className="w-8 h-8 rounded-md overflow-hidden border border-primary-navy/10 hover:border-secondary-gold/60 transition-all active:scale-95"
                        >
                          <img
                            src={b.idImageUrl}
                            alt="Guest ID thumbnail"
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </button>
                      )}
                      {b.idImageUrl && b.idImageUrl.toLowerCase().endsWith('.pdf') && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setViewer({ url: b.idImageUrl!, kind: 'id' }); }}
                          title="View guest ID (PDF)"
                          className="p-1 rounded-md text-secondary-gold hover:bg-secondary-gold/10 active:scale-90 transition-all"
                        >
                          <IdCard size={12} />
                        </button>
                      )}
                      {b.receiptURL && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setViewer({ url: b.receiptURL, kind: 'receipt' }); }}
                          title="View attached receipt"
                          className="p-1 rounded-md text-secondary-gold hover:bg-secondary-gold/10 active:scale-90 transition-all"
                        >
                          <Paperclip size={12} />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={cn(
                        "text-[8px] font-bold uppercase px-2 py-0.5 rounded-full",
                        b.payment_status === 'free' ? "bg-secondary-gold/10 text-secondary-gold" :
                        status === 'sent' ? "bg-emerald-50 text-emerald-600" :
                        "bg-amber-50 text-amber-600"
                      )}>
                        {b.payment_status === 'free' ? 'free' : status}
                      </span>
                      {b.deposit_paid === false && (Number(b.balance_due) > 0 || Number(b.depositAmount) > 0) && (
                        <span
                          title="Outstanding deposit to be collected on arrival"
                          className="inline-flex items-center gap-1 text-[8px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200"
                        >
                          <AlertCircle size={9} />
                          Deposit Due on Arrival
                        </span>
                      )}
                      <span className="text-[10px] text-primary-navy/40 font-medium md:hidden">{b.property_name}</span>
                    </div>
                  </div>

                  {/* Booking ID */}
                  <div className="col-span-2">
                    <span className="text-xs font-mono text-primary-navy/50">{b.id.slice(0, 8).toUpperCase()}</span>
                  </div>

                  {/* Date */}
                  <div className="col-span-2">
                    <span className="text-xs text-primary-navy/50">
                      {new Date(b.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>

                  {/* Amount — bold, right-aligned */}
                  <div className="col-span-2 text-end">
                    <span className="font-bold text-primary-navy font-headline text-sm">
                      {(Number(b.grandTotal) || Number(b.total_amount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-primary-navy/40 ms-1">{t('common.omr')}</span>
                  </div>

                  {/* Actions — icon-only buttons */}
                  <div className="col-span-2 flex justify-end gap-1.5">
                    <button
                      onClick={() => handleViewPDF(b)}
                      title="View Invoice PDF"
                      className="w-9 h-9 flex items-center justify-center rounded-lg border border-primary-navy/10 text-primary-navy/50 hover:text-primary-navy hover:border-primary-navy/20 hover:bg-primary-navy/5 transition-all"
                    >
                      <FileText size={15} />
                    </button>
                    <button
                      onClick={() => handleSendWhatsApp(b)}
                      title="Send via WhatsApp"
                      className="w-9 h-9 flex items-center justify-center rounded-lg border border-emerald-200 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 transition-all"
                    >
                      <MessageCircle size={15} />
                    </button>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
        {!loading && hasMore && nonCancelledBookings.length > 0 && (
          <button
            onClick={() => setPageLimit(prev => prev + PAGE_SIZE)}
            className="w-full py-3 text-sm font-bold text-secondary-gold hover:text-primary-navy bg-white rounded-xl border border-primary-navy/5 shadow-sm transition-colors mt-4"
          >
            {t('common.loadMore')}
          </button>
        )}
      </section>

      {/* SECTION 2: Monthly VAT Reports */}
      <section className="space-y-4">
        <div className="px-1">
          <h3 className="font-headline text-lg text-primary-navy font-bold">{t('invoices.businessTaxReports')}</h3>
          <p className="text-primary-navy/50 text-xs font-medium">{t('invoices.businessTaxReportsDesc')}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lastSixMonths.map((m, i) => {
            const monthBookings = getMonthlyConfirmedBookings(m.month, m.year);
            const totalRevenue = monthBookings.reduce((sum, b) => sum + (Number(b.stayTotal) || (Number(b.total_amount) - (Number(b.depositAmount) || Number(b.security_deposit) || 0))), 0);
            const vatCollected = +(totalRevenue * 0.05).toFixed(2);

            return (
              <motion.div
                key={m.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white rounded-[20px] p-5 border border-primary-navy/5 shadow-sm space-y-4 hover:border-primary-navy/10 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-secondary-gold" />
                    <h4 className="text-sm font-bold text-primary-navy">{m.label}</h4>
                  </div>
                  <span className="text-[10px] font-bold text-primary-navy/40">{monthBookings.length} bookings</span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-primary-navy/50">{t('invoices.revenue')}</span>
                    <span className="font-bold text-primary-navy">{totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })} {t('common.omr')}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-primary-navy/50">{t('invoices.vat')}</span>
                    <span className="font-bold text-secondary-gold">{vatCollected.toFixed(2)} {t('common.omr')}</span>
                  </div>
                </div>

                <button
                  onClick={() => handleDownloadVAT(m.month, m.year, m.label)}
                  disabled={monthBookings.length === 0}
                  className="w-full flex items-center justify-center gap-2 bg-primary-navy text-white py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Download size={12} />
                  {t('invoices.downloadVatReport')}
                </button>
              </motion.div>
            );
          })}
        </div>

        <div className="bg-surface-container-low rounded-xl p-4 flex items-center gap-3">
          <Building2 size={16} className="text-secondary-gold flex-shrink-0" />
          <p className="text-[10px] text-primary-navy/50 font-bold">
            {t('invoices.taxId')}: <span className="text-primary-navy">1009283746</span> &bull; {t('invoices.vatRate')}: <span className="text-primary-navy">5%</span> &bull; {t('common.alMalak')}
          </p>
        </div>
      </section>

      {/* Receipt / ID Viewer Modal */}
      <AnimatePresence>
        {viewer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setViewer(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-[24px] w-full max-w-lg max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between p-5 border-b border-primary-navy/5">
                <div className="flex items-center gap-2">
                  {viewer.kind === 'id'
                    ? <IdCard size={16} className="text-secondary-gold" />
                    : <Paperclip size={16} className="text-secondary-gold" />}
                  <h3 className="font-headline font-bold text-primary-navy">
                    {viewer.kind === 'id' ? 'Guest ID' : 'Payment Receipt'}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={viewer.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-primary-navy/5 text-primary-navy text-[10px] font-bold uppercase tracking-widest hover:bg-primary-navy/10 transition-all"
                  >
                    Open Full Size
                  </a>
                  <button onClick={() => setViewer(null)} className="p-2 hover:bg-primary-navy/5 rounded-full">
                    <X size={18} className="text-primary-navy/40" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-surface-container-low">
                {viewer.url.toLowerCase().endsWith('.pdf') ? (
                  <iframe src={viewer.url} className="w-full h-[60vh] rounded-lg border-0" title={viewer.kind === 'id' ? 'Guest ID PDF' : 'Receipt PDF'} />
                ) : (
                  <img
                    src={viewer.url}
                    alt={viewer.kind === 'id' ? 'Guest ID' : 'Payment Receipt'}
                    className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-sm"
                    referrerPolicy="no-referrer"
                  />
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Print-only invoice — rendered off-screen, visible only in window.print() */}
      {selectedInvoice && (
        <PrintableInvoice
          invoice={selectedInvoice}
          lang={i18n.language}
          chaletName={config.chaletName}
          licenseNumber={licenseNumber}
          adminName={config.admin.name}
          balanceDue={Number(selectedBooking?.balance_due) || Number(selectedBooking?.depositAmount) || Number(selectedBooking?.security_deposit) || 0}
          depositUnpaid={selectedBooking?.deposit_paid === false}
          checkIn={selectedBooking?.check_in}
          checkOut={selectedBooking?.check_out}
          checkInTime={selectedBooking?.check_in_time}
          checkOutTime={selectedBooking?.check_out_time}
          termsText={i18n.language === 'ar' ? termsAr : termsEn}
        />
      )}

      {/* Invoice Preview Modal — only opens when a specific invoice is selected */}
      <AnimatePresence>
        {selectedInvoice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={closeModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-[20px] overflow-hidden shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            >
              {/* Modal Header */}
              <div className="bg-surface-container-low p-5 border-b border-primary-navy/5 flex justify-between items-center sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-navy flex items-center justify-center rounded-lg">
                    <Receipt className="text-secondary-gold" size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-headline text-sm font-bold">Invoice #{selectedInvoice.id.slice(0, 8).toUpperCase()}</p>
                      {selectedBooking?.isManual && (
                        <span
                          title="Walk-in / manual entry"
                          className="inline-flex items-center gap-1 bg-secondary-gold/15 text-secondary-gold px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest"
                        >
                          <Home size={8} />
                          Manual
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-primary-navy/50 uppercase tracking-widest font-bold">Guest Invoice</p>
                  </div>
                </div>
                <button onClick={closeModal} className="p-2 hover:bg-primary-navy/5 rounded-full transition-colors">
                  <X size={18} className="text-primary-navy/40" />
                </button>
              </div>

              {/* Invoice Body — NO VAT for guest invoices */}
              <div className="p-6 space-y-6 text-sm">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <BrandMark variant="light" size="sm" className="uppercase tracking-tight" />
                    <p className="text-xs text-primary-navy/50 font-medium">Muscat, Sultanate of Oman</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 py-4 border-y border-primary-navy/5">
                  <div>
                    <p className="text-[10px] text-primary-navy/40 uppercase font-bold mb-1 tracking-wider">Billed To</p>
                    <p className="font-bold text-primary-navy">{selectedInvoice.guest_name}</p>
                    <p className="text-xs text-primary-navy/50 font-medium">{selectedInvoice.room_type}</p>
                  </div>
                  <div className="text-end">
                    <p className="text-[10px] text-primary-navy/40 uppercase font-bold mb-1 tracking-wider">Issue Date</p>
                    <p className="font-bold text-primary-navy">{new Date(selectedInvoice.issued_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                </div>

                <table className="w-full">
                  <thead>
                    <tr className="text-[10px] uppercase font-bold text-primary-navy/40 border-b border-primary-navy/5">
                      <th className="text-start py-3 font-bold">Description</th>
                      <th className="text-end py-3 font-bold">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="text-primary-navy">
                    {selectedInvoice.items?.map((item, i) => (
                      <tr key={i}>
                        <td className="py-3 font-medium">{item.description}</td>
                        <td className="text-end font-headline font-bold">OMR {item.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-primary-navy/5">
                      <td className="py-4 font-bold text-base">Grand Total</td>
                      <td className="py-4 text-end font-headline text-xl text-secondary-gold font-bold">OMR {selectedInvoice.total_amount.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>

                {/* Attachment strip — Guest ID thumbnail side-by-side with the
                    payment receipt so the admin can verify both at a glance. */}
                {(selectedBooking?.idImageUrl || selectedBooking?.receiptURL) && (
                  <div className="pt-2">
                    <p className="text-[10px] uppercase font-bold text-primary-navy/40 tracking-wider mb-2">Attachments</p>
                    <div className="flex gap-3 flex-wrap">
                      {selectedBooking?.idImageUrl && (
                        <button
                          type="button"
                          onClick={() => setViewer({ url: selectedBooking.idImageUrl!, kind: 'id' })}
                          className="flex flex-col items-center gap-1.5 group"
                        >
                          <div className="w-24 h-24 rounded-lg overflow-hidden border border-primary-navy/10 group-hover:border-secondary-gold/60 transition-all bg-surface-container-low flex items-center justify-center">
                            {selectedBooking.idImageUrl.toLowerCase().endsWith('.pdf') ? (
                              <IdCard size={32} className="text-primary-navy/40" />
                            ) : (
                              <img
                                src={selectedBooking.idImageUrl}
                                alt="Guest ID"
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            )}
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/50 group-hover:text-secondary-gold transition-colors">Guest ID</span>
                        </button>
                      )}
                      {selectedBooking?.receiptURL && (
                        <button
                          type="button"
                          onClick={() => setViewer({ url: selectedBooking.receiptURL, kind: 'receipt' })}
                          className="flex flex-col items-center gap-1.5 group"
                        >
                          <div className="w-24 h-24 rounded-lg overflow-hidden border border-primary-navy/10 group-hover:border-secondary-gold/60 transition-all bg-surface-container-low flex items-center justify-center">
                            {selectedBooking.receiptURL.toLowerCase().endsWith('.pdf') ? (
                              <Paperclip size={32} className="text-primary-navy/40" />
                            ) : (
                              <img
                                src={selectedBooking.receiptURL}
                                alt="Payment Receipt"
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            )}
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/50 group-hover:text-secondary-gold transition-colors">Receipt</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="p-5 bg-surface-container-low space-y-3 border-t border-primary-navy/5 no-print">
                {/* Primary action — large, full-width tap target for mobile owners */}
                <button
                  onClick={handlePrint}
                  className="w-full min-h-[56px] flex items-center justify-center gap-3 bg-primary-navy text-white rounded-2xl font-bold text-sm uppercase tracking-wider shadow-lg shadow-primary-navy/20 active:scale-[0.98] hover:bg-primary-navy/90 transition-all"
                >
                  <Printer size={20} />
                  {i18n.language === 'ar' ? 'طباعة / حفظ PDF' : 'Print / Save as PDF'}
                </button>
                {selectedBooking && (
                  <button
                    onClick={() => handleSendWhatsApp(selectedBooking)}
                    className="w-full min-h-[48px] flex items-center justify-center gap-2 border border-emerald-300 bg-emerald-50 rounded-xl font-bold text-xs uppercase tracking-widest text-emerald-700 hover:bg-emerald-100 active:scale-[0.98] transition-all"
                  >
                    <MessageCircle size={16} />
                    {i18n.language === 'ar' ? 'إرسال عبر واتساب' : 'Send via WhatsApp'}
                  </button>
                )}
                {whatsappHref(config.social.whatsapp) && (
                  <a
                    href={whatsappHref(config.social.whatsapp) as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full border border-primary-navy/20 py-3 rounded-xl font-bold text-[10px] uppercase tracking-widest text-primary-navy hover:bg-white transition-colors"
                  >
                    <MessageCircle size={14} />
                    Contact {config.chaletName}
                  </a>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/** WhatsApp invoice trigger — logs for now, will connect API next */
export function sendWhatsAppInvoice(bookingData: { guest_name: string; guest_phone?: string; id: string }) {
  console.log(`Triggering WhatsApp PDF send for ${bookingData.guest_name}...`);
}
