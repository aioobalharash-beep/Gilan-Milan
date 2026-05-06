import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ─────────────────────────────────────────────────────────────────────────────
// Inbound iCal sync: /api/ical/sync[?propertyId=...]
//
// Pulls each property's configured inbound iCal feeds (Booking.com, Massarah,
// Airbnb, …), parses the VEVENTs, and mirrors them into the bookings
// collection as `source: 'external_ical'`. The in-app availability listener
// (which already filters by property_id) then automatically blocks those
// dates so guests can't double-book.
//
// Triggers:
//   • Vercel cron — once per day (vercel.json)
//   • Dashboard mount (debounced via localStorage) for near-realtime sync
//     while an admin is using the app
//   • PropertyEditor "Sync now" button for explicit re-poll after pasting
//     a new URL
//
// All three hit this same endpoint. With propertyId, only that chalet is
// synced; without, every property with at least one feed is processed.
// ─────────────────────────────────────────────────────────────────────────────

function ensureAdminInitialized(): void {
  if (getApps().length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT env var is not set. Add it in Vercel → Settings → Environment Variables with the JSON contents of the service account key.',
    );
  }
  initializeApp({ credential: cert(JSON.parse(raw)) });
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal iCal parser — handles what Booking.com / Massarah / Airbnb emit.
// We deliberately don't pull a parser dep: their feeds are tiny and the
// shape is well-known (BEGIN:VEVENT … END:VEVENT, dates as VALUE=DATE or
// YYYYMMDDTHHMMSS[Z]).
// ─────────────────────────────────────────────────────────────────────────────

interface ParsedEvent {
  uid: string;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  summary: string;
  status: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED' | string;
}

function unfold(text: string): string[] {
  // RFC 5545 §3.1: a CRLF followed by a single linear white-space character
  // is a continuation. Normalise CR/LF first, then re-stitch wrapped lines.
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out: string[] = [];
  for (const raw of lines) {
    if (raw.startsWith(' ') || raw.startsWith('\t')) {
      if (out.length === 0) continue;
      out[out.length - 1] += raw.slice(1);
    } else {
      out.push(raw);
    }
  }
  return out.filter(Boolean);
}

function unescapeText(s: string): string {
  return s
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseDateProp(value: string): string | null {
  // Strip any timezone designator and just take the date portion.
  // Examples we accept:
  //   20250515
  //   20250515T140000
  //   20250515T140000Z
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(value);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function parseICal(text: string): ParsedEvent[] {
  const lines = unfold(text);
  const events: ParsedEvent[] = [];
  let current: Partial<ParsedEvent> | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { current = {}; continue; }
    if (line === 'END:VEVENT') {
      if (current && current.uid && current.start && current.end) {
        events.push({
          uid: current.uid,
          start: current.start,
          end: current.end,
          summary: current.summary || 'External booking',
          status: current.status || 'CONFIRMED',
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;

    // PROPERTY[;PARAM=VAL;…]:VALUE — find the first unescaped colon.
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const semi = head.indexOf(';');
    const prop = (semi < 0 ? head : head.slice(0, semi)).toUpperCase();

    switch (prop) {
      case 'UID':
        current.uid = value.trim();
        break;
      case 'DTSTART': {
        const d = parseDateProp(value.trim());
        if (d) current.start = d;
        break;
      }
      case 'DTEND': {
        const d = parseDateProp(value.trim());
        if (d) current.end = d;
        break;
      }
      case 'SUMMARY':
        current.summary = unescapeText(value).trim();
        break;
      case 'STATUS':
        current.status = value.trim().toUpperCase();
        break;
      default:
        break;
    }
  }
  return events;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync logic
// ─────────────────────────────────────────────────────────────────────────────

function nightsBetween(checkIn: string, checkOut: string): number {
  // Half-open [checkIn, checkOut) — same convention as the rest of the app.
  const a = new Date(`${checkIn}T00:00:00Z`).getTime();
  const b = new Date(`${checkOut}T00:00:00Z`).getTime();
  if (!isFinite(a) || !isFinite(b)) return 0;
  const ms = b - a;
  if (ms <= 0) return 0;
  return Math.round(ms / 86_400_000);
}

/**
 * Stable, deterministic short hash of an arbitrary string. Used so each
 * (propertyId, feedUrl, eventUid) triple produces the same Firestore doc id
 * across runs — critical for upsert + prune.
 */
function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

function externalBookingId(propertyId: string, feedUrl: string, uid: string): string {
  // Firestore doc ids may not contain `/`. Strip it from the UID to be safe.
  const safeUid = uid.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);
  return `ext_${propertyId}_${shortHash(feedUrl)}_${safeUid}`;
}

interface PropertyDoc { id: string; name: unknown }
interface FeedConfig { label: string; url: string }

interface SyncSummary {
  propertyId: string;
  imported: number;   // events upserted (created or updated)
  pruned: number;     // previously-imported events removed because they're gone from the feed
  failed: number;     // feeds that errored out
  feedErrors: Array<{ url: string; error: string }>;
}

async function syncProperty(
  firestore: FirebaseFirestore.Firestore,
  property: PropertyDoc,
  feeds: FeedConfig[],
): Promise<SyncSummary> {
  const summary: SyncSummary = {
    propertyId: property.id,
    imported: 0,
    pruned: 0,
    failed: 0,
    feedErrors: [],
  };

  if (!feeds.length) return summary;

  const propertyName = (() => {
    const name = (property as any).name;
    if (typeof name === 'string') return name;
    if (name && typeof name === 'object') return name.en || name.ar || property.id;
    return property.id;
  })();

  const seenIds = new Set<string>();
  const writes: Array<Promise<unknown>> = [];

  for (const feed of feeds) {
    let text: string;
    try {
      // Spoof a generic UA — some OTAs reject the default fetch UA.
      const resp = await fetch(feed.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Gilan-Milan-iCal-Sync/1.0)',
          Accept: 'text/calendar, text/plain, */*',
        },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      text = await resp.text();
    } catch (err) {
      summary.failed += 1;
      summary.feedErrors.push({
        url: feed.url,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const events = parseICal(text);
    for (const ev of events) {
      if (ev.status === 'CANCELLED') continue;
      const docId = externalBookingId(property.id, feed.url, ev.uid);
      seenIds.add(docId);

      const nights = nightsBetween(ev.start, ev.end);
      const status = ev.status === 'TENTATIVE' ? 'pending' : 'confirmed';

      const docData = {
        property_id: property.id,
        property_name: propertyName,
        guest_name: ev.summary || `${feed.label} booking`,
        guest_phone: '',
        guest_email: '',
        check_in: ev.start,
        check_out: ev.end,
        nights: Math.max(nights, 0),
        nightly_rate: 0,
        security_deposit: 0,
        total_amount: 0,
        stayTotal: 0,
        depositAmount: 0,
        grandTotal: 0,
        balance_due: 0,
        deposit_paid: true,
        status,
        payment_status: 'external',
        payment_method: 'external',
        // Mark the source so existing revenue/guest/invoice listings can
        // exclude these without conflating them with real walk-in bookings.
        source: 'external_ical',
        source_label: feed.label,
        source_url: feed.url,
        source_uid: ev.uid,
        source_summary: ev.summary,
        external_synced_at: FieldValue.serverTimestamp(),
        // created_at preserved on first write only via merge:true.
        created_at: new Date().toISOString(),
      };

      writes.push(
        firestore
          .collection('bookings')
          .doc(docId)
          .set(docData, { merge: true })
          .then(() => { summary.imported += 1; })
          .catch((err) => {
            console.error('iCal upsert failed', docId, err);
          }),
      );
    }
  }

  await Promise.all(writes);

  // Prune external bookings that disappeared from every feed (cancelled or
  // checkout date passed and OTA pruned). We only prune docs that we
  // ourselves created (source=external_ical) so real bookings are never
  // touched.
  const existingSnap = await firestore
    .collection('bookings')
    .where('property_id', '==', property.id)
    .where('source', '==', 'external_ical')
    .get();

  const stale = existingSnap.docs.filter((d) => !seenIds.has(d.id));
  if (stale.length) {
    const batch = firestore.batch();
    stale.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    summary.pruned = stale.length;
  }

  return summary;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST').status(405).send('Method Not Allowed');
    return;
  }

  try {
    ensureAdminInitialized();
    const firestore = getFirestore();

    const propertyIdRaw = req.query.propertyId;
    const propertyId =
      typeof propertyIdRaw === 'string'
        ? propertyIdRaw.trim()
        : Array.isArray(propertyIdRaw)
          ? (propertyIdRaw[0] || '').trim()
          : '';

    // Build the (property, feeds) tuples to sync.
    type Tuple = { property: PropertyDoc; feeds: FeedConfig[] };
    const tuples: Tuple[] = [];

    if (propertyId) {
      const propSnap = await firestore.collection('properties').doc(propertyId).get();
      if (!propSnap.exists) {
        res.status(404).json({ error: 'Property not found' });
        return;
      }
      const settingsSnap = await firestore
        .collection('settings')
        .doc(`property_details_${propertyId}`)
        .get();
      const feeds = ((settingsSnap.exists ? settingsSnap.data() : null)
        ?.inbound_ical_feeds || []) as FeedConfig[];
      tuples.push({
        property: { id: propertyId, name: (propSnap.data() as any)?.name },
        feeds: feeds.filter((f) => f && f.url),
      });
    } else {
      const propsSnap = await firestore
        .collection('properties')
        .where('status', '==', 'active')
        .get();
      for (const doc of propsSnap.docs) {
        const settingsSnap = await firestore
          .collection('settings')
          .doc(`property_details_${doc.id}`)
          .get();
        const feeds = ((settingsSnap.exists ? settingsSnap.data() : null)
          ?.inbound_ical_feeds || []) as FeedConfig[];
        const validFeeds = feeds.filter((f) => f && f.url);
        if (validFeeds.length) {
          tuples.push({ property: { id: doc.id, name: (doc.data() as any)?.name }, feeds: validFeeds });
        }
      }
    }

    // Run sequentially per-property so a slow OTA doesn't blow our serverless
    // 10s function budget — still fast enough for two chalets, and the
    // dashboard-load trigger is debounced anyway.
    const results: SyncSummary[] = [];
    for (const t of tuples) {
      results.push(await syncProperty(firestore, t.property, t.feeds));
    }

    res.status(200).json({
      ok: true,
      ranAt: new Date().toISOString(),
      properties: results,
      // Top-level totals for convenience (used by the Sync now button when
      // it filters to a single property).
      imported: results.reduce((s, r) => s + r.imported, 0),
      pruned: results.reduce((s, r) => s + r.pruned, 0),
      failed: results.reduce((s, r) => s + r.failed, 0),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('iCal sync failed:', message);
    res.status(500).json({ ok: false, error: message });
  }
}
