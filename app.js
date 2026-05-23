/* ── State ─────────────────────────────────────────────── */
let allItems = [];
let editingId = null;
let currentView = 'grid';
let imageDataUrl = '';

const STORAGE_KEY = 'vtuber_merch_v1';
const TYPE_OPTIONS = ['Acrylic Stand', 'Cheki Card', 'Plushie', 'Tapestry', 'Keychain', 'Pin Badge', 'Trading Card', 'Fan Book', 'Voice Pack', 'Other'];
const CURRENCY_OPTIONS = ['JPY', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'TWD', 'KRW'];

/* ── Init ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  bindEvents();
  render();
});

/* ── Data persistence ──────────────────────────────────── */
function loadData() {
  // Fall back to fetching the JSON file
  fetch('merch.json')
    .then(r => r.json())
    .then(data => { allItems = data; render(); })
    .catch(() => { allItems = []; render(); });
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(allItems));
}

function exportJson() {
  const blob = new Blob([JSON.stringify(allItems, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'merch.json'; a.click();
  URL.revokeObjectURL(url);
  toast('Exported merch.json');
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error();
      allItems = data;
      saveData();
      render();
      toast(`Imported ${data.length} items`);
    } catch { toast('Invalid JSON file'); }
  };
  reader.readAsText(file);
}

/* ── Render ────────────────────────────────────────────── */
function render() {
  updateStats();
  const filtered = getFiltered();
  if (currentView === 'grid') renderGrid(filtered);
  else renderTable(filtered);
}

function getFiltered() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const statusFilter = document.getElementById('statusFilter').value;
  const typeFilter = document.getElementById('typeFilter').value;
  const groupFilter = document.getElementById('groupFilter').value;

  return allItems.filter(item => {
    const matchQ = !q || item.name.toLowerCase().includes(q) || (item.group || '').toLowerCase().includes(q) || (item.notes || '').toLowerCase().includes(q);
    const matchStatus = !statusFilter || item.status === statusFilter;
    const matchType = !typeFilter || item.type === typeFilter;
    const matchGroup = !groupFilter || item.group === groupFilter;
    return matchQ && matchStatus && matchType && matchGroup;
  });
}

function updateStats() {
  const owned = allItems.filter(i => i.status === 'owned');
  const wishlist = allItems.filter(i => i.status === 'wishlist');
  const totalCost = owned.reduce((sum, i) => sum + (parseFloat(i.cost) || 0), 0);
  const groups = new Set(allItems.map(i => i.group).filter(Boolean));

  document.getElementById('statTotal').textContent = allItems.length;
  document.getElementById('statOwned').textContent = owned.length;
  document.getElementById('statWishlist').textContent = wishlist.length;

  // Update group filter
  const gf = document.getElementById('groupFilter');
  const prev = gf.value;
  gf.innerHTML = '<option value="">All groups</option>';
  [...groups].sort().forEach(g => {
    const o = document.createElement('option');
    o.value = g; o.textContent = g;
    if (g === prev) o.selected = true;
    gf.appendChild(o);
  });
}

function formatCostSummary(owned) {
  if (!owned.length) return '—';
  // Group by currency
  const byCurrency = {};
  owned.forEach(i => {
    if (!i.cost) return;
    const c = i.currency || 'JPY';
    byCurrency[c] = (byCurrency[c] || 0) + parseFloat(i.cost);
  });
  return Object.entries(byCurrency)
    .map(([c, v]) => `${formatNum(v)} ${c}`)
    .join(' / ');
}

function formatNum(n) {
  return n % 1 === 0 ? n.toLocaleString() : n.toFixed(2);
}

/* ── Grid View ─────────────────────────────────────────── */
function renderGrid(items) {
  const container = document.getElementById('content');
  container.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'grid';

  if (!items.length) {
    grid.innerHTML = `<div class="empty-state"><p>No items found</p><p>Try adjusting your filters or add a new item.</p></div>`;
  } else {
    items.forEach(item => grid.appendChild(createCard(item)));
  }
  container.appendChild(grid);
}

function createCard(item) {
  const card = document.createElement('div');
  card.className = 'card';

  const imgSection = item.image
    ? `<div class="card-image"><img src="${item.image}" alt="${item.name}" loading="lazy"></div>`
    : `<div class="card-image-placeholder">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        <span>No image</span>
      </div>`;

  card.innerHTML = `
    ${imgSection}
    <div class="card-body">
      <div class="card-badges">
        <span class="badge badge-${item.status === 'owned' ? 'owned' : 'wishlist'}">${item.status === 'owned' ? '✓ Owned' : '♡ Wishlist'}</span>
        <span class="badge badge-type">${item.type}</span>
      </div>
      <div class="card-name">${item.name}</div>
      ${item.group ? `<div class="card-group">${item.group}</div>` : ''}
      ${item.cost ? `<div class="card-cost">${formatNum(item.cost)} ${item.currency || 'JPY'}</div>` : ''}
      ${item.notes ? `<div class="card-notes">${item.notes}</div>` : ''}
    </div>
    <div class="card-actions">
      <button class="btn btn-ghost btn-sm" onclick="openEdit(${item.id})">Edit</button>
      <button class="btn btn-danger btn-sm" onclick="deleteItem(${item.id})">Delete</button>
    </div>`;
  return card;
}

/* ── Table View ────────────────────────────────────────── */
function renderTable(items) {
  const container = document.getElementById('content');
  container.innerHTML = '';

  if (!items.length) {
    container.innerHTML = `<div class="empty-state"><p>No items found</p><p>Try adjusting your filters or add a new item.</p></div>`;
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Image</th>
          <th>Name</th>
          <th>Group</th>
          <th>Type</th>
          <th>Status</th>
          <th>Cost</th>
          <th>Notes</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${items.map(item => `
          <tr>
            <td>
              <div class="table-thumb">
                ${item.image ? `<img src="${item.image}" alt="">` : '—'}
              </div>
            </td>
            <td><strong>${item.name}</strong></td>
            <td>${item.group || '—'}</td>
            <td><span class="badge badge-type">${item.type}</span></td>
            <td><span class="badge badge-${item.status === 'owned' ? 'owned' : 'wishlist'}">${item.status === 'owned' ? '✓ Owned' : '♡ Wishlist'}</span></td>
            <td>${item.cost ? `${formatNum(item.cost)} ${item.currency || 'JPY'}` : '—'}</td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:.8rem">${item.notes || '—'}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-ghost btn-sm" onclick="openEdit(${item.id})">Edit</button>
              <button class="btn btn-danger btn-sm" onclick="deleteItem(${item.id})">Delete</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  container.appendChild(wrap);
}

/* ── Modal ─────────────────────────────────────────────── */
function openAdd() {
  editingId = null;
  imageDataUrl = '';
  document.getElementById('modalTitle').textContent = 'Add Merch';
  document.getElementById('merch-form').reset();
  document.getElementById('imgPreview').innerHTML = uploadPlaceholderHTML();
  document.getElementById('modalOverlay').classList.add('open');
}

function openEdit(id) {
  const item = allItems.find(i => i.id === id);
  if (!item) return;
  editingId = id;
  imageDataUrl = item.image || '';

  document.getElementById('modalTitle').textContent = 'Edit Merch';
  document.getElementById('fName').value = item.name || '';
  document.getElementById('fGroup').value = item.group || '';
  document.getElementById('fType').value = item.type || '';
  document.getElementById('fStatus').value = item.status || 'owned';
  document.getElementById('fCost').value = item.cost || '';
  document.getElementById('fCurrency').value = item.currency || 'JPY';
  document.getElementById('fNotes').value = item.notes || '';

  const preview = document.getElementById('imgPreview');
  if (item.image) {
    preview.innerHTML = `<img src="${item.image}" style="max-height:140px;max-width:100%;object-fit:contain;border-radius:4px;margin-bottom:.5rem"><p>Click to change</p>`;
  } else {
    preview.innerHTML = uploadPlaceholderHTML();
  }
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

function uploadPlaceholderHTML() {
  return `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:.5rem"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><p>Click to upload image</p><p style="font-size:.7rem;margin-top:.2rem">PNG, JPG, WEBP</p>`;
}

function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    imageDataUrl = ev.target.result;
    document.getElementById('imgPreview').innerHTML = `<img src="${imageDataUrl}" style="max-height:140px;max-width:100%;object-fit:contain;border-radius:4px;margin-bottom:.5rem"><p>Click to change</p>`;
  };
  reader.readAsDataURL(file);
}

function saveItem() {
  const name = document.getElementById('fName').value.trim();
  if (!name) { document.getElementById('fName').focus(); return; }

  const item = {
    id: editingId || Date.now(),
    name,
    group: document.getElementById('fGroup').value.trim(),
    type: document.getElementById('fType').value,
    status: document.getElementById('fStatus').value,
    cost: parseFloat(document.getElementById('fCost').value) || 0,
    currency: document.getElementById('fCurrency').value,
    notes: document.getElementById('fNotes').value.trim(),
    image: imageDataUrl,
    dateAdded: editingId ? (allItems.find(i => i.id === editingId)?.dateAdded || today()) : today(),
  };

  if (editingId) {
    const idx = allItems.findIndex(i => i.id === editingId);
    allItems[idx] = item;
    toast('Item updated');
  } else {
    allItems.unshift(item);
    toast('Item added');
  }
  saveData();
  closeModal();
  render();
}

function deleteItem(id) {
  if (!confirm('Delete this item?')) return;
  allItems = allItems.filter(i => i.id !== id);
  saveData();
  render();
  toast('Item deleted');
}

function today() {
  return new Date().toISOString().split('T')[0];
}

/* ── Bind events ───────────────────────────────────────── */
function bindEvents() {
  // Search & filters
  document.getElementById('searchInput').addEventListener('input', render);
  document.getElementById('statusFilter').addEventListener('change', render);
  document.getElementById('typeFilter').addEventListener('change', render);
  document.getElementById('groupFilter').addEventListener('change', render);

  // Modal overlay click outside
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Image upload area
  document.getElementById('imgPreview').addEventListener('click', () => {
    document.getElementById('fileInput').click();
  });
  document.getElementById('fileInput').addEventListener('change', handleImageUpload);

  // Import
  document.getElementById('importFileInput').addEventListener('change', e => {
    if (e.target.files[0]) importJson(e.target.files[0]);
    e.target.value = '';
  });

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // Populate type filter & type select
  const tf = document.getElementById('typeFilter');
  const fs = document.getElementById('fType');
  TYPE_OPTIONS.forEach(t => {
    tf.innerHTML += `<option value="${t}">${t}</option>`;
    fs.innerHTML += `<option value="${t}">${t}</option>`;
  });

  // Currency options
  const curr = document.getElementById('fCurrency');
  CURRENCY_OPTIONS.forEach(c => {
    curr.innerHTML += `<option value="${c}">${c}</option>`;
  });
}

/* ── View toggle ───────────────────────────────────────── */
function setView(v) {
  currentView = v;
  document.getElementById('viewGrid').classList.toggle('active', v === 'grid');
  document.getElementById('viewTable').classList.toggle('active', v === 'table');
  render();
}

/* ── Toast ─────────────────────────────────────────────── */
function toast(msg) {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 2900);
}
