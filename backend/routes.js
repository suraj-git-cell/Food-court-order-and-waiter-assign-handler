import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import db from './db.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportsDir = path.join(__dirname, '..', 'reports');

const ensureReportsDir = () => {
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
};

const getNowIso = () => new Date().toISOString();

router.get('/items', (_req, res) => {
  const rows = db
    .prepare('SELECT id, name, price_cents FROM items ORDER BY name ASC')
    .all();
  res.json(rows);
});

router.post('/items', (req, res) => {
  const { name, price_cents } = req.body;
  if (!name || typeof price_cents !== 'number' || price_cents < 0) {
    return res.status(400).json({ error: 'name and positive price_cents required' });
  }
  const info = db.prepare('INSERT INTO items (name, price_cents) VALUES (?, ?)').run(name, price_cents);
  res.status(201).json({ id: info.lastInsertRowid, name, price_cents });
});

router.get('/customers', (_req, res) => {
  const rows = db.prepare('SELECT id, name, phone FROM customers ORDER BY id DESC LIMIT 100').all();
  res.json(rows);
});

router.post('/customers', (req, res) => {
  const { name, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const info = db.prepare('INSERT INTO customers (name, phone) VALUES (?, ?)').run(name, phone ?? null);
  res.status(201).json({ id: info.lastInsertRowid, name, phone: phone ?? null });
});

const normalizeStatus = (status) => (status === 'engaged' ? 'engaged' : 'free');

router.get('/waiters', (_req, res) => {
  const rows = db.prepare('SELECT id, name, phone, status FROM waiters ORDER BY name').all();
  res.json(rows);
});

router.post('/waiters', (req, res) => {
  const { name, phone, status } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const normalizedStatus = normalizeStatus(status);
  const info = db
    .prepare('INSERT INTO waiters (name, phone, status) VALUES (?, ?, ?)')
    .run(name, phone ?? null, normalizedStatus);
  res.status(201).json({ id: info.lastInsertRowid, name, phone: phone ?? null, status: normalizedStatus });
});

router.post('/waiters/login', (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone required' });
  const waiter = db.prepare('SELECT id, name, phone, status FROM waiters WHERE phone = ?').get(phone);
  if (!waiter) return res.status(401).json({ error: 'waiter not found' });
  res.json(waiter);
});

router.post('/waiters/:id/status', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'invalid waiter id' });
  const { status } = req.body;
  const normalizedStatus = normalizeStatus(status);
  const result = db.prepare('UPDATE waiters SET status = ? WHERE id = ?').run(normalizedStatus, id);
  if (result.changes === 0) return res.status(404).json({ error: 'waiter not found' });
  const updated = db.prepare('SELECT id, name, phone, status FROM waiters WHERE id = ?').get(id);
  res.json(updated);
});

router.get('/waiters/:id/orders', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'invalid waiter id' });
  const waiter = db.prepare('SELECT id FROM waiters WHERE id = ?').get(id);
  if (!waiter) return res.status(404).json({ error: 'waiter not found' });
  const limit = Math.min(parseInt(req.query.limit ?? '20', 10) || 20, 100);
  const orders = db
    .prepare(
      `SELECT o.id, o.table_number, o.total_cents, o.created_at,
              c.name AS customer_name, c.phone AS customer_phone
         FROM orders o
         LEFT JOIN customers c ON c.id = o.customer_id
        WHERE o.waiter_id = ?
        ORDER BY o.id DESC
        LIMIT ?`
    )
    .all(id, limit);

  const items = db
    .prepare(
      `SELECT oi.order_id, oi.quantity, oi.price_cents_at_order, it.name
         FROM order_items oi
         JOIN items it ON it.id = oi.item_id
        WHERE oi.order_id IN (
          SELECT id FROM orders WHERE waiter_id = ? ORDER BY id DESC LIMIT ?
        )`
    )
    .all(id, limit);

  const perOrder = new Map();
  for (const row of items) {
    if (!perOrder.has(row.order_id)) perOrder.set(row.order_id, []);
    perOrder.get(row.order_id).push({
      name: row.name,
      quantity: row.quantity,
      price_cents_at_order: row.price_cents_at_order
    });
  }

  const data = orders.map((order) => ({
    ...order,
    items: perOrder.get(order.id) ?? []
  }));

  res.json(data);
});

router.post('/orders', (req, res) => {
  const { table_number, customer, waiter_id, items } = req.body;
  if (!table_number || typeof table_number !== 'number') {
    return res.status(400).json({ error: 'table_number required' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items required' });
  }
  let customerId = null;
  if (customer && (customer.name || customer.phone)) {
    const existing =
      customer.phone && db.prepare('SELECT id FROM customers WHERE phone = ?').get(customer.phone);
    if (existing) {
      customerId = existing.id;
    } else {
      const info = db
        .prepare('INSERT INTO customers (name, phone) VALUES (?, ?)')
        .run(customer.name ?? null, customer.phone ?? null);
      customerId = info.lastInsertRowid;
    }
  }

  let waiterId = null;
  if (waiter_id) {
    const waiter = db.prepare('SELECT id FROM waiters WHERE id = ?').get(waiter_id);
    if (!waiter) return res.status(400).json({ error: 'waiter not found' });
    waiterId = waiter.id;
  }

  const getItem = db.prepare('SELECT id, name, price_cents FROM items WHERE id = ?');
  const orderItems = [];
  let total = 0;
  for (const line of items) {
    if (!line || typeof line.item_id !== 'number' || typeof line.quantity !== 'number') {
      return res.status(400).json({ error: 'invalid item line' });
    }
    const item = getItem.get(line.item_id);
    if (!item) return res.status(400).json({ error: `item not found: ${line.item_id}` });
    const qty = Math.max(line.quantity, 1);
    const lineTotal = qty * item.price_cents;
    total += lineTotal;
    orderItems.push({
      item_id: item.id,
      quantity: qty,
      price_cents_at_order: item.price_cents
    });
  }

  const now = getNowIso();
  const tx = db.transaction(() => {
    const orderInfo = db
      .prepare(
        'INSERT INTO orders (table_number, customer_id, waiter_id, total_cents, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(table_number, customerId, waiterId, total, now);
    const orderId = orderInfo.lastInsertRowid;
    const insertLine = db.prepare(
      'INSERT INTO order_items (order_id, item_id, quantity, price_cents_at_order) VALUES (?, ?, ?, ?)'
    );
    for (const oi of orderItems) {
      insertLine.run(orderId, oi.item_id, oi.quantity, oi.price_cents_at_order);
    }
    return orderId;
  });

  const orderId = tx();
  res.status(201).json({ id: orderId, total_cents: total, created_at: now });
});

router.get('/orders', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit ?? '20', 10) || 20, 100);
  const orders = db
    .prepare(
      `SELECT o.id, o.table_number, o.total_cents, o.created_at,
              c.name AS customer_name, c.phone AS customer_phone,
              w.name AS waiter_name, w.phone AS waiter_phone, w.status AS waiter_status
         FROM orders o
         LEFT JOIN customers c ON c.id = o.customer_id
         LEFT JOIN waiters w ON w.id = o.waiter_id
        ORDER BY o.id DESC
        LIMIT ?`
    )
    .all(limit);

  const orderItems = db
    .prepare(
      `SELECT oi.order_id, oi.quantity, oi.price_cents_at_order, it.name
         FROM order_items oi
         JOIN items it ON it.id = oi.item_id
        WHERE oi.order_id IN (SELECT id FROM orders ORDER BY id DESC LIMIT ?)`
    )
    .all(limit);

  const perOrder = new Map();
  for (const row of orderItems) {
    if (!perOrder.has(row.order_id)) perOrder.set(row.order_id, []);
    perOrder.get(row.order_id).push({
      name: row.name,
      quantity: row.quantity,
      price_cents_at_order: row.price_cents_at_order
    });
  }

  const data = orders.map((order) => ({
    ...order,
    items: perOrder.get(order.id) ?? []
  }));

  res.json(data);
});

router.get('/orders/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'bad id' });
  const order = db
    .prepare(
      `SELECT o.id, o.table_number, o.total_cents, o.created_at,
              c.name AS customer_name, c.phone AS customer_phone,
              w.name AS waiter_name, w.phone AS waiter_phone, w.status AS waiter_status
         FROM orders o
         LEFT JOIN customers c ON c.id = o.customer_id
         LEFT JOIN waiters w ON w.id = o.waiter_id
        WHERE o.id = ?`
    )
    .get(id);
  if (!order) return res.status(404).json({ error: 'not found' });
  const items = db
    .prepare(
      `SELECT oi.quantity, oi.price_cents_at_order, it.name
         FROM order_items oi
         JOIN items it ON it.id = oi.item_id
        WHERE oi.order_id = ?`
    )
    .all(id);
  res.json({ ...order, items });
});

const csvEscape = (value) => {
  const str = `${value ?? ''}`;
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

router.post('/day-end', (_req, res) => {
  const orders = db
    .prepare(
      `SELECT o.id, o.table_number, o.total_cents, o.created_at,
              c.name AS customer_name, c.phone AS customer_phone,
              w.name AS waiter_name, w.phone AS waiter_phone
         FROM orders o
         LEFT JOIN customers c ON c.id = o.customer_id
         LEFT JOIN waiters w ON w.id = o.waiter_id
        ORDER BY o.id ASC`
    )
    .all();

  const items = db
    .prepare(
      `SELECT oi.order_id, oi.quantity, oi.price_cents_at_order, it.name
         FROM order_items oi
         JOIN items it ON it.id = oi.item_id`
    )
    .all();

  const perOrder = new Map();
  for (const row of items) {
    if (!perOrder.has(row.order_id)) perOrder.set(row.order_id, []);
    perOrder.get(row.order_id).push(row);
  }

  // Prepare Excel data
  const excelData = [];
  
  // Add header row
  excelData.push([
    'Order ID',
    'Table Number',
    'Total (₹)',
    'Created At',
    'Customer Name',
    'Customer Phone',
    'Waiter Name',
    'Waiter Phone',
    'Items'
  ]);

  // Add data rows
  for (const order of orders) {
    const orderItems = perOrder.get(order.id) ?? [];
    const itemsStr = orderItems
      .map(
        (it) =>
          `${it.name} x ${it.quantity} = ₹${(it.price_cents_at_order * it.quantity / 100).toFixed(2)}`
      )
      .join(' | ');
    
    excelData.push([
      order.id,
      order.table_number,
      parseFloat((order.total_cents / 100).toFixed(2)),
      order.created_at,
      order.customer_name ?? '',
      order.customer_phone ?? '',
      order.waiter_name ?? '',
      order.waiter_phone ?? '',
      itemsStr
    ]);
  }

  // Create workbook and worksheet
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(excelData);
  
  // Set column widths for better readability
  ws['!cols'] = [
    { wch: 10 }, // Order ID
    { wch: 12 }, // Table Number
    { wch: 12 }, // Total
    { wch: 20 }, // Created At
    { wch: 20 }, // Customer Name
    { wch: 15 }, // Customer Phone
    { wch: 15 }, // Waiter Name
    { wch: 15 }, // Waiter Phone
    { wch: 50 }  // Items
  ];
  
  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Orders');

  ensureReportsDir();
  const timestamp = new Date().toISOString().replace(/[:]/g, '-').split('.')[0];
  const filename = `day_end_${timestamp}.xlsx`;
  const filePath = path.join(reportsDir, filename);
  
  // Save to disk for backup
  XLSX.writeFile(wb, filePath);

  // Clear orders after generating Excel
  db.transaction(() => {
    db.prepare('DELETE FROM order_items').run();
    db.prepare('DELETE FROM orders').run();
  })();

  // Generate Excel buffer for download
  const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // Send Excel as download
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(excelBuffer);
});

export default router;

