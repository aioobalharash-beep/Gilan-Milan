import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, adminOnly, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, adminOnly, (req: AuthRequest, res) => {
  // Key metrics
  const totalProperties = db.prepare("SELECT COUNT(*) as count FROM properties WHERE status = 'active'").get() as { count: number };
  const occupied = db.prepare("SELECT COUNT(DISTINCT property_id) as count FROM bookings WHERE status = 'checked-in'").get() as { count: number };
  const occupancyRate = totalProperties.count > 0 ? ((occupied.count / totalProperties.count) * 100).toFixed(1) : '0';

  const avgRate = db.prepare("SELECT COALESCE(AVG(nightly_rate), 0) as avg FROM bookings WHERE payment_status = 'paid'").get() as { avg: number };
  const monthlyRevenue = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM bookings WHERE payment_status = 'paid'").get() as { total: number };

  // Occupancy by property
  const propertyOccupancy = db.prepare(`
    SELECT p.name, p.id,
      (SELECT COUNT(*) FROM bookings b WHERE b.property_id = p.id AND b.status NOT IN ('cancelled')) as booking_count,
      (SELECT COALESCE(SUM(b.nights), 0) FROM bookings b WHERE b.property_id = p.id AND b.status NOT IN ('cancelled')) as total_nights
    FROM properties p WHERE p.status = 'active'
    ORDER BY total_nights DESC
  `).all() as any[];

  const maxNights = Math.max(...propertyOccupancy.map(p => p.total_nights), 1);
  const occupancyByProperty = propertyOccupancy.map(p => ({
    name: p.name,
    percentage: Math.round((p.total_nights / maxNights) * 100),
    bookings: p.booking_count,
  }));

  // Monthly revenue breakdown (simulated for chart)
  const revenueByMonth = [
    { month: 'JAN', actual: 24000, forecast: 32000 },
    { month: 'FEB', actual: 36000, forecast: 40000 },
    { month: 'MAR', actual: 42000, forecast: 44000 },
    { month: 'APR', actual: 52000, forecast: 48000 },
    { month: 'MAY', actual: 48000, forecast: 52000 },
    { month: 'JUN', actual: 56000, forecast: 60000 },
  ];

  // Reviews (static for now)
  const reviews = [
    { name: 'Sarah J.', stay: '4 nights in Al-Bustan', text: 'The service was impeccable. Every detail from the arrival to the private dining was handled with pure Omani hospitality.', rating: 5 },
    { name: 'Ahmed M.', stay: '2 nights in Coast View', text: 'Exceptional views and the modern luxury styling of the portal made booking very easy. Will return next month.', rating: 4 },
    { name: 'Elena R.', stay: '1 week in Royal Suite', text: 'A true desert sanctuary. The staff anticipated our needs before we even asked. Pure 5-star experience.', rating: 5 },
  ];

  res.json({
    stats: {
      occupancyRate: parseFloat(occupancyRate as string),
      avgNightlyRate: Math.round(avgRate.avg),
      monthlyRevenue: monthlyRevenue.total,
      guestSatisfaction: 4.9,
    },
    occupancyByProperty,
    revenueByMonth,
    reviews,
  });
});

export default router;
