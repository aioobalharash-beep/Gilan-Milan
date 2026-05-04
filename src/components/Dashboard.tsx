import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Banknote, Bell, BellOff, Star, ChevronLeft, ChevronRight, User, X, ArrowRight, Clock, Sparkles, Pin, Trash2, MessageSquare } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { dashboardApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { collection, query, orderBy, onSnapshot, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { formatTime } from '../services/pricingUtils';
import { enableAdminPushNotifications, onForegroundPush } from '../services/pushNotifications';

interface DashboardData {
  revenue: { total: number; trend: number };
  pendingBookings: number;
  occupancy: number;
  nextCheckIn: any;
  recentBookings: any[];
  userName: string;
}

interface RealtimeBooking {
  id: string;
  property_name: string;
  guest_name: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  nights: number;
  total_amount: number;
  grandTotal?: number;
  depositAmount?: number;
  security_deposit?: number;
  status: string;
  payment_status: string;
  slot_name?: string;
  slot_start_time?: string;
  slot_end_time?: string;
}

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Real-time bookings from Firestore (same source as Calendar page)
  const [bookings, setBookings] = useState<RealtimeBooking[]>([]);

  // Chalet availability toggle (Firestore settings/property_status)
  const [chaletLive, setChaletLive] = useState(true);
  const [statusLoading, setStatusLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  // Testimonials
  const [testimonials, setTestimonials] = useState<{ id: string; guest_name: string; rating: number; text: string; stay_details: string; isPinned: boolean; created_at: string }[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Calendar widget state
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // Push notifications
  const [pushStatus, setPushStatus] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushToast, setPushToast] = useState<{ title: string; body: string } | null>(null);

  const handleEnablePush = async () => {
    if (!user) return;
    setPushBusy(true);
    setPushError(null);
    const result = await enableAdminPushNotifications(user.id || user.email || user.name || 'admin');
    setPushBusy(false);
    if (result.status === 'granted') {
      setPushStatus('granted');
    } else if (result.status === 'denied') {
      setPushStatus('denied');
      setPushError('Notifications were blocked. Enable them in your browser settings.');
    } else if (result.status === 'unsupported') {
      setPushStatus('unsupported');
      setPushError('Push notifications are not supported on this device.');
    } else if (result.status === 'error') {
      setPushError(result.error);
    }
  };

  useEffect(() => {
    let unsub: (() => void) | undefined;
    onForegroundPush((title, body) => {
      setPushToast({ title, body });
      window.setTimeout(() => setPushToast(null), 6000);
    }).then((u) => { unsub = u; });
    return () => { if (unsub) unsub(); };
  }, []);

  useEffect(() => {
    dashboardApi.get(user?.name || 'Curator')
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [user]);

  // Single source of truth: onSnapshot on 'bookings' collection
  useEffect(() => {
    const q = query(collection(db, 'bookings'), orderBy('created_at', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setBookings(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RealtimeBooking)));
    });
    return () => unsubscribe();
  }, []);

  // Real-time testimonials
  useEffect(() => {
    const q = query(collection(db, 'testimonials'), orderBy('created_at', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTestimonials(snapshot.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          guest_name: data.guest_name || '',
          rating: data.rating || 0,
          text: data.text || '',
          stay_details: data.stay_details || '',
          isPinned: data.isPinned === true,
          created_at: data.created_at || '',
        };
      }));
    });
    return () => unsubscribe();
  }, []);

  const handleToggleTestimonialPin = async (id: string, currentlyPinned: boolean) => {
    try {
      await updateDoc(doc(db, 'testimonials', id), { isPinned: !currentlyPinned });
    } catch (err) {
      console.error('Failed to toggle testimonial pin:', err);
    }
  };

  const handleDeleteTestimonial = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'testimonials', deleteTarget));
    } catch (err) {
      console.error('Failed to delete testimonial:', err);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  // Real-time listener for property status
  useEffect(() => {
    const ref = doc(db, 'settings', 'property_status');
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setChaletLive(snap.data().is_live !== false);
      } else {
        // Default to live if doc doesn't exist yet
        setChaletLive(true);
      }
      setStatusLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const toggleChaletStatus = async () => {
    setToggling(true);
    try {
      await setDoc(doc(db, 'settings', 'property_status'), {
        is_live: !chaletLive,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Failed to toggle status:', err);
    } finally {
      setToggling(false);
    }
  };

  // Calendar helpers
  const getDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (month: number, year: number) => new Date(year, month, 1).getDay();

  const daysInMonth = getDaysInMonth(calMonth, calYear);
  const firstDay = getFirstDayOfMonth(calMonth, calYear);
  const monthName = new Date(calYear, calMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDay = today.getMonth() === calMonth && today.getFullYear() === calYear ? today.getDate() : -1;

  // Same color logic as Calendar page: build day → status map
  const getBookedDayMap = (): Map<number, { status: 'pending' | 'confirmed'; isDayUse: boolean; bookings: RealtimeBooking[] }> => {
    const dayMap = new Map<number, { status: 'pending' | 'confirmed'; isDayUse: boolean; bookings: RealtimeBooking[] }>();

    for (const b of bookings) {
      if (b.status === 'cancelled') continue;

      const checkIn = new Date(b.check_in);
      const checkOut = new Date(b.check_out);
      const bIsDayUse = b.check_in === b.check_out;
      const monthStart = new Date(calYear, calMonth, 1);
      const monthEnd = new Date(calYear, calMonth + 1, 0);

      if (checkOut < monthStart || checkIn > monthEnd) continue;

      const startDay = checkIn.getMonth() === calMonth && checkIn.getFullYear() === calYear ? checkIn.getDate() : 1;
      const endDay = checkOut.getMonth() === calMonth && checkOut.getFullYear() === calYear ? checkOut.getDate() : daysInMonth;

      for (let d = startDay; d <= endDay; d++) {
        const existing = dayMap.get(d);
        const statusVal = (b.status === 'confirmed' || b.status === 'checked-in') ? 'confirmed' : 'pending';

        if (existing) {
          existing.bookings.push(b);
          if (statusVal === 'confirmed') existing.status = 'confirmed';
          if (!bIsDayUse) existing.isDayUse = false;
        } else {
          dayMap.set(d, { status: statusVal as 'pending' | 'confirmed', isDayUse: bIsDayUse, bookings: [b] });
        }
      }
    }
    return dayMap;
  };

  const bookedDayMap = getBookedDayMap();

  // Get bookings for the selected day
  const selectedDayBookings = selectedDay ? bookedDayMap.get(selectedDay)?.bookings || [] : [];

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
    else setCalMonth(calMonth - 1);
    setSelectedDay(null);
  };

  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
    else setCalMonth(calMonth + 1);
    setSelectedDay(null);
  };

  if (loading) return <DashboardSkeleton />;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
  if (!data) return null;

  const formatCurrency = (amount: number) =>
    `OMR ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  // Recompute stats from real-time bookings
  const pendingCount = bookings.filter(b => b.status === 'pending').length;

  // Live revenue: grandTotal sum of non-cancelled AND paid bookings.
  // Excludes 'free' and 'pending' payment statuses.
  const liveRevenue = bookings
    .filter(b => b.status !== 'cancelled' && b.payment_status === 'paid')
    .reduce((sum, b) => sum + (Number(b.grandTotal) || Number(b.total_amount) || 0), 0);

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-4xl mx-auto">
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-1"
      >
        <p className="text-primary-navy/60 font-medium text-sm">{t('dashboard.greeting')}, {data.userName}</p>
        <h2 className="text-3xl font-bold text-primary-navy">{t('dashboard.eveningOverview')}</h2>
      </motion.section>

      {pushStatus !== 'granted' && pushStatus !== 'unsupported' && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-primary-navy text-white rounded-2xl p-5 flex items-center gap-4 shadow-lg"
        >
          <div className="w-10 h-10 rounded-full bg-secondary-gold/20 flex items-center justify-center flex-shrink-0">
            <Bell size={18} className="text-secondary-gold" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">Get instant booking alerts</p>
            <p className="text-[11px] text-white/60 font-medium">
              {pushError ? pushError : 'Allow notifications so new bookings ping your phone even when the app is closed.'}
            </p>
          </div>
          <button
            onClick={handleEnablePush}
            disabled={pushBusy || pushStatus === 'denied'}
            className="bg-secondary-gold text-primary-navy px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 flex-shrink-0"
          >
            {pushBusy ? '…' : pushStatus === 'denied' ? 'Blocked' : 'Enable'}
          </button>
        </motion.div>
      )}

      {pushStatus === 'granted' && (
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-600">
          <Bell size={12} /> Push alerts on
        </div>
      )}

      <AnimatePresence>
        {pushToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 end-4 z-50 bg-primary-navy text-white rounded-2xl p-4 shadow-2xl max-w-xs flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-full bg-secondary-gold/20 flex items-center justify-center flex-shrink-0">
              <BellOff size={16} className="text-secondary-gold" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">{pushToast.title}</p>
              <p className="text-[11px] text-white/70 font-medium">{pushToast.body}</p>
            </div>
            <button onClick={() => setPushToast(null)} className="text-white/40 hover:text-white">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-6 rounded-2xl shadow-sm border-s-4 border-secondary-gold"
        >
          <div className="flex justify-between items-start mb-2">
            <span className="text-primary-navy/50 font-bold text-[10px] uppercase tracking-widest">{t('dashboard.totalRevenue')}</span>
            <Banknote className="text-secondary-gold" size={20} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-headline">{formatCurrency(liveRevenue)}</span>
          </div>
          <p className="text-[10px] text-primary-navy/40 mt-2 font-medium">{t('dashboard.paidBookings')}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-primary-navy p-6 rounded-2xl shadow-lg text-white"
        >
          <div className="flex justify-between items-start mb-2">
            <span className="text-white/50 font-bold text-[10px] uppercase tracking-widest">{t('dashboard.pendingBookings')}</span>
            <Star className="text-secondary-gold" size={20} fill="currentColor" />
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold font-headline">{String(pendingCount).padStart(2, '0')}</span>
            {pendingCount > 0 && (
              <span className="bg-secondary-gold/20 text-secondary-gold px-2 py-0.5 rounded text-[10px] font-bold uppercase">{t('dashboard.actionRequired')}</span>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="bg-white p-6 rounded-2xl shadow-sm border border-primary-navy/5"
        >
          <div className="flex justify-between items-start mb-3">
            <span className="text-primary-navy/50 font-bold text-[10px] uppercase tracking-widest">{t('dashboard.chaletAvailability')}</span>
            {statusLoading ? (
              <div className="w-10 h-5 bg-primary-navy/10 rounded-full animate-pulse" />
            ) : (
              <span className={cn(
                "text-[9px] font-bold uppercase px-2.5 py-1 rounded-full",
                chaletLive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
              )}>
                {chaletLive ? t('dashboard.live') : t('dashboard.maintenance')}
              </span>
            )}
          </div>
          <p className="text-xs text-primary-navy/50 font-medium mb-4">
            {chaletLive ? t('dashboard.acceptingBookings') : t('dashboard.bookingsPaused')}
          </p>
          {/* Toggle switch */}
          <button
            onClick={toggleChaletStatus}
            disabled={toggling || statusLoading}
            className="relative w-full flex items-center justify-between gap-3 group disabled:opacity-60"
          >
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/60">
              {chaletLive ? t('dashboard.online') : t('dashboard.offline')}
            </span>
            <div className={cn(
              "relative w-12 h-6 rounded-full transition-colors duration-300",
              chaletLive ? "bg-emerald-500" : "bg-red-400"
            )}>
              <motion.div
                layout
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md"
                style={{ left: chaletLive ? '26px' : '2px' }}
              />
            </div>
          </button>
        </motion.div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Real-time Calendar Widget — same onSnapshot source as Calendar page */}
        <motion.section
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white p-6 rounded-3xl shadow-sm border border-primary-navy/5"
        >
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold font-headline">{monthName}</h3>
            <div className="flex gap-2">
              <button onClick={prevMonth} className="p-1 hover:bg-primary-navy/5 rounded-full"><ChevronLeft size={20} /></button>
              <button onClick={nextMonth} className="p-1 hover:bg-primary-navy/5 rounded-full"><ChevronRight size={20} /></button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <span key={d} className="font-bold text-primary-navy/40 uppercase mb-2 text-[10px]">{d}</span>
            ))}
            {Array.from({ length: firstDay }).map((_, i) => <span key={`empty-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isToday = day === todayDay;
              const dayInfo = bookedDayMap.get(day);
              const hasBooking = !!dayInfo;
              const isDayUseDay = dayInfo?.isDayUse;
              const isSelected = selectedDay === day;
              const dayBookings = dayInfo?.bookings || [];

              return (
                <span
                  key={day}
                  onClick={() => hasBooking && setSelectedDay(isSelected ? null : day)}
                  className={cn(
                    "py-1 font-medium rounded-lg transition-all text-xs relative flex flex-col items-center min-h-[2.5rem]",
                    hasBooking ? "cursor-pointer hover:opacity-80" : "",
                    isToday && !hasBooking && "bg-primary-navy text-white font-bold",
                    !isToday && !hasBooking && "text-primary-navy/80",
                    isSelected && "ring-2 ring-primary-navy ring-offset-1",
                  )}
                  style={
                    hasBooking && dayInfo.status === 'confirmed' && !isDayUseDay ? { backgroundColor: '#2E7D32', color: '#fff' } :
                    hasBooking && dayInfo.status === 'confirmed' && isDayUseDay ? { backgroundColor: '#2E7D32', backgroundImage: 'linear-gradient(135deg, #2E7D32 50%, transparent 50%)', color: '#2E7D32' } :
                    hasBooking && dayInfo.status === 'pending' ? { backgroundColor: '#FFD700', color: '#1a1a1a' } :
                    undefined
                  }
                >
                  {day}
                  {isDayUseDay && (
                    <span className="absolute -top-1 -end-1 w-3 h-3 bg-secondary-gold text-primary-navy rounded-full text-[6px] font-bold flex items-center justify-center leading-none">D</span>
                  )}
                  {dayBookings.length > 0 && (
                    <span className="w-full mt-px overflow-hidden flex flex-col items-center">
                      {dayBookings.slice(0, 2).map((b) => (
                        <span
                          key={b.id}
                          className={cn(
                            "text-[5px] leading-tight font-bold truncate max-w-full block text-center",
                            hasBooking && dayInfo!.status === 'confirmed' && !isDayUseDay ? "text-white/80" :
                            hasBooking && dayInfo!.status === 'pending' ? "text-primary-navy/70" :
                            "opacity-70"
                          )}
                        >
                          {b.guest_name.split(' ')[0]}
                        </span>
                      ))}
                      {dayBookings.length > 2 && (
                        <span className={cn(
                          "text-[5px] leading-tight font-bold text-center",
                          hasBooking && dayInfo!.status === 'confirmed' && !isDayUseDay ? "text-white/60" : "text-primary-navy/50"
                        )}>
                          +{dayBookings.length - 2}
                        </span>
                      )}
                    </span>
                  )}
                </span>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-4 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: '#2E7D32' }}></span>
              <span className="text-[10px] font-bold uppercase text-primary-navy/60">{t('common.confirmed')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: '#FFD700' }}></span>
              <span className="text-[10px] font-bold uppercase text-primary-navy/60">{t('common.pending')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="relative w-2.5 h-2.5 rounded bg-secondary-gold"><span className="absolute -top-0.5 -end-0.5 w-2 h-2 bg-secondary-gold text-primary-navy rounded-full text-[5px] font-bold flex items-center justify-center leading-none">D</span></span>
              <span className="text-[10px] font-bold uppercase text-primary-navy/60">{t('common.dayUse')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-primary-navy"></span>
              <span className="text-[10px] font-bold uppercase text-primary-navy/60">{t('common.today')}</span>
            </div>
          </div>

          {/* Day Detail Popup — shows guest info when a date is clicked */}
          {selectedDay && selectedDayBookings.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 bg-surface-container-low rounded-xl p-4 space-y-3 border border-primary-navy/5"
            >
              <div className="flex justify-between items-center">
                <p className="text-xs font-bold text-primary-navy">
                  {selectedDay} {new Date(calYear, calMonth).toLocaleDateString('en-US', { month: 'long' })} — {selectedDayBookings.length} booking{selectedDayBookings.length > 1 ? 's' : ''}
                </p>
                <button onClick={() => setSelectedDay(null)} className="p-1 hover:bg-primary-navy/5 rounded-full">
                  <X size={14} className="text-primary-navy/40" />
                </button>
              </div>
              {selectedDayBookings.map((b) => (
                <div key={b.id} className="flex items-center gap-3 py-2 border-t border-primary-navy/5 first:border-t-0 first:pt-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-primary-navy truncate">{b.guest_name}</p>
                    <p className="text-[10px] text-primary-navy/50 font-medium">
                      {b.property_name} &bull; {b.slot_name
                        ? `${b.slot_name}: ${formatTime(b.slot_start_time!, lang)} – ${formatTime(b.slot_end_time!, lang)}`
                        : b.check_in === b.check_out ? t('common.dayUse') : `${b.nights} ${t(b.nights > 1 ? 'common.nights' : 'common.night')}`} &bull; {b.total_amount} {t('common.omr')}
                    </p>
                  </div>
                  <span className={cn(
                    "text-[9px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0",
                    (b.status === 'confirmed' || b.status === 'checked-in') ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                  )}>
                    {b.status}
                  </span>
                </div>
              ))}
            </motion.div>
          )}
        </motion.section>

        {/* Right column: Next Check-In + Recent Activity */}
        <div className="space-y-4">
          {/* Next Check-In Widget */}
          <motion.section
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
          >
            {(() => {
              const todayStr = new Date().toISOString().split('T')[0];
              const nextCheckIn = bookings
                .filter(b => b.status !== 'cancelled' && b.check_in >= todayStr)
                .sort((a, b) => a.check_in.localeCompare(b.check_in))[0];

              if (!nextCheckIn) {
                return (
                  <div className="bg-white rounded-2xl border border-primary-navy/5 p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <Clock size={16} className="text-secondary-gold" />
                      <h3 className="text-sm font-bold font-headline text-primary-navy uppercase tracking-wide">{t('dashboard.nextCheckIn')}</h3>
                    </div>
                    <div className="text-center py-6">
                      <div className="w-12 h-12 rounded-full bg-primary-navy/5 mx-auto mb-3 flex items-center justify-center">
                        <User size={20} className="text-primary-navy/30" />
                      </div>
                      <p className="text-sm text-primary-navy/40 font-medium">{t('dashboard.noUpcomingCheckIns')}</p>
                    </div>
                  </div>
                );
              }

              const arrivalDate = new Date(nextCheckIn.check_in);
              const isConfirmed = nextCheckIn.status === 'confirmed' || nextCheckIn.status === 'checked-in';

              return (
                <div className="bg-white rounded-2xl border border-primary-navy/5 p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Clock size={16} className="text-secondary-gold" />
                      <h3 className="text-sm font-bold font-headline text-primary-navy uppercase tracking-wide">{t('dashboard.nextCheckIn')}</h3>
                    </div>
                    <span className={cn(
                      "text-[9px] font-bold uppercase px-2.5 py-1 rounded-full",
                      isConfirmed ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    )}>
                      {nextCheckIn.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-primary-navy text-sm truncate">{nextCheckIn.guest_name}</p>
                      <p className="text-[11px] text-primary-navy/50 font-medium">
                        {arrivalDate.toLocaleDateString(lang === 'ar' ? 'ar-OM' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                        {' '}&bull;{' '}{nextCheckIn.property_name}
                        {nextCheckIn.slot_name && ` &bull; ${nextCheckIn.slot_name}: ${formatTime(nextCheckIn.slot_start_time!, lang)} – ${formatTime(nextCheckIn.slot_end_time!, lang)}`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-secondary-gold text-lg font-headline">
                        {arrivalDate.toLocaleDateString('en-GB', { day: 'numeric' })}
                      </p>
                      <p className="text-[9px] uppercase font-bold text-primary-navy/40 tracking-wider">
                        {arrivalDate.toLocaleDateString('en-GB', { month: 'short' })}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/admin/guests?highlight=${encodeURIComponent(nextCheckIn.guest_name)}`)}
                    className="mt-4 w-full flex items-center justify-center gap-2 bg-primary-navy text-white py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest active:scale-[0.98] transition-all"
                  >
                    {t('common.viewDetails')}
                    <ArrowRight size={12} />
                  </button>
                </div>
              );
            })()}
          </motion.section>

          {/* Recent Activity Widget */}
          <motion.section
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 }}
          >
            {(() => {
              // Most recently created booking (bookings are already sorted by created_at DESC from onSnapshot)
              const recentBooking = bookings.filter(b => b.status !== 'cancelled')[0];

              if (!recentBooking) {
                return (
                  <div className="bg-primary-navy rounded-2xl p-6 shadow-lg">
                    <div className="flex items-center gap-2 mb-4">
                      <Sparkles size={16} className="text-secondary-gold" />
                      <h3 className="text-sm font-bold font-headline text-white uppercase tracking-wide">{t('dashboard.recentActivity')}</h3>
                    </div>
                    <div className="text-center py-6">
                      <div className="w-12 h-12 rounded-full bg-white/10 mx-auto mb-3 flex items-center justify-center">
                        <Sparkles size={20} className="text-white/30" />
                      </div>
                      <p className="text-sm text-white/40 font-medium">{t('dashboard.noRecentActivity')}</p>
                    </div>
                  </div>
                );
              }

              return (
                <div className="bg-primary-navy rounded-2xl p-6 shadow-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} className="text-secondary-gold" />
                      <h3 className="text-sm font-bold font-headline text-white uppercase tracking-wide">{t('dashboard.recentActivity')}</h3>
                    </div>
                    <span className="bg-secondary-gold/20 text-secondary-gold px-2.5 py-1 rounded-full text-[9px] font-bold uppercase">New</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm truncate">{t('dashboard.newBookingFrom')} {recentBooking.guest_name}</p>
                      <p className="text-[11px] text-white/50 font-medium">
                        {recentBooking.property_name} &bull; {recentBooking.slot_name
                          ? `${recentBooking.slot_name}: ${formatTime(recentBooking.slot_start_time!, lang)} – ${formatTime(recentBooking.slot_end_time!, lang)}`
                          : recentBooking.check_in === recentBooking.check_out ? t('common.dayUse') : `${recentBooking.nights} ${t(recentBooking.nights > 1 ? 'common.nights' : 'common.night')}`}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between bg-white/5 rounded-xl px-4 py-2.5">
                    <span className="text-white/50 text-[10px] font-bold uppercase tracking-wider">{t('dashboard.amount')}</span>
                    <span className="text-secondary-gold font-bold font-headline">OMR {recentBooking.total_amount?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <button
                    onClick={() => navigate(`/admin/guests?highlight=${encodeURIComponent(recentBooking.guest_name)}`)}
                    className="mt-3 w-full flex items-center justify-center gap-2 bg-secondary-gold text-primary-navy py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest active:scale-[0.98] transition-all"
                  >
                    {t('common.viewDetails')}
                    <ArrowRight size={12} />
                  </button>
                </div>
              );
            })()}
          </motion.section>
        </div>
      </div>

      {/* Recent Testimonials */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="space-y-4"
      >
        <div className="flex justify-between items-end px-1">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-secondary-gold" />
            <h3 className="font-headline text-lg font-bold text-primary-navy">{t('dashboard.recentTestimonials')}</h3>
          </div>
          <span className="text-[10px] font-bold text-primary-navy/40 uppercase tracking-widest">
            {testimonials.length} review{testimonials.length !== 1 ? 's' : ''}
          </span>
        </div>

        {testimonials.length === 0 ? (
          <div className="bg-white rounded-2xl border border-primary-navy/5 p-8 text-center shadow-sm">
            <div className="w-12 h-12 rounded-full bg-primary-navy/5 mx-auto mb-3 flex items-center justify-center">
              <MessageSquare size={20} className="text-primary-navy/30" />
            </div>
            <p className="text-sm text-primary-navy/40 font-medium">{t('dashboard.noTestimonials')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {testimonials.map((tm) => (
              <div
                key={tm.id}
                className={cn(
                  "bg-white rounded-xl p-5 shadow-sm border transition-all",
                  tm.isPinned ? "border-secondary-gold/40 bg-secondary-gold/[0.03]" : "border-primary-navy/5"
                )}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-primary-navy">{tm.guest_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            size={11}
                            className={i < tm.rating ? "text-secondary-gold fill-secondary-gold" : "text-primary-navy/15"}
                          />
                        ))}
                      </div>
                      {tm.stay_details && (
                        <span className="text-[10px] text-primary-navy/40 font-medium">&bull; {tm.stay_details}</span>
                      )}
                    </div>
                  </div>
                  {tm.isPinned && (
                    <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-secondary-gold/10 text-secondary-gold flex-shrink-0">
                      {t('dashboard.public')}
                    </span>
                  )}
                </div>

                <p className="text-xs text-primary-navy/60 leading-relaxed mb-3 line-clamp-3">{tm.text}</p>

                <div className="flex items-center gap-2 pt-3 border-t border-primary-navy/5">
                  <button
                    onClick={() => handleToggleTestimonialPin(tm.id, tm.isPinned)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95",
                      tm.isPinned
                        ? "bg-secondary-gold/10 text-secondary-gold border border-secondary-gold/30"
                        : "bg-primary-navy/5 text-primary-navy/50 hover:text-primary-navy/70 hover:bg-primary-navy/10"
                    )}
                  >
                    <Pin size={11} className={tm.isPinned ? "fill-current" : ""} />
                    {tm.isPinned ? t('dashboard.unpin') : t('dashboard.pinToPublic')}
                  </button>
                  <button
                    onClick={() => setDeleteTarget(tm.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest text-red-400 hover:text-red-500 hover:bg-red-50 transition-all active:scale-95"
                  >
                    <Trash2 size={11} />
                    {t('dashboard.remove')}
                  </button>
                  <span className="ms-auto text-[10px] text-primary-navy/30 font-medium">
                    {new Date(tm.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.section>

      {/* Delete Testimonial Confirmation */}
      <AnimatePresence>
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[24px] w-full max-w-sm p-8 shadow-2xl text-center space-y-5"
            >
              <div className="w-14 h-14 bg-red-50 rounded-full mx-auto flex items-center justify-center">
                <Trash2 size={28} className="text-red-500" />
              </div>
              <div className="space-y-2">
                <h3 className="font-headline text-lg font-bold text-primary-navy">{t('dashboard.removeTestimonial')}</h3>
                <p className="text-sm text-primary-navy/50">
                  {t('dashboard.removeTestimonialDesc')}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 py-3 rounded-xl border border-primary-navy/20 font-bold text-xs uppercase tracking-widest text-primary-navy active:scale-[0.98] transition-all"
                >
                  {t('dashboard.keep')}
                </button>
                <button
                  onClick={handleDeleteTestimonial}
                  disabled={deleting}
                  className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold text-xs uppercase tracking-widest shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    t('dashboard.yesRemove')
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

function DashboardSkeleton() {
  return (
    <div className="p-6 md:p-8 space-y-8 max-w-4xl mx-auto animate-pulse">
      <div className="space-y-2">
        <div className="h-4 bg-primary-navy/10 rounded w-48" />
        <div className="h-8 bg-primary-navy/10 rounded w-64" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => <div key={i} className="h-32 bg-primary-navy/5 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="h-72 bg-primary-navy/5 rounded-3xl" />
        <div className="space-y-4">
          <div className="h-44 bg-primary-navy/5 rounded-2xl" />
          <div className="h-44 bg-primary-navy/10 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
