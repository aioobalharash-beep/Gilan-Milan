import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { authMiddleware, adminOnly, AuthRequest } from '../middleware/auth.js';

const router = Router();

// List invoices
router.get('/', authMiddleware, adminOnly, (req: AuthRequest, res) => {
  const { status } = req.query;
  let query = 'SELECT * FROM invoices';
  const params: any[] = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }
  query += ' ORDER BY issued_date DESC';

  const invoices = db.prepare(query).all(...params);
  res.json(invoices);
});

// Get invoice stats
router.get('/stats', authMiddleware, adminOnly, (req: AuthRequest, res) => {
  const outstanding = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices WHERE status IN ('pending', 'overdue')").get() as { total: number };
  const paid = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices WHERE status = 'paid'").get() as { total: number };
  const pending = db.prepare("SELECT COUNT(*) as count FROM invoices WHERE status = 'pending'").get() as { count: number };
  const overdue = db.prepare("SELECT COUNT(*) as count FROM invoices WHERE status = 'overdue'").get() as { count: number };
  const total = db.prepare("SELECT COUNT(*) as count FROM invoices").get() as { count: number };
  const paidCount = db.prepare("SELECT COUNT(*) as count FROM invoices WHERE status = 'paid'").get() as { count: number };

  const healthRate = total.count > 0 ? ((paidCount.count / total.count) * 100).toFixed(1) : '0';

  res.json({
    outstanding: outstanding.total,
    totalPaid: paid.total,
    pendingCount: pending.count,
    overdueCount: overdue.count,
    healthRate: parseFloat(healthRate),
    awaitingAction: pending.count + overdue.count,
  });
});

// Get single invoice with items
router.get('/:id', authMiddleware, adminOnly, (req: AuthRequest, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(req.params.id);
  res.json({ ...invoice as any, items });
});

// Update invoice status / mark VAT compliant
router.patch('/:id', authMiddleware, adminOnly, (req: AuthRequest, res) => {
  const { status, vat_compliant } = req.body;
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }

  if (status !== undefined) {
    db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(status, req.params.id);
  }
  if (vat_compliant !== undefined) {
    db.prepare('UPDATE invoices SET vat_compliant = ? WHERE id = ?').run(vat_compliant ? 1 : 0, req.params.id);
  }

  const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(req.params.id);
  res.json({ ...updated as any, items });
});

// Create invoice
router.post('/', authMiddleware, adminOnly, (req: AuthRequest, res) => {
  const { guest_name, booking_ref, room_type, items } = req.body;

  if (!guest_name || !booking_ref || !room_type || !items?.length) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  const subtotal = items.reduce((sum: number, item: any) => sum + item.amount, 0);
  const vatAmount = subtotal * 0.05;
  const totalAmount = subtotal + vatAmount;

  const id = uuidv4();
  db.prepare(`
    INSERT INTO invoices (id, guest_name, booking_ref, room_type, subtotal, vat_amount, total_amount, status, vat_compliant)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 1)
  `).run(id, guest_name, booking_ref, room_type, subtotal, vatAmount, totalAmount);

  for (const item of items) {
    db.prepare('INSERT INTO invoice_items (invoice_id, description, amount) VALUES (?, ?, ?)').run(id, item.description, item.amount);
  }

  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  const savedItems = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(id);
  res.status(201).json({ ...invoice as any, items: savedItems });
});

export default router;
