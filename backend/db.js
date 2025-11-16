import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = path.join(__dirname, '..', 'db');
const dbFile = path.join(dbDir, 'foodcourt.db');
const schemaFile = path.join(dbDir, 'schema.sql');

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbFile);
db.pragma('journal_mode = WAL');

const ensureSchema = () => {
  const schemaSql = fs.readFileSync(schemaFile, 'utf8');
  db.exec(schemaSql);
};

const tableCount = db
  .prepare(
    "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name IN ('items','customers','orders','order_items','waiters')"
  )
  .get().c;

if (tableCount < 5) {
  ensureSchema();
}

const ensureWaiterStatusColumn = () => {
  const columns = db.prepare("PRAGMA table_info('waiters')").all();
  const hasStatus = columns.some((col) => col.name === 'status');
  if (!hasStatus) {
    db.exec("ALTER TABLE waiters ADD COLUMN status TEXT NOT NULL DEFAULT 'free'");
  }
};

ensureWaiterStatusColumn();

const seedItems = () => {
  const count = db.prepare('SELECT COUNT(*) AS c FROM items').get().c;
  if (count > 0) return;
  const insert = db.prepare('INSERT INTO items (name, price_cents) VALUES (?, ?)');
  const defaults = [
    ['Veg Sandwich', 12000],
    ['Masala Dosa', 15000],
    ['Pav Bhaji', 18000],
    ['Cold Coffee', 9000],
    ['Fresh Lime Soda', 7000],
    ['Paneer Tikka', 21000]
  ];
  const tx = db.transaction((rows) => rows.forEach((row) => insert.run(...row)));
  tx(defaults);
};

const seedWaiters = () => {
  const count = db.prepare('SELECT COUNT(*) AS c FROM waiters').get().c;
  if (count > 0) return;
  const insert = db.prepare('INSERT INTO waiters (name, phone, status) VALUES (?, ?, ?)');
  const defaults = [
    ['Asha', '9876543210', 'free'],
    ['Ravi', '9876512345', 'free'],
    ['Meena', '9876509876', 'free']
  ];
  const tx = db.transaction((rows) => rows.forEach((row) => insert.run(...row)));
  tx(defaults);
};

seedItems();
seedWaiters();

export default db;

