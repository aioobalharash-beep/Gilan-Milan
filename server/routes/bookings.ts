import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { authMiddleware, adminOnly, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Public: Create a booking (client booking flow)
router.post('/', (req, res) => {
  const { property_id, guest_name, guest_phone, guest_email, check_in, check_out } = req.body;

  if (!property_id || !guest_name || !guest_phone || !check_in || !check_out) {
    res.status(400).json({ error: 'Missing required fields: property_id, guest_name, guest_phone, check_in, check_out' });
    return;
  }

  // Validate name
  if (guest_name.trim().length < 2) {
    res.status(400).json({ error: 'Name must be at least 2 characters' });
    return;
  }

  // Validate phone (Omani format)
  const phoneClean = guest_phone.replace(/\s/g, '');
  if (!/^\+?968?\d{8}$/.test(phoneClean) && !/^\d{8}$/.test(phoneClean)) {
    res.status(400).json({ error: 'Please provide a valid Omani phone number' });
    return;
  }

  // Validate dates
  const checkInDate = new Date(check_in);
  const checkOutDate = new Date(check_out);
  if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
    res.status(400).json({ error: 'Invalid date format' });
    return;
  }
  if (checkOutDate <= checkInDate) {
    res.status(400).json({ error: 'Check-out date must be after check-in date' });
    return;
  }

  const property = db.prepare('SELECT * FROM properties WHERE id = ? AND status = ?').get(property_id, 'active') as any;
  if (!property) {
    res.status(404).json({ error: 'Property not found' });
    return;
  }

  // Check availability
  const conflict = db.prepare(`
    SELECT id FROM bookings
    WHERE property_id = ? AND status NOT IN ('cancelled', 'checked-out')
    AND check_in < ? AND check_out > ?
  `).get(property_id, check_out, check_in);

  if (conflict) {
    res.status(409).json({ error: 'Property is not available for the selected dates' });
    return;
  }

  const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
  const total = (property.nightly_rate * nights) + property.security_deposit;

  const id = uuidv4();
  db.prepare(`
    INSERT INTO bookings (id, property_id, guest_name, guest_phone, guest_email, check_in, check_out, nights, nightly_rate, security_deposit, total_amount, status, payment_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'paid')
  `).run(id, property_id, guest_name.trim(), guest_phone, guest_email || null, check_in, check_out, nights, property.nightly_rate, property.security_deposit, total);

  // Also create a guest record
  const guestId = uuidv4();
  db.prepare(`
    INSERT INTO guests (id, name, phone, email, check_in, check_out, status, property_id, booking_id)
    VALUES (?, ?, ?, ?, ?, ?, 'upcoming', ?, ?)
  `).run(guestId, guest_name.trim(), guest_phone, guest_email || null, check_in, check_out, property_id, id);

  // Create a transaction
  const txId = uuidv4();
  db.prepare(`INSERT INTO transactions (id, type, description, amount, booking_id, date) VALUES (?, 'payment', ?, ?, ?, date('now'))`).run(
    txId, `Booking Payment - ${property.name}`, total, id
  );

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  res.status(201).json({ booking, property_name: property.name });
});

// Admin: List all bookings
router.get('/', authMiddleware, adminOnly, (req: AuthRequest, res) => {
  const { status, limit = 50, offset = 0 } = req.query;
  let query = 'SELECT b.*, p.name as property_name FROM bookings b LEFT JOIN properties p ON b.property_id = p.id';
  const params: any[] = [];

  if (status) {
    query += ' WHERE b.status = ?';
    params.push(status);
  }

  query += ' ORDER BY b.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const bookings = db.prepare(query).all(...params);
  const total = db.prepare('SELECT COUNT(*) as count FROM bookings').get() as { count: number };
  res.json({ bookings, total: total.count });
});

// Admin: Get single booking
router.get('/:id', authMiddleware, adminOnly, (req: AuthRequest, res) => {
  const booking = db.prepare('SELECT b.*, p.name as property_name FROM bookings b LEFT JOIN properties p ON b.property_id = p.id WHERE b.id = ?').get(req.params.id);
  if (!booking) {
    res.status(404).json({ error: 'Booking not found' });
    return;
  }
  res.json(booking);
});

// Admin: Update booking status
router.patch('/:id', authMiddleware, adminOnly, (req: AuthRequest, res) => {
  const { status, payment_status } = req.body;
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id) as any;
  if (!booking) {
    res.status(404).json({ error: 'Booking not found' });
    return;
  }

  if (status) {
    db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, req.params.id);
    // Update guest status accordingly
    const guestStatusMap: Record<string, string> = {
      'confirmed': 'upcoming',
      'checked-in': 'checked-in',
      'checked-out': 'completed',
      'cancelled': 'completed',
    };
    if (guestStatusMap[status]) {
      db.prepare('UPDATE guests SET status = ? WHERE booking_id = ?').run(guestStatusMap[status], req.params.id);
    }
  }
  if (payment_status) {
    db.prepare('UPDATE bookings SET payment_status = ? WHERE id = ?').run(payment_status, req.params.id);
  }

  const updated = db.prepare('SELECT b.*, p.name as property_name FROM bookings b LEFT JOIN properties p ON b.property_id = p.id WHERE b.id = ?').get(req.params.id);
  res.json(updated);
});

export default router;
