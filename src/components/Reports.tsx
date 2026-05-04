import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Banknote, TrendingUp, Moon, Download, Calendar as CalendarIcon, Search, FileBarChart } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { collection, query, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { generatePerformanceReportPDF } from '../services/performanceReport';
import { useTranslation } from 'react-i18next';
import { getClientConfig } from '../config/clientConfig';

interface RealtimeBooking {
  id: string;
  property_name: string;
  guest_name: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  nights: number;
  total_amount: number;
  security_deposit: number;
  status: string;
  payment_status: string;
  created_at: string;
}

export const Reports: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [allBookings, setAllBookings] = useState<RealtimeBooking[]>([]);
  const [loading, setLoading] = useState(true);

  // Date range picker
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Filtered results
  const [filteredBookings, setFilteredBookings] = useState<RealtimeBooking[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [licenseNumber, setLicenseNumber] = useState('');

  useEffect(() => {
    getDoc(doc(db, 'settings', 'property_details'))
      .then(snap => {
        if (snap.exists() && snap.data().licenseNumber) {
          setLicenseNumber(snap.data().licenseNumber);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'bookings'), orderBy('created_at', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RealtimeBooking));
      setAllBookings(data);
      setLoading(false);
    }, (error) => {
      console.error('Bookings listener error:', error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleGenerate = () => {
    if (!startDate || !endDate) return;
    const results = allBookings.filter(b => {
      if (b.status === 'cancelled') return false;
      if (b.status !== 'confirmed' && b.status !== 'checked-in') return false;
      return b.check_in >= startDate && b.check_in <= endDate;
    }).sort((a, b) => a.check_in.localeCompare(b.check_in));
    setFilteredBookings(results);
  };

  // Computed stats
  const totalRevenue = filteredBookings?.reduce((sum, b) => sum + b.total_amount - (b.security_deposit || 0), 0) ?? 0;
  const totalBookings = filteredBookings?.length ?? 0;
  const totalNights = filteredBookings?.reduce((sum, b) => sum + b.nights, 0) ?? 0;
  const avgStay = totalBookings > 0 ? +(totalNights / totalBookings).toFixed(1) : 0;

  const handleDownloadPDF = () => {
    if (!filteredBookings || !startDate || !endDate) return;
    setGenerating(true);

    // Small delay so the spinner renders before the synchronous PDF work
    setTimeout(() => {
      const config = getClientConfig();
      generatePerformanceReportPDF({
        startDate,
        endDate,
        totalRevenue,
        totalBookings,
        totalNights,
        avgStay,
        licenseNumber,
        chaletName: config.chaletName,
        adminName: config.admin.name,
        bookings: filteredBookings.map(b => ({
          guest_name: b.guest_name,
          check_in: b.check_in,
          check_out: b.check_out,
          nights: b.nights,
          amount: b.total_amount - (b.security_deposit || 0),
        })),
      });
      setGenerating(false);
    }, 100);
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString(i18n.language === 'ar' ? 'ar-OM' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  if (loading) return <div className="p-8 animate-pulse"><div className="h-96 bg-primary-navy/5 rounded-xl" /></div>;

  return (
    <div className="p-6 md:p-8 space-y-10 max-w-4xl mx-auto">
      {/* Page Header */}
      <div>
        <span className="text-secondary-gold font-bold tracking-widest text-[10px] uppercase">{t('common.administration')}</span>
        <h1 className="font-headline text-2xl font-bold text-primary-navy mt-1">{t('reports.financialReports')}</h1>
        <p className="text-primary-navy/50 text-xs font-medium mt-1">{t('reports.generateReportDesc')}</p>
      </div>

      {/* Date Range Picker */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[20px] p-6 border border-primary-navy/5 shadow-sm"
      >
        <div className="flex items-center gap-2 mb-5">
          <CalendarIcon size={16} className="text-secondary-gold" />
          <h3 className="text-sm font-bold text-primary-navy uppercase tracking-wide">{t('reports.selectDateRange')}</h3>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">{t('reports.startDate')}</label>
            <input
              type="date"
              lang={i18n.language}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-pearl-white border border-primary-navy/10 rounded-xl py-3 px-4 text-sm text-primary-navy font-medium focus:ring-1 focus:ring-secondary-gold/50 focus:border-secondary-gold/50 outline-none"
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">{t('reports.endDate')}</label>
            <input
              type="date"
              lang={i18n.language}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-pearl-white border border-primary-navy/10 rounded-xl py-3 px-4 text-sm text-primary-navy font-medium focus:ring-1 focus:ring-secondary-gold/50 focus:border-secondary-gold/50 outline-none"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleGenerate}
              disabled={!startDate || !endDate}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary-navy text-white px-8 py-3 rounded-xl font-bold text-xs uppercase tracking-widest active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Search size={14} />
              {t('reports.generateReport')}
            </button>
          </div>
        </div>
      </motion.section>

      {/* Results — only show after generating */}
      {filteredBookings !== null && (
        <>
          {/* Performance Summary Cards */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-primary-navy p-6 rounded-[20px] text-white shadow-xl shadow-primary-navy/20"
            >
              <Banknote size={20} className="text-secondary-gold mb-3" />
              <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest">{t('reports.totalRevenue')}</p>
              <p className="font-headline text-2xl font-bold mt-1">
                {totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                <span className="text-sm font-normal text-white/60 ms-1">{t('common.omr')}</span>
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="bg-white p-6 rounded-[20px] border border-primary-navy/5 shadow-sm"
            >
              <TrendingUp size={20} className="text-secondary-gold mb-3" />
              <p className="text-primary-navy/40 text-[10px] font-bold uppercase tracking-widest">{t('calendar.totalBookings')}</p>
              <p className="font-headline text-2xl font-bold text-primary-navy mt-1">{totalBookings}</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white p-6 rounded-[20px] border border-primary-navy/5 shadow-sm"
            >
              <Moon size={20} className="text-secondary-gold mb-3" />
              <p className="text-primary-navy/40 text-[10px] font-bold uppercase tracking-widest">{t('reports.averageStay')}</p>
              <p className="font-headline text-2xl font-bold text-primary-navy mt-1">
                {avgStay} <span className="text-sm font-normal text-primary-navy/40">{t('common.nights')}</span>
              </p>
            </motion.div>
          </section>

          {/* Bookings Table or No Data */}
          {filteredBookings.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-white rounded-[20px] p-12 border border-primary-navy/5 shadow-sm text-center"
            >
              <div className="w-16 h-16 bg-primary-navy/5 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileBarChart size={28} className="text-primary-navy/25" />
              </div>
              <p className="font-bold text-primary-navy text-sm">{t('reports.noDataAvailable')}</p>
              <p className="text-primary-navy/40 text-xs mt-1">{t('reports.noDataHint')}</p>
            </motion.div>
          ) : (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="flex justify-between items-end px-1">
                <div>
                  <h3 className="font-headline text-lg text-primary-navy font-bold">{t('reports.bookingDetails')}</h3>
                  <p className="text-primary-navy/50 text-xs font-medium">
                    {formatDate(startDate)} — {formatDate(endDate)} &bull; {totalBookings} {t('reports.confirmed')}
                  </p>
                </div>
                <button
                  onClick={handleDownloadPDF}
                  disabled={generating}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-navy text-white font-bold text-[10px] uppercase tracking-widest active:scale-[0.98] transition-all disabled:opacity-60"
                >
                  {generating ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  {generating ? t('reports.generating') : t('reports.downloadPdfReport')}
                </button>
              </div>

              <div className="bg-white rounded-[20px] border border-primary-navy/5 shadow-sm overflow-hidden">
                {/* Table Header */}
                <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 bg-surface-container-low border-b border-primary-navy/5">
                  <span className="col-span-4 text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">{t('invoices.guest')}</span>
                  <span className="col-span-3 text-[10px] font-bold uppercase tracking-widest text-primary-navy/40">{t('reports.datesCol')}</span>
                  <span className="col-span-2 text-[10px] font-bold uppercase tracking-widest text-primary-navy/40 text-center">{t('reports.nightsCol')}</span>
                  <span className="col-span-3 text-[10px] font-bold uppercase tracking-widest text-primary-navy/40 text-end">{t('common.amount')}</span>
                </div>

                {filteredBookings.map((b, i) => (
                  <div
                    key={b.id}
                    className={cn(
                      "px-6 py-4 border-b border-primary-navy/5 last:border-b-0 transition-colors hover:bg-primary-navy/[0.02]",
                      "md:grid md:grid-cols-12 md:gap-4 md:items-center",
                      "flex flex-col gap-2"
                    )}
                  >
                    <div className="col-span-4">
                      <p className="font-bold text-primary-navy text-sm">{b.guest_name}</p>
                      <p className="text-[10px] text-primary-navy/40 font-medium md:hidden">{b.property_name}</p>
                    </div>
                    <div className="col-span-3">
                      <span className="text-xs text-primary-navy/60">
                        {formatDate(b.check_in)} — {formatDate(b.check_out)}
                      </span>
                    </div>
                    <div className="col-span-2 text-center">
                      <span className="text-xs font-bold text-primary-navy">{b.nights}</span>
                    </div>
                    <div className="col-span-3 text-end">
                      <span className="font-bold text-primary-navy font-headline text-sm">
                        {(b.total_amount - (b.security_deposit || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-primary-navy/40 ms-1">{t('common.omr')}</span>
                    </div>
                  </div>
                ))}

                {/* Table Footer Totals */}
                <div className="px-6 py-4 bg-surface-container-low border-t border-primary-navy/10 md:grid md:grid-cols-12 md:gap-4 md:items-center flex justify-between">
                  <div className="col-span-4">
                    <p className="text-xs font-bold text-primary-navy uppercase tracking-wider">{t('reports.totals')}</p>
                  </div>
                  <div className="col-span-3 hidden md:block" />
                  <div className="col-span-2 text-center">
                    <span className="text-xs font-bold text-primary-navy">{totalNights}</span>
                  </div>
                  <div className="col-span-3 text-end">
                    <span className="font-bold text-secondary-gold font-headline">
                      {totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-primary-navy/40 ms-1">{t('common.omr')}</span>
                  </div>
                </div>
              </div>
            </motion.section>
          )}
        </>
      )}
    </div>
  );
};
