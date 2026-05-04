import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  query,
  orderBy,
  where,
} from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { db, auth } from './firebase';
import { isAdminEmail } from '../config/clientConfig';
import { notifyAdminsOfNewBooking } from './pushNotifications';

// ── Collection refs ──

const propertiesCol = () => collection(db, 'properties');
const bookingsCol = () => collection(db, 'bookings');
const guestsCol = () => collection(db, 'guests');
const transactionsCol = () => collection(db, 'transactions');
const invoicesCol = () => collection(db, 'invoices');
const invoiceItemsCol = () => collection(db, 'invoice_items');
const testimonialsCol = () => collection(db, 'testimonials');
const notificationsCol = () => collection(db, 'notifications');

// ── Seed Data ──

let seedInitialized = false;

export async function ensureSeedData() {
  if (seedInitialized) return;
  seedInitialized = true;

  // Users are managed by Firebase Auth; profile docs are created on first login
  // via firestoreUsers.login/register. We only seed non-user domain data here.
  const propertiesSnap = await getDocs(propertiesCol());
  if (propertiesSnap.size > 0) return;

  // Seed properties
  const properties = [
    { id: 'p1', name: 'Woody Chalete', type: 'Luxury Chalet', capacity: 12, area_sqm: 850, nightly_rate: 120, security_deposit: 50, description: 'Premium luxury chalet', status: 'active' },
    { id: 'p2', name: 'Al-Bustan Villa', type: 'Deluxe Villa', capacity: 8, area_sqm: 620, nightly_rate: 180, security_deposit: 75, description: 'Exclusive beachfront villa', status: 'active' },
    { id: 'p3', name: 'Royal Suite A', type: 'Royal Suite', capacity: 4, area_sqm: 320, nightly_rate: 250, security_deposit: 100, description: 'Opulent royal suite with private pool', status: 'active' },
    { id: 'p4', name: 'Coast View Chalet', type: 'Ocean Chalet', capacity: 6, area_sqm: 480, nightly_rate: 150, security_deposit: 60, description: 'Stunning ocean view chalet', status: 'active' },
  ];
  for (const p of properties) {
    const { id, ...data } = p;
    await setDoc(doc(db, 'properties', id), { ...data, created_at: new Date().toISOString() });
  }

  // Seed invoices
  const invoices = [
    { id: 'inv1', guest_name: 'Ahmed Al-Said', booking_ref: '#NK-8829', room_type: 'Deluxe Villa', subtotal: 840, vat_amount: 42, total_amount: 882, status: 'pending', vat_compliant: false, issued_date: '2024-10-20', due_date: '2024-11-20' },
    { id: 'inv2', guest_name: 'Salma bin Rashid', booking_ref: '#NK-9012', room_type: 'Ocean Suite', subtotal: 1220.50, vat_amount: 61.025, total_amount: 1281.525, status: 'pending', vat_compliant: false, issued_date: '2024-10-18', due_date: '2024-11-18' },
    { id: 'inv3', guest_name: 'Khalid Al-Harthy', booking_ref: '#NK-8801', room_type: 'Royal Suite', subtotal: 1350, vat_amount: 67.5, total_amount: 1417.5, status: 'paid', vat_compliant: true, issued_date: '2024-10-24', due_date: '2024-11-24' },
    { id: 'inv4', guest_name: 'Nasser Al-Harthy', booking_ref: '#NK-8790', room_type: 'Luxury Chalet', subtotal: 240, vat_amount: 12, total_amount: 252, status: 'paid', vat_compliant: true, issued_date: '2024-10-12', due_date: '2024-11-12' },
    { id: 'inv5', guest_name: 'Sara Williams', booking_ref: '#NK-9045', room_type: 'Ocean Chalet', subtotal: 750, vat_amount: 37.5, total_amount: 787.5, status: 'overdue', vat_compliant: false, issued_date: '2024-09-15', due_date: '2024-10-15' },
  ];
  for (const inv of invoices) {
    const { id, ...data } = inv;
    await setDoc(doc(db, 'invoices', id), { ...data, created_at: new Date().toISOString() });
  }

  // Seed invoice items for inv3
  await addDoc(invoiceItemsCol(), { invoice_id: 'inv3', description: 'Stay Charges - Royal Suite (3 Nights)', amount: 1200 });
  await addDoc(invoiceItemsCol(), { invoice_id: 'inv3', description: 'Airport Transfer Service', amount: 150 });
}

// ── Users / Auth ──

type UserRole = 'admin' | 'client';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
}

const mapAuthError = (err: any): Error => {
  const code: string = err?.code || '';
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return new Error('Invalid email or password');
  }
  if (code === 'auth/invalid-email') return new Error('Please enter a valid email address');
  if (code === 'auth/email-already-in-use') return new Error('An account with this email already exists');
  if (code === 'auth/weak-password') return new Error('Password must be at least 6 characters');
  if (code === 'auth/too-many-requests') return new Error('Too many attempts. Please try again later.');
  if (code === 'auth/network-request-failed') return new Error('Network error. Please check your connection.');
  if (code === 'auth/user-disabled') return new Error('This account has been disabled.');
  return new Error(err?.message || 'Sign in failed');
};

export const firestoreUsers = {
  async login(email: string, password: string): Promise<{ user: AppUser }> {
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const fbUser = credential.user;

      const profileRef = doc(db, 'users', fbUser.uid);
      const profileSnap = await getDoc(profileRef);

      let profile: Omit<AppUser, 'id'>;
      if (profileSnap.exists()) {
        const data = profileSnap.data();
        profile = {
          name: data.name || fbUser.displayName || email.split('@')[0],
          email: data.email || fbUser.email || email,
          role: (data.role as UserRole) || (isAdminEmail(fbUser.email) ? 'admin' : 'client'),
          phone: data.phone || fbUser.phoneNumber || '',
        };
      } else {
        profile = {
          name: fbUser.displayName || email.split('@')[0],
          email: fbUser.email || email,
          role: isAdminEmail(fbUser.email) ? 'admin' : 'client',
          phone: fbUser.phoneNumber || '',
        };
        await setDoc(profileRef, {
          ...profile,
          created_at: new Date().toISOString(),
        });
      }

      return { user: { id: fbUser.uid, ...profile } };
    } catch (err) {
      throw mapAuthError(err);
    }
  },

  async register(data: {
    name: string;
    email: string;
    password: string;
    phone?: string;
  }): Promise<{ user: AppUser }> {
    try {
      const credential = await createUserWithEmailAndPassword(auth, data.email.trim(), data.password);
      const fbUser = credential.user;

      const profile: Omit<AppUser, 'id'> = {
        name: data.name,
        email: fbUser.email || data.email,
        role: isAdminEmail(fbUser.email) ? 'admin' : 'client',
        phone: data.phone || '',
      };
      await setDoc(doc(db, 'users', fbUser.uid), {
        ...profile,
        created_at: new Date().toISOString(),
      });

      return { user: { id: fbUser.uid, ...profile } };
    } catch (err) {
      throw mapAuthError(err);
    }
  },

  async logout(): Promise<void> {
    await signOut(auth);
  },

  async getById(id: string): Promise<AppUser | null> {
    const snap = await getDoc(doc(db, 'users', id));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      id: snap.id,
      name: data.name,
      email: data.email,
      role: (data.role as UserRole) || 'client',
      phone: data.phone,
    };
  },
};

// ── Properties ──

export const firestoreProperties = {
  async list() {
    await ensureSeedData();
    const q = query(propertiesCol(), where('status', '==', 'active'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async get(id: string) {
    const ref = doc(db, 'properties', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  },

  // ── Property details (settings/property_details) ──
  // Single-document store backing the public site and the Edit Property admin screen.
  // Accepts any long-form fields (aboutEn, aboutAr, termsOfStay, footerText, description, etc.)
  // and merges them without clobbering unrelated keys.
  async getDetails(): Promise<Record<string, any> | null> {
    const snap = await getDoc(doc(db, 'settings', 'property_details'));
    return snap.exists() ? (snap.data() as Record<string, any>) : null;
  },

  async updateProperty(patch: Record<string, any>) {
    await setDoc(doc(db, 'settings', 'property_details'), patch, { merge: true });
  },
};

// ── Bookings ──

export interface FirestoreBooking {
  id?: string;
  property_id: string;
  property_name: string;
  guest_name: string;
  guest_phone: string;
  guest_email?: string;
  check_in: string;
  check_out: string;
  nights: number;
  nightly_rate: number;
  security_deposit: number;
  total_amount: number;
  stayTotal?: number;
  depositAmount?: number;
  grandTotal?: number;
  balance_due?: number;
  deposit_paid?: boolean;
  isManual?: boolean;
  status: string;
  payment_status: string;
  payment_method: 'thawani' | 'bank_transfer' | 'walk_in';
  receipt_image?: string;
  receiptURL?: string;
  idImageUrl?: string;
  stay_type?: 'day_use' | 'night_stay' | 'event';
  slot_id?: string;
  slot_name?: string;
  slot_start_time?: string;
  slot_end_time?: string;
  check_in_time?: string;
  check_out_time?: string;
  termsAccepted?: boolean;
  termsAcceptedAt?: string;
  created_at: string;
}

export const firestoreBookings = {
  async create(data: {
    property_id: string;
    property_name: string;
    guest_name: string;
    guest_phone: string;
    guest_email?: string;
    check_in: string;
    check_out: string;
    nightly_rate: number;
    security_deposit: number;
    stayTotal?: number;
    depositAmount?: number;
    grandTotal?: number;
    payment_method: 'thawani' | 'bank_transfer' | 'walk_in';
    payment_mode?: 'paid' | 'free';
    amount_paid?: number;
    deposit_paid?: boolean;
    isManual?: boolean;
    receipt_image?: string;
    receiptURL?: string;
    idImageUrl?: string;
    stay_type?: 'day_use' | 'night_stay' | 'event';
    slot_id?: string;
    slot_name?: string;
    slot_start_time?: string;
    slot_end_time?: string;
    check_in_time?: string;
    check_out_time?: string;
    termsAccepted?: boolean;
    termsAcceptedAt?: string;
  }): Promise<FirestoreBooking> {
    const checkIn = new Date(data.check_in);
    const checkOut = new Date(data.check_out);
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

    // Use explicit pricing values from the pricing engine when available
    const stayTotal = Number(data.stayTotal) || (data.nightly_rate * nights);
    const depositAmount = Number(data.depositAmount) || Number(data.security_deposit) || 0;
    const isWalkIn = data.payment_method === 'walk_in';
    const isBankTransfer = data.payment_method === 'bank_transfer';
    const isFreeWalkIn = isWalkIn && data.payment_mode === 'free';
    const isManual = data.isManual === true;
    // Online flows always assume the security deposit has cleared alongside the
    // stay. Walk-ins can split the two — the admin records whether cash/deposit
    // was collected on the spot via `deposit_paid`. Default true so existing
    // flows are unaffected.
    const depositPaid = data.deposit_paid !== false;
    // Walk-in grandTotal: amount_paid for the stay, plus deposit only when it
    // was actually collected. Online flows keep using their explicit grandTotal.
    const walkInStayPaid = isFreeWalkIn ? 0 : Number(data.amount_paid) || 0;
    const grandTotal = isWalkIn
      ? walkInStayPaid + (depositPaid ? depositAmount : 0)
      : (Number(data.grandTotal) || (stayTotal + depositAmount));
    // Amount still owed on arrival — drives the "Deposit Due on Arrival" notice.
    const balanceDue = isWalkIn && !depositPaid ? depositAmount : 0;

    // payment_status: free → 'free', paid walk-in → 'paid', bank_transfer → 'pending',
    // thawani → 'paid'. Walk-in falls back to 'pending' if no mode set.
    let paymentStatus: string;
    if (isFreeWalkIn) paymentStatus = 'free';
    else if (isWalkIn && data.payment_mode === 'paid') paymentStatus = 'paid';
    else if (isBankTransfer) paymentStatus = 'pending';
    else if (isWalkIn) paymentStatus = 'pending';
    else paymentStatus = 'paid';

    const booking: Omit<FirestoreBooking, 'id'> = {
      property_id: data.property_id,
      property_name: data.property_name,
      guest_name: data.guest_name,
      guest_phone: data.guest_phone,
      guest_email: data.guest_email || '',
      check_in: data.check_in,
      check_out: data.check_out,
      nights,
      nightly_rate: data.nightly_rate,
      security_deposit: depositAmount,
      total_amount: grandTotal,
      stayTotal: isWalkIn ? walkInStayPaid : stayTotal,
      depositAmount,
      grandTotal,
      balance_due: balanceDue,
      deposit_paid: isWalkIn ? depositPaid : true,
      ...(isManual ? { isManual: true } : {}),
      status: isBankTransfer ? 'pending' : 'confirmed',
      payment_status: paymentStatus,
      payment_method: data.payment_method,
      receipt_image: data.receipt_image || '',
      receiptURL: data.receiptURL || '',
      idImageUrl: data.idImageUrl || '',
      ...(data.stay_type ? { stay_type: data.stay_type } : {}),
      ...(data.slot_id ? {
        slot_id: data.slot_id,
        slot_name: data.slot_name || '',
        slot_start_time: data.slot_start_time || '',
        slot_end_time: data.slot_end_time || '',
      } : {}),
      ...(data.check_in_time ? { check_in_time: data.check_in_time } : {}),
      ...(data.check_out_time ? { check_out_time: data.check_out_time } : {}),
      ...(data.termsAccepted ? {
        termsAccepted: true,
        termsAcceptedAt: data.termsAcceptedAt || new Date().toISOString(),
      } : {}),
      created_at: new Date().toISOString(),
    };

    const docRef = await addDoc(bookingsCol(), booking);

    // Also create a guest record
    await addDoc(guestsCol(), {
      name: data.guest_name,
      phone: data.guest_phone,
      email: data.guest_email || '',
      check_in: data.check_in,
      check_out: data.check_out,
      status: 'upcoming',
      property_id: data.property_id,
      property_name: data.property_name,
      booking_id: docRef.id,
      created_at: new Date().toISOString(),
    });

    // Create a transaction record only when money was actually collected
    if (paymentStatus === 'paid') {
      await addDoc(transactionsCol(), {
        type: 'payment',
        description: `Booking Payment - ${data.property_name}`,
        amount: grandTotal,
        booking_id: docRef.id,
        date: new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString(),
      });
    }

    // Create notification for admin
    await addDoc(notificationsCol(), {
      type: isBankTransfer ? 'pending_payment' : 'new_booking',
      title: isBankTransfer ? 'Bank Transfer Pending' : 'New Booking',
      message: `${data.guest_name} booked ${data.property_name} (${nights > 0 ? `${nights} nights` : 'Day Use'})`,
      booking_id: docRef.id,
      read: false,
      created_at: new Date().toISOString(),
    });

    // Push fan-out to admin devices. Fire-and-forget — booking confirmation
    // must never block on notification delivery. Safe no-op if the server
    // endpoint is not deployed; the Cloud Function on bookings/{id} also
    // covers this path independently.
    notifyAdminsOfNewBooking({
      bookingId: docRef.id,
      guest_name: data.guest_name,
      total_amount: grandTotal,
      check_in: data.check_in,
      check_out: data.check_out,
      check_in_time: booking.check_in_time,
      check_out_time: booking.check_out_time,
    });

    return { ...booking, id: docRef.id };
  },

  async list(): Promise<FirestoreBooking[]> {
    const q = query(bookingsCol(), orderBy('created_at', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreBooking));
  },

  async get(id: string): Promise<FirestoreBooking | null> {
    const ref = doc(db, 'bookings', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as FirestoreBooking;
  },

  async updateStatus(id: string, status: string) {
    const ref = doc(db, 'bookings', id);
    await updateDoc(ref, { status });
  },

  async approvePayment(id: string) {
    const ref = doc(db, 'bookings', id);
    await updateDoc(ref, { status: 'confirmed', payment_status: 'paid' });

    const booking = await this.get(id);
    if (booking) {
      await addDoc(transactionsCol(), {
        type: 'payment',
        description: `Bank Transfer Approved - ${booking.property_name}`,
        amount: booking.total_amount,
        booking_id: id,
        date: new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString(),
      });
    }
  },
};

// ── Guests ──

export const firestoreGuests = {
  async create(data: {
    name: string;
    phone: string;
    email?: string;
    check_in: string;
    check_out: string;
    property_id: string;
    property_name: string;
  }) {
    const docRef = await addDoc(guestsCol(), {
      ...data,
      email: data.email || '',
      status: 'upcoming',
      booking_id: '',
      created_at: new Date().toISOString(),
    });
    return { id: docRef.id, ...data, status: 'upcoming' };
  },

  async list(filters?: { status?: string; search?: string }) {
    let q = query(guestsCol(), orderBy('created_at', 'desc'));

    if (filters?.status && filters.status !== 'all') {
      q = query(guestsCol(), where('status', '==', filters.status), orderBy('created_at', 'desc'));
    }

    const snap = await getDocs(q);
    let guests = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (filters?.search) {
      const s = filters.search.toLowerCase();
      guests = guests.filter((g: any) =>
        g.name?.toLowerCase().includes(s) || g.phone?.includes(s)
      );
    }

    return guests;
  },

  async stats() {
    const snap = await getDocs(guestsCol());
    const all = snap.docs.map(d => d.data());
    return {
      checkedIn: all.filter(g => g.status === 'checked-in').length,
      upcoming: all.filter(g => g.status === 'upcoming').length,
      checkingOut: all.filter(g => g.status === 'checking-out').length,
      completed: all.filter(g => g.status === 'completed').length,
      total: all.length,
    };
  },

  async updateStatus(id: string, status: string) {
    const ref = doc(db, 'guests', id);
    await updateDoc(ref, { status });
  },
};

// ── Transactions ──

export const firestoreTransactions = {
  async list(limit = 20) {
    const q = query(transactionsCol(), orderBy('created_at', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.slice(0, limit).map(d => ({ id: d.id, ...d.data() }));
  },
};

// ── Invoices ──

export const firestoreInvoices = {
  async list(statusFilter?: string) {
    await ensureSeedData();
    const snap = await getDocs(invoicesCol());
    let invoices = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    if (statusFilter) {
      invoices = invoices.filter(inv => inv.status === statusFilter);
    }
    invoices.sort((a: any, b: any) => (b.issued_date || '').localeCompare(a.issued_date || ''));
    return invoices;
  },

  async stats() {
    await ensureSeedData();
    const snap = await getDocs(invoicesCol());
    const all = snap.docs.map(d => d.data());

    const outstanding = all
      .filter(inv => inv.status === 'pending' || inv.status === 'overdue')
      .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

    const totalPaid = all
      .filter(inv => inv.status === 'paid')
      .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

    const pendingCount = all.filter(inv => inv.status === 'pending').length;
    const overdueCount = all.filter(inv => inv.status === 'overdue').length;
    const paidCount = all.filter(inv => inv.status === 'paid').length;
    const healthRate = all.length > 0 ? parseFloat(((paidCount / all.length) * 100).toFixed(1)) : 0;

    return {
      outstanding,
      totalPaid,
      pendingCount,
      overdueCount,
      healthRate,
      awaitingAction: pendingCount + overdueCount,
    };
  },

  async get(id: string) {
    const ref = doc(db, 'invoices', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const invoice = { id: snap.id, ...snap.data() };

    // Get items
    const itemsSnap = await getDocs(query(invoiceItemsCol(), where('invoice_id', '==', id)));
    const items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    return { ...invoice, items };
  },

  async update(id: string, data: { status?: string; vat_compliant?: boolean }) {
    const ref = doc(db, 'invoices', id);
    const updates: any = {};
    if (data.status !== undefined) updates.status = data.status;
    if (data.vat_compliant !== undefined) updates.vat_compliant = data.vat_compliant;
    await updateDoc(ref, updates);

    return this.get(id);
  },

  async create(data: { guest_name: string; booking_ref: string; room_type: string; items: { description: string; amount: number }[] }) {
    const subtotal = data.items.reduce((sum, item) => sum + item.amount, 0);
    const vatAmount = subtotal * 0.05;
    const totalAmount = subtotal + vatAmount;

    const docRef = await addDoc(invoicesCol(), {
      guest_name: data.guest_name,
      booking_ref: data.booking_ref,
      room_type: data.room_type,
      subtotal,
      vat_amount: vatAmount,
      total_amount: totalAmount,
      status: 'pending',
      vat_compliant: true,
      issued_date: new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString(),
    });

    for (const item of data.items) {
      await addDoc(invoiceItemsCol(), { invoice_id: docRef.id, description: item.description, amount: item.amount });
    }

    return this.get(docRef.id);
  },
};

// ── Dashboard (computed from Firestore) ──

export const firestoreDashboard = {
  async get(userName: string) {
    const bookings = await firestoreBookings.list();
    const properties = await firestoreProperties.list();

    const paidBookings = bookings.filter(b => b.payment_status === 'paid');
    const revenueTotal = paidBookings.reduce((sum, b) => sum + b.total_amount - (b.security_deposit || 0), 0);
    const lastMonthRevenue = revenueTotal * 0.88;
    const revenueTrend = lastMonthRevenue > 0 ? Math.round(((revenueTotal - lastMonthRevenue) / lastMonthRevenue) * 100) : 0;

    const pendingBookings = bookings.filter(b => b.status === 'pending').length;

    const activeProperties = properties.length;
    const occupiedPropertyIds = new Set(bookings.filter(b => b.status === 'checked-in').map(b => b.property_id));
    const occupancy = activeProperties > 0 ? Math.round((occupiedPropertyIds.size / activeProperties) * 100) : 0;

    const upcomingBookings = bookings
      .filter(b => b.status === 'confirmed' || b.status === 'pending')
      .sort((a, b) => a.check_in.localeCompare(b.check_in));

    const nextCheckIn = upcomingBookings.length > 0 ? {
      guest_name: upcomingBookings[0].guest_name,
      property_name: upcomingBookings[0].property_name,
      check_in: upcomingBookings[0].check_in,
      check_out: upcomingBookings[0].check_out,
    } : null;

    const recentBookings = bookings
      .filter(b => b.status !== 'cancelled')
      .slice(0, 10)
      .map(b => ({
        check_in: b.check_in,
        check_out: b.check_out,
        guest_name: b.guest_name,
        property_name: b.property_name,
      }));

    return {
      revenue: { total: revenueTotal, trend: revenueTrend },
      pendingBookings,
      occupancy,
      totalProperties: activeProperties,
      nextCheckIn,
      recentBookings,
      userName,
    };
  },
};

// ── Reports (computed from Firestore) ──

export const firestoreReports = {
  async get() {
    const bookings = await firestoreBookings.list();
    const properties = await firestoreProperties.list();

    const activeProperties = properties.length;
    const occupiedIds = new Set(bookings.filter(b => b.status === 'checked-in').map(b => b.property_id));
    const occupancyRate = activeProperties > 0 ? parseFloat(((occupiedIds.size / activeProperties) * 100).toFixed(1)) : 0;

    const paidBookings = bookings.filter(b => b.payment_status === 'paid');
    const avgNightlyRate = paidBookings.length > 0 ? Math.round(paidBookings.reduce((s, b) => s + b.nightly_rate, 0) / paidBookings.length) : 0;
    const monthlyRevenue = paidBookings.reduce((s, b) => s + b.total_amount - (b.security_deposit || 0), 0);

    // Total nights booked this month
    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const totalNightsThisMonth = bookings
      .filter(b => b.status !== 'cancelled' && b.check_in.startsWith(currentMonthStr))
      .reduce((sum, b) => sum + b.nights, 0);

    const revenueByMonth = [
      { month: 'JAN', actual: 24000, forecast: 32000 },
      { month: 'FEB', actual: 36000, forecast: 40000 },
      { month: 'MAR', actual: 42000, forecast: 44000 },
      { month: 'APR', actual: 52000, forecast: 48000 },
      { month: 'MAY', actual: 48000, forecast: 52000 },
      { month: 'JUN', actual: 56000, forecast: 60000 },
    ];

    return {
      stats: { occupancyRate, avgNightlyRate, monthlyRevenue, guestSatisfaction: 4.9, totalNightsThisMonth },
      revenueByMonth,
    };
  },
};

// ── Testimonials ──

export interface Testimonial {
  id?: string;
  guest_name: string;
  guest_phone: string;
  property_name: string;
  rating: number;
  text: string;
  stay_details: string;
  isPinned?: boolean;
  created_at: string;
}

export const firestoreTestimonials = {
  async create(data: Omit<Testimonial, 'id' | 'created_at'>) {
    const docRef = await addDoc(testimonialsCol(), {
      ...data,
      created_at: new Date().toISOString(),
    });
    return { id: docRef.id, ...data, created_at: new Date().toISOString() };
  },

  async list(): Promise<Testimonial[]> {
    const q = query(testimonialsCol(), orderBy('created_at', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Testimonial));
  },
};

// ── Notifications ──

export interface Notification {
  id?: string;
  type: 'new_booking' | 'pending_payment';
  title: string;
  message: string;
  booking_id: string;
  read: boolean;
  created_at: string;
}

export const firestoreNotifications = {
  async list(): Promise<Notification[]> {
    const q = query(notificationsCol(), orderBy('created_at', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification));
  },

  async markRead(id: string) {
    const ref = doc(db, 'notifications', id);
    await updateDoc(ref, { read: true });
  },

  async markAllRead() {
    const snap = await getDocs(query(notificationsCol(), where('read', '==', false)));
    const updates = snap.docs.map(d => updateDoc(doc(db, 'notifications', d.id), { read: true }));
    await Promise.all(updates);
  },
};
