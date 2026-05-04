export interface ClientTheme {
  primary: string;
  secondary: string;
  background?: string;
}

export interface ClientAdmin {
  email: string;
  /** Additional authorized admin emails (beyond the primary). */
  additionalEmails?: string[];
  name: string;
}

export interface ClientSocial {
  whatsapp: string;
  instagram?: string;
}

export interface ClientLocation {
  /** Public Google Maps link shown in confirmation, invoices, footer. */
  mapsUrl: string;
}

export interface ClientFeatures {
  /** Require guests to upload Civil ID / Passport during booking. */
  hasIdUpload: boolean;
  /** Allow Day Use bookings (guest selector + admin pricing/slots). */
  hasDayUse: boolean;
  /** Allow Event bookings (guest selector + admin pricing). */
  hasEvent: boolean;
}

/**
 * Standard check-in / check-out wall-clock times for this client.
 * Stored as 24-hour "HH:MM" so the existing pricingUtils.formatTime() helper
 * can localise the label per language. These act as the *default* times when
 * the booking record itself has no per-stay override.
 */
export interface ClientCheckInOut {
  /** 24h format, e.g. "14:00" for 2:00 PM. */
  checkInTime: string;
  /** 24h format, e.g. "11:00" for 11:00 AM (next day for night stays). */
  checkOutTime: string;
}

export interface ClientConfig {
  chaletName: string;
  logoPath: string | null;
  theme: ClientTheme;
  admin: ClientAdmin;
  social: ClientSocial;
  location: ClientLocation;
  features: ClientFeatures;
  checkInOut: ClientCheckInOut;
}

export const CLIENT_CONFIG: ClientConfig = {
  chaletName: 'Woody Chalete',
  logoPath: '/assets/brand/logo.png',
  theme: {
    primary: '#1C3A2A',
    secondary: '#C8964A',
    background: '#F2E8D5',
  },
  admin: {
    email: 'akwakhhwwdyman@gmail.com',
    additionalEmails: [],
    name: 'Woody Chalete Admin',
  },
  social: {
    whatsapp: '96879210323',
    instagram: 'https://www.instagram.com/wooody_chalete/',
  },
  location: {
    mapsUrl: 'https://maps.app.goo.gl/Wsnnm9W6nxvyBUcy8',
  },
  features: {
    hasIdUpload: false,
    hasDayUse: false,
    hasEvent: false,
  },
  checkInOut: {
    checkInTime: '14:00',   // 2:00 PM
    checkOutTime: '11:00',  // 11:00 AM (next day for night stays)
  },
};

export const getClientConfig = (): ClientConfig => CLIENT_CONFIG;

export const ADMIN_EMAILS: string[] = [
  CLIENT_CONFIG.admin.email,
  ...(CLIENT_CONFIG.admin.additionalEmails ?? []),
]
  .map(e => (e || '').trim().toLowerCase())
  .filter(Boolean);

export const isAdminEmail = (email: string | null | undefined): boolean => {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
};

export const whatsappHref = (number: string): string => {
  const digits = (number || '').replace(/\D/g, '');
  return `https://wa.me/${digits}`;
};

export const applyTheme = (theme: ClientTheme): void => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--primary', theme.primary);
  root.style.setProperty('--secondary', theme.secondary);
  if (theme.background) {
    root.style.setProperty('--background', theme.background);
  }
};

export const FALLBACK_CLIENT_CONFIG: ClientConfig = CLIENT_CONFIG;
