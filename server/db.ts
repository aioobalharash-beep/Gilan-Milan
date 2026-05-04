import Database from 'better-sqlite3';
import bcryptjs from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'woody-chalete.db');

const db = new Database(dbPath);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'client')),
      phone TEXT,
      avatar TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      area_sqm INTEGER,
      nightly_rate REAL NOT NULL,
      security_deposit REAL DEFAULT 0,
      description TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'maintenance', 'inactive')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL REFERENCES properties(id),
      guest_name TEXT NOT NULL,
      guest_phone TEXT NOT NULL,
      guest_email TEXT,
      check_in TEXT NOT NULL,
      check_out TEXT NOT NULL,
      nights INTEGER NOT NULL,
      nightly_rate REAL NOT NULL,
      security_deposit REAL DEFAULT 0,
      total_amount REAL NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled')),
      payment_status TEXT DEFAULT 'pending' CHECK(payment_status IN ('pending', 'paid', 'refunded', 'partial')),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS guests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      check_in TEXT NOT NULL,
      check_out TEXT NOT NULL,
      status TEXT DEFAULT 'upcoming' CHECK(status IN ('checked-in', 'upcoming', 'checking-out', 'completed')),
      avatar TEXT,
      property_id TEXT REFERENCES properties(id),
      booking_id TEXT REFERENCES bookings(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      guest_name TEXT NOT NULL,
      booking_ref TEXT NOT NULL,
      room_type TEXT NOT NULL,
      subtotal REAL NOT NULL,
      vat_amount REAL NOT NULL,
      total_amount REAL NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'overdue')),
      vat_compliant INTEGER DEFAULT 0,
      issued_date TEXT DEFAULT (date('now')),
      due_date TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id TEXT NOT NULL REFERENCES invoices(id),
      description TEXT NOT NULL,
      amount REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('refund', 'payment')),
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      booking_id TEXT REFERENCES bookings(id),
      date TEXT DEFAULT (date('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  seedData();
}

function seedData() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCount.count > 0) return;

  const passwordHash = bcryptjs.hashSync('admin123', 10);
  const clientHash = bcryptjs.hashSync('guest123', 10);

  // Users
  db.prepare(`INSERT INTO users (id, name, email, password, role, phone) VALUES (?, ?, ?, ?, ?, ?)`).run(
    'u1', 'Woody Chalete Admin', 'akwakhhwwdyman@gmail.com', passwordHash, 'admin', '+968 7921 0323'
  );
  db.prepare(`INSERT INTO users (id, name, email, password, role, phone) VALUES (?, ?, ?, ?, ?, ?)`).run(
    'u2', 'Salim Al-Harthy', 'salim@guest.com', clientHash, 'client', '+968 9200 0002'
  );

  // Properties
  const properties = [
    ['p1', 'Woody Chalete', 'Luxury Chalet', 12, 850, 120, 50, 'Premium luxury chalet'],
    ['p2', 'Al-Bustan Villa', 'Deluxe Villa', 8, 620, 180, 75, 'Exclusive beachfront villa'],
    ['p3', 'Royal Suite A', 'Royal Suite', 4, 320, 250, 100, 'Opulent royal suite with private pool'],
    ['p4', 'Coast View Chalet', 'Ocean Chalet', 6, 480, 150, 60, 'Stunning ocean view chalet'],
  ];
  for (const p of properties) {
    db.prepare(`INSERT INTO properties (id, name, type, capacity, area_sqm, nightly_rate, security_deposit, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(...p);
  }

  // Bookings
  const bookings = [
    ['b1', 'p1', 'Ahmed Al-Bakri', '+968 9123 4567', 'ahmed.b@mail.com', '2024-10-14', '2024-10-18', 4, 120, 50, 530, 'confirmed', 'paid'],
    ['b2', 'p2', 'Sarah Henderson', '+968 9788 1234', 'sarah.h@mail.com', '2024-10-20', '2024-10-22', 2, 180, 75, 435, 'pending', 'pending'],
    ['b3', 'p3', 'Marcus Vane', '+968 9345 6789', 'marcus@mail.com', '2024-10-14', '2024-10-16', 2, 250, 100, 600, 'checked-in', 'paid'],
    ['b4', 'p1', 'Nasser Al-Harthy', '+968 9555 1234', 'nasser@mail.com', '2024-10-10', '2024-10-12', 2, 120, 50, 290, 'confirmed', 'paid'],
    ['b5', 'p4', 'Sara Williams', '+968 9666 5678', 'sara.w@mail.com', '2024-10-15', '2024-10-20', 5, 150, 60, 810, 'confirmed', 'paid'],
    ['b6', 'p2', 'Khalid Al-Harthy', '+968 9777 9999', 'khalid@mail.com', '2024-10-21', '2024-10-24', 3, 180, 75, 615, 'pending', 'pending'],
    ['b7', 'p3', 'Fatima Al-Zahra', '+968 9888 1111', 'fatima@mail.com', '2024-10-25', '2024-10-27', 2, 250, 100, 600, 'pending', 'pending'],
    ['b8', 'p1', 'Salim Al-Harthy', '+968 9200 0002', 'salim@guest.com', '2024-10-24', '2024-10-27', 3, 120, 50, 410, 'confirmed', 'paid'],
  ];
  for (const b of bookings) {
    db.prepare(`INSERT INTO bookings (id, property_id, guest_name, guest_phone, guest_email, check_in, check_out, nights, nightly_rate, security_deposit, total_amount, status, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...b);
  }

  // Guests
  const guests = [
    ['g1', 'Ahmed Al-Bakri', '+968 9123 4567', 'ahmed.b@mail.com', '2024-10-14', '2024-10-18', 'checked-in', 'https://i.pravatar.cc/150?u=ahmed', 'p1', 'b1'],
    ['g2', 'Sarah Henderson', '+968 9788 1234', 'sarah.h@mail.com', '2024-10-20', '2024-10-22', 'upcoming', 'https://i.pravatar.cc/150?u=sarah', 'p2', 'b2'],
    ['g3', 'Marcus Vane', '+968 9345 6789', 'marcus@mail.com', '2024-10-14', '2024-10-16', 'checking-out', 'https://i.pravatar.cc/150?u=marcus', 'p3', 'b3'],
    ['g4', 'Nasser Al-Harthy', '+968 9555 1234', 'nasser@mail.com', '2024-10-10', '2024-10-12', 'completed', 'https://i.pravatar.cc/150?u=nasser', 'p1', 'b4'],
    ['g5', 'Sara Williams', '+968 9666 5678', 'sara.w@mail.com', '2024-10-15', '2024-10-20', 'upcoming', 'https://i.pravatar.cc/150?u=sara', 'p4', 'b5'],
  ];
  for (const g of guests) {
    db.prepare(`INSERT INTO guests (id, name, phone, email, check_in, check_out, status, avatar, property_id, booking_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...g);
  }

  // Invoices
  const invoices = [
    ['inv1', 'Ahmed Al-Said', '#NK-8829', 'Deluxe Villa', 840, 42, 882, 'pending', 0, '2024-10-20', '2024-11-20'],
    ['inv2', 'Salma bin Rashid', '#NK-9012', 'Ocean Suite', 1220.50, 61.025, 1281.525, 'pending', 0, '2024-10-18', '2024-11-18'],
    ['inv3', 'Khalid Al-Harthy', '#NK-8801', 'Royal Suite', 1350, 67.5, 1417.5, 'paid', 1, '2024-10-24', '2024-11-24'],
    ['inv4', 'Nasser Al-Harthy', '#NK-8790', 'Luxury Chalet', 240, 12, 252, 'paid', 1, '2024-10-12', '2024-11-12'],
    ['inv5', 'Sara Williams', '#NK-9045', 'Ocean Chalet', 750, 37.5, 787.5, 'overdue', 0, '2024-09-15', '2024-10-15'],
  ];
  for (const inv of invoices) {
    db.prepare(`INSERT INTO invoices (id, guest_name, booking_ref, room_type, subtotal, vat_amount, total_amount, status, vat_compliant, issued_date, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...inv);
  }

  // Invoice items for inv3 (the preview one)
  db.prepare(`INSERT INTO invoice_items (invoice_id, description, amount) VALUES (?, ?, ?)`).run('inv3', 'Stay Charges - Royal Suite (3 Nights)', 1200);
  db.prepare(`INSERT INTO invoice_items (invoice_id, description, amount) VALUES (?, ?, ?)`).run('inv3', 'Airport Transfer Service', 150);

  // Transactions
  const transactions = [
    ['t1', 'refund', 'Booking Refund', -45, 'b4', '2024-10-08'],
    ['t2', 'payment', 'Stay Payment', 320, 'b1', '2024-10-07'],
    ['t3', 'payment', 'Advance Payment', 615, 'b6', '2024-10-05'],
    ['t4', 'payment', 'Full Payment', 410, 'b8', '2024-10-03'],
    ['t5', 'refund', 'Partial Refund', -25, 'b2', '2024-10-01'],
  ];
  for (const t of transactions) {
    db.prepare(`INSERT INTO transactions (id, type, description, amount, booking_id, date) VALUES (?, ?, ?, ?, ?, ?)`).run(...t);
  }
}

export default db;
