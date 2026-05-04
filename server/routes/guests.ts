import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, adminOnly, AuthRequest } from '../middleware/auth.js';

const router = Router();

// List guests
router.get('/', authMiddleware, adminOnly, (req: AuthRequest, res) => {
  const { status, search } = req.query;
  let query = 'SELECT g.*, p.name as property_name FROM guests g LEFT JOIN properties p ON g.property_id = p.id';
  const conditions: string[] = [];
  const params: any[] = [];

  if (status && status !== 'all') {
    conditions.push('g.status = ?');
    params.push(status);
  }
  if (search) {
    conditions.push('(g.name LIKE ? OR g.phone LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY g.check_in DESC';

  const guests = db.prepare(query).all(...params);
  res.json(guests);
});

// Get guest stats
router.get('/stats', authMiddleware, adminOnly, (req: AuthRequest, res) => {
  const checkedIn = db.prepare("SELECT COUNT(*) as count FROM guests WHERE status = 'checked-in'").get() as { count: number };
  const upcoming = db.prepare("SELECT COUNT(*) as count FROM guests WHERE status = 'upcoming'").get() as { count: number };
  const checkingOut = db.prepare("SELECT COUNT(*) as count FROM guests WHERE status = 'checking-out'").get() as { count: number };
  const completed = db.prepare("SELECT COUNT(*) as count FROM guests WHERE status = 'completed'").get() as { count: number };

  res.json({
    checkedIn: checkedIn.count,
    upcoming: upcoming.count,
    checkingOut: checkingOut.count,
    completed: completed.count,
    total: checkedIn.count + upcoming.count + checkingOut.count + completed.count,
  });
});

// Update guest status
router.patch('/:id', authMiddleware, adminOnly, (req: AuthRequest, res) => {
  const { status } = req.body;
  const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(req.params.id);
  if (!guest) {
    res.status(404).json({ error: 'Guest not found' });
    return;
  }

  db.prepare('UPDATE guests SET status = ? WHERE id = ?').run(status, req.params.id);
  const updated = db.prepare('SELECT g.*, p.name as property_name FROM guests g LEFT JOIN properties p ON g.property_id = p.id WHERE g.id = ?').get(req.params.id);
  res.json(updated);
});

export default router;
