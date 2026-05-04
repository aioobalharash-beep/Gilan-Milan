import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { getClientConfig } from '../config/clientConfig';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InvoiceData {
  id: string;
  guest_name: string;
  room_type: string;
  issued_date: string;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  items?: { description: string; amount: number }[];
  licenseNumber?: string;
  chaletName?: string;
  adminName?: string;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const FONT_STACK = '"IBM Plex Sans Arabic", "Cairo", "Alexandria", sans-serif';

/** Wait for all web fonts to finish loading */
async function ensureFontsLoaded(): Promise<void> {
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }
}

/**
 * Render a hidden DOM element to a high-resolution canvas,
 * then place it as an image inside a jsPDF document.
 *
 * Returns the jsPDF instance for further use (save / bloburl).
 */
async function htmlToPdf(el: HTMLElement): Promise<jsPDF> {
  await ensureFontsLoaded();

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });

  const imgData = canvas.toDataURL('image/png');
  const imgW = canvas.width;
  const imgH = canvas.height;

  // A4 dimensions in mm
  const pdfW = 210;
  const pdfH = 297;
  const ratio = imgW / imgH;
  const fitH = pdfW / ratio;

  const doc = new jsPDF({
    orientation: fitH > pdfH ? 'portrait' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // If content is taller than one page, scale to fit width and span pages
  if (fitH <= pdfH) {
    doc.addImage(imgData, 'PNG', 0, 0, pdfW, fitH, undefined, 'FAST');
  } else {
    // Multi-page: slice the canvas into page-sized chunks
    const pageCanvasH = (pdfH / fitH) * imgH;
    let srcY = 0;
    let pageNum = 0;

    while (srcY < imgH) {
      if (pageNum > 0) doc.addPage();
      const sliceH = Math.min(pageCanvasH, imgH - srcY);
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = imgW;
      sliceCanvas.height = sliceH;
      const ctx = sliceCanvas.getContext('2d')!;
      ctx.drawImage(canvas, 0, srcY, imgW, sliceH, 0, 0, imgW, sliceH);
      const sliceData = sliceCanvas.toDataURL('image/png');
      const sliceRenderedH = (sliceH / imgH) * fitH;
      doc.addImage(sliceData, 'PNG', 0, 0, pdfW, sliceRenderedH, undefined, 'FAST');
      srcY += sliceH;
      pageNum++;
    }
  }

  return doc;
}

/**
 * Mount a hidden div off-screen, run a callback, then clean up.
 */
async function withHiddenDiv(
  buildHtml: (container: HTMLDivElement) => void,
): Promise<jsPDF> {
  const wrapper = document.createElement('div');
  wrapper.style.cssText =
    'position:fixed;left:-9999px;top:0;z-index:-1;pointer-events:none;';
  document.body.appendChild(wrapper);

  const container = document.createElement('div');
  // A4 aspect ratio at 794px wide (≈ 210mm at 96dpi)
  container.style.cssText = `width:794px;background:#fff;font-family:${FONT_STACK};`;
  wrapper.appendChild(container);

  buildHtml(container);

  // Give the browser a frame to lay out + render fonts
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await ensureFontsLoaded();

  const doc = await htmlToPdf(container);
  document.body.removeChild(wrapper);
  return doc;
}

// ---------------------------------------------------------------------------
// Reusable style constants
// ---------------------------------------------------------------------------

const NAVY = '#011F36';
const GOLD = '#D4AF37';
const LIGHT_BORDER = '#e8e8e8';

// ---------------------------------------------------------------------------
// Invoice HTML builder
// ---------------------------------------------------------------------------

function buildInvoiceHtml(
  container: HTMLDivElement,
  invoice: InvoiceData,
  lang: string,
): void {
  const isAr = lang === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  const textStart = isAr ? 'text-right' : 'text-left';
  const textEnd = isAr ? 'text-left' : 'text-right';

  const dateLocale = isAr ? 'ar-OM' : 'en-GB';
  const dateStr = new Date(invoice.issued_date).toLocaleDateString(dateLocale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const companyName = (invoice.chaletName || (isAr ? 'شاليه وودي' : 'Woody Chalete')).toUpperCase();
  const location = isAr ? 'مسقط، سلطنة عُمان' : 'Muscat, Sultanate of Oman';
  const regInfo = invoice.licenseNumber
    ? (isAr ? `ترخيص سياحي: ${invoice.licenseNumber}` : `Tourism License: ${invoice.licenseNumber}`)
    : '';
  const issuedByLabel = isAr ? 'صادرة بواسطة' : 'ISSUED BY';

  const invoiceTitle = isAr ? 'فاتورة' : 'INVOICE';
  const billedToLabel = isAr ? 'فاتورة إلى' : 'BILLED TO';
  const issueDateLabel = isAr ? 'تاريخ الحجز' : 'ISSUE DATE';
  const descLabel = isAr ? 'البيان' : 'DESCRIPTION';
  const amountLabel = isAr ? 'المبلغ (ر.ع.)' : 'AMOUNT (OMR)';
  const grandTotalLabel = isAr ? 'الإجمالي العام' : 'Grand Total';

  // Translate property name for Arabic
  const localizedProperty = isAr ? 'شاليه وودي' : invoice.room_type;

  const fmtAmount = (n: number): string => {
    const val = n.toFixed(2);
    return isAr ? `${val} ر.ع.` : `OMR ${val}`;
  };

  const fmtLineAmount = (n: number): string => {
    const val = n.toFixed(2);
    return isAr ? `${val} ر.ع.` : val;
  };

  /**
   * Localize an item description for Arabic invoices.
   * Translates known English patterns into proper Arabic equivalents.
   */
  const localizeDesc = (desc: string): string => {
    if (!isAr) return desc;
    // Already Arabic — pass through
    if (/[\u0600-\u06FF]/.test(desc)) return desc;
    // Known patterns
    if (/security\s*deposit|refundable\s*security\s*deposit/i.test(desc)) return 'مبلغ التأمين يدفع عند الدخول';
    if (/full\s*day/i.test(desc)) return `يوم كامل بدون مبيت — ${localizedProperty}`;
    if (/day\s*use/i.test(desc)) return `يوم كامل بدون مبيت — ${localizedProperty}`;
    if (/partial/i.test(desc)) return `حجز جزئي — ${localizedProperty}`;
    if (/morning/i.test(desc)) return `فترة صباحية — ${localizedProperty}`;
    if (/afternoon|evening/i.test(desc)) return `فترة مسائية — ${localizedProperty}`;
    // Generic stay pattern: "3 Nights — Property Name" or "1 Night — Property Name"
    const nightMatch = desc.match(/^(\d+)\s*nights?\s*[—–-]/i);
    if (nightMatch) {
      const n = parseInt(nightMatch[1], 10);
      const nightWord = n > 1 ? 'ليالٍ' : 'ليلة';
      return `${n} ${nightWord} — ${localizedProperty}`;
    }
    // Slot name patterns: "SlotName — Property" → keep slot, replace property
    const slotMatch = desc.match(/^(.+?)\s*[—–-]\s*.+$/);
    if (slotMatch) return `${slotMatch[1]} — ${localizedProperty}`;
    return desc;
  };

  const refId = invoice.id.slice(0, 8).toUpperCase();

  const { logoPath } = getClientConfig();
  // Resolve a same-origin absolute URL so html2canvas can read the image
  // without tripping over relative paths inside the off-screen render frame.
  const logoUrl =
    logoPath && typeof window !== 'undefined'
      ? new URL(logoPath, window.location.origin).toString()
      : logoPath || '';

  const footerText = isAr
    ? 'شاليه وودي  |  سلطنة عُمان  |  هذه فاتورة صادرة آلياً ولا تتطلب توقيعاً'
    : 'Woody Chalete  |  Sultanate of Oman  |  This is a computer-generated invoice.';

  // Build items HTML
  let itemsHtml = '';
  if (invoice.items && invoice.items.length > 0) {
    for (const item of invoice.items) {
      const localDesc = localizeDesc(item.description);
      const isDeposit = /deposit|تأمين/i.test(item.description);
      const descColor = isDeposit ? '#888' : NAVY;
      itemsHtml += `
        <div style="display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;">
          <span style="color:${descColor};font-size:13px;">${localDesc}</span>
          <span style="font-weight:700;color:${NAVY};font-size:13px;">${fmtLineAmount(item.amount)}</span>
        </div>`;
    }
  } else {
    const desc = isAr
      ? `رسوم الإقامة — ${localizedProperty}`
      : `Stay Charges - ${invoice.room_type}`;
    itemsHtml = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;">
        <span style="color:${NAVY};font-size:13px;">${desc}</span>
        <span style="font-weight:700;color:${NAVY};font-size:13px;">${fmtLineAmount(invoice.subtotal)}</span>
      </div>`;
  }

  container.setAttribute('dir', dir);
  container.innerHTML = `
    <div style="padding:48px 48px 36px;font-family:${FONT_STACK};color:${NAVY};line-height:1.6;">

      <!-- Header -->
      <div style="display:flex;align-items:center;gap:16px;${isAr ? 'flex-direction:row-reverse;' : ''}margin-bottom:4px;">
        ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" style="height:48px;width:auto;object-fit:contain;" crossorigin="anonymous" />` : ''}
        <div style="${textStart};">
          <div style="font-size:22px;font-weight:700;letter-spacing:0.5px;">${companyName}</div>
          <div style="font-size:10px;color:#888;margin-top:4px;">${location}</div>
          ${regInfo ? `<div style="font-size:10px;color:#888;margin-top:2px;">${regInfo}</div>` : ''}
        </div>
      </div>

      <hr style="border:none;border-top:1px solid ${LIGHT_BORDER};margin:24px 0;" />

      <!-- Invoice title + ref -->
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <div style="font-size:20px;font-weight:700;">${invoiceTitle}</div>
        <div style="font-size:11px;color:#999;font-weight:600;">#${refId}</div>
      </div>

      <div style="margin-top:20px;display:flex;justify-content:space-between;">
        <!-- Billed To -->
        <div>
          <div style="font-size:9px;color:#aaa;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin-bottom:4px;">${billedToLabel}</div>
          <div style="font-size:14px;font-weight:700;">${invoice.guest_name}</div>
          <div style="font-size:11px;color:#888;margin-top:2px;">${localizedProperty}</div>
        </div>
        <!-- Issue Date -->
        <div style="${textEnd};">
          <div style="font-size:9px;color:#aaa;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin-bottom:4px;">${issueDateLabel}</div>
          <div style="font-size:14px;font-weight:700;">${dateStr}</div>
          ${invoice.adminName ? `<div style="font-size:9px;color:#aaa;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin-top:10px;">${issuedByLabel}</div><div style="font-size:12px;font-weight:600;">${invoice.adminName}</div>` : ''}
        </div>
      </div>

      <hr style="border:none;border-top:1px solid ${LIGHT_BORDER};margin:24px 0;" />

      <!-- Table header -->
      <div style="display:flex;justify-content:space-between;padding-bottom:6px;border-bottom:1px solid ${LIGHT_BORDER};">
        <span style="font-size:9px;color:#aaa;font-weight:700;text-transform:uppercase;letter-spacing:2px;">${descLabel}</span>
        <span style="font-size:9px;color:#aaa;font-weight:700;text-transform:uppercase;letter-spacing:2px;">${amountLabel}</span>
      </div>

      <!-- Line items -->
      ${itemsHtml}

      <hr style="border:none;border-top:1px solid ${LIGHT_BORDER};margin:16px 0;" />

      <!-- Grand total -->
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;">
        <span style="font-size:17px;font-weight:700;">${grandTotalLabel}</span>
        <span style="font-size:20px;font-weight:700;color:${GOLD};">${fmtAmount(invoice.total_amount)}</span>
      </div>

      <!-- Footer -->
      <div style="margin-top:60px;text-align:center;font-size:8px;color:#bbb;letter-spacing:1px;">
        ${footerText}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Terms HTML builder
// ---------------------------------------------------------------------------

function buildTermsHtml(
  container: HTMLDivElement,
  termsText: string,
  lang: string,
): void {
  const isAr = lang === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  const textStart = isAr ? 'text-right' : 'text-left';

  const companyName = isAr ? 'شاليه وودي' : 'WOODY CHALETE';
  const location = isAr ? 'مسقط، سلطنة عُمان' : 'Muscat, Sultanate of Oman';
  const title = isAr ? 'شروط الإقامة' : 'Terms of Stay';

  const dateLocale = isAr ? 'ar-OM' : 'en-GB';
  const genLabel = isAr ? 'تاريخ الإصدار: ' : 'Generated: ';
  const genDate = new Date().toLocaleDateString(dateLocale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const footerText = isAr
    ? 'شاليه وودي  |  سلطنة عُمان  |  هذه الوثيقة لأغراض إعلامية فقط.'
    : 'Woody Chalete  |  Sultanate of Oman  |  This document is for informational purposes.';

  // Convert newlines to paragraphs
  const bodyHtml = termsText
    .split(/\n+/)
    .filter((p) => p.trim())
    .map((p) => `<p style="margin:0 0 10px;font-size:12px;color:#333;line-height:1.8;">${p}</p>`)
    .join('');

  container.setAttribute('dir', dir);
  container.innerHTML = `
    <div style="padding:48px 48px 36px;font-family:${FONT_STACK};color:${NAVY};line-height:1.6;">

      <!-- Header -->
      <div style="${textStart};margin-bottom:4px;">
        <div style="font-size:22px;font-weight:700;letter-spacing:0.5px;">${companyName}</div>
        <div style="font-size:10px;color:#888;margin-top:4px;">${location}</div>
      </div>

      <hr style="border:none;border-top:1px solid ${LIGHT_BORDER};margin:24px 0;" />

      <!-- Title -->
      <div style="font-size:18px;font-weight:700;margin-bottom:6px;">${title}</div>
      <div style="font-size:9px;color:#aaa;margin-bottom:20px;">${genLabel}${genDate}</div>

      <hr style="border:none;border-top:1px solid ${LIGHT_BORDER};margin:0 0 20px;" />

      <!-- Body -->
      <div>${bodyHtml}</div>

      <!-- Footer -->
      <div style="margin-top:40px;text-align:center;font-size:8px;color:#bbb;letter-spacing:1px;">
        ${footerText}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Public API — same signatures, now powered by HTML snapshot
// ---------------------------------------------------------------------------

export async function generateInvoicePDF(
  invoice: InvoiceData,
  lang = 'en',
): Promise<jsPDF> {
  return withHiddenDiv((el) => buildInvoiceHtml(el, invoice, lang));
}

export async function downloadInvoicePDF(invoice: InvoiceData, lang = 'en') {
  try {
    const doc = await generateInvoicePDF(invoice, lang);
    doc.save(`Al-Malak-Chalet-Invoice-${invoice.id.slice(0, 8).toUpperCase()}.pdf`);
  } catch (err) {
    console.error('[PDF] Failed to download invoice PDF:', err);
    alert(
      lang === 'ar'
        ? 'حدث خطأ أثناء إنشاء الفاتورة. يرجى المحاولة مرة أخرى.'
        : 'Failed to generate invoice. Please try again.',
    );
  }
}

export async function downloadTermsPDF(termsText: string, lang = 'en') {
  try {
    const doc = await withHiddenDiv((el) =>
      buildTermsHtml(el, termsText, lang),
    );
    doc.save(
      lang === 'ar'
        ? 'شاليه-وودي-شروط-الإقامة.pdf'
        : 'Al-Malak-Chalet-Terms-of-Stay.pdf',
    );
  } catch (err) {
    console.error('[PDF] Failed to download terms PDF:', err);
    alert(
      lang === 'ar'
        ? 'حدث خطأ أثناء إنشاء ملف الشروط. يرجى المحاولة مرة أخرى.'
        : 'Failed to generate terms PDF. Please try again.',
    );
  }
}
