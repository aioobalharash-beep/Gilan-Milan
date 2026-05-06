import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ─────────────────────────────────────────────────────────────────────────────
// Outbound iCal feed: /api/ical/<propertyId>
//
// Returns a public iCalendar (RFC 5545) document listing every non-cancelled
// booking for the given property, so that external platforms (Booking.com,
// Massarah, Airbnb, Google Calendar, …) can subscribe to the URL and avoid
// double-booking dates that are already taken in this app.
//
// The URL is meant to be public-but-unguessable: it doesn't require auth, but
// the property id is the only handle on the data. We only emit the dates +
// status — guest names and contact info are deliberately omitted because the
// feed is essentially shareable.
// ─────────────────────────────────────────────────────────────────────────────

const PRODID = '-//Gilan & Milan Chalet//Bookings//EN';
const TZID = 'Asia/Muscat';

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

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** UTC iCal datetime: 20250101T120000Z */
function toIcsUtcStamp(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

/** Local iCal datetime (no Z, used with TZID=...): 20250101T140000 */
function toIcsLocalDateTime(date: string, time: string): string | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time || '');
  if (!dateMatch || !timeMatch) return null;
  return (
    dateMatch[1] +
    dateMatch[2] +
    dateMatch[3] +
    'T' +
    pad(parseInt(timeMatch[1], 10)) +
    timeMatch[2] +
    '00'
  );
}

/** All-day iCal date: 20250101 */
function toIcsDate(yyyyMmDd: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd || '');
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

/**
 * Add one calendar day to a YYYY-MM-DD string. Used to convert a same-day
 * day-use booking into a half-open all-day event (DTEND is exclusive in
 * iCal).
 */
function addOneDay(yyyyMmDd: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd || '');
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  d.setUTCDate(d.getUTCDate() + 1);
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate())
  );
}

/** RFC 5545 §3.3.11 — escape commas, semicolons, backslashes, newlines. */
function escapeText(value: string): string {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * RFC 5545 §3.1 — fold lines longer than 75 octets at byte boundaries with
 * CRLF + a single space continuation.
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let i = 0;
  while (i < line.length) {
    const take = i === 0 ? 75 : 74;
    chunks.push(line.slice(i, i + take));
    i += take;
  }
  return chunks.join('\r\n ');
}

function resolveBilingualName(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value || fallback;
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof v.en === 'string' && v.en) return v.en;
    if (typeof v.ar === 'string' && v.ar) return v.ar;
  }
  return fallback;
}

interface BookingDoc {
  property_id?: string;
  check_in?: string;
  check_out?: string;
  check_in_time?: string;
  check_out_time?: string;
  status?: string;
  source?: string;
  created_at?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).setHeader('Allow', 'GET, HEAD').send('Method Not Allowed');
    return;
  }

  // Vercel maps /api/ical/<id> to req.query.propertyId via the [propertyId]
  // dynamic segment. Strip a trailing ".ics" so admins can paste either
  // /api/ical/gilan or /api/ical/gilan.ics into the OTA's iCal field.
  const rawId = req.query.propertyId;
  const propertyId = (Array.isArray(rawId) ? rawId[0] : rawId || '')
    .replace(/\.ics$/i, '')
    .trim();
  if (!propertyId || !/^[A-Za-z0-9_-]+$/.test(propertyId)) {
    res.status(400).send('Invalid property id');
    return;
  }

  try {
    ensureAdminInitialized();
    const firestore = getFirestore();

    // Property record gives us a friendly calendar name.
    const propSnap = await firestore.collection('properties').doc(propertyId).get();
    if (!propSnap.exists) {
      res.status(404).send('Property not found');
      return;
    }
    const propertyName = resolveBilingualName(
      (propSnap.data() as Record<string, unknown>)?.name,
      propertyId,
    );

    // Bookings — filter by property and exclude cancelled. We also exclude
    // anything tagged source=external_ical so that round-tripping a feed
    // (us → OTA → us via a future inbound poll) doesn't cause an infinite
    // duplication loop.
    const bookingsSnap = await firestore
      .collection('bookings')
      .where('property_id', '==', propertyId)
      .get();

    const bookings: Array<BookingDoc & { id: string }> = bookingsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as BookingDoc) }))
      .filter((b) => b.status !== 'cancelled' && b.source !== 'external_ical');

    const dtstamp = toIcsUtcStamp(new Date());
    const lines: string[] = [];
    const push = (line: string) => lines.push(foldLine(line));

    push('BEGIN:VCALENDAR');
    push('VERSION:2.0');
    push(`PRODID:${PRODID}`);
    push('CALSCALE:GREGORIAN');
    push('METHOD:PUBLISH');
    push(`X-WR-CALNAME:${escapeText(`${propertyName} Bookings`)}`);
    push(`X-WR-TIMEZONE:${TZID}`);

    for (const b of bookings) {
      if (!b.check_in || !b.check_out) continue;

      const isDayUse = b.check_in === b.check_out;
      const status = b.status === 'pending' ? 'TENTATIVE' : 'CONFIRMED';

      let dtstartLine: string | null = null;
      let dtendLine: string | null = null;

      if (isDayUse) {
        if (b.check_in_time && b.check_out_time) {
          // Same-day with explicit slot times → emit a timed event in the
          // chalet's local timezone. OTAs that don't understand time-of-day
          // generally still see the event blocking the date.
          const dtStartLocal = toIcsLocalDateTime(b.check_in, b.check_in_time);
          const dtEndLocal = toIcsLocalDateTime(b.check_out, b.check_out_time);
          if (dtStartLocal && dtEndLocal) {
            dtstartLine = `DTSTART;TZID=${TZID}:${dtStartLocal}`;
            dtendLine = `DTEND;TZID=${TZID}:${dtEndLocal}`;
          }
        }
        if (!dtstartLine || !dtendLine) {
          // No times — block the whole day as an all-day event. iCal DTEND
          // is exclusive, so DTEND must be the day after.
          const start = toIcsDate(b.check_in);
          const next = addOneDay(b.check_in);
          if (start && next) {
            dtstartLine = `DTSTART;VALUE=DATE:${start}`;
            dtendLine = `DTEND;VALUE=DATE:${next}`;
          }
        }
      } else {
        // Overnight — emit as a multi-day all-day event. DTEND is the
        // checkout day (exclusive in iCal terms), which matches how this
        // app blocks the calendar internally.
        const start = toIcsDate(b.check_in);
        const end = toIcsDate(b.check_out);
        if (start && end) {
          dtstartLine = `DTSTART;VALUE=DATE:${start}`;
          dtendLine = `DTEND;VALUE=DATE:${end}`;
        }
      }

      if (!dtstartLine || !dtendLine) continue;

      push('BEGIN:VEVENT');
      push(`UID:booking-${b.id}@gilan-milan-chalet`);
      push(`DTSTAMP:${dtstamp}`);
      push(dtstartLine);
      push(dtendLine);
      // Public-friendly summary — no guest details. "Reserved" is the
      // convention used by Airbnb / Booking.com on their outbound feeds.
      push(`SUMMARY:${escapeText('Reserved')}`);
      push(`STATUS:${status}`);
      push('TRANSP:OPAQUE');
      push('END:VEVENT');
    }

    push('END:VCALENDAR');

    const body = lines.join('\r\n') + '\r\n';

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${propertyId}-bookings.ics"`);
    // 10 minutes of caching is a sensible compromise: most OTAs poll every
    // 15-60 minutes anyway, and stale data of a few minutes doesn't cause
    // double-bookings (the OTA also enforces availability on its side).
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600');
    res.status(200).send(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('iCal feed failed:', message);
    res.status(500).send('Failed to build iCal feed');
  }
}
