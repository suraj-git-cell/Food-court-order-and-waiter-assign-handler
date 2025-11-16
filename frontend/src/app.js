const apiBase = '/api';

const formatCurrency = (cents) => `₹${(cents / 100).toFixed(2)}`;

const state = {
  items: [],
  waiters: [],
  lines: []
};

let waiterStatusInterval = null;

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed ${url}`);
  return res.json();
}

async function bootstrapData() {
  const [items, waiters] = await Promise.all([
    fetchJson(`${apiBase}/items`),
    fetchJson(`${apiBase}/waiters`)
  ]);
  state.items = items;
  state.waiters = waiters;
}

function renderSelects() {
  renderItemSelect();
  renderWaiterSelect();
}

function renderItemSelect() {
  const itemSelect = document.getElementById('itemSelect');
  if (!itemSelect) return;
  itemSelect.innerHTML = '';
  state.items.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = String(item.id);
    opt.textContent = `${item.name} — ${formatCurrency(item.price_cents)}`;
    itemSelect.appendChild(opt);
  });
}

function renderWaiterSelect() {
  const waiterSelect = document.getElementById('waiterSelect');
  if (!waiterSelect) return;
  const previous = waiterSelect.value;
  waiterSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Unassigned';
  waiterSelect.appendChild(placeholder);
  state.waiters.forEach((waiter) => {
    const opt = document.createElement('option');
    opt.value = String(waiter.id);
    opt.textContent = `${waiter.name}${waiter.phone ? ` (${waiter.phone})` : ''} — ${
      waiter.status === 'engaged' ? 'Engaged' : 'Free'
    }`;
    if (waiter.status === 'engaged') {
      opt.disabled = true;
    }
    waiterSelect.appendChild(opt);
  });
  if (previous) {
    const canKeep = Array.from(waiterSelect.options).some(
      (opt) => opt.value === previous && !opt.disabled
    );
    if (canKeep) {
      waiterSelect.value = previous;
    }
  }
  renderWaiterStatuses();
}

function renderWaiterStatuses() {
  const container = document.getElementById('waiterStatusList');
  if (!container) return;
  container.innerHTML = '';
  if (!state.waiters.length) {
    container.textContent = 'No waiters setup';
    return;
  }
  state.waiters.forEach((waiter) => {
    const pill = document.createElement('div');
    pill.className = `waiter-pill ${waiter.status === 'engaged' ? 'engaged' : 'free'}`;
    pill.innerHTML = `<span class="status-dot"></span>${waiter.name}`;
    container.appendChild(pill);
  });
}

function renderLines() {
  const tbody = document.getElementById('orderLines');
  tbody.innerHTML = '';
  let total = 0;
  state.lines.forEach((line, idx) => {
    const lineTotal = line.price_cents * line.quantity;
    total += lineTotal;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${line.name}</td>
      <td class="right">${formatCurrency(line.price_cents)}</td>
      <td class="right">${line.quantity}</td>
      <td class="right">${formatCurrency(lineTotal)}</td>
      <td class="right">
        <button class="danger" data-idx="${idx}">Remove</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById('orderTotal').textContent = formatCurrency(total);
  document.querySelectorAll('button.danger').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const idx = Number(e.currentTarget.getAttribute('data-idx'));
      state.lines.splice(idx, 1);
      renderLines();
    });
  });
}

function resetForm() {
  document.getElementById('tableNumber').value = '';
  document.getElementById('customerName').value = '';
  document.getElementById('customerPhone').value = '';
  document.getElementById('waiterSelect').value = '';
  state.lines = [];
  renderLines();
}

async function submitOrder() {
  const tableNumber = parseInt(document.getElementById('tableNumber').value, 10);
  if (!tableNumber) {
    alert('Enter table number');
    return;
  }
  if (state.lines.length === 0) {
    alert('Add at least one item');
    return;
  }
  const waiterIdRaw = document.getElementById('waiterSelect').value;
  const payload = {
    table_number: tableNumber,
    waiter_id: waiterIdRaw ? Number(waiterIdRaw) : null,
    customer: {
      name: document.getElementById('customerName').value || null,
      phone: document.getElementById('customerPhone').value || null
    },
    items: state.lines.map((line) => ({
      item_id: line.item_id,
      quantity: line.quantity
    }))
  };
  const res = await fetch(`${apiBase}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(`Failed to create order: ${err.error || res.status}`);
    return;
  }
  await refreshOrders();
  await refreshWaiters();
  resetForm();
}

async function refreshOrders() {
  const orders = await fetchJson(`${apiBase}/orders?limit=20`);
  const container = document.getElementById('orders');
  container.innerHTML = '';
  orders.forEach((order) => {
    const div = document.createElement('div');
    div.className = 'order-card';
    const itemsList = order.items
      .map(
        (item) =>
          `${item.name} × ${item.quantity} • ${formatCurrency(item.price_cents_at_order * item.quantity)}`
      )
      .join('<br/>');
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:14px; align-items:center;">
        <div>
          <div><strong>#${order.id}</strong> • Table ${order.table_number}</div>
          <div style="font-size:13px; color:#4b5563;">
            ${order.customer_name || 'Walk-in'}
            ${order.customer_phone ? ` (${order.customer_phone})` : ''}
          </div>
          <div style="font-size:12px; color:#047857; margin-top:4px;">
            Waiter: ${order.waiter_name ? `${order.waiter_name}${order.waiter_phone ? ` (${order.waiter_phone})` : ''}` : 'Unassigned'}
          </div>
        </div>
        <div class="badge">${formatCurrency(order.total_cents)}</div>
      </div>
      <div style="margin-top:10px; font-size:14px; color:#1f2933;">${itemsList}</div>
    `;
    container.appendChild(div);
  });
}

async function refreshWaiters() {
  state.waiters = await fetchJson(`${apiBase}/waiters`);
  renderWaiterSelect();
}

function attachHandlers() {
  document.getElementById('addItemBtn').addEventListener('click', () => {
    const itemId = parseInt(document.getElementById('itemSelect').value, 10);
    if (!itemId) return;
    const qty = Math.max(parseInt(document.getElementById('itemQty').value, 10) || 1, 1);
    const item = state.items.find((i) => i.id === itemId);
    if (!item) return;
    const existing = state.lines.find((line) => line.item_id === itemId);
    if (existing) {
      existing.quantity += qty;
    } else {
      state.lines.push({
        item_id: item.id,
        name: item.name,
        price_cents: item.price_cents,
        quantity: qty
      });
    }
    renderLines();
  });
  document.getElementById('submitOrderBtn').addEventListener('click', submitOrder);
  document.getElementById('resetBtn').addEventListener('click', resetForm);
  document.getElementById('dayEndBtn').addEventListener('click', runDayEnd);
}

async function runDayEnd() {
  const confirmRun = window.confirm(
    'Day end will export all current orders to Excel and clear them. Continue?'
  );
  if (!confirmRun) return;
  const btn = document.getElementById('dayEndBtn');
  btn.disabled = true;
  try {
    const res = await fetch(`${apiBase}/day-end`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || 'Day end failed');
    }
    
    // Get filename from Content-Disposition header or use default
    const contentDisposition = res.headers.get('Content-Disposition');
    let filename = 'day_end_export.xlsx';
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="(.+)"/);
      if (match) filename = match[1];
    }
    
    // Download Excel file
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    alert('Day end complete! Excel file downloaded. All orders have been cleared.');
    resetForm();
    await refreshOrders();
    await refreshWaiters();
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

async function init() {
  try {
    await bootstrapData();
    renderSelects();
    attachHandlers();
    renderLines();
    startWaiterPolling();
    await refreshOrders();
  } catch (err) {
    console.error(err);
    alert('Failed to load data. Ensure backend is running.');
  }
}

function startWaiterPolling() {
  if (waiterStatusInterval) clearInterval(waiterStatusInterval);
  waiterStatusInterval = setInterval(() => {
    refreshWaiters().catch((err) => console.error('waiter poll failed', err));
  }, 15000);
}

init();

