import { Router } from 'express';
import db from '../db.js';

const router = Router();

// Public: list active properties
router.get('/', (req, res) => {
  const properties = db.prepare("SELECT * FROM properties WHERE status = 'active' ORDER BY name").all();
  res.json(properties);
});

// Public: get single property
router.get('/:id', (req, res) => {
  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  if (!property) {
    res.status(404).json({ error: 'Property not found' });
    return;
  }
  res.json(property);
});

// Public: check availability
router.get('/:id/availability', (req, res) => {
  const { check_in, check_out } = req.query;
  if (!check_in || !check_out) {
    res.status(400).json({ error: 'check_in and check_out query params required' });
    return;
  }

  const conflict = db.prepare(`
    SELECT id FROM bookings
    WHERE property_id = ? AND status NOT IN ('cancelled', 'checked-out')
    AND check_in < ? AND check_out > ?
  `).get(req.params.id, check_out, check_in);

  res.json({ available: !conflict });
});

export default router;
