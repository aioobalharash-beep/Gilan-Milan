import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

function ensureAdminInitialized() {
  if (getApps().length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT env var is not set. Add it in Vercel → Settings → Environment Variables with the JSON contents of the service account key.'
    );
  }
  const serviceAccount = JSON.parse(raw);
  initializeApp({ credential: cert(serviceAccount) });
}

type Body = {
  bookingId?: string;
  guest_name?: string;
  total_amount?: number | string;
  check_in?: string;
  check_out?: string;
  check_in_time?: string;
  check_out_time?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // GET = health check. Returns whether the env var is set, whether
  // firebase-admin initialized, and how many admin_tokens exist — so the
  // dashboard can surface the failure reason without needing server logs.
  if (req.method === 'GET') {
    const envVarSet = !!process.env.FIREBASE_SERVICE_ACCOUNT;
    let adminSdkReady = false;
    let tokenCount: number | null = null;
    let projectId: string | null = null;
    let error: string | null = null;

    let tokens: Array<{
      tokenHash: string;
      adminId: string | null;
      userAgent: string | null;
      createdAtMs: number | null;
      lastSeenAtMs: number | null;
    }> = [];

    try {
      ensureAdminInitialized();
      adminSdkReady = true;
      const apps = getApps();
      projectId = apps[0]?.options?.projectId || null;
      const snap = await getFirestore().collection('admin_tokens').get();
      tokenCount = snap.size;
      tokens = snap.docs.map((d) => {
        const data = d.data() as {
          adminId?: string;
          userAgent?: string;
          createdAt?: FirebaseFirestore.Timestamp;
          lastSeenAt?: FirebaseFirestore.Timestamp;
        };
        return {
          tokenHash: `${d.id.slice(0, 6)}…${d.id.slice(-4)}`,
          adminId: data.adminId || null,
          userAgent: (data.userAgent || '').slice(0, 40) || null,
          createdAtMs: data.createdAt?.toMillis?.() ?? null,
          lastSeenAtMs: data.lastSeenAt?.toMillis?.() ?? null,
        };
      });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    res.status(200).json({
      envVarSet,
      adminSdkReady,
      projectId,
      tokenCount,
      tokens,
      error,
    });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const {
    bookingId,
    guest_name,
    total_amount,
    check_in,
    check_out,
    check_in_time,
    check_out_time,
  } = (req.body || {}) as Body;

  if (!guest_name || total_amount === undefined) {
    res.status(400).json({ error: 'guest_name and total_amount are required' });
    return;
  }

  try {
    ensureAdminInitialized();
    const firestore = getFirestore();
    const messaging = getMessaging();

    const tokensSnap = await firestore.collection('admin_tokens').get();
    if (tokensSnap.empty) {
      res.status(200).json({ delivered: 0, pruned: 0, reason: 'no_tokens' });
      return;
    }

    // Dedupe by adminId: one admin = one active device. Fixes cases where a
    // stale token lingers after a PWA reset, so the same phone doesn't get
    // the same notification twice. Superseded tokens are deleted from
    // Firestore so future sends are already clean.
    const keptByAdmin = new Map<string, { id: string; millis: number }>();
    const superseded: string[] = [];
    for (const d of tokensSnap.docs) {
      const data = d.data() as { adminId?: string; createdAt?: FirebaseFirestore.Timestamp; lastSeenAt?: FirebaseFirestore.Timestamp };
      const adminId = data.adminId || d.id;
      const millis =
        data.lastSeenAt?.toMillis?.() ?? data.createdAt?.toMillis?.() ?? 0;
      const existing = keptByAdmin.get(adminId);
      if (!existing) {
        keptByAdmin.set(adminId, { id: d.id, millis });
      } else if (millis > existing.millis) {
        superseded.push(existing.id);
        keptByAdmin.set(adminId, { id: d.id, millis });
      } else {
        superseded.push(d.id);
      }
    }

    if (superseded.length) {
      const batch = firestore.batch();
      superseded.forEach((t) => batch.delete(firestore.doc(`admin_tokens/${t}`)));
      await batch.commit();
    }

    const tokens = Array.from(keptByAdmin.values()).map((v) => v.id);
    const title = '🛎️ حجز جديد! (New Booking!)';
    const stayLine =
      check_in && check_out
        ? ` ${check_in}${check_in_time ? ` ${check_in_time}` : ''} → ${check_out}${check_out_time ? ` ${check_out_time}` : ''}`
        : '';
    const body = `${guest_name} has booked for ${total_amount} OMR.${stayLine}`;

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: {
        title,
        body,
        bookingId: bookingId || '',
        guest_name: String(guest_name),
        total_amount: String(total_amount),
        check_in: check_in || '',
        check_out: check_out || '',
        check_in_time: check_in_time || '',
        check_out_time: check_out_time || '',
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

    res.status(200).json({
      delivered: response.successCount,
      failed: response.failureCount,
      pruned: stale.length,
      deduped: superseded.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('notify-admin failed:', message);
    res.status(500).json({ error: message });
  }
}
