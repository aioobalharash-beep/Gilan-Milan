import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, adminOnly, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, adminOnly, (req: AuthRequest, res) => {
  const { limit = 20 } = req.query;
  const transactions = db.prepare('SELECT * FROM transactions ORDER BY date DESC, created_at DESC LIMIT ?').all(Number(limit));
  res.json(transactions);
});

export default router;
