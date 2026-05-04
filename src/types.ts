export type Mode = 'admin' | 'client';

export type View =
  | 'dashboard' | 'calendar' | 'guests' | 'invoices' | 'reports' // Admin Views
  | 'sanctuary' | 'booking' | 'payment' | 'confirmation' | 'terms'; // Client Views

export interface Guest {
  id: string;
  name: string;
  phone: string;
  email?: string;
  check_in: string;
  check_out: string;
  status: 'checked-in' | 'upcoming' | 'checking-out' | 'completed';
  avatar?: string;
  property_id?: string;
  property_name?: string;
  booking_id?: string;
}

export interface Invoice {
  id: string;
  guest_name: string;
  booking_ref: string;
  room_type: string;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  status: 'pending' | 'paid' | 'overdue';
  vat_compliant: boolean;
  issued_date: string;
  due_date?: string;
  items?: InvoiceItem[];
}

export interface InvoiceItem {
  id: number;
  invoice_id: string;
  description: string;
  amount: number;
}

export interface Transaction {
  id: string;
  type: 'refund' | 'payment';
  description: string;
  amount: number;
  booking_id?: string;
  date: string;
}

export interface Booking {
  id: string;
  property_id: string;
  property_name?: string;
  guest_name: string;
  guest_phone: string;
  guest_email?: string;
  check_in: string;
  check_out: string;
  nights: number;
  nightly_rate: number;
  security_deposit: number;
  total_amount: number;
  status: 'pending' | 'confirmed' | 'checked-in' | 'checked-out' | 'cancelled';
  payment_status: 'pending' | 'paid' | 'refunded' | 'partial';
  created_at: string;
}

export interface PropertyImage {
  url: string;
  label?: string;
}

export interface Property {
  id: string;
  /**
   * Display name. Stored as a bilingual `{ en, ar }` object for new
   * multi-property records, but legacy/single-property data uses a plain
   * string — both shapes are accepted at the boundary and normalised by the
   * UI via `bl()` from `utils/bilingual`.
   */
  name: string | { en: string; ar: string };
  type: string;
  capacity: number;
  area_sqm: number;
  nightly_rate: number;
  security_deposit: number;
  description: string;
  /** Hero/preview gallery shown in the toggle and on the main page. */
  images?: PropertyImage[];
  /** Quick amenity list rendered as chips on the main page. */
  amenities?: string[];
  /** External calendar identifier (iCal/Google Calendar) for sync. */
  calendarSyncId?: string;
  status: string;
}
