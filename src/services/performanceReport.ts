import jsPDF from 'jspdf';

interface PerformanceReportData {
  startDate: string;
  endDate: string;
  totalRevenue: number;
  totalBookings: number;
  totalNights: number;
  avgStay: number;
  licenseNumber?: string;
  chaletName?: string;
  adminName?: string;
  bookings: { guest_name: string; check_in: string; check_out: string; nights: number; amount: number }[];
}

// Navy: rgb(1, 31, 54)  |  Gold: rgb(212, 175, 55)

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function generatePerformanceReportPDF(data: PerformanceReportData) {
  const doc = new jsPDF({ format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ml = 20;
  const mr = pw - 20;
  let y = 24;

  // ── HEADER ──────────────────────────────────────────────
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(1, 31, 54);
  doc.text(data.chaletName || 'Luxury Stay', ml, y);

  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text('Muscat, Sultanate of Oman', mr, y, { align: 'right' });
  if (data.licenseNumber) {
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
  doc.text('Performance Report', ml, y);

  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`${fmtDate(data.startDate)} — ${fmtDate(data.endDate)}  |  ${data.totalBookings} confirmed booking${data.totalBookings !== 1 ? 's' : ''}`, ml, y);

  // ── BOOKINGS TABLE ──────────────────────────────────────
  y += 18;

  const col1 = ml;       // Guest Name
  const col2 = 80;       // Dates
  const col3 = 145;      // Nights
  const col4 = mr;       // Amount (right-aligned)

  // Table header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(1, 31, 54);
  doc.text('GUEST NAME', col1, y);
  doc.text('DATES', col2, y);
  doc.text('NIGHTS', col3, y);
  doc.text('AMOUNT (OMR)', col4, y, { align: 'right' });

  y += 3;
  doc.setDrawColor(1, 31, 54);
  doc.setLineWidth(0.3);
  doc.line(ml, y, mr, y);
  y += 7;

  // Table rows
  if (data.bookings.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(140);
    doc.text('No confirmed bookings for this period.', ml, y);
    y += 10;
  } else {
    for (let i = 0; i < data.bookings.length; i++) {
      const b = data.bookings[i];

      // Page break — leave room for summary + footer
      if (y > ph - 90) {
        drawFooter(doc, pw, ph);
        doc.addPage();
        y = 24;
      }

      // Subtle separator between rows
      if (i > 0) {
        doc.setDrawColor(210);
        doc.setLineWidth(0.15);
        doc.line(ml, y - 5, mr, y - 5);
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(1, 31, 54);
      doc.text(b.guest_name, col1, y);

      doc.setTextColor(80);
      doc.text(`${fmtDate(b.check_in)} — ${fmtDate(b.check_out)}`, col2, y);

      doc.setTextColor(1, 31, 54);
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

  // ── EXECUTIVE SUMMARY ───────────────────────────────────
  y += 18;

  // Section title
  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(1, 31, 54);
  doc.text('Executive Summary', ml, y);

  y += 4;
  doc.setDrawColor(1, 31, 54);
  doc.setLineWidth(0.2);
  doc.line(ml, y, ml + 40, y);

  y += 12;
  const labelX = ml;
  const valueX = ml + 60;

  // Total Revenue
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text('Total Revenue', labelX, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(212, 175, 55);
  doc.text(`OMR ${data.totalRevenue.toFixed(2)}`, valueX, y);

  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text('Total Bookings', labelX, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(1, 31, 54);
  doc.text(String(data.totalBookings), valueX, y);

  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text('Total Nights', labelX, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(1, 31, 54);
  doc.text(String(data.totalNights), valueX, y);

  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text('Average Stay', labelX, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(1, 31, 54);
  doc.text(`${data.avgStay} nights`, valueX, y);

  // Revenue per booking
  if (data.totalBookings > 0) {
    y += 8;
    const revPerBooking = (data.totalRevenue / data.totalBookings).toFixed(2);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80);
    doc.text('Revenue / Booking', labelX, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(212, 175, 55);
    doc.text(`OMR ${revPerBooking}`, valueX, y);
  }

  // ── FOOTER ──────────────────────────────────────────────
  drawFooter(doc, pw, ph);

  const rangeLabel = `${data.startDate}_${data.endDate}`;
  doc.save(`Al-Malak-Chalet-Performance-Report-${rangeLabel}.pdf`);
}

function drawFooter(doc: jsPDF, pw: number, ph: number) {
  const footerY = ph - 16;
  doc.setDrawColor(200);
  doc.setLineWidth(0.15);
  doc.line(20, footerY - 4, pw - 20, footerY - 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(160);
  doc.text(
    'Woody Chalete: This is a computer-generated performance report.',
    pw / 2, footerY, { align: 'center' }
  );
}
