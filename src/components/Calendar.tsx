import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, BarChart3, ChevronRight as ChevronRightIcon, ArrowUpRight, TrendingUp, TrendingDown, X } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useTranslation } from 'react-i18next';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { formatTime } from '../services/pricingUtils';

interface RealtimeBooking {
  id: string;
  property_id: string;
  property_name: string;
  guest_name: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  nights: number;
  total_amount: number;
  grandTotal?: number;
  status: string;
  payment_status: string;
  created_at: string;
  slot_name?: string;
  slot_start_time?: string;
  slot_end_time?: string;
}

interface CompareModalProps {
  show: boolean;
  onClose: () => void;
  monthName: string;
  currentMonthBookings: RealtimeBooking[];
  prevMonthBookings: RealtimeBooking[];
  occupancyPct: number;
  prevOccupancyPct: number;
  currentRevenue: number;
  prevRevenue: number;
  bookingGrowth: number;
  revenueGrowth: number;
  t: (key: string) => string;
}

const CompareModal = React.memo<CompareModalProps>(({
  show, onClose, monthName,
  currentMonthBookings, prevMonthBookings,
  occupancyPct, prevOccupancyPct,
  currentRevenue, prevRevenue,
  bookingGrowth, revenueGrowth, t,
}) => {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-[24px] w-full max-w-md shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-primary-navy/5 flex justify-between items-center">
          <div>
            <h3 className="font-headline text-lg font-bold text-primary-navy">{t('calendar.monthlyComparison')}</h3>
            <p className="text-xs text-primary-navy/50 font-medium">{t('calendar.currentVsPrevious')}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-primary-navy/5 rounded-full">
            <X size={18} className="text-primary-navy/40" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="text-center space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('calendar.currentMonth')}</p>
            <p className="font-headline text-lg font-bold text-primary-navy">{monthName}</p>
          </div>

          <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/50">{t('calendar.totalBookings')}</span>
              <div className="flex items-center gap-1">
                {bookingGrowth !== 0 && (
                  <span className={cn("flex items-center gap-0.5 text-[10px] font-bold", bookingGrowth > 0 ? "text-emerald-600" : "text-red-500")}>
                    {bookingGrowth > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                    {bookingGrowth > 0 ? '+' : ''}{bookingGrowth}%
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-lg p-3 text-center border border-primary-navy/5">
                <p className="font-headline text-2xl font-bold text-primary-navy">{currentMonthBookings.length}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-primary-navy/40 mt-1">{t('calendar.thisMonth')}</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-center border border-primary-navy/5">
                <p className="font-headline text-2xl font-bold text-primary-navy/50">{prevMonthBookings.length}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-primary-navy/40 mt-1">{t('calendar.lastMonth')}</p>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/50">{t('calendar.occupancy')}</span>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-baseline gap-1">
                  <span className="font-headline text-xl font-bold text-secondary-gold">{occupancyPct}%</span>
                </div>
                <div className="h-2 bg-primary-navy/10 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${occupancyPct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} className="h-full bg-secondary-gold rounded-full" />
                </div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-primary-navy/40">{t('calendar.thisMonth')}</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-baseline gap-1">
                  <span className="font-headline text-xl font-bold text-primary-navy/40">{prevOccupancyPct}%</span>
                </div>
                <div className="h-2 bg-primary-navy/10 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${prevOccupancyPct}%` }} transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }} className="h-full bg-primary-navy/30 rounded-full" />
                </div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-primary-navy/40">{t('calendar.lastMonth')}</p>
              </div>
            </div>
          </div>

          <div className="bg-primary-navy rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">{t('calendar.revenue')}</span>
              {revenueGrowth !== 0 && (
                <span className={cn("flex items-center gap-0.5 text-[10px] font-bold", revenueGrowth > 0 ? "text-emerald-400" : "text-red-400")}>
                  {revenueGrowth > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {revenueGrowth > 0 ? '+' : ''}{revenueGrowth}% {t('calendar.fromLastMonth')}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="font-headline text-xl font-bold text-secondary-gold">{currentRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-white/40 mt-1">{t('calendar.thisMonth')} (OMR)</p>
              </div>
              <div>
                <p className="font-headline text-xl font-bold text-white/40">{prevRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-white/40 mt-1">{t('calendar.lastMonth')} (OMR)</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
});
CompareModal.displayName = 'CompareModal';

export const Calendar: React.FC = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [bookings, setBookings] = useState<RealtimeBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompare, setShowCompare] = useState(false);

  // Calendar navigation
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  const getDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (month: number, year: number) => new Date(year, month, 1).getDay();

  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
  const monthName = new Date(currentYear, currentMonth).toLocaleDateString(lang === 'ar' ? 'ar-OM' : 'en-US', { month: 'long', year: 'numeric' });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDay = today.getMonth() === currentMonth && today.getFullYear() === currentYear ? today.getDate() : -1;

  // Real-time listener on bookings
  useEffect(() => {
    const q = query(collection(db, 'bookings'), orderBy('created_at', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RealtimeBooking));
      setBookings(data);
      setLoading(false);
    }, (error) => {
      console.error('Bookings listener error:', error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Derive recent transactions from bookings: only paid, non-cancelled, latest 4
  const recentTransactions = useMemo(() =>
    bookings
      .filter(b => b.status !== 'cancelled' && b.payment_status === 'paid')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 4)
      .map(b => ({
        id: b.id,
        type: 'payment' as const,
        description: `Booking Payment – ${b.property_name}`,
        amount: Number(b.grandTotal) || Number(b.total_amount) || 0,
        date: b.created_at ? b.created_at.split('T')[0] : '',
      })),
    [bookings]
  );

  // Build a map of day -> booking info for current month
  const getBookedDayMap = (): Map<number, { status: 'pending' | 'confirmed'; isDayUse: boolean; bookings: RealtimeBooking[] }> => {
    const dayMap = new Map<number, { status: 'pending' | 'confirmed'; isDayUse: boolean; bookings: RealtimeBooking[] }>();

    for (const b of bookings) {
      if (b.status === 'cancelled') continue;

      const checkIn = new Date(b.check_in);
      const checkOut = new Date(b.check_out);
      const bIsDayUse = b.check_in === b.check_out;

      const monthStart = new Date(currentYear, currentMonth, 1);
      const monthEnd = new Date(currentYear, currentMonth + 1, 0);

      if (checkOut < monthStart || checkIn > monthEnd) continue;

      const startDay = checkIn.getMonth() === currentMonth && checkIn.getFullYear() === currentYear
        ? checkIn.getDate() : 1;
      const endDay = checkOut.getMonth() === currentMonth && checkOut.getFullYear() === currentYear
        ? checkOut.getDate() : daysInMonth;

      for (let d = startDay; d <= endDay; d++) {
        const existing = dayMap.get(d);
        const statusVal = (b.status === 'confirmed' || b.status === 'checked-in') ? 'confirmed' as const : 'pending' as const;

        if (existing) {
          existing.bookings.push(b);
          if (statusVal === 'confirmed') existing.status = 'confirmed';
          // If any booking on this day is NOT day-use, mark as full
          if (!bIsDayUse) existing.isDayUse = false;
        } else {
          dayMap.set(d, { status: statusVal, isDayUse: bIsDayUse, bookings: [b] });
        }
      }
    }
    return dayMap;
  };

  const bookedDayMap = getBookedDayMap();

  // Helper: get non-cancelled bookings that overlap a given month
  const getMonthBookings = (month: number, year: number) => {
    const mDays = getDaysInMonth(month, year);
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month, mDays, 23, 59, 59);
    return bookings.filter(b => {
      if (b.status === 'cancelled') return false;
      const ci = new Date(b.check_in);
      const co = new Date(b.check_out);
      return co >= monthStart && ci <= monthEnd;
    });
  };

  // Current month stats
  const currentMonthBookings = useMemo(() => getMonthBookings(currentMonth, currentYear), [bookings, currentMonth, currentYear]);
  const occupiedDays = bookedDayMap.size;
  const occupancyPct = daysInMonth > 0 ? Math.round((occupiedDays / daysInMonth) * 100) : 0;

  // Previous month stats (for compare)
  const prevMonthIdx = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYearIdx = currentMonth === 0 ? currentYear - 1 : currentYear;
  const prevMonthBookings = useMemo(() => getMonthBookings(prevMonthIdx, prevYearIdx), [bookings, prevMonthIdx, prevYearIdx]);
  const prevDaysInMonth = getDaysInMonth(prevMonthIdx, prevYearIdx);

  // Previous month occupancy: count unique occupied days
  const prevOccupiedDays = useMemo(() => {
    const daySet = new Set<number>();
    for (const b of prevMonthBookings) {
      const ci = new Date(b.check_in);
      const co = new Date(b.check_out);
      const startDay = ci.getMonth() === prevMonthIdx && ci.getFullYear() === prevYearIdx ? ci.getDate() : 1;
      const endDay = co.getMonth() === prevMonthIdx && co.getFullYear() === prevYearIdx ? co.getDate() : prevDaysInMonth;
      for (let d = startDay; d <= endDay; d++) daySet.add(d);
    }
    return daySet.size;
  }, [prevMonthBookings, prevMonthIdx, prevYearIdx, prevDaysInMonth]);
  const prevOccupancyPct = prevDaysInMonth > 0 ? Math.round((prevOccupiedDays / prevDaysInMonth) * 100) : 0;

  // Revenue: current vs previous
  const currentRevenue = currentMonthBookings.filter(b => b.payment_status === 'paid').reduce((s, b) => s + (Number(b.grandTotal) || Number(b.total_amount) || 0), 0);
  const prevRevenue = prevMonthBookings.filter(b => b.payment_status === 'paid').reduce((s, b) => s + (Number(b.grandTotal) || Number(b.total_amount) || 0), 0);

  // Growth percentages
  const bookingGrowth = prevMonthBookings.length > 0 ? Math.round(((currentMonthBookings.length - prevMonthBookings.length) / prevMonthBookings.length) * 100) : (currentMonthBookings.length > 0 ? 100 : 0);
  const revenueGrowth = prevRevenue > 0 ? Math.round(((currentRevenue - prevRevenue) / prevRevenue) * 100) : (currentRevenue > 0 ? 100 : 0);

  const confirmedCount = currentMonthBookings.filter(b => b.status === 'confirmed' || b.status === 'checked-in').length;
  const pendingCount = currentMonthBookings.filter(b => b.status === 'pending').length;
  const upcomingArrivals = bookings
    .filter(b => b.status === 'confirmed' || b.status === 'pending')
    .sort((a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime())
    .slice(0, 3);

  const closeCompare = useCallback(() => setShowCompare(false), []);

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
  };

  if (loading) return <div className="p-8 animate-pulse"><div className="h-96 bg-primary-navy/5 rounded-xl" /></div>;

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-4xl mx-auto">
      <section className="grid grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-primary-navy p-5 rounded-xl flex flex-col justify-between shadow-lg text-white h-32"
        >
          <CalendarIcon className="text-secondary-gold" size={24} />
          <div>
            <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest">{t('common.confirmed')}</p>
            <p className="font-headline text-2xl font-bold">{confirmedCount}</p>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-amber-50 p-5 rounded-xl flex flex-col justify-between shadow-sm border border-amber-200 h-32"
        >
          <CalendarIcon className="text-amber-600" size={24} />
          <div>
            <p className="text-amber-700/60 text-[10px] font-bold uppercase tracking-widest">{t('common.pending')}</p>
            <p className="text-amber-800 font-headline text-2xl font-bold">{pendingCount}</p>
          </div>
        </motion.div>
        {/* Occupancy Widget — click to compare */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={() => setShowCompare(true)}
          className="bg-white p-5 rounded-xl flex flex-col justify-between shadow-sm border border-primary-navy/5 h-32 cursor-pointer hover:border-secondary-gold/40 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between">
            <BarChart3 className="text-secondary-gold" size={24} />
            <span className="text-[8px] font-bold uppercase tracking-widest text-primary-navy/30 group-hover:text-secondary-gold transition-colors">{t('calendar.tapToCompare')}</span>
          </div>
          <div>
            <p className="text-primary-navy font-headline text-2xl font-bold">
              {currentMonthBookings.length} <span className="text-xs font-medium text-primary-navy/50">{t('calendar.bookingsLabel')}</span>
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="flex-1 h-1.5 bg-primary-navy/10 rounded-full overflow-hidden">
                <div className="h-full bg-secondary-gold rounded-full transition-all" style={{ width: `${occupancyPct}%` }} />
              </div>
              <span className="text-[10px] font-bold text-primary-navy/50">{occupancyPct}%</span>
            </div>
          </div>
        </motion.div>
      </section>

      <AnimatePresence>
        <CompareModal
          show={showCompare}
          onClose={closeCompare}
          monthName={monthName}
          currentMonthBookings={currentMonthBookings}
          prevMonthBookings={prevMonthBookings}
          occupancyPct={occupancyPct}
          prevOccupancyPct={prevOccupancyPct}
          currentRevenue={currentRevenue}
          prevRevenue={prevRevenue}
          bookingGrowth={bookingGrowth}
          revenueGrowth={revenueGrowth}
          t={t}
        />
      </AnimatePresence>

      <motion.section
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl p-6 shadow-sm border border-primary-navy/5"
      >
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="font-headline text-xl font-bold text-primary-navy">{monthName}</h2>
            <p className="text-xs text-primary-navy/40 font-medium">{currentMonthBookings.length} {t('calendar.totalBookings')}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={prevMonth} className="p-2 rounded-full hover:bg-primary-navy/5 transition-colors"><ChevronLeft size={20} /></button>
            <button onClick={nextMonth} className="p-2 rounded-full hover:bg-primary-navy/5 transition-colors"><ChevronRight size={20} /></button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-y-4 text-center">
          {['daysSun', 'daysMon', 'daysTue', 'daysWed', 'daysThu', 'daysFri', 'daysSat'].map(d => (
            <div key={d} className="text-[10px] font-bold text-primary-navy/40 uppercase tracking-tighter">{t(`booking.${d}`)}</div>
          ))}
          {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const isToday = day === todayDay;
            const entry = bookedDayMap.get(day);
            const bookingStatus = entry?.status;
            const isDayUseDay = entry?.isDayUse;
            const dayBookings = entry?.bookings || [];

            return (
              <div
                key={day}
                className={cn(
                  "relative text-sm font-medium p-1.5 rounded-lg transition-all flex flex-col items-center min-h-[3rem]",
                  isToday && !bookingStatus && "bg-primary-navy text-white font-bold",
                  bookingStatus === 'confirmed' && !isDayUseDay && "text-white font-bold",
                  bookingStatus === 'confirmed' && isDayUseDay && "font-bold",
                  bookingStatus === 'pending' && "text-primary-navy font-bold",
                  !isToday && !bookingStatus && "text-primary-navy",
                )}
                style={
                  bookingStatus === 'confirmed' && !isDayUseDay ? { backgroundColor: '#2E7D32' } :
                  bookingStatus === 'confirmed' && isDayUseDay ? { backgroundColor: '#2E7D32', backgroundImage: 'linear-gradient(135deg, #2E7D32 50%, transparent 50%)', color: '#2E7D32' } :
                  bookingStatus === 'pending' ? { backgroundColor: '#FFD700' } :
                  undefined
                }
              >
                {day}
                {isDayUseDay && (
                  <span className="absolute -top-1 -end-1 w-3.5 h-3.5 bg-secondary-gold text-primary-navy rounded-full text-[7px] font-bold flex items-center justify-center leading-none">D</span>
                )}
                {dayBookings.length > 0 && (
                  <div className="w-full mt-0.5 space-y-px overflow-hidden">
                    {dayBookings.slice(0, 2).map((b) => (
                      <p
                        key={b.id}
                        className={cn(
                          "text-[6px] leading-tight font-bold truncate text-center",
                          bookingStatus === 'confirmed' && !isDayUseDay ? "text-white/80" :
                          bookingStatus === 'pending' ? "text-primary-navy/70" :
                          "text-current opacity-70"
                        )}
                      >
                        {b.guest_name.split(' ')[0]}
                      </p>
                    ))}
                    {dayBookings.length > 2 && (
                      <p className={cn(
                        "text-[6px] leading-tight font-bold text-center",
                        bookingStatus === 'confirmed' && !isDayUseDay ? "text-white/60" : "text-primary-navy/50"
                      )}>
                        +{dayBookings.length - 2}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-6 flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: '#2E7D32' }}></span>
            <span className="text-[10px] font-bold uppercase text-primary-navy/60">{t('common.confirmed')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: '#FFD700' }}></span>
            <span className="text-[10px] font-bold uppercase text-primary-navy/60">{t('common.pending')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative w-3 h-3 rounded bg-secondary-gold"><span className="absolute -top-0.5 -end-0.5 w-2 h-2 bg-secondary-gold text-primary-navy rounded-full text-[5px] font-bold flex items-center justify-center leading-none">D</span></span>
            <span className="text-[10px] font-bold uppercase text-primary-navy/60">{t('common.dayUse')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-primary-navy"></span>
            <span className="text-[10px] font-bold uppercase text-primary-navy/60">{t('common.today')}</span>
          </div>
        </div>
      </motion.section>

      <section className="space-y-4">
        <div className="flex justify-between items-end px-1">
          <h3 className="font-headline text-lg font-bold text-primary-navy">{t('calendar.nextArrivals')}</h3>
          <button onClick={() => navigate('/admin/guests')} className="text-[10px] font-bold text-secondary-gold tracking-widest uppercase hover:underline">{t('common.viewAll')}</button>
        </div>
        <div className="space-y-3">
          {upcomingArrivals.map((arrival, i) => (
            <motion.div
              key={arrival.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white rounded-xl p-4 flex items-center justify-between group active:bg-primary-navy/5 transition-colors border border-primary-navy/5 shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div>
                  <button
                    onClick={() => navigate(`/admin/guests?id=${arrival.id}`)}
                    className="font-bold text-sm text-primary-navy hover:text-secondary-gold transition-colors text-left"
                  >
                    {arrival.guest_name}
                  </button>
                  <p className="text-xs text-primary-navy/40 font-medium">
                    {arrival.property_name} &bull; {arrival.slot_name
                      ? `${arrival.slot_name}: ${formatTime(arrival.slot_start_time!, lang)} – ${formatTime(arrival.slot_end_time!, lang)}`
                      : arrival.check_in === arrival.check_out
                        ? t('common.dayUse')
                        : `${new Date(arrival.check_in).toLocaleDateString(lang === 'ar' ? 'ar-OM' : 'en-GB', { month: 'short', day: 'numeric' })} - ${new Date(arrival.check_out).toLocaleDateString(lang === 'ar' ? 'ar-OM' : 'en-GB', { month: 'short', day: 'numeric' })}`}
                  </p>
                </div>
              </div>
              <div className="text-right flex items-center gap-2">
                <div className="flex flex-col items-end gap-1">
                  <p className="text-[10px] font-bold text-secondary-gold uppercase">
                    {new Date(arrival.check_in).toLocaleDateString(lang === 'ar' ? 'ar-OM' : 'en-GB', { month: 'short', day: 'numeric' })}
                  </p>
                  <span className={cn(
                    "text-[9px] font-bold uppercase px-2 py-0.5 rounded-full",
                    arrival.status === 'confirmed' ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                  )}>
                    {arrival.status === 'confirmed' ? t('common.confirmed') : t('common.pending')}
                  </span>
                </div>
                <ChevronRightIcon size={16} className="text-primary-navy/20" />
              </div>
            </motion.div>
          ))}
          {upcomingArrivals.length === 0 && (
            <p className="text-center text-sm text-primary-navy/40 py-8">{t('calendar.noUpcoming')}</p>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="font-headline text-lg font-bold text-primary-navy px-1">{t('calendar.recentTransactions')}</h3>
        <div className="bg-white rounded-xl overflow-hidden border border-primary-navy/5 shadow-sm">
          {recentTransactions.map((tx, i) => (
            <div key={tx.id} className={cn("p-4 flex items-center justify-between", i < recentTransactions.length - 1 && "border-b border-primary-navy/5")}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-50">
                  <ArrowUpRight className="text-emerald-500" size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold">{tx.description}</p>
                  <p className="text-[10px] text-primary-navy/40 uppercase font-bold">{tx.date} &bull; ID #{tx.id.slice(0, 4)}</p>
                </div>
              </div>
              <p className="text-sm font-bold text-emerald-500">
                +{tx.amount.toFixed(2)} OMR
              </p>
            </div>
          ))}
          {recentTransactions.length === 0 && (
            <p className="text-center text-sm text-primary-navy/40 py-8">{t('calendar.noTransactions')}</p>
          )}
        </div>
      </section>

    </div>
  );
};
