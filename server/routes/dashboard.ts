import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, adminOnly, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, adminOnly, (req: AuthRequest, res) => {
  // Revenue (sum of all paid bookings)
  const revenue = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM bookings WHERE payment_status = 'paid'").get() as { total: number };

  // Revenue last month (approximate for trend)
  const lastMonthRevenue = revenue.total * 0.88; // simulated prior period
  const revenueTrend = lastMonthRevenue > 0 ? Math.round(((revenue.total - lastMonthRevenue) / lastMonthRevenue) * 100) : 0;

  // Pending bookings
  const pendingBookings = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE status = 'pending'").get() as { count: number };

  // Occupancy
  const totalProperties = db.prepare("SELECT COUNT(*) as count FROM properties WHERE status = 'active'").get() as { count: number };
  const occupiedProperties = db.prepare("SELECT COUNT(DISTINCT property_id) as count FROM bookings WHERE status = 'checked-in'").get() as { count: number };
  const occupancyRate = totalProperties.count > 0 ? Math.round((occupiedProperties.count / totalProperties.count) * 100) : 0;

  // Next check-in
  const nextCheckIn = db.prepare(`
    SELECT b.*, p.name as property_name, p.type as property_type
    FROM bookings b
    LEFT JOIN properties p ON b.property_id = p.id
    WHERE b.status IN ('confirmed', 'pending')
    ORDER BY b.check_in ASC
    LIMIT 1
  `).get();

  // Recent bookings for calendar highlights
  const recentBookings = db.prepare(`
    SELECT b.check_in, b.check_out, b.guest_name, p.name as property_name
    FROM bookings b
    LEFT JOIN properties p ON b.property_id = p.id
    WHERE b.status NOT IN ('cancelled')
    ORDER BY b.check_in DESC
    LIMIT 10
  `).all();

  res.json({
    revenue: { total: revenue.total, trend: revenueTrend },
    pendingBookings: pendingBookings.count,
    occupancy: occupancyRate,
    totalProperties: totalProperties.count,
    nextCheckIn,
    recentBookings,
    userName: req.user?.name || 'Curator',
  });
});

export default router;
