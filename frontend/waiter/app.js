const apiBase = '/api';

const selectors = {
  loginCard: document.getElementById('loginCard'),
  dashboardCard: document.getElementById('dashboardCard'),
  loginPhone: document.getElementById('loginPhone'),
  loginBtn: document.getElementById('loginBtn'),
  waiterName: document.getElementById('waiterName'),
  waiterPhone: document.getElementById('waiterPhone'),
  waiterStatusBadge: document.getElementById('waiterStatusBadge'),
  waiterStatusText: document.getElementById('waiterStatusText'),
  ordersList: document.getElementById('ordersList'),
  ordersEmpty: document.getElementById('ordersEmpty'),
  refreshBtn: document.getElementById('refreshBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  markFreeBtn: document.getElementById('markFreeBtn'),
  markEngagedBtn: document.getElementById('markEngagedBtn')
};

let waiterSession = null;

const currency = (cents) => `₹${(cents / 100).toFixed(2)}`;

async function login(phone) {
  const res = await fetch(`${apiBase}/waiters/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Login failed');
  }
  return res.json();
}

async function fetchOrders(waiterId) {
  const res = await fetch(`${apiBase}/waiters/${waiterId}/orders?limit=25`);
  if (!res.ok) throw new Error('Failed to load orders');
  return res.json();
}

function saveSession(data) {
  waiterSession = data;
  localStorage.setItem('waiterSession', JSON.stringify(data));
}

function loadSession() {
  try {
    const raw = localStorage.getItem('waiterSession');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to parse session', err);
    return null;
  }
}

function clearSession() {
  waiterSession = null;
  localStorage.removeItem('waiterSession');
}

function showDashboard() {
  updateWaiterInfo();
  selectors.loginCard.style.display = 'none';
  selectors.dashboardCard.style.display = 'block';
  refreshOrders();
}

function updateWaiterInfo() {
  selectors.waiterName.textContent = waiterSession.name;
  selectors.waiterPhone.textContent = waiterSession.phone || 'N/A';
  updateStatusBadge(waiterSession.status);
}

function updateStatusBadge(status) {
  const normalized = status === 'engaged' ? 'engaged' : 'free';
  selectors.waiterStatusBadge.classList.remove('engaged', 'free');
  selectors.waiterStatusBadge.classList.add(normalized);
  selectors.waiterStatusText.textContent = normalized === 'engaged' ? 'Engaged' : 'Free';
}

function showLogin() {
  selectors.loginCard.style.display = 'block';
  selectors.dashboardCard.style.display = 'none';
}

async function refreshOrders() {
  if (!waiterSession) return;
  selectors.refreshBtn.disabled = true;
  try {
    const orders = await fetchOrders(waiterSession.id);
    renderOrders(orders);
  } catch (err) {
    alert(err.message);
  } finally {
    selectors.refreshBtn.disabled = false;
  }
}

function renderOrders(orders) {
  selectors.ordersList.innerHTML = '';
  if (!orders.length) {
    selectors.ordersEmpty.style.display = 'block';
    return;
  }
  selectors.ordersEmpty.style.display = 'none';
  for (const order of orders) {
    const div = document.createElement('div');
    div.className = 'order-card';
    const items = order.items
      .map((item) => `${item.name} × ${item.quantity} • ${currency(item.price_cents_at_order * item.quantity)}`)
      .join('<br/>');
    div.innerHTML = `
      <h4>Table ${order.table_number}</h4>
      <div class="meta">Order #${order.id} • ${new Date(order.created_at).toLocaleString()}</div>
      <div class="meta">Customer: ${order.customer_name || 'Walk-in'} ${
      order.customer_phone ? `(${order.customer_phone})` : ''
    }</div>
      <p style="margin:8px 0 0 0;">${items}</p>
      <p style="margin:10px 0 0 0; font-weight:600;">Total: ${currency(order.total_cents)}</p>
    `;
    selectors.ordersList.appendChild(div);
  }
}

function attachHandlers() {
  selectors.loginBtn.addEventListener('click', async () => {
    const phone = selectors.loginPhone.value.trim();
    if (!phone) {
      alert('Enter phone number');
      return;
    }
    selectors.loginBtn.disabled = true;
    try {
      const data = await login(phone);
      saveSession(data);
      showDashboard();
    } catch (err) {
      alert(err.message);
    } finally {
      selectors.loginBtn.disabled = false;
    }
  });

  selectors.logoutBtn.addEventListener('click', () => {
    clearSession();
    showLogin();
  });

  selectors.refreshBtn.addEventListener('click', refreshOrders);

  selectors.markFreeBtn.addEventListener('click', () => updateWaiterStatus('free'));
  selectors.markEngagedBtn.addEventListener('click', () => updateWaiterStatus('engaged'));
}

async function updateWaiterStatus(status) {
  if (!waiterSession) return;
  selectors.markFreeBtn.disabled = true;
  selectors.markEngagedBtn.disabled = true;
  try {
    const res = await fetch(`${apiBase}/waiters/${waiterSession.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update status');
    }
    const updated = await res.json();
    saveSession(updated);
    updateWaiterInfo();
  } catch (err) {
    alert(err.message);
  } finally {
    selectors.markFreeBtn.disabled = false;
    selectors.markEngagedBtn.disabled = false;
  }
}

function init() {
  attachHandlers();
  const existing = loadSession();
  if (existing) {
    waiterSession = existing;
    showDashboard();
  }
}

init();

