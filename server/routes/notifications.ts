import { Router } from 'express';

const router = Router();

/**
 * POST /api/notifications/new-booking
 *
 * Server-side FCM fan-out. The frontend calls this after writing a booking.
 *
 * SECURITY: FCM send credentials MUST live on the server. This route uses
 * firebase-admin, which auto-loads its credential from one of:
 *   - GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service-account
 *     JSON key file, OR
 *   - the default App Engine / Cloud Run identity, OR
 *   - FIREBASE_SERVICE_ACCOUNT env var holding the JSON string (wired below).
 *
 * Never embed these credentials in the Vite bundle. This endpoint is the ONLY
 * place that should hold them.
 *
 * To enable:
 *   1. npm install firebase-admin
 *   2. Set FIREBASE_SERVICE_ACCOUNT in your server env (JSON string of the
 *      service account private key file from Firebase Console → Project
 *      Settings → Service accounts → Generate new private key).
 *   3. Register this router in server/index.ts:
 *        import notificationRoutes from './routes/notifications.js';
 *        app.use('/api/notifications', notificationRoutes);
 */

type Body = {
  bookingId?: string;
  guest_name?: string;
  total_amount?: number | string;
};

router.post('/new-booking', async (req, res) => {
  const { bookingId, guest_name, total_amount } = req.body as Body;

  if (!guest_name || total_amount === undefined) {
    res.status(400).json({ error: 'guest_name and total_amount are required' });
    return;
  }

  try {
    // Lazy-load so the server still boots if firebase-admin isn't installed yet.
    const admin = await import('firebase-admin').then((m) => m.default ?? m);

    if (!admin.apps.length) {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
      const credential = raw
        ? admin.credential.cert(JSON.parse(raw))
        : admin.credential.applicationDefault();
      admin.initializeApp({ credential });
    }

    const firestore = admin.firestore();
    const messaging = admin.messaging();

    const tokensSnap = await firestore.collection('admin_tokens').get();
    if (tokensSnap.empty) {
      res.json({ delivered: 0, pruned: 0, reason: 'no_tokens' });
      return;
    }

    const tokens = tokensSnap.docs.map((d) => d.id);
    const title = '🛎️ حجز جديد! (New Booking!)';
    const body = `${guest_name} has booked for ${total_amount} OMR.`;

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: {
        title,
        body,
        bookingId: bookingId || '',
        guest_name: String(guest_name),
        total_amount: String(total_amount),
        url: '/admin',
      },
      webpush: {
        fcmOptions: { link: '/admin' },
        notification: {
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
        },
      },
    });

    const stale: string[] = [];
    response.responses.forEach((r, i) => {
      if (r.success) return;
      const code = r.error?.code;
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        stale.push(tokens[i]);
      }
    });

    if (stale.length) {
      const batch = firestore.batch();
      stale.forEach((t) => batch.delete(firestore.doc(`admin_tokens/${t}`)));
      await batch.commit();
    }

    res.json({
      delivered: response.successCount,
      failed: response.failureCount,
      pruned: stale.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('FCM fan-out failed:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
