import jsPDF from 'jspdf';

interface VATReportData {
  month: string;
  taxId: string;
  licenseNumber?: string;
  chaletName?: string;
  adminName?: string;
  totalRevenue: number;
  vatRate: number;
  vatCollected: number;
  bookingCount: number;
  bookings: { guest_name: string; check_in: string; nights: number; amount: number }[];
}

// Navy: rgb(1, 31, 54)  |  Gold: rgb(212, 175, 55)

export function generateVATReportPDF(data: VATReportData) {
  const doc = new jsPDF({ format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();   // ~210
  const ph = doc.internal.pageSize.getHeight();   // ~297
  const ml = 20;  // margin left
  const mr = pw - 20; // margin right
  let y = 24;

  // ── HEADER ──────────────────────────────────────────────
  // Business name — serif
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(1, 31, 54);
  doc.text(data.chaletName || 'Luxury Stay', ml, y);

  // Tax ID + location — sans-serif
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(`Tax ID: ${data.taxId}`, ml, y);
  doc.text('Muscat, Sultanate of Oman', mr, y, { align: 'right' });

  if (data.licenseNumber) {
    y += 5;
    doc.text(`Tourism License: ${data.licenseNumber}`, ml, y);
  }

  if (data.adminName) {
    y += 5;
    doc.text(`Issued By: ${data.adminName}`, ml, y);
  }

  // Thin navy rule
  y += 6;
  doc.setDrawColor(1, 31, 54);
  doc.setLineWidth(0.3);
  doc.line(ml, y, mr, y);

  // ── REPORT TITLE ────────────────────────────────────────
  y += 14;
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(1, 31, 54);
  doc.text(`Monthly VAT Summary — ${data.month}`, ml, y);

  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`${data.bookingCount} confirmed booking${data.bookingCount !== 1 ? 's' : ''} in this period`, ml, y);

  // ── TABLE ───────────────────────────────────────────────
  y += 16;

  const col1 = ml;       // Guest Name
  const col2 = 95;       // Check-in
  const col3 = 135;      // Nights
  const col4 = mr;       // Amount (right-aligned)

  // Table header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(1, 31, 54);
  doc.text('GUEST NAME', col1, y);
  doc.text('CHECK-IN', col2, y);
  doc.text('NIGHTS', col3, y);
  doc.text('AMOUNT (OMR)', col4, y, { align: 'right' });

  y += 3;
  doc.setDrawColor(1, 31, 54);
  doc.setLineWidth(0.3);
  doc.line(ml, y, mr, y);
  y += 7;

  // Table rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  if (data.bookings.length === 0) {
    doc.setTextColor(140);
    doc.text('No confirmed bookings for this period.', ml, y);
    y += 10;
  } else {
    for (let i = 0; i < data.bookings.length; i++) {
      const b = data.bookings[i];

      // Page break check — leave room for summary + footer
      if (y > ph - 80) {
        // footer on current page
        drawFooter(doc, pw, ph);
        doc.addPage();
        y = 24;
      }

      // Alternating subtle guide line (thin, light)
      if (i > 0) {
        doc.setDrawColor(210);
        doc.setLineWidth(0.15);
        doc.line(ml, y - 5, mr, y - 5);
      }

      doc.setTextColor(1, 31, 54);
      doc.setFont('helvetica', 'normal');
      doc.text(b.guest_name, col1, y);
      doc.text(
        new Date(b.check_in).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        col2, y
      );
      doc.text(String(b.nights), col3 + 6, y, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.text(b.amount.toFixed(2), col4, y, { align: 'right' });
      y += 9;
    }
  }

  // Bottom table rule
  y += 2;
  doc.setDrawColor(1, 31, 54);
  doc.setLineWidth(0.3);
  doc.line(ml, y, mr, y);

  // ── SUMMARY BOX (right-aligned) ─────────────────────────
  y += 14;
  const boxW = 80;
  const boxX = mr - boxW;

  // Revenue
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text('Revenue', boxX, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(1, 31, 54);
  doc.text(`OMR ${data.totalRevenue.toFixed(2)}`, mr, y, { align: 'right' });

  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text('VAT Rate', boxX, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(1, 31, 54);
  doc.text(`${data.vatRate}%`, mr, y, { align: 'right' });

  // Thin separator
  y += 5;
  doc.setDrawColor(1, 31, 54);
  doc.setLineWidth(0.2);
  doc.line(boxX, y, mr, y);

  // Total VAT Collected — gold accent
  y += 9;
  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text('Total VAT Collected', boxX, y);
  doc.setFontSize(12);
  doc.setTextColor(212, 175, 55);
  doc.text(`OMR ${data.vatCollected.toFixed(2)}`, mr, y, { align: 'right' });

  // ── FOOTER ──────────────────────────────────────────────
  drawFooter(doc, pw, ph);

  doc.save(`Al-Malak-Chalet-VAT-Report-${data.month.replace(/\s/g, '-')}.pdf`);
}

function drawFooter(doc: jsPDF, pw: number, ph: number) {
  const footerY = ph - 16;
  // Thin rule above footer
  doc.setDrawColor(200);
  doc.setLineWidth(0.15);
  doc.line(20, footerY - 4, pw - 20, footerY - 4);
  // Footer text
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(160);
  doc.text(
    'Woody Chalete: This is a computer-generated VAT summary report.',
    pw / 2, footerY, { align: 'center' }
  );
}
