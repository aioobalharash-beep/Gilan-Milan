import { getMessaging, getToken, onMessage, isSupported, Messaging } from 'firebase/messaging';
import { collection, doc, setDoc, deleteDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import app, { db } from './firebase';

const ADMIN_TOKENS_COLLECTION = 'admin_tokens';

// VAPID public key is safe to ship in the bundle — it's the public half of the
// Web Push certificate pair. The private half stays in Firebase.
//
// Configure per-project via the VITE_FIREBASE_VAPID_KEY env var (Project
// Settings → Cloud Messaging → Web Push certificates → Key pair). The bundled
// fallback is only useful for the original template's Firebase project; any
// new deployment must override it or push registration will fail.
const RAW_VAPID_KEY =
  (import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined) ||
  'BErsSKwySJ84fE7jBwq1BoZvkowA7qb-8TFaP1V1PQfOTlyWgbeDdvMZTJltugbZ2ij40Z4l7_PKRHsuGlaw5-O';

// Strip whitespace and surrounding quotes that sometimes survive from a copy
// out of the Firebase Console or from a poorly-pasted env var value.
const VAPID_KEY = (RAW_VAPID_KEY || '')
  .trim()
  .replace(/^['"]|['"]$/g, '')
  .replace(/\s+/g, '');

// Web Push P-256 public keys are 65 bytes uncompressed → 87 chars unpadded
// base64url, or 88 with a single trailing `=`. Reject anything else early so
// we surface a clear configuration error instead of FCM's generic "The string
// contains invalid characters".
const VAPID_KEY_LOOKS_VALID =
  /^[A-Za-z0-9_-]{86,88}=?$/.test(VAPID_KEY);

let messagingInstance: Messaging | null = null;

async function getMessagingInstance(): Promise<Messaging | null> {
  if (messagingInstance) return messagingInstance;
  if (!(await isSupported())) return null;
  messagingInstance = getMessaging(app);
  return messagingInstance;
}

async function registerFcmServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  // Reuse the app's main service worker (registered in main.tsx) for push.
  // Registering a second SW at the same scope `/` would clobber whichever was
  // registered last on the next page load, silently breaking background pushes.
  // service-worker.js handles the push + notificationclick events directly.
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  return navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
}

export type PushPermissionResult =
  | { status: 'granted'; token: string }
  | { status: 'denied' }
  | { status: 'default' }
  | { status: 'unsupported' }
  | { status: 'not-configured' }
  | { status: 'error'; error: string };

/**
 * True only when push is wired up enough to attempt enabling. Use this to
 * decide whether to render the "Enable notifications" prompt at all.
 */
export function isPushConfigured(): boolean {
  return VAPID_KEY_LOOKS_VALID;
}

/**
 * Detects iOS Safari running outside an installed PWA. On iOS, Web Push only
 * works when the site has been added to the Home Screen — the Notification
 * API itself is missing in regular Safari tabs. This lets the dashboard show
 * a "Install to Home Screen first" hint instead of a broken Enable button.
 */
export function isIosNeedsHomeScreen(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPhone, iPod, or modern iPadOS (which reports as Mac with touch).
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Mac') && 'ontouchend' in document);
  if (!isIos) return false;
  // Standalone PWA (installed to Home Screen).
  const isStandalone =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    // Legacy Safari flag
    (window.navigator as any).standalone === true;
  return !isStandalone;
}

/**
 * Requests browser notification permission, fetches the FCM token, and
 * persists it under admin_tokens/{token} so the backend can fan out pushes.
 */
export async function enableAdminPushNotifications(
  adminId: string
): Promise<PushPermissionResult> {
  try {
    if (!('Notification' in window)) return { status: 'unsupported' };
    if (!VAPID_KEY) return { status: 'not-configured' };
    if (!VAPID_KEY_LOOKS_VALID) {
      console.warn(
        'enableAdminPushNotifications: VITE_FIREBASE_VAPID_KEY is malformed',
        { length: VAPID_KEY.length },
      );
      return { status: 'not-configured' };
    }

    const messaging = await getMessagingInstance();
    if (!messaging) return { status: 'unsupported' };

    const permission = await Notification.requestPermission();
    if (permission === 'denied') return { status: 'denied' };
    if (permission !== 'granted') return { status: 'default' };

    const swReg = await registerFcmServiceWorker();
    let token: string;
    try {
      token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swReg || undefined,
      });
    } catch (tokenErr) {
      const msg = tokenErr instanceof Error ? tokenErr.message : String(tokenErr);
      // FCM throws "The string to be decoded contains invalid characters"
      // (or similar) when the VAPID key isn't valid base64url for the
      // current Firebase project. Surface this as a configuration issue
      // rather than a scary technical error.
      if (/invalid characters|applicationServerKey|Failed to execute 'subscribe'/i.test(msg)) {
        return { status: 'not-configured' };
      }
      throw tokenErr;
    }

    if (!token) return { status: 'error', error: 'Empty FCM token' };

    // One admin = one active token. Purge any prior tokens for this adminId
    // (e.g. a stale token from before a PWA reset that Apple hasn't invalidated
    // yet) so bookings don't trigger duplicate notifications on the same
    // device.
    try {
      const existing = await getDocs(
        query(collection(db, ADMIN_TOKENS_COLLECTION), where('adminId', '==', adminId))
      );
      await Promise.all(
        existing.docs
          .filter((d) => d.id !== token)
          .map((d) => deleteDoc(d.ref))
      );
    } catch {
      // non-fatal — server also dedupes on send
    }

    await setDoc(doc(db, ADMIN_TOKENS_COLLECTION, token), {
      token,
      adminId,
      userAgent: navigator.userAgent,
      createdAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    });

    return { status: 'granted', token };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

export async function disableAdminPushNotifications(token: string): Promise<void> {
  try {
    await deleteDoc(doc(db, ADMIN_TOKENS_COLLECTION, token));
  } catch {
    // non-fatal
  }
}

/**
 * Fire-and-forget trigger the booking flow calls right after a booking is
 * written. Posts to the Vercel serverless function /api/notify-admin, which
 * holds the firebase-admin service-account credential (FIREBASE_SERVICE_ACCOUNT
 * env var in Vercel). Never blocks booking confirmation — any push failure is
 * logged but does not throw.
 */
export function notifyAdminsOfNewBooking(params: {
  bookingId: string;
  guest_name: string;
  total_amount: number | string;
  check_in?: string;
  check_out?: string;
  check_in_time?: string;   // 24h "HH:MM"
  check_out_time?: string;  // 24h "HH:MM"
}): void {
  try {
    fetch('/api/notify-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      keepalive: true,
    }).catch((err) => console.warn('Push notification request failed:', err));
  } catch (err) {
    console.warn('Push notification dispatch skipped:', err);
  }
}

/**
 * Foreground message handler — call once on mount to show in-app toast / system
 * notification while the admin is actively viewing the dashboard. Background
 * delivery is handled by the push handler in /public/service-worker.js.
 */
export async function onForegroundPush(
  handler: (title: string, body: string, data: Record<string, string>) => void
): Promise<() => void> {
  const messaging = await getMessagingInstance();
  if (!messaging) return () => {};

  const unsubscribe = onMessage(messaging, (payload) => {
    const data = (payload.data || {}) as Record<string, string>;
    const title = payload.notification?.title || data.title || '🛎️ New Booking!';
    const body =
      payload.notification?.body ||
      data.body ||
      (data.guest_name && data.total_amount
        ? `${data.guest_name} just booked for ${data.total_amount} OMR. Click to view.`
        : 'A new booking just arrived.');
    handler(title, body, data);
  });

  return unsubscribe;
}
