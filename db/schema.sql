PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    price_cents INTEGER NOT NULL CHECK(price_cents >= 0)
);

CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY,
    name TEXT,
    phone TEXT
);

CREATE TABLE IF NOT EXISTS waiters (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'free' CHECK(status IN ('free', 'engaged'))
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY,
    table_number INTEGER NOT NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    waiter_id INTEGER REFERENCES waiters(id) ON DELETE SET NULL,
    total_cents INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES items(id),
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    price_cents_at_order INTEGER NOT NULL,
    PRIMARY KEY (order_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_waiter ON orders(waiter_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

