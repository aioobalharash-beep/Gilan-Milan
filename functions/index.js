/**
 * Firebase Cloud Function — fan-out push notification on new booking.
 *
 * Deploy with:
 *   cd functions && npm install
 *   firebase deploy --only functions:notifyAdminsOnNewBooking
 *
 * Requires: Node 20+, firebase-admin, firebase-functions (v2).
 *
 * This runs server-side so the FCM server credentials never reach the browser.
 * The frontend only writes the booking doc — this function handles the push.
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

exports.notifyAdminsOnNewBooking = onDocumentCreated(
  { document: 'bookings/{bookingId}', region: 'us-central1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const booking = snap.data() || {};
    const bookingId = event.params.bookingId;

    const guestName = booking.guest_name || 'A guest';
    const totalAmount =
      booking.grandTotal ?? booking.total_amount ?? booking.total ?? 0;
    const checkIn = booking.check_in || '';
    const checkOut = booking.check_out || '';
    const checkInTime = booking.check_in_time || '';
    const checkOutTime = booking.check_out_time || '';

    const title = '🛎️ حجز جديد! (New Booking!)';
    const stayLine =
      checkIn && checkOut
        ? ` ${checkIn}${checkInTime ? ` ${checkInTime}` : ''} → ${checkOut}${checkOutTime ? ` ${checkOutTime}` : ''}`
        : '';
    const body = `${guestName} has booked for ${totalAmount} OMR.${stayLine}`;

    const tokensSnap = await getFirestore().collection('admin_tokens').get();
    if (tokensSnap.empty) {
      console.log('No admin tokens registered — skipping push.');
      return;
    }

    const tokens = tokensSnap.docs.map((d) => d.id);

    const response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: {
        title,
        body,
        bookingId,
        guest_name: String(guestName),
        total_amount: String(totalAmount),
        check_in: String(checkIn),
        check_out: String(checkOut),
        check_in_time: String(checkInTime),
        check_out_time: String(checkOutTime),
        url: '/admin',
      },
      webpush: {
        fcmOptions: { link: '/admin' },
        notification: {
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          vibrate: [200, 100, 200],
        },
      },
    });

    // Clean up tokens the FCM service rejected as permanently invalid.
    const stale = [];
    response.responses.forEach((r, i) => {
      if (r.success) return;
      const code = r.error && r.error.code;
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        stale.push(tokens[i]);
      }
    });

    if (stale.length) {
      const batch = getFirestore().batch();
      stale.forEach((t) => batch.delete(getFirestore().doc(`admin_tokens/${t}`)));
      await batch.commit();
    }

    console.log(
      `Push fan-out: ${response.successCount}/${tokens.length} delivered, ${stale.length} stale tokens pruned.`
    );
  }
);
