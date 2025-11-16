# Open Air Food Court - Orders Web App

Minimal full-stack app to manage open-air food court orders: capture table number, customer details, waiter assignment, ordered items, and totals.

## Features
- Items catalog with prices (seeded menu, editable via API)
- Customers directory (auto-created from orders, optional manual creation)
- Waiter roster with live status (Free/Engaged) and assignment per order
- Order builder: table number, customer, waiter pick list with color status, multi-item cart, auto total
- Recent orders view showing items, total, and assigned waiter
- Waiter console (login with phone) to see assigned orders and toggle availability
- Day-end export button that saves all orders to Excel (.xlsx) and clears the day's tickets

## Tech
- Backend: Node.js, Express, better-sqlite3, xlsx (for Excel export)
- DB: SQLite (file `db/foodcourt.db`), schema in `db/schema.sql`
- Frontend: Vanilla HTML/JS

## Setup

1. Install Node.js 20+
   - Ubuntu:
     ```bash
     curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
     sudo apt-get install -y nodejs build-essential
     ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Run the server (dev with reload)
   ```bash
   npm run dev
   ```
   or production mode
   ```bash
   npm start
   ```

4. Open the apps
   - Ops console: `http://localhost:3000`
   - Waiter console: `http://localhost:3000/waiter` (log in with waiter phone, e.g. `9876543210`)

## Access from Multiple Devices

The server is configured to accept connections from other devices on the same network.

### On the Server Computer

When you start the server, it will display your local IP address in the terminal:
```
==================================================
Food Court Server Running!
==================================================
Local:    http://localhost:3000
Network:  http://192.168.1.100:3000

Access from other devices on the same network:
  - Ops Console:  http://192.168.1.100:3000
  - Waiter App:   http://192.168.1.100:3000/waiter
==================================================
```

### From Other Computers/Mobile Devices

1. **Ensure all devices are on the same Wi-Fi network** (same router/network)

2. **Find the server's IP address** (if not shown in terminal):
   - **Linux/Mac**: Run `hostname -I` or `ip addr show`
   - **Windows**: Run `ipconfig` and look for "IPv4 Address"

3. **Open a web browser** on your phone/tablet/other computer and visit:
   - **Ops Console**: `http://[SERVER_IP]:3000`
     - Example: `http://192.168.1.100:3000`
   - **Waiter App**: `http://[SERVER_IP]:3000/waiter`
     - Example: `http://192.168.1.100:3000/waiter`

### Firewall Configuration

If other devices can't connect, you may need to allow port 3000 through your firewall:

**Linux (UFW)**:
```bash
sudo ufw allow 3000/tcp
```

**Linux (firewalld)**:
```bash
sudo firewall-cmd --add-port=3000/tcp --permanent
sudo firewall-cmd --reload
```

**Windows**: Allow Node.js through Windows Firewall when prompted, or manually add port 3000.

### Mobile Device Tips

- Works on any smartphone or tablet with a web browser (Chrome, Safari, Firefox, etc.)
- No app installation needed - just use the browser
- The interface is responsive and works well on mobile screens
- Bookmark the URLs for quick access

## API
- `GET /api/items`
- `POST /api/items` → `{ name, price_cents }`
- `GET /api/customers`
- `POST /api/customers` → `{ name, phone? }`
- `GET /api/waiters`
- `POST /api/waiters` → `{ name, phone? }`
- `POST /api/waiters/login` → `{ phone }` returns waiter profile
- `POST /api/waiters/:id/status` → `{ status: "free" | "engaged" }`
- `GET /api/waiters/:id/orders?limit=25`
- `POST /api/orders` → `{ table_number, waiter_id?, customer: { name?, phone? }, items: [{ item_id, quantity }] }`
- `GET /api/orders?limit=20`
- `GET /api/orders/:id`
- `POST /api/day-end` → exports all orders to Excel file `reports/day_end_<timestamp>.xlsx`, clears `orders` + `order_items`

## Notes
- Prices stored in paise (cents). Frontend formats rupees.
- First launch seeds menu items and default waiters.
- Orders can be created without customer or waiter; those fields are optional.
- Excel exports are automatically downloaded to your computer and also saved in the `reports/` directory for backup.
