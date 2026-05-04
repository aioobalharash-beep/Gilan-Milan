import React from 'react';
import type { Invoice } from '../types';
import { getClientConfig } from '../config/clientConfig';
import { formatTime } from '../services/pricingUtils';

interface PrintableInvoiceProps {
  invoice: Invoice;
  lang: string;
  chaletName?: string;
  licenseNumber?: string;
  adminName?: string;
  balanceDue?: number;
  depositUnpaid?: boolean;
  checkIn?: string;
  checkOut?: string;
  checkInTime?: string;
  checkOutTime?: string;
  termsText?: string;
}

const DEFAULT_TERMS_EN = `1. Booking & Payment
All reservations require a security deposit at the time of booking. Full payment is due upon check-in. Accepted methods include Thawani, bank transfer, and walk-in payment.

2. Check-In & Check-Out
Check-in is available from 2:00 PM. Check-out must be completed by 11:00 AM. Early check-in or late check-out may be arranged subject to availability.

3. Security Deposit
A refundable security deposit is collected at booking. Any damages, missing items, or additional cleaning beyond normal use will be deducted from the deposit. The remaining balance is refunded within 3–5 business days after check-out once the property is inspected.

4. Cancellation Policy
Cancellations made 48 hours prior to check-in are eligible for a full refund of the security deposit. Late cancellations may incur a charge equivalent to one night's stay.

5. House Rules
Guests are expected to maintain the property in good condition. Smoking is permitted only in designated outdoor areas. Loud gatherings after 11:00 PM are not permitted out of respect for neighbors. Pets are not allowed unless explicitly agreed in writing.

6. Privacy & Security
Your personal information is collected solely for the purpose of managing your reservation. We do not share guest data with third parties. The property is monitored by perimeter security for your safety.`;

const DEFAULT_TERMS_AR = `1. الحجز والدفع
تتطلب جميع الحجوزات دفع تأمين قابل للاسترداد عند الحجز. يُستحق المبلغ كاملاً عند تسجيل الوصول. وسائل الدفع المقبولة: ثواني، التحويل البنكي، والدفع المباشر.

2. تسجيل الوصول والمغادرة
تسجيل الوصول من الساعة 2:00 مساءً. تسجيل المغادرة قبل الساعة 11:00 صباحاً. يمكن ترتيب وصول مبكر أو مغادرة متأخرة حسب التوفر.

3. مبلغ التأمين
يُحصَّل مبلغ تأمين قابل للاسترداد عند الحجز. أي أضرار أو عناصر مفقودة أو تنظيف إضافي يتجاوز الاستخدام الطبيعي يُخصم من المبلغ. يُعاد المتبقي خلال 3 إلى 5 أيام عمل بعد تسجيل المغادرة ومعاينة العقار.

4. سياسة الإلغاء
الإلغاءات قبل 48 ساعة من تسجيل الوصول تستحق استرداداً كاملاً للتأمين. الإلغاءات المتأخرة قد يترتب عليها رسوم تعادل ليلة واحدة.

5. قواعد المنزل
يُتوقع من الضيوف الحفاظ على العقار بحالة جيدة. التدخين مسموح فقط في المناطق الخارجية المخصصة. لا يُسمح بالتجمعات الصاخبة بعد الساعة 11:00 مساءً احتراماً للجيران. لا يُسمح بالحيوانات الأليفة إلا باتفاق خطي مسبق.

6. الخصوصية والأمان
تُجمع بياناتك الشخصية فقط لغرض إدارة حجزك. لا نشارك بيانات الضيوف مع أي طرف ثالث. العقار مُراقب بنظام أمن محيطي لسلامتك.`;

const localizeDesc = (desc: string, isAr: boolean, property: string): string => {
  if (!isAr) return desc;
  if (/[؀-ۿ]/.test(desc)) return desc;
  // Deposit paid upfront — no "payable on entry" suffix
  if (/^security\s*deposit$/i.test(desc)) return 'مبلغ التأمين';
  // Deposit not paid upfront — payable on entry
  if (/security\s*deposit|refundable\s*security\s*deposit/i.test(desc)) return 'مبلغ التأمين يدفع عند الدخول';
  if (/full\s*day|day\s*use/i.test(desc)) return `يوم كامل بدون مبيت — ${property}`;
  if (/partial/i.test(desc)) return `حجز جزئي — ${property}`;
  if (/morning/i.test(desc)) return `فترة صباحية — ${property}`;
  if (/afternoon|evening/i.test(desc)) return `فترة مسائية — ${property}`;
  const nightMatch = desc.match(/^(\d+)\s*nights?\s*[—–-]/i);
  if (nightMatch) {
    const n = parseInt(nightMatch[1], 10);
    return `${n} ${n > 1 ? 'ليالٍ' : 'ليلة'} — ${property}`;
  }
  const slotMatch = desc.match(/^(.+?)\s*[—–-]\s*.+$/);
  if (slotMatch) return `${slotMatch[1]} — ${property}`;
  return desc;
};

export const PrintableInvoice: React.FC<PrintableInvoiceProps> = ({
  invoice,
  lang,
  chaletName,
  licenseNumber,
  adminName,
  balanceDue,
  depositUnpaid,
  checkIn,
  checkOut,
  checkInTime: checkInTimeProp,
  checkOutTime: checkOutTimeProp,
  termsText,
}) => {
  const isAr = lang === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  const refId = invoice.id.slice(0, 8).toUpperCase();
  const property = isAr ? 'شاليه وودي' : invoice.room_type;
  const company = (chaletName || (isAr ? 'شاليه وودي' : 'Woody Chalete')).toUpperCase();

  const dateLocale = isAr ? 'ar-OM' : 'en-GB';
  const fmtDate = (d: string | undefined) =>
    d
      ? new Date(d).toLocaleDateString(dateLocale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '';
  const issuedStr = fmtDate(invoice.issued_date);
  const checkInStr = fmtDate(checkIn);
  const checkOutStr = fmtDate(checkOut);

  // Use booking-specific times when available; otherwise fall back to the
  // standard times configured for this client in clientConfig.checkInOut.
  const { checkInOut: clientTimes, logoPath } = getClientConfig();
  const checkInTime = checkInTimeProp || formatTime(clientTimes.checkInTime, lang);
  const checkOutTime = checkOutTimeProp || formatTime(clientTimes.checkOutTime, lang);

  const t = {
    invoice: isAr ? 'فاتورة' : 'INVOICE',
    billedTo: isAr ? 'فاتورة إلى' : 'BILLED TO',
    issueDate: isAr ? 'تاريخ الإصدار' : 'ISSUE DATE',
    stayWindow: isAr ? 'فترة الإقامة' : 'STAY WINDOW',
    checkIn: isAr ? 'تسجيل الوصول' : 'Check-in',
    checkOut: isAr ? 'تسجيل المغادرة' : 'Check-out',
    issuedBy: isAr ? 'صادرة بواسطة' : 'ISSUED BY',
    description: isAr ? 'البيان' : 'DESCRIPTION',
    amount: isAr ? 'المبلغ' : 'AMOUNT',
    grandTotal: isAr ? 'الإجمالي العام' : 'GRAND TOTAL',
    currency: isAr ? 'ر.ع.' : 'OMR',
    location: isAr ? 'مسقط، سلطنة عُمان' : 'Muscat, Sultanate of Oman',
    license: isAr ? 'رقم الترخيص' : 'License No.',
    depositDue: isAr ? 'مبلغ التأمين مستحق عند الوصول' : 'Deposit Due on Arrival',
    depositDueMsg: isAr
      ? 'يُحصَّل الرصيد المتبقي عند تسجيل الدخول.'
      : 'Remaining balance to be collected at check-in.',
    footer: isAr
      ? 'شكراً لاختياركم شاليه وودي  •  فاتورة صادرة آلياً ولا تتطلب توقيعاً'
      : 'Thank you for choosing Woody Chalete  •  This is a computer-generated invoice.',
    termsTitle: isAr ? 'شروط الإقامة' : 'Terms of Stay',
    termsIntro: isAr
      ? 'يُرجى مراجعة الشروط التالية المتعلقة بإقامتكم في شاليه وودي.'
      : 'Please review the following terms regarding your stay at Woody Chalete.',
    locationAr: 'الموقع',
    locationEn: 'Location',
  };

  const locationUrl = getClientConfig().location.mapsUrl;
  const LocationPin = () => (
    <svg
      className="pi-footer-location-icon"
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
  const FooterLocation = () => (
    <a
      className="pi-footer-location"
      href={locationUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      <LocationPin />
      <span className="pi-footer-location-ar" dir="rtl" lang="ar">{t.locationAr}</span>
      <span className="pi-footer-location-sep" aria-hidden="true">•</span>
      <span className="pi-footer-location-en" dir="ltr" lang="en">{t.locationEn}</span>
    </a>
  );

  const fmt = (n: number) =>
    n.toLocaleString(isAr ? 'ar-OM' : 'en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const terms = (termsText && termsText.trim()) || (isAr ? DEFAULT_TERMS_AR : DEFAULT_TERMS_EN);
  const termsBlocks = terms
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const [firstLine, ...rest] = block.split('\n');
      return { heading: firstLine.trim(), body: rest.join(' ').trim() };
    });

  return (
    <div className="printable-invoice" dir={dir} lang={isAr ? 'ar' : 'en'}>
      <div id="invoice-container" className="pi-sheet">
        {/* Header */}
        <header className="pi-header">
          <div className="pi-header-inner">
            <div className="pi-brand">
              {logoPath && (
                <img
                  src={logoPath}
                  className="invoice-logo"
                  alt={isAr ? `شعار ${company}` : `${company} Logo`}
                />
              )}
              <div>
                <div className="pi-brand-name">{company}</div>
                <div className="pi-brand-tag">{t.location}</div>
                {licenseNumber && (
                  <div className="pi-brand-tag">
                    {t.license}: {licenseNumber}
                  </div>
                )}
              </div>
            </div>
            <div className="pi-title-block">
              <div className="pi-title">{t.invoice}</div>
              <div className="pi-ref">#{refId}</div>
            </div>
          </div>
          <div className="pi-header-accent" />
        </header>

        {/* Meta grid */}
        <section className="pi-meta">
          <div className="pi-meta-col">
            <div className="pi-meta-label">{t.billedTo}</div>
            <div className="pi-meta-name">{invoice.guest_name}</div>
            <div className="pi-meta-sub">{property}</div>
          </div>
          <div className="pi-meta-col">
            <div className="pi-meta-label">{t.issueDate}</div>
            <div className="pi-meta-value">{issuedStr}</div>
            {adminName && (
              <>
                <div className="pi-meta-label pi-meta-label-sm">{t.issuedBy}</div>
                <div className="pi-meta-sub">{adminName}</div>
              </>
            )}
          </div>
        </section>

        {/* Stay window — check-in / check-out dates + times */}
        {(checkInStr || checkOutStr) && (
          <section className="pi-stay">
            <div className="pi-stay-label">{t.stayWindow}</div>
            <div className="pi-stay-row">
              <span className="pi-stay-chip">
                <span className="pi-stay-chip-label">{t.checkIn}</span>
                <span className="pi-stay-chip-value">
                  {checkInStr && <span className="pi-stay-date">{checkInStr}</span>}
                  <span className="pi-stay-sep">|</span>
                  <span className="pi-stay-time">{checkInTime}</span>
                </span>
              </span>
              <span className="pi-stay-chip">
                <span className="pi-stay-chip-label">{t.checkOut}</span>
                <span className="pi-stay-chip-value">
                  {checkOutStr && <span className="pi-stay-date">{checkOutStr}</span>}
                  <span className="pi-stay-sep">|</span>
                  <span className="pi-stay-time">{checkOutTime}</span>
                </span>
              </span>
            </div>
          </section>
        )}

        {/* Line items table */}
        <section className="pi-table-wrap">
          <div className="pi-table-head">
            <span>{t.description}</span>
            <span>
              {t.amount} ({t.currency})
            </span>
          </div>
          {invoice.items && invoice.items.length > 0 ? (
            invoice.items.map((item, i) => {
              const isDeposit = /deposit|تأمين/i.test(item.description);
              return (
                <div key={i} className={`pi-row ${isDeposit ? 'pi-row-muted' : ''}`}>
                  <span>{localizeDesc(item.description, isAr, property)}</span>
                  <span className="pi-row-amount">{fmt(item.amount)}</span>
                </div>
              );
            })
          ) : (
            <div className="pi-row">
              <span>{isAr ? `رسوم الإقامة — ${property}` : `Stay Charges — ${invoice.room_type}`}</span>
              <span className="pi-row-amount">{fmt(invoice.subtotal)}</span>
            </div>
          )}
        </section>

        {/* Grand total */}
        <section className="pi-total">
          <span className="pi-total-label">{t.grandTotal}</span>
          <span className="pi-total-value">
            {fmt(invoice.total_amount)} <span className="pi-total-currency">{t.currency}</span>
          </span>
        </section>

        <footer className="pi-footer">
          <div className="pi-footer-rule" />
          <div className="pi-footer-text">{t.footer}</div>
          <FooterLocation />
        </footer>

        {/* Terms of Stay — always starts on its own page */}
        <section className="page-break pi-terms" aria-label={t.termsTitle}>
          <header className="pi-terms-header">
            <div className="pi-terms-eyebrow">{company}</div>
            <h2 className="pi-terms-title">{t.termsTitle}</h2>
            <p className="pi-terms-intro">{t.termsIntro}</p>
            <div className="pi-terms-accent" />
          </header>

          <div className="pi-terms-body">
            {termsBlocks.map((block, i) => (
              <article key={i} className="pi-terms-block">
                <h3 className="pi-terms-heading">{block.heading}</h3>
                {block.body && <p className="pi-terms-text">{block.body}</p>}
              </article>
            ))}
          </div>

          <div className="pi-footer-rule" />
          <div className="pi-footer-text">{t.footer}</div>
          <FooterLocation />
        </section>
      </div>
    </div>
  );
};
