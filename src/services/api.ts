import {
  firestoreUsers,
  firestoreProperties,
  firestoreBookings,
  firestoreGuests,
  firestoreTransactions,
  firestoreInvoices,
  firestoreTestimonials,
  firestoreNotifications,
  firestoreDashboard,
  firestoreReports,
} from './firestore';

// Auth — Firebase Authentication (user profile stored in Firestore users/{uid})
export const authApi = {
  login: (email: string, password: string) => firestoreUsers.login(email, password),
  register: (data: { name: string; email: string; password: string; phone?: string }) => firestoreUsers.register(data),
  logout: () => firestoreUsers.logout(),
  me: (id: string) => firestoreUsers.getById(id),
};

// Dashboard — Firestore
export const dashboardApi = {
  get: (userName: string) => firestoreDashboard.get(userName),
};

// Bookings — Firestore
export const bookingsApi = {
  create: async (data: {
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
  }) => {
    const booking = await firestoreBookings.create(data);
    return { booking, property_name: data.property_name };
  },

  list: async (params?: { status?: string }) => {
    const bookings = await firestoreBookings.list();
    const filtered = params?.status
      ? bookings.filter(b => b.status === params.status)
      : bookings;
    return { bookings: filtered, total: filtered.length };
  },

  get: async (id: string) => firestoreBookings.get(id),

  update: async (id: string, data: { status?: string; payment_status?: string }) => {
    if (data.status) await firestoreBookings.updateStatus(id, data.status);
    return { id, ...data };
  },

  approvePayment: (id: string) => firestoreBookings.approvePayment(id),
};

// Guests — Firestore
export const guestsApi = {
  create: (data: {
    name: string;
    phone: string;
    email?: string;
    check_in: string;
    check_out: string;
    property_id: string;
    property_name: string;
  }) => firestoreGuests.create(data),

  list: (params?: { status?: string; search?: string }) =>
    firestoreGuests.list(params) as Promise<any[]>,

  stats: () => firestoreGuests.stats(),

  update: async (id: string, data: { status: string }) => {
    await firestoreGuests.updateStatus(id, data.status);
    return { id, ...data };
  },
};

// Invoices — Firestore
export const invoicesApi = {
  list: (params?: { status?: string }) => firestoreInvoices.list(params?.status),

  stats: () => firestoreInvoices.stats(),

  get: (id: string) => firestoreInvoices.get(id),

  update: (id: string, data: { status?: string; vat_compliant?: boolean }) =>
    firestoreInvoices.update(id, data),

  create: (data: { guest_name: string; booking_ref: string; room_type: string; items: { description: string; amount: number }[] }) =>
    firestoreInvoices.create(data),
};

// Reports — Firestore
export const reportsApi = {
  get: () => firestoreReports.get(),
};

// Properties — Firestore
export const propertiesApi = {
  list: () => firestoreProperties.list() as Promise<any[]>,
  get: (id: string) => firestoreProperties.get(id),
  checkAvailability: async (id: string, checkIn: string, checkOut: string) => {
    const bookings = await firestoreBookings.list();
    const conflict = bookings.find(b =>
      b.property_id === id &&
      b.status !== 'cancelled' &&
      b.check_in < checkOut &&
      b.check_out > checkIn
    );
    return { available: !conflict };
  },
};

// Transactions — Firestore
export const transactionsApi = {
  list: (limit?: number) => firestoreTransactions.list(limit) as Promise<any[]>,
};

// Testimonials — Firestore
export const testimonialsApi = {
  create: (data: { guest_name: string; guest_phone: string; property_name: string; rating: number; text: string; stay_details: string }) =>
    firestoreTestimonials.create(data),
  list: () => firestoreTestimonials.list(),
};

// Notifications — Firestore
export const notificationsApi = {
  list: () => firestoreNotifications.list(),
  markRead: (id: string) => firestoreNotifications.markRead(id),
  markAllRead: () => firestoreNotifications.markAllRead(),
};
