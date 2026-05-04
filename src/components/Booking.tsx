import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, ShieldCheck, AlertCircle, ArrowLeft, Upload, CreditCard, Building2, Check, FileText, X, Download } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { propertiesApi, bookingsApi } from '../services/api';
import { downloadTermsPDF } from '../services/pdf';
import { uploadToCloudinary } from '../services/cloudinary';
import { sendWhatsAppInvoice } from './Invoices';
import { collection, query, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { calculateTotalPrice, formatBreakdown, migratePricing, formatTime, getSlotRateForDay, formatLocalDate, parseLocalDate, getDayUseTimes, getNightStayTimes, type PricingSettings, type PriceBreakdown, type DayUseSlot } from '../services/pricingUtils';
import type { Property } from '../types';
import { useTranslation } from 'react-i18next';
import { bl } from '../utils/bilingual';
import { getClientConfig } from '../config/clientConfig';

export const Booking: React.FC = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const features = getClientConfig().features;
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [selectedDates, setSelectedDates] = useState<{ start: number | null; end: number | null }>({ start: null, end: null });
  // Stay type — explicit guest selection. 'event' is a single-day, flat-priced full-day-and-night booking.
  // Day Use and Event options can be hidden per-client via features.hasDayUse / features.hasEvent.
  const [stayType, setStayType] = useState<'day_use' | 'night_stay' | 'event'>('night_stay');
  // Thawani temporarily hidden from the public UI; bank transfer is the only guest-visible option.
  const SHOW_THAWANI = false;
  const [paymentMethod, setPaymentMethod] = useState<'thawani' | 'bank_transfer'>('bank_transfer');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptFileName, setReceiptFileName] = useState('');

  // Civil ID / Passport — uploaded eagerly to Cloudinary; submission blocked until URL is set.
  const [idFileName, setIdFileName] = useState('');
  const [idImageUrl, setIdImageUrl] = useState<string | null>(null);
  const [idUploading, setIdUploading] = useState(false);
  const [idUploadProgress, setIdUploadProgress] = useState<number | null>(null);

  // Upload progress
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  // Booked NIGHTS (fully occupied) from Firestore (real-time).
  // A night = one calendar day on which a guest is sleeping at the property.
  // For an overnight booking [check_in, check_out), only the nights in between
  // are blocked — the check_out day itself becomes a normal available day
  // (morning cleanup wraps well before the 2 PM arrival window).
  const [bookedDates, setBookedDates] = useState<Set<string>>(new Set());
  // Becomes true after the first bookings snapshot resolves so auto-select
  // waits for the authoritative list before defaulting the calendar range.
  const [bookedDatesLoaded, setBookedDatesLoaded] = useState(false);

  // Check-in / Check-out picker state. The calendar is only shown when one
  // of the two cards is active; picking a date collapses it automatically.
  const [pickerMode, setPickerMode] = useState<'check_in' | 'check_out' | null>(null);

  // Maintenance mode — blocks all bookings when admin toggles off
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  // Dynamic pricing from Firestore
  const [pricingSettings, setPricingSettings] = useState<PricingSettings | null>(null);

  // Dynamic bank details from Firestore
  const [bankDetails, setBankDetails] = useState({ bank_name: '', account_name: '', iban: '', bankPhone: '' });

  // Day-use slots
  const [dayUseSlots, setDayUseSlots] = useState<DayUseSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<DayUseSlot | null>(null);
  const [bookedSlots, setBookedSlots] = useState<Map<string, string[]>>(new Map());

  // Thawani simulation state
  const [thawaniSimulating, setThawaniSimulating] = useState(false);

  // Terms of Stay
  const [termsOfStayRaw, setTermsOfStayRaw] = useState<any>('');
  const termsOfStay = typeof termsOfStayRaw === 'string' ? termsOfStayRaw : bl(termsOfStayRaw, lang);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsNudge, setTermsNudge] = useState(false);

  useEffect(() => {
    propertiesApi.list()
      .then(properties => {
        if (properties.length > 0) setProperty(properties[0]);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Real-time listener for existing bookings to prevent double-booking.
  //
  // A date is blocked iff a guest is occupying the chalet from the 2 PM arrival
  // window onwards (i.e. it is a NIGHT someone is sleeping there). The morning
  // after an overnight stay is NOT blocked — check-out is at 10/11 AM, so the
  // 2 PM arrival slot is always free for the next guest. Each booking contributes:
  //   • bookedNights — the nights the guest sleeps at the property.
  //   • slotMap — slot-based day-use bookings that only block a single slot.
  useEffect(() => {
    const q = query(collection(db, 'bookings'), orderBy('created_at', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bookedNights = new Set<string>();
      const slotMap = new Map<string, string[]>();

      snapshot.docs.forEach(d => {
        const data = d.data();
        if (data.status === 'cancelled') return;

        const bIsDayUse = data.check_in === data.check_out;

        if (bIsDayUse && data.slot_id) {
          // Slot-based day-use: only block that slot, not the whole day
          const existing = slotMap.get(data.check_in) || [];
          existing.push(data.slot_id);
          slotMap.set(data.check_in, existing);
        } else if (bIsDayUse) {
          // Full-day day-use with no slot → block the whole day as a night
          bookedNights.add(data.check_in);
        } else {
          // Overnight stay. Nights run [check_in, check_out). The check_out
          // day itself stays available — morning cleanup finishes before the
          // next 2 PM arrival.
          const checkIn = parseLocalDate(data.check_in);
          const checkOut = parseLocalDate(data.check_out);
          const cursor = new Date(checkIn);
          while (cursor < checkOut) {
            bookedNights.add(formatLocalDate(cursor));
            cursor.setDate(cursor.getDate() + 1);
          }
        }
      });
      setBookedDates(bookedNights);
      setBookedSlots(slotMap);
      setBookedDatesLoaded(true);
    });
    return () => unsubscribe();
  }, []);

  // Real-time listener for property availability status
  useEffect(() => {
    const ref = doc(db, 'settings', 'property_status');
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setMaintenanceMode(snap.data().is_live === false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Load dynamic pricing settings + bank details
  useEffect(() => {
    getDoc(doc(db, 'settings', 'property_details'))
      .then(snap => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.pricing) {
            const migrated = migratePricing(data.pricing);
            setPricingSettings(migrated);
            if (migrated.day_use_slots?.length) setDayUseSlots(migrated.day_use_slots);
          }
          if (data.bank_name || data.account_name || data.iban) {
            setBankDetails(prev => ({
              bank_name: data.bank_name || prev.bank_name,
              account_name: data.account_name || prev.account_name,
              iban: data.iban || prev.iban,
              bankPhone: data.bankPhone || '',
            }));
          }
          if (data.termsOfStay) {
            setTermsOfStayRaw(data.termsOfStay);
          }
        }
      })
      .catch(console.error);
  }, []);

  const getDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (month: number, year: number) => new Date(year, month, 1).getDay();

  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
  const dateLocale = lang === 'ar' ? 'ar-OM' : 'en-US';
  const monthName = new Date(currentYear, currentMonth).toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Compute which slots remain bookable for a date, accounting for time overlap
  const getAvailableSlotsForDate = (dateStr: string): DayUseSlot[] => {
    const taken = bookedSlots.get(dateStr) || [];
    if (taken.length === 0) return dayUseSlots;
    return dayUseSlots.filter(slot => {
      if (taken.includes(slot.id)) return false;
      // Check time overlap: if ANY booked slot's hours overlap this slot, block it
      for (const takenId of taken) {
        const takenSlot = dayUseSlots.find(s => s.id === takenId);
        if (takenSlot && slot.start_time < takenSlot.end_time && slot.end_time > takenSlot.start_time) {
          return false;
        }
      }
      return true;
    });
  };

  const isDayBooked = (day: number): boolean => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (bookedDates.has(dateStr)) return true;
    // If slots exist, check whether any slot is still available (overlap-aware)
    if (dayUseSlots.length > 0) {
      if (getAvailableSlotsForDate(dateStr).length === 0) return true;
    }
    return false;
  };

  // Find the first available consecutive pair (D, D+1) starting from today
  // where night D is not already booked. D+1 is the check-out day and only
  // needs to clear the night-D check — a turnover on D+1 is fine. Restricted
  // to same-month pairs because the calendar selection model is scoped to
  // the active month. Shared between Night Stay and Event.
  const findNextAvailableRangePair = useCallback((): { start: Date; end: Date } | null => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);

    for (let i = 0; i < 365; i++) {
      const start = new Date(from);
      start.setDate(from.getDate() + i);
      const end = new Date(start);
      end.setDate(start.getDate() + 1);

      if (start.getMonth() !== end.getMonth()) continue;

      if (!bookedDates.has(formatLocalDate(start))) {
        return { start, end };
      }
    }
    return null;
  }, [bookedDates]);

  const applyAutoRangeSelect = useCallback((): boolean => {
    const pair = findNextAvailableRangePair();
    if (!pair) return false;
    setCurrentMonth(pair.start.getMonth());
    setCurrentYear(pair.start.getFullYear());
    setSelectedDates({ start: pair.start.getDate(), end: pair.end.getDate() });
    setErrors(prev => ({ ...prev, dates: '' }));
    return true;
  }, [findNextAvailableRangePair]);

  // One-shot auto-select on initial load (Night Stay is the default stay type)
  // so the guest never faces an empty calendar once real bookings are loaded.
  const didInitialAutoSelectRef = useRef(false);
  useEffect(() => {
    if (didInitialAutoSelectRef.current) return;
    if (stayType !== 'night_stay') return;
    if (!bookedDatesLoaded) return;
    if (selectedDates.start !== null || selectedDates.end !== null) return;
    didInitialAutoSelectRef.current = true;
    applyAutoRangeSelect();
  }, [stayType, bookedDatesLoaded, selectedDates.start, selectedDates.end, applyAutoRangeSelect]);

  // Check whether every night in [startDay, endDayExclusive - 1] of the active
  // month is free. For a new night stay check_in=S → check_out=E the nights
  // the guest will sleep are [S, E-1] so we stop one short of the check-out
  // day (which may legitimately be a turnover day).
  const nightsRangeIsClear = (startDay: number, endDayExclusive: number): boolean => {
    for (let d = startDay; d < endDayExclusive; d++) {
      const key = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (bookedDates.has(key)) return false;
    }
    return true;
  };

  const handleDayClick = (day: number) => {
    const clickedDate = new Date(currentYear, currentMonth, day);
    if (clickedDate < today) return;
    if (isDayBooked(day)) return;
    setSelectedSlot(null);

    // Day Use is always single-day. Picking auto-closes the picker.
    if (stayType === 'day_use') {
      setSelectedDates({ start: day, end: day });
      setErrors(prev => ({ ...prev, dates: '' }));
      setPickerMode(null);
      return;
    }

    // Night Stay / Event — routed by which card opened the calendar.
    if (pickerMode === 'check_out' && selectedDates.start !== null) {
      if (day <= selectedDates.start) {
        // Clicking on or before the check-in while picking check-out is
        // treated as "change my mind about check-in" — restart the flow.
        setSelectedDates({ start: day, end: null });
        setErrors(prev => ({ ...prev, dates: '' }));
        setPickerMode('check_out');
        return;
      }
      if (!nightsRangeIsClear(selectedDates.start, day)) {
        setErrors(prev => ({ ...prev, dates: t('booking.selectedRange') }));
        return;
      }
      setSelectedDates(prev => ({ ...prev, end: day }));
      setErrors(prev => ({ ...prev, dates: '' }));
      setPickerMode(null);
      return;
    }

    // pickerMode === 'check_in' (or null fallback): pick the arrival date.
    // If an end was previously set but no longer sits after the new start,
    // reset it so the guest explicitly picks a new check-out next.
    setSelectedDates(prev => {
      const keepEnd = prev.end !== null && prev.end > day && nightsRangeIsClear(day, prev.end);
      return { start: day, end: keepEnd ? prev.end : null };
    });
    setErrors(prev => ({ ...prev, dates: '' }));
    setPickerMode(null);
  };

  const isEvent = stayType === 'event';
  const isDayUse = !isEvent && selectedDates.start !== null && selectedDates.end !== null && selectedDates.start === selectedDates.end;
  const nights = selectedDates.start && selectedDates.end && selectedDates.start !== selectedDates.end
    ? selectedDates.end - selectedDates.start
    : 0;
  const securityDeposit = pricingSettings?.security_deposit ?? property?.security_deposit ?? 50;
  // Admin-managed per-night Event price. Falls back to ~2× nightly rate if the owner hasn't set one yet.
  const eventRate = pricingSettings?.event_rate
    ?? (property?.nightly_rate ? Math.round(property.nightly_rate * 2) : 300);

  // Available slots for selected day-use date (overlap-aware)
  const availableSlots = isDayUse && selectedDates.start !== null
    ? getAvailableSlotsForDate(`${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(selectedDates.start).padStart(2, '0')}`)
    : [];

  // Dynamic pricing breakdown
  const priceBreakdown: PriceBreakdown | null = (() => {
    if (selectedDates.start === null || selectedDates.end === null) return null;

    // Event — per-night flat rate; date range identical to Night Stay.
    if (isEvent) {
      if (!nights) return null;
      const perNight: PriceBreakdown['per_night'] = [];
      const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      // Iterate strictly from the check-in date for `nights` iterations using
      // local-time arithmetic, so the breakdown matches the days the guest
      // actually sleeps at the chalet (no UTC drift).
      const cursor = new Date(currentYear, currentMonth, selectedDates.start);
      for (let i = 0; i < nights; i++) {
        perNight.push({
          date: formatLocalDate(cursor),
          dayLabel: dayLabels[cursor.getDay()],
          rate: eventRate,
          isSpecial: false,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      const subtotal = eventRate * nights;
      return {
        nights,
        isDayUse: false,
        subtotal,
        discount_amount: 0,
        total: subtotal,
        per_night: perNight,
      };
    }

    if (!isDayUse && !nights) return null;
    // Wait for slot selection when slots are defined
    if (isDayUse && dayUseSlots.length > 0 && !selectedSlot) return null;
    const checkInStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(selectedDates.start).padStart(2, '0')}`;
    const checkOutStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(selectedDates.end).padStart(2, '0')}`;
    const fallbackRate = property?.nightly_rate || 120;
    const pricing: PricingSettings = pricingSettings || migratePricing({
      weekday_rate: fallbackRate,
      thursday_rate: fallbackRate,
      friday_rate: fallbackRate,
      saturday_rate: fallbackRate,
      day_use_rate: Math.round(fallbackRate * 0.6),
      special_dates: [],
    });
    return calculateTotalPrice(checkInStr, checkOutStr, pricing, selectedSlot?.id);
  })();

  const stayTotal = priceBreakdown?.total || 0;
  const depositAmount = Number(securityDeposit) || 0;
  // Deposit is collected at check-in, not upfront. Grand Total = stay only.
  const grandTotal = stayTotal;

  // Resolve Check-in / Check-out wall-clock times from the timing engine.
  // Day use pivots on the selected day; night stay / event pivot on the
  // check-out day (the day the guest actually leaves).
  const stayTimes = (() => {
    if (selectedDates.start === null) return null;
    if (isDayUse) {
      const d = new Date(currentYear, currentMonth, selectedDates.start);
      return getDayUseTimes(d, lang);
    }
    if (selectedDates.end === null) return null;
    const checkOutDate = new Date(currentYear, currentMonth, selectedDates.end);
    return getNightStayTimes(checkOutDate, lang);
  })();

  // Short "27 Apr" style labels for the two cards.
  const cardDateFormatter = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  });
  const checkInCardLabel = selectedDates.start !== null
    ? cardDateFormatter.format(new Date(currentYear, currentMonth, selectedDates.start))
    : null;
  const checkOutCardLabel = selectedDates.end !== null
    ? cardDateFormatter.format(new Date(currentYear, currentMonth, selectedDates.end))
    : null;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!guestName.trim() || guestName.trim().length < 2) {
      newErrors.name = 'Please enter your full name (at least 2 characters)';
    }

    const phoneClean = guestPhone.replace(/\s/g, '');
    if (!phoneClean) {
      newErrors.phone = 'Phone number is required';
    } else if (!/^\d{8}$/.test(phoneClean)) {
      newErrors.phone = 'Please enter a valid 8-digit Omani phone number';
    }

    if (guestEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (features.hasIdUpload && !idImageUrl) {
      newErrors.idImage = idUploading
        ? 'Please wait for the ID upload to finish'
        : 'Please upload a clear photo of your Civil ID or Passport';
    }

    if (!selectedDates.start || !selectedDates.end) {
      newErrors.dates = 'Please select check-in and check-out dates';
    }

    if (isDayUse && dayUseSlots.length > 0 && !selectedSlot) {
      newErrors.slot = 'Please select a time slot';
    }

    if (paymentMethod === 'bank_transfer' && !receiptFile) {
      newErrors.receipt = 'Please upload your bank transfer receipt';
    }

    if (termsOfStay && !termsAccepted) {
      newErrors.terms = 'Please accept the terms to proceed';
      setTermsNudge(true);
      setTimeout(() => setTermsNudge(false), 600);
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleReceiptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptFile(file);
    setReceiptFileName(file.name);
    setErrors(prev => ({ ...prev, receipt: '' }));
  };

  // Upload bank-transfer receipt via the shared Cloudinary service
  const uploadReceipt = (file: File): Promise<string> =>
    uploadToCloudinary(file, {
      folder: 'woody-chalete-receipts',
      onProgress: (pct) => setUploadProgress(pct),
    }).finally(() => setUploadProgress(null));

  const handleIdUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIdFileName(file.name);
    setIdImageUrl(null);
    setErrors(prev => ({ ...prev, idImage: '' }));
    setIdUploading(true);
    try {
      const url = await uploadToCloudinary(file, {
        folder: 'woody-chalete-ids',
        onProgress: (pct) => setIdUploadProgress(pct),
      });
      setIdImageUrl(url);
    } catch (err: any) {
      console.error('ID upload failed:', err.message);
      setErrors(prev => ({ ...prev, idImage: err.message || 'ID upload failed. Please try again.' }));
      setIdFileName('');
    } finally {
      setIdUploading(false);
      setIdUploadProgress(null);
      e.target.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!validate() || !property || selectedDates.start === null || selectedDates.end === null) return;

    setSubmitting(true);
    setSubmitError('');

    const checkIn = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(selectedDates.start).padStart(2, '0')}`;
    const checkOut = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(selectedDates.end).padStart(2, '0')}`;

    try {
      // Upload receipt to Cloudinary if bank transfer
      let receiptURL: string | undefined;
      if (paymentMethod === 'bank_transfer' && receiptFile) {
        try {
          receiptURL = await uploadReceipt(receiptFile);
        } catch (uploadErr: any) {
          console.error('Receipt upload failed:', uploadErr.message);
          setSubmitError(`Receipt upload failed: ${uploadErr.message}. Please try again.`);
          setSubmitting(false);
          return;
        }
      }

      // Thawani — simulate payment gateway for prototype demo
      if (paymentMethod === 'thawani') {
        setThawaniSimulating(true);

        // Simulate 2-second network delay (Thawani redirect)
        await new Promise(resolve => setTimeout(resolve, 2000));

        let thawaniBooking: any = null;
        let thawaniPropertyName = property.name;

        try {
          // Save booking to Firestore as paid
          const termsTimestamp = new Date().toISOString();
          const result = await bookingsApi.create({
            property_id: property.id,
            property_name: property.name,
            guest_name: guestName.trim(),
            guest_phone: `+968${guestPhone.replace(/\s/g, '')}`,
            guest_email: guestEmail || undefined,
            check_in: checkIn,
            check_out: checkOut,
            nightly_rate: priceBreakdown ? (isDayUse ? stayTotal : Math.round(stayTotal / nights)) : property.nightly_rate,
            security_deposit: depositAmount,
            stayTotal,
            depositAmount,
            grandTotal,
            payment_method: 'thawani',
            idImageUrl: idImageUrl || undefined,
            stay_type: stayType,
            ...(stayTimes ? {
              check_in_time: stayTimes.checkInTime,
              check_out_time: stayTimes.checkOutTime,
            } : {}),
            ...(selectedSlot ? {
              slot_id: selectedSlot.id,
              slot_name: selectedSlot.name,
              slot_name_ar: selectedSlot.name_ar || '',
              slot_start_time: selectedSlot.start_time,
              slot_end_time: selectedSlot.end_time,
            } : {}),
            ...(termsAccepted ? { termsAccepted: true, termsAcceptedAt: termsTimestamp } : {}),
          });

          thawaniBooking = result.booking;
          thawaniPropertyName = result.property_name;

          sendWhatsAppInvoice({
            guest_name: guestName.trim(),
            guest_phone: `+968${guestPhone.replace(/\s/g, '')}`,
            id: result.booking.id,
          });
        } catch (saveErr: any) {
          console.error('Thawani booking save error (continuing to confirmation):', saveErr.message);
          // Build a fallback booking object so the confirmation page still renders
          thawaniBooking = {
            id: `demo-${Date.now()}`,
            guest_name: guestName.trim(),
            guest_phone: `+968${guestPhone.replace(/\s/g, '')}`,
            check_in: checkIn,
            check_out: checkOut,
            nights: isDayUse ? 0 : nights,
            nightly_rate: property.nightly_rate,
            security_deposit: depositAmount,
            stayTotal,
            depositAmount,
            grandTotal,
            total_amount: grandTotal,
            payment_method: 'thawani',
            status: 'confirmed',
            payment_status: 'paid',
            created_at: new Date().toISOString(),
          };
        }

        setThawaniSimulating(false);

        // Always navigate — demo must never crash
        navigate('/confirmation', {
          state: {
            booking: thawaniBooking,
            propertyName: thawaniPropertyName,
          },
        });
        return;
      }

      // Bank transfer — save booking to Firestore
      const bankTermsTimestamp = new Date().toISOString();
      const result = await bookingsApi.create({
        property_id: property.id,
        property_name: property.name,
        guest_name: guestName.trim(),
        guest_phone: `+968${guestPhone.replace(/\s/g, '')}`,
        guest_email: guestEmail || undefined,
        check_in: checkIn,
        check_out: checkOut,
        nightly_rate: priceBreakdown ? (isDayUse ? stayTotal : Math.round(stayTotal / nights)) : property.nightly_rate,
        security_deposit: depositAmount,
        stayTotal,
        depositAmount,
        grandTotal,
        payment_method: paymentMethod,
        receiptURL,
        idImageUrl: idImageUrl || undefined,
        ...(stayTimes ? {
          check_in_time: stayTimes.checkInTime,
          check_out_time: stayTimes.checkOutTime,
        } : {}),
        ...(selectedSlot ? {
          slot_id: selectedSlot.id,
          slot_name: selectedSlot.name,
          slot_name_ar: selectedSlot.name_ar || '',
          slot_start_time: selectedSlot.start_time,
          slot_end_time: selectedSlot.end_time,
        } : {}),
        ...(termsAccepted ? { termsAccepted: true, termsAcceptedAt: bankTermsTimestamp } : {}),
      });

      // Trigger WhatsApp invoice (will connect API next)
      sendWhatsAppInvoice({
        guest_name: guestName.trim(),
        guest_phone: `+968${guestPhone.replace(/\s/g, '')}`,
        id: result.booking.id,
      });

      navigate('/confirmation', {
        state: {
          booking: result.booking,
          propertyName: result.property_name,
        },
      });
    } catch (err: any) {
      console.error('Booking submission error:', err.response?.data || err.message || err);
      setSubmitError(err.message || 'Booking failed. Please try again.');
    } finally {
      setThawaniSimulating(false);
      setSubmitting(false);
    }
  };

  // Month navigation intentionally keeps the current selection. Clearing the
  // dates here would make the Check-out picker wipe the Check-in as soon as
  // the guest paged forward a month.
  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  if (loading) return <div className="p-8 animate-pulse"><div className="h-96 bg-primary-navy/5 rounded-xl" /></div>;

  return (
    <div className="px-4 py-6 sm:px-6 space-y-10 max-w-lg mx-auto">
      {/* Back Button */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-primary-navy/60 hover:text-primary-navy transition-colors text-sm font-medium"
      >
        <ArrowLeft size={18} />
        {t('login.backToHome')}
      </button>

      <section className="text-center space-y-2">
        <span className="text-secondary-gold font-bold tracking-widest text-[10px] uppercase">{t('booking.bookYourStay')}</span>
        <h2 className="font-headline text-2xl sm:text-4xl font-bold text-primary-navy">{t('booking.selectDates')}</h2>
        <p className="text-primary-navy/60 text-sm max-w-xs mx-auto">
          {t('booking.selectDatesDesc', { name: property?.name || t('common.alMalak') })}
        </p>
      </section>

      {/* Maintenance Mode Banner */}
      {maintenanceMode && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 border border-red-200 rounded-[20px] p-6 text-center space-y-2"
        >
          <div className="w-12 h-12 bg-red-100 rounded-full mx-auto flex items-center justify-center">
            <AlertCircle size={24} className="text-red-500" />
          </div>
          <h3 className="font-headline font-bold text-red-700 text-lg">{t('booking.maintenanceMode')}</h3>
          <p className="text-red-600/70 text-sm max-w-xs mx-auto">
            Our chalets are currently under maintenance. Please check back soon for availability.
          </p>
        </motion.div>
      )}

      {submitError && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 bg-red-50 text-red-600 p-4 rounded-xl text-sm font-medium"
        >
          <AlertCircle size={18} />
          {submitError}
        </motion.div>
      )}

      {/* Stay Type Selector — options filtered by client features */}
      {(() => {
        const stayTypeOptions = ([
          features.hasDayUse && { value: 'day_use' as const, label: t('booking.stayTypeDayUse'), sub: undefined },
          { value: 'night_stay' as const, label: t('booking.stayTypeNightStay'), sub: undefined },
          features.hasEvent && {
            value: 'event' as const,
            label: pricingSettings?.event_category_name?.trim() || t('booking.stayTypeEvent'),
            sub: t('booking.pricePerNight', { amount: eventRate }),
          },
        ] as const).filter(Boolean) as ReadonlyArray<{ value: 'day_use' | 'night_stay' | 'event'; label: string; sub: string | undefined }>;

        // When only one option exists (Night Stay), suppress the entire picker.
        if (stayTypeOptions.length <= 1) return null;

        return (
      <section className="space-y-3">
        <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">
          {t('booking.stayType')} *
        </label>
        <div className={cn("grid gap-3", stayTypeOptions.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
          {stayTypeOptions.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setStayType(opt.value);
                setSelectedSlot(null);
                setPickerMode(null);
                if (opt.value === 'day_use') {
                  setSelectedDates(prev => prev.start !== null ? { start: prev.start, end: prev.start } : prev);
                  return;
                }

                // Night Stay and Event share identical range semantics: auto-pick
                // the next available (D, D+1) pair when nothing (or only a leftover
                // single day from Day Use) is selected. Any existing valid range is
                // preserved so switching between the two types stays seamless.
                const hasSingleDay = selectedDates.start !== null && selectedDates.end === selectedDates.start;
                const hasNoSelection = selectedDates.start === null;

                if (hasSingleDay) {
                  setSelectedDates({ start: selectedDates.start, end: null });
                  applyAutoRangeSelect();
                } else if (hasNoSelection) {
                  applyAutoRangeSelect();
                }
              }}
              className={cn(
                "relative p-3 sm:p-4 rounded-[18px] border-2 transition-all text-center min-h-[44px] flex flex-col items-center justify-center",
                stayType === opt.value
                  ? "border-primary-navy bg-primary-navy/5"
                  : "border-primary-navy/10 bg-white hover:border-primary-navy/20"
              )}
            >
              {stayType === opt.value && (
                <div className="absolute top-2 end-2 w-4 h-4 bg-primary-navy rounded-full flex items-center justify-center">
                  <Check size={10} className="text-white" />
                </div>
              )}
              <p className="text-sm font-bold text-primary-navy">{opt.label}</p>
              {opt.sub && (
                <p className="text-[10px] text-primary-navy/50 font-medium mt-0.5">{opt.sub}</p>
              )}
            </button>
          ))}
        </div>
      </section>
        );
      })()}

      {/* Check-in / Check-out Cards */}
      <section className="space-y-3">
        <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">
          {t('booking.datesHeading')} *
        </label>
        <div className="grid grid-cols-2 gap-3">
          {([
            {
              mode: 'check_in' as const,
              title: t('booking.checkInCard'),
              valueLabel: checkInCardLabel,
              timeLabel: stayTimes?.checkInLabel,
              disabled: false,
            },
            {
              mode: 'check_out' as const,
              title: isDayUse ? t('booking.checkOutCardSameDay') : t('booking.checkOutCard'),
              valueLabel: isDayUse ? checkInCardLabel : checkOutCardLabel,
              timeLabel: stayTimes?.checkOutLabel,
              // Day-use auto-mirrors check-in → no separate picker needed.
              // Night/event check-out requires a check-in first.
              disabled: isDayUse || selectedDates.start === null,
            },
          ]).map(card => {
            const active = pickerMode === card.mode;
            const hasValue = !!card.valueLabel;
            return (
              <button
                key={card.mode}
                type="button"
                disabled={card.disabled}
                onClick={() => setPickerMode(active ? null : card.mode)}
                className={cn(
                  "relative p-4 rounded-[18px] border-2 transition-all text-start min-h-[96px] flex flex-col justify-between",
                  active
                    ? "border-primary-navy bg-primary-navy/5 shadow-sm"
                    : hasValue
                      ? "border-primary-navy/20 bg-white"
                      : "border-primary-navy/10 bg-white hover:border-primary-navy/20",
                  card.disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/50">
                  {card.title}
                </p>
                <div className="space-y-1">
                  <p className={cn(
                    "font-headline text-lg font-bold leading-tight",
                    hasValue ? "text-primary-navy" : "text-primary-navy/30"
                  )}>
                    {card.valueLabel || t('booking.selectDate')}
                  </p>
                  {hasValue && card.timeLabel && (
                    <p className="text-[11px] font-bold text-secondary-gold">
                      {card.timeLabel}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        {errors.dates && <p className="text-red-500 text-xs font-medium">{errors.dates}</p>}
      </section>

      {/* Calendar — only rendered when a card is active */}
      <AnimatePresence initial={false}>
        {pickerMode !== null && (
          <motion.div
            key="calendar"
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="bg-white rounded-[24px] p-4 sm:p-6 shadow-sm border border-primary-navy/5">
              <div className="flex justify-between items-center mb-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">
                  {pickerMode === 'check_in' ? t('booking.pickCheckIn') : t('booking.pickCheckOut')}
                </p>
                <button
                  type="button"
                  onClick={() => setPickerMode(null)}
                  className="p-1.5 hover:bg-primary-navy/5 rounded-full"
                >
                  <X size={14} className="text-primary-navy/40" />
                </button>
              </div>

              <div className="flex justify-between items-center mb-6">
                <h3 className="font-headline text-lg font-bold">{monthName}</h3>
                <div className="flex gap-4">
                  <button type="button" onClick={prevMonth}><ChevronLeft size={20} className="text-primary-navy/40 hover:text-primary-navy" /></button>
                  <button type="button" onClick={nextMonth}><ChevronRight size={20} className="text-primary-navy hover:text-primary-navy/60" /></button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-y-4 text-center text-[10px] font-bold text-primary-navy/30 uppercase tracking-tighter mb-4">
                {['daysSun', 'daysMon', 'daysTue', 'daysWed', 'daysThu', 'daysFri', 'daysSat'].map(d => <div key={d}>{t(`booking.${d}`)}</div>)}
              </div>

              <div className="grid grid-cols-7 gap-y-2 text-center text-sm font-medium">
                {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateObj = new Date(currentYear, currentMonth, day);
                  const isPast = dateObj < today;
                  const isBooked = isDayBooked(day);
                  const isStart = selectedDates.start === day;
                  const isEnd = selectedDates.end === day;
                  const isSelected = isStart || isEnd;
                  const isInRange = selectedDates.start && selectedDates.end && day > selectedDates.start && day < selectedDates.end;

                  // In check-out mode: grey out any day <= check-in and any
                  // day that would create a range crossing a booked night.
                  let disabledForMode = false;
                  if (pickerMode === 'check_out' && selectedDates.start !== null) {
                    if (day <= selectedDates.start) disabledForMode = true;
                    else if (!nightsRangeIsClear(selectedDates.start, day)) disabledForMode = true;
                  }

                  const isUnavailable = isPast || isBooked || maintenanceMode || disabledForMode;

                  return (
                    <div
                      key={day}
                      onClick={() => !isUnavailable && handleDayClick(day)}
                      className={cn(
                        "py-2 rounded-lg transition-all relative",
                        isUnavailable ? "cursor-not-allowed" : "cursor-pointer hover:bg-primary-navy/5",
                        isPast && !isBooked && "text-primary-navy/20",
                        isBooked && "bg-red-50 text-red-300 line-through",
                        disabledForMode && !isBooked && !isPast && "text-primary-navy/20",
                        isSelected && !isPast && !isBooked && "bg-primary-navy text-white font-bold",
                        isInRange && !isUnavailable && "bg-primary-navy/5 text-primary-navy"
                      )}
                    >
                      {day}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="mt-4 flex items-center gap-4 justify-center">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-red-50 border border-red-200"></span>
                  <span className="text-[9px] font-bold uppercase text-primary-navy/40">{t('booking.legendBooked')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-primary-navy"></span>
                  <span className="text-[9px] font-bold uppercase text-primary-navy/40">{t('booking.legendSelected')}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Day-Use Time Slot Selection */}
      {isDayUse && dayUseSlots.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('booking.selectDayUseType')} *</label>
          <div className="space-y-2">
            {availableSlots.map(slot => {
              const dow = new Date(currentYear, currentMonth, selectedDates.start!).getDay();
              const rate = getSlotRateForDay(dow, slot);
              const isSelected = selectedSlot?.id === slot.id;
              return (
                <button
                  key={slot.id}
                  onClick={() => { setSelectedSlot(isSelected ? null : slot); setErrors(prev => ({ ...prev, slot: '' })); }}
                  className={cn(
                    "w-full p-4 rounded-[16px] border-2 transition-all text-start flex items-center justify-between",
                    isSelected
                      ? "border-primary-navy bg-primary-navy/5"
                      : "border-primary-navy/10 bg-white hover:border-primary-navy/20"
                  )}
                >
                  <div>
                    <p className="text-sm font-bold text-primary-navy">{lang === 'ar' && slot.name_ar ? slot.name_ar : slot.name}</p>
                    <p className="text-[10px] text-primary-navy/50 font-medium">{formatTime(slot.start_time, lang)} – {formatTime(slot.end_time, lang)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-secondary-gold font-headline">{rate} {t('common.omr')}</span>
                    {isSelected && (
                      <div className="w-5 h-5 bg-primary-navy rounded-full flex items-center justify-center">
                        <Check size={12} className="text-white" />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
            {availableSlots.length === 0 && (
              <p className="text-center text-sm text-primary-navy/40 py-4">{t('booking.allSlotsBooked')}</p>
            )}
          </div>
          {errors.slot && <p className="text-red-500 text-xs font-medium">{errors.slot}</p>}
        </motion.section>
      )}

      {/* Pricing Summary */}
      {priceBreakdown && (isDayUse || nights > 0) && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface-container-low p-4 sm:p-6 rounded-[24px] space-y-4"
        >
          <div className="flex justify-between text-sm">
            <div>
              <span className="text-primary-navy/60 font-medium">
                {isDayUse
                  ? selectedSlot
                    ? /full\s*day/i.test(selectedSlot.name)
                      ? t('common.dayUse')           /* يوم كامل بدون مبيت */
                      : t('common.partialBooking')    /* حجز جزئي */
                    : t('common.dayUse')
                  : t('booking.stay')}
              </span>
              {selectedSlot && (
                <p className="text-[10px] text-primary-navy/40 font-medium">
                  {lang === 'ar' && selectedSlot.name_ar ? selectedSlot.name_ar : selectedSlot.name}
                  {' · '}
                  {formatTime(selectedSlot.start_time, lang)} – {formatTime(selectedSlot.end_time, lang)}
                </p>
              )}
            </div>
            <span className="font-bold text-primary-navy text-xs">
              {(() => {
                const bd = { ...priceBreakdown };
                const slotNameEn = bd.slotName; // keep English name for full-day detection
                if (bd.slotName && lang === 'ar' && bd.slotNameAr) bd.slotName = bd.slotNameAr;
                return formatBreakdown(bd, lang, t, slotNameEn);
              })()}
            </span>
          </div>

          {/* Per-night breakdown */}
          <div className="space-y-1.5 border-t border-primary-navy/5 pt-3">
            {priceBreakdown.per_night.map(n => (
              <div key={n.date} className="flex justify-between text-xs">
                <span className="text-primary-navy/50">
                  {parseLocalDate(n.date).toLocaleDateString(lang === 'ar' ? 'ar-OM' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                  {n.isSpecial && <span className="ms-1 text-secondary-gold font-bold">({t('booking.special')})</span>}
                </span>
                <span className="font-bold text-primary-navy">{n.rate} {t('common.omr')}</span>
              </div>
            ))}
          </div>

          {priceBreakdown.discount_amount > 0 && (
            <div className="flex justify-between text-sm text-emerald-600">
              <span className="font-medium">{t('booking.discount')}</span>
              <span className="font-bold">-{priceBreakdown.discount_amount} {t('common.omr')}</span>
            </div>
          )}

          <div className="pt-3 border-t border-primary-navy/5 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-primary-navy/60 font-medium">{t('confirmation.stayTotal')}</span>
              <span className="font-bold text-primary-navy">{stayTotal} {t('common.omr')}</span>
            </div>
            {depositAmount > 0 && (
              <div className="flex justify-between items-start text-sm">
                <div>
                  <span className="text-primary-navy/60 font-medium">{t('booking.securityDeposit')}</span>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-primary-navy/40 mt-0.5">{t('booking.dueOnArrival')}</p>
                </div>
                <span className="font-bold text-primary-navy/40">{depositAmount} {t('common.omr')}</span>
              </div>
            )}
          </div>

          {/* Check-in / Check-out times — dynamic per stay type & weekday */}
          {stayTimes && (
            <div className="rounded-[16px] border border-secondary-gold/30 bg-secondary-gold/5 p-4 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold text-center">
                {stayTimes.isOvernight ? t('booking.stayTimingNight') : t('booking.stayTimingDay')}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-primary-navy/50">
                    {t('booking.checkInCard')}
                  </p>
                  <p className="font-headline text-base font-bold text-primary-navy mt-1">
                    {stayTimes.checkInLabel}
                  </p>
                </div>
                <div className="text-center border-s border-primary-navy/10">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-primary-navy/50">
                    {t('booking.checkOutCard')}
                    {stayTimes.isOvernight && (
                      <span className="ms-1 text-primary-navy/30 normal-case tracking-normal">
                        ({t('booking.nextDay')})
                      </span>
                    )}
                  </p>
                  <p className="font-headline text-base font-bold text-primary-navy mt-1">
                    {stayTimes.checkOutLabel}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-primary-navy/5 flex justify-between items-end gap-2">
            <p className="text-lg sm:text-xl font-bold font-headline">{t('booking.grandTotal')}</p>
            <div className="text-end shrink-0">
              <p className="text-xl sm:text-2xl font-bold text-secondary-gold font-headline">{grandTotal} {t('common.omr')}</p>
            </div>
          </div>
        </motion.section>
      )}

      {/* Form */}
      <section className="space-y-6">
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('booking.fullName')} *</label>
          <input
            type="text"
            value={guestName}
            onChange={(e) => { setGuestName(e.target.value); setErrors(prev => ({ ...prev, name: '' })); }}
            placeholder={t('booking.placeholderName')}
            className={cn(
              "w-full bg-surface-container-low border rounded-xl py-4 px-6 focus:ring-1 focus:ring-secondary-gold/50 placeholder:text-primary-navy/20 text-sm",
              errors.name ? "border-red-300" : "border-transparent"
            )}
          />
          {errors.name && <p className="text-red-500 text-xs font-medium">{errors.name}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('booking.phone')} *</label>
          <div className="flex gap-3">
            <div className="bg-surface-container-low rounded-xl py-4 px-4 text-sm font-bold text-primary-navy/60">+968</div>
            <input
              type="text"
              value={guestPhone}
              onChange={(e) => {
                const val = e.target.value.replace(/[^\d\s]/g, '');
                setGuestPhone(val);
                setErrors(prev => ({ ...prev, phone: '' }));
              }}
              placeholder="9000 0000"
              maxLength={9}
              className={cn(
                "flex-1 bg-surface-container-low border rounded-xl py-4 px-6 focus:ring-1 focus:ring-secondary-gold/50 placeholder:text-primary-navy/20 text-sm",
                errors.phone ? "border-red-300" : "border-transparent"
              )}
            />
          </div>
          {errors.phone && <p className="text-red-500 text-xs font-medium">{errors.phone}</p>}
        </div>

        {features.hasIdUpload && (
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">
            {t('booking.civilIdPassport')} *
          </label>
          <label
            className={cn(
              "flex items-center justify-between gap-3 bg-surface-container-low border rounded-xl py-4 px-5 cursor-pointer transition-all hover:bg-surface-container-low/70",
              errors.idImage ? "border-red-300" : idImageUrl ? "border-emerald-300" : "border-transparent"
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              {idImageUrl ? (
                <Check size={18} className="text-emerald-600 flex-none" />
              ) : (
                <FileText size={18} className="text-primary-navy/40 flex-none" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold text-primary-navy truncate">
                  {idFileName || t('booking.uploadCivilIdPassport')}
                </p>
                <p className="text-[10px] text-primary-navy/50 font-medium">
                  {idUploading
                    ? `Uploading... ${idUploadProgress ?? 0}%`
                    : idImageUrl
                      ? 'Uploaded successfully'
                      : t('booking.idRequiredHint')}
                </p>
              </div>
            </div>
            {idUploading ? (
              <div className="w-5 h-5 border-2 border-primary-navy/20 border-t-secondary-gold rounded-full animate-spin flex-none" />
            ) : (
              <Upload size={18} className="text-primary-navy/40 flex-none" />
            )}
            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={handleIdUpload}
              disabled={idUploading}
            />
          </label>
          {errors.idImage && <p className="text-red-500 text-xs font-medium">{errors.idImage}</p>}
        </div>
        )}

        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('booking.emailOptional')}</label>
          <input
            type="email"
            value={guestEmail}
            onChange={(e) => { setGuestEmail(e.target.value); setErrors(prev => ({ ...prev, email: '' })); }}
            placeholder="you@example.com"
            className={cn(
              "w-full bg-surface-container-low border rounded-xl py-4 px-6 focus:ring-1 focus:ring-secondary-gold/50 placeholder:text-primary-navy/20 text-sm",
              errors.email ? "border-red-300" : "border-transparent"
            )}
          />
          {errors.email && <p className="text-red-500 text-xs font-medium">{errors.email}</p>}
        </div>
      </section>

      {/* Payment Method Selection */}
      {(isDayUse || nights > 0) && (
        <section className="space-y-4">
          <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('booking.paymentMethod')} *</label>
          <div className={cn("grid gap-3", SHOW_THAWANI ? "grid-cols-2" : "grid-cols-1")}>
            {SHOW_THAWANI && (
              <button
                type="button"
                onClick={() => setPaymentMethod('thawani')}
                className={cn(
                  "relative p-5 rounded-[20px] border-2 transition-all text-start space-y-2",
                  paymentMethod === 'thawani'
                    ? "border-primary-navy bg-primary-navy/5"
                    : "border-primary-navy/10 bg-white hover:border-primary-navy/20"
                )}
              >
                {paymentMethod === 'thawani' && (
                  <div className="absolute top-3 end-3 w-5 h-5 bg-primary-navy rounded-full flex items-center justify-center">
                    <Check size={12} className="text-white" />
                  </div>
                )}
                <CreditCard size={22} className={paymentMethod === 'thawani' ? "text-primary-navy" : "text-primary-navy/40"} />
                <p className="text-sm font-bold text-primary-navy">{t('booking.thawani')}</p>
                <p className="text-[10px] text-primary-navy/50 font-medium">Instant online payment</p>
              </button>
            )}

            <button
              type="button"
              onClick={() => setPaymentMethod('bank_transfer')}
              className={cn(
                "relative p-5 rounded-[20px] border-2 transition-all text-start space-y-2",
                paymentMethod === 'bank_transfer'
                  ? "border-primary-navy bg-primary-navy/5"
                  : "border-primary-navy/10 bg-white hover:border-primary-navy/20"
              )}
            >
              {paymentMethod === 'bank_transfer' && (
                <div className="absolute top-3 end-3 w-5 h-5 bg-primary-navy rounded-full flex items-center justify-center">
                  <Check size={12} className="text-white" />
                </div>
              )}
              <Building2 size={22} className={paymentMethod === 'bank_transfer' ? "text-primary-navy" : "text-primary-navy/40"} />
              <p className="text-sm font-bold text-primary-navy">{t('booking.bankTransfer')}</p>
              <p className="text-[10px] text-primary-navy/50 font-medium">{t('booking.uploadReceiptForApproval')}</p>
            </button>
          </div>

          {/* Bank Transfer Details & Receipt Upload */}
          {paymentMethod === 'bank_transfer' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-4"
            >
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                <p className="text-xs font-bold text-amber-800">{t('booking.bankTransferDetails')}</p>
                <div className="text-xs text-amber-700 space-y-1">
                  <p><span className="font-bold">{t('booking.bankLabel')}</span> {bankDetails.bank_name}</p>
                  <p><span className="font-bold">{t('booking.accountLabel')}</span> {bankDetails.account_name}</p>
                  <p><span className="font-bold">{t('booking.ibanLabel')}</span> {bankDetails.iban}</p>
                  {bankDetails.bankPhone.trim() && (
                    <p><span className="font-bold">{t('booking.mobileTransferLabel')}</span> {bankDetails.bankPhone}</p>
                  )}
                  <p><span className="font-bold">{t('booking.referenceLabel')}</span> {t('booking.referencePhoneNumber')}</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-secondary-gold">{t('booking.uploadReceipt')} *</label>
                <label
                  className={cn(
                    "flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-all",
                    receiptFile
                      ? "border-emerald-300 bg-emerald-50"
                      : errors.receipt ? "border-red-300 bg-red-50/50" : "border-primary-navy/20 bg-surface-container-low hover:border-primary-navy/40"
                  )}
                >
                  {receiptFile ? (
                    <div className="text-center space-y-1">
                      <Check size={24} className="mx-auto text-emerald-600" />
                      <p className="text-xs font-bold text-emerald-700">{t('booking.receiptUploaded')}</p>
                      <p className="text-[10px] text-emerald-600">{receiptFileName}</p>
                    </div>
                  ) : (
                    <div className="text-center space-y-1">
                      <Upload size={24} className="mx-auto text-primary-navy/30" />
                      <p className="text-xs font-bold text-primary-navy/50">Tap to upload receipt</p>
                      <p className="text-[10px] text-primary-navy/30">JPG, PNG or PDF</p>
                    </div>
                  )}
                  <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleReceiptUpload} />
                </label>
                {errors.receipt && <p className="text-red-500 text-xs font-medium">{errors.receipt}</p>}
              </div>
            </motion.div>
          )}
        </section>
      )}

      <div className="space-y-4 pt-4">
        {/* Terms of Stay Checkbox */}
        {termsOfStay && (isDayUse || nights > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={termsNudge ? { opacity: 1, y: 0, x: [0, -6, 6, -4, 4, 0] } : { opacity: 1, y: 0 }}
            transition={termsNudge ? { duration: 0.4 } : undefined}
            className={cn(
              "rounded-[16px] p-4 transition-colors",
              errors.terms ? "bg-red-50 border border-red-200" : "bg-surface-container-low border border-primary-navy/5"
            )}
          >
            <label className="flex items-start gap-3 cursor-pointer">
              <div className="relative mt-0.5 flex-shrink-0">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => { setTermsAccepted(e.target.checked); setErrors(prev => ({ ...prev, terms: '' })); }}
                  className="sr-only"
                />
                <div className={cn(
                  "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                  termsAccepted ? "bg-primary-navy border-primary-navy" : errors.terms ? "border-red-300 bg-red-50" : "border-primary-navy/20 bg-white"
                )}>
                  {termsAccepted && <Check size={12} className="text-white" />}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-primary-navy leading-relaxed">
                  {t('booking.iAcceptTerms').split(t('booking.termsOfStay'))[0]}
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setShowTermsModal(true); }}
                    className="text-secondary-gold font-bold underline underline-offset-2 hover:text-secondary-gold/80 transition-colors"
                  >
                    {t('booking.termsOfStay')}
                  </button>
                </p>
                {errors.terms && (
                  <p className="text-red-500 text-[10px] font-bold">{errors.terms}</p>
                )}
              </div>
            </label>
          </motion.div>
        )}

        {/* Upload Progress Bar */}
        {uploadProgress !== null && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
          >
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary-navy/60">Uploading Receipt</span>
              <span className="text-xs font-bold text-secondary-gold">{uploadProgress}%</span>
            </div>
            <div className="w-full h-2 bg-primary-navy/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-secondary-gold rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${uploadProgress}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            </div>
          </motion.div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting || (features.hasIdUpload && (idUploading || !idImageUrl)) || (!isDayUse && nights === 0) || maintenanceMode || (!!termsOfStay && !termsAccepted)}
          className="w-full bg-primary-navy text-white py-5 rounded-[20px] font-bold text-sm uppercase tracking-widest shadow-xl shadow-primary-navy/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {submitting ? (
            thawaniSimulating ? (
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span className="text-xs normal-case tracking-normal font-medium">Redirecting to Thawani Secure Payment...</span>
              </div>
            ) : uploadProgress !== null ? (
              <span className="text-xs">Uploading Receipt...</span>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span className="text-xs normal-case tracking-normal font-medium">{t('booking.processing')}</span>
              </div>
            )
          ) : paymentMethod === 'bank_transfer' ? (
            <>
              {t('booking.submitBooking')}
              <span className="text-[10px] opacity-40 lowercase font-normal">({t('booking.pendingApproval')})</span>
            </>
          ) : (
            <>
              {t('booking.payWithThawani')}
              <span className="text-[10px] opacity-40 lowercase font-normal">({grandTotal} {t('common.omr')})</span>
            </>
          )}
        </button>
        {depositAmount > 0 && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-secondary-gold/30 bg-secondary-gold/5 px-4 py-2.5">
            <AlertCircle size={14} className="text-secondary-gold flex-shrink-0" />
            <p className="text-xs font-medium text-primary-navy text-center leading-snug">
              {t('booking.depositOnArrival', { amount: depositAmount })}
            </p>
          </div>
        )}
        <div className="flex items-center justify-center gap-2 text-primary-navy/30">
          <ShieldCheck size={14} />
          <p className="text-[9px] font-bold text-center uppercase tracking-wider max-w-[200px]">
            {paymentMethod === 'bank_transfer'
              ? t('booking.bookingConfirmedOnApproval')
              : 'Your transaction is encrypted and secured by Thawani Gateway'}
          </p>
        </div>
      </div>

      {/* Terms of Stay Modal */}
      <AnimatePresence>
        {showTermsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setShowTermsModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full sm:max-w-lg sm:rounded-[24px] rounded-t-[24px] overflow-hidden shadow-2xl max-h-[85vh] flex flex-col"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-5 border-b border-primary-navy/5 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-navy flex items-center justify-center rounded-lg">
                    <FileText className="text-secondary-gold" size={20} />
                  </div>
                  <div>
                    <p className="font-headline text-sm font-bold text-primary-navy">{t('booking.termsOfStay')}</p>
                    <p className="text-[10px] text-primary-navy/40 uppercase tracking-widest font-bold">Woody Chalete</p>
                  </div>
                </div>
                <button onClick={() => setShowTermsModal(false)} className="p-2 hover:bg-primary-navy/5 rounded-full transition-colors">
                  <X size={18} className="text-primary-navy/40" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto flex-1">
                <div className="text-sm text-primary-navy/80 leading-relaxed whitespace-pre-wrap font-medium">
                  {termsOfStay}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-5 border-t border-primary-navy/5 flex-shrink-0 space-y-2.5">
                <button
                  onClick={() => {
                    setTermsAccepted(true);
                    setErrors(prev => ({ ...prev, terms: '' }));
                    setShowTermsModal(false);
                  }}
                  className="w-full bg-primary-navy text-white py-4 rounded-[16px] font-bold text-xs uppercase tracking-widest active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <Check size={16} />
                  {t('booking.iAccept')}
                </button>
                <button
                  onClick={async () => downloadTermsPDF(termsOfStay, lang)}
                  className="w-full border-2 border-primary-navy/10 text-primary-navy/60 py-3.5 rounded-[16px] font-bold text-[10px] uppercase tracking-widest active:scale-[0.98] transition-all flex items-center justify-center gap-2 hover:border-primary-navy/20 hover:text-primary-navy"
                >
                  <Download size={14} />
                  {t('booking.downloadTerms')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
