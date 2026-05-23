/* ═══════════════════════════════════════════════════════
   Merch Archive — app.js
   Supabase-backed multi-user merch tracker
   ═══════════════════════════════════════════════════════ */

/* ── Supabase client ──────────────────────────────────── */
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

/* ── App state ────────────────────────────────────────── */
let currentUser   = null;
let isSuperuser   = false;
let allItems      = [];       // rows from `merch` table
let userStatuses  = {};       // { merch_id: 'owned'|'wishlist' }
let editingId     = null;
let currentView   = 'grid';

const TYPE_OPTIONS     = ['Acrylic Stand','Cheki Card','Plushie','Tapestry','Keychain','Can Badge','Trading Card','Voice Pack','Other'];
const CURRENCY_OPTIONS = ['JPY','USD','EUR','GBP','AUD','CAD','SGD','TWD','KRW'];

/* ══════════════════════════════════════════════════════
   BOOTSTRAP
   ══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  populateSelects();
  bindEvents();

  // Check for existing session
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await onSignedIn(session.user);
  } else {
    showScreen('auth');
  }

  // Listen for auth changes (e.g. email confirmation redirects)
  sb.auth.onAuthStateChange(async (_event, session) => {
    if (session) {
      await onSignedIn(session.user);
    } else {
      currentUser = null;
      isSuperuser = false;
      showScreen('auth');
    }
  });
});

/* ══════════════════════════════════════════════════════
   AUTH
   ══════════════════════════════════════════════════════ */
function switchTab(tab) {
  document.getElementById('formLogin').style.display  = tab === 'login'  ? '' : 'none';
  document.getElementById('formSignup').style.display = tab === 'signup' ? '' : 'none';
  document.getElementById('tabLogin').classList.toggle('active',  tab === 'login');
  document.getElementById('tabSignup').classList.toggle('active', tab === 'signup');
  clearAuthMessage();
}

// Convert a username to a fake internal email Supabase accepts
function usernameToEmail(username) {
  return username.toLowerCase() + '@speciale.co';
}

function validateUsername(username) {
  if (!username) return 'Please enter a username.';
  if (username.length < 3) return 'Username must be at least 3 characters.';
  if (username.length > 30) return 'Username must be 30 characters or fewer.';
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return 'Username can only contain letters, numbers, and underscores.';
  return null;
}

async function handleLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!username || !password) return showAuthError('Please enter your username and password.');

  setAuthLoading('loginBtn', true);
  const { error } = await sb.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  setAuthLoading('loginBtn', false);

  if (error) {
    // Translate Supabase's email-specific error messages into username-friendly ones
    if (error.message.includes('Invalid login')) showAuthError('Incorrect username or password.');
    else showAuthError(error.message);
  }
  // success is handled by onAuthStateChange
}

async function handleSignup() {
  const username = document.getElementById('signupUsername').value.trim();
  const password = document.getElementById('signupPassword').value;
  const confirm  = document.getElementById('signupConfirm').value;

  const usernameError = validateUsername(username);
  if (usernameError) return showAuthError(usernameError);
  if (!password) return showAuthError('Please enter a password.');
  if (password !== confirm) return showAuthError('Passwords do not match.');
  if (password.length < 6) return showAuthError('Password must be at least 6 characters.');

  setAuthLoading('signupBtn', true);
  const { error } = await sb.auth.signUp({
    email: usernameToEmail(username),
    password,
    options: {
      data: { username }, // store the display username in user metadata
    },
  });
  setAuthLoading('signupBtn', false);

  if (error) {
    if (error.message.includes('already registered')) showAuthError('That username is already taken.');
    else showAuthError(error.message);
  } else {
    showAuthSuccess('Account created! You can now sign in.');
    switchTab('login');
    document.getElementById('loginUsername').value = username;
  }
}

async function handleLogout() {
  await sb.auth.signOut();
}

async function onSignedIn(user) {
  currentUser = user;
  // username is stored in metadata; fall back to stripping the fake domain from email
  currentUser.username = user.user_metadata?.username
    || user.email.replace('@speciale.co', '');
  isSuperuser = user.email === usernameToEmail(SUPERUSER_USERNAME);
  await loadAll();
  applyPermissions();
  showScreen('app');
}

/* ══════════════════════════════════════════════════════
   DATA — MERCH (superuser read/write, all users read)
   ══════════════════════════════════════════════════════ */
async function loadAll() {
  // Load catalogue
  const { data: items, error: e1 } = await sb
    .from('merch')
    .select('*');

  if (e1) { toast('Failed to load merch: ' + e1.message, true); return; }
  allItems = items || [];

  // Load this user's statuses
  const { data: statuses, error: e2 } = await sb
    .from('user_statuses')
    .select('merch_id, status')
    .eq('user_id', currentUser.id);

  if (e2) { toast('Failed to load your statuses: ' + e2.message, true); return; }
  userStatuses = {};
  (statuses || []).forEach(s => { userStatuses[s.merch_id] = s.status; });

  render();
}

/* ── Toggle owned / wishlist (all users) ──────────────── */
async function cycleStatus(itemId) {
  const current = userStatuses[itemId] || 'none';
  const next = current === 'none' ? 'owned' : current === 'owned' ? 'wishlist' : 'none';

  // Optimistic UI update
  userStatuses[itemId] = next;
  render();

  if (next === 'none') {
    const { error } = await sb
      .from('user_statuses')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('merch_id', itemId);
    if (error) { toast('Error updating status', true); await loadAll(); }
  } else {
    const { error } = await sb
      .from('user_statuses')
      .upsert({ user_id: currentUser.id, merch_id: itemId, status: next },
               { onConflict: 'user_id,merch_id' });
    if (error) { toast('Error updating status', true); await loadAll(); }
  }
}

/* ── Add / edit item (superuser only) ────────────────── */
async function saveItem() {
  const series = document.getElementById('fSeries').value.trim();
  if (!series) { document.getElementById('fSeries').focus(); return; }

  setSaveLoading(true);

  const payload = {
    series,
    liver:  document.getElementById('fLiver').value.trim(),
    type:        document.getElementById('fType').value,
    cost:        parseFloat(document.getElementById('fCost').value) || 0,
    currency:    document.getElementById('fCurrency').value,
    image:       document.getElementById('fImage').value.trim(),
  };

  let error;
  if (editingId) {
    ({ error } = await sb.from('merch').update(payload).eq('id', editingId));
  } else {
    ({ error } = await sb.from('merch').insert(payload));
  }

  setSaveLoading(false);
  if (error) { toast('Save failed: ' + error.message, true); return; }

  toast(editingId ? 'Item updated' : 'Item added');
  closeModal();
  await loadAll();
}

/* ── Delete item (superuser only) ─────────────────────── */
async function deleteItem(id) {
  if (!confirm('Delete this item? This cannot be undone.')) return;
  const { error } = await sb.from('merch').delete().eq('id', id);
  if (error) { toast('Delete failed: ' + error.message, true); return; }
  toast('Item deleted');
  await loadAll();
}

/* ── Export JSON ──────────────────────────────────────── */
function exportJson() {
  const blob = new Blob([JSON.stringify(allItems, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'merch.json'; a.click();
  URL.revokeObjectURL(url);
  toast('Exported merch.json');
}

/* ── Import JSON (superuser only) ─────────────────────── */
function importJson(file) {
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error();
      // Upsert all rows
      const { error } = await sb.from('merch').upsert(data);
      if (error) throw error;
      await loadAll();
      toast(`Imported ${data.length} items`);
    } catch (err) {
      toast('Import failed: ' + (err.message || 'Invalid file'), true);
    }
  };
  reader.readAsText(file);
}

/* ══════════════════════════════════════════════════════
   RENDER
   ══════════════════════════════════════════════════════ */
function render() {
  updateStats();
  updateLiverFilter();
  const filtered = getFiltered();
  if (currentView === 'grid') renderGrid(filtered);
  else renderTable(filtered);
}

function getFiltered() {
  const q           = document.getElementById('searchInput').value.toLowerCase();
  const statusFilter = document.getElementById('statusFilter').value;
  const typeFilter   = document.getElementById('typeFilter').value;
  const liverFilter  = document.getElementById('liverFilter').value;

  return allItems.filter(item => {
    const myStatus = userStatuses[item.id] || 'none';
    const matchQ      = !q || item.series.toLowerCase().includes(q)
                          || (item.liver || '').toLowerCase().includes(q)
                          || (item.notes || '').toLowerCase().includes(q);
    const matchStatus = !statusFilter || myStatus === statusFilter;
    const matchType   = !typeFilter || item.type === typeFilter;
    const matchLiver  = !liverFilter || item.liver === liverFilter;
    return matchQ && matchStatus && matchType && matchLiver;
  });
}

function updateStats() {
  const myOwned = allItems.filter(i => userStatuses[i.id] === 'owned');
  const myWishlist = allItems.filter(i => userStatuses[i.id] === 'wishlist');

  document.getElementById('statTotal').textContent = allItems.length;
  document.getElementById('statOwned').textContent = myOwned.length;
  document.getElementById('statWishlist').textContent = myWishlist.length;
}

function updateLiverFilter() {
  const gf   = document.getElementById('liverFilter');
  const prev = gf.value;
  const livers = [...new Set(allItems.map(i => i.liver).filter(Boolean))].sort();
  gf.innerHTML = '<option value="">All livers</option>';
  livers.forEach(g => {
    const o = document.createElement('option');
    o.value = g; o.textContent = g;
    if (g === prev) o.selected = true;
    gf.appendChild(o);
  });
}

/* ── Grid ─────────────────────────────────────────────── */
function renderGrid(items) {
  const container = document.getElementById('content');
  container.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'grid';

  if (!items.length) {
    grid.innerHTML = `<div class="empty-state"><p>No items found</p><p>Try adjusting your filters${isSuperuser ? ' or add a new item' : ''}.</p></div>`;
  } else {
    items.forEach(item => grid.appendChild(createCard(item)));
  }
  container.appendChild(grid);
}

function createCard(item) {
  const myStatus = userStatuses[item.id] || 'none';
  const card = document.createElement('div');
  card.className = 'card';

  const imgHtml = item.image
    ? `<img class="card-image" src="${item.image}" alt="${item.name}" loading="lazy">`
    : `<div class="card-image-placeholder">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        <span>No image</span>
      </div>`;

  const statusLabel = myStatus === 'owned' ? '✓ Owned' : myStatus === 'wishlist' ? '♡ Wishlist' : '+ Track';
  const toggleClass = myStatus === 'owned' ? 'is-owned' : myStatus === 'wishlist' ? 'is-wishlist' : '';

  const superActions = isSuperuser
    ? `<div class="card-actions">
        <button class="btn btn-ghost btn-sm" onclick="openEdit(${item.id})">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteItem(${item.id})">Delete</button>
       </div>`
    : '';

  card.innerHTML = `
    ${imgHtml}
    <div class="card-body">
      <div class="card-badges">
        <span class="badge badge-${myStatus === 'none' ? 'none' : myStatus}">${myStatus === 'owned' ? '✓ Owned' : myStatus === 'wishlist' ? '♡ Wishlist' : '— Untracked'}</span>
        <span class="badge badge-type">${item.type}</span>
      </div>
      <div class="card-name">${item.series}</div>
      ${item.liver ? `<div class="card-group">${item.liver}</div>` : ''}
      ${item.cost ? `<div class="card-cost">${fmtNum(item.cost)} ${item.currency || 'JPY'}</div>` : ''}
    </div>
    <button class="status-toggle ${toggleClass}" onclick="cycleStatus(${item.id})">
      ${statusLabel} <span style="font-size:.7rem;opacity:.7">· click to cycle</span>
    </button>
    ${superActions}`;
  return card;
}

/* ── Table ────────────────────────────────────────────── */
function renderTable(items) {
  const container = document.getElementById('content');
  container.innerHTML = '';

  if (!items.length) {
    container.innerHTML = `<div class="empty-state"><p>No items found</p><p>Try adjusting your filters.</p></div>`;
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th></th><th>Name</th><th>Liver</th><th>Type</th>
          <th>My Status</th><th>Cost</th><th>Notes</th>
          ${isSuperuser ? '<th></th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${items.map(item => {
          const myStatus = userStatuses[item.id] || 'none';
          const toggleClass = myStatus === 'owned' ? 'is-owned' : myStatus === 'wishlist' ? 'is-wishlist' : '';
          return `
          <tr>
            <td>${item.image
              ? `<img class="table-thumb" src="${item.image}" alt="">`
              : `<div class="table-thumb-placeholder">?</div>`}
            </td>
            <td><strong>${item.series}</strong></td>
            <td>${item.liver || '—'}</td>
            <td><span class="badge badge-type">${item.type}</span></td>
            <td>
              <button class="status-toggle ${toggleClass}" style="border-radius:999px;padding:.2rem .7rem;font-size:.72rem;width:auto"
                onclick="cycleStatus(${item.id})">
                ${myStatus === 'owned' ? '✓ Owned' : myStatus === 'wishlist' ? '♡ Wishlist' : '+ Track'}
              </button>
            </td>
            <td style="white-space:nowrap">${item.cost ? `${fmtNum(item.cost)} ${item.currency || 'JPY'}` : '—'}</td>
            ${isSuperuser ? `<td style="white-space:nowrap">
              <button class="btn btn-ghost btn-sm" onclick="openEdit(${item.id})">Edit</button>
              <button class="btn btn-danger btn-sm" onclick="deleteItem(${item.id})">Delete</button>
            </td>` : ''}
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  container.appendChild(wrap);
}

/* ══════════════════════════════════════════════════════
   MODAL (superuser only)
   ══════════════════════════════════════════════════════ */
function openAdd() {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'Add Merch';
  document.getElementById('merch-form').reset();
  document.getElementById('modalOverlay').classList.add('open');
}

function openEdit(id) {
  const item = allItems.find(i => i.id === id);
  if (!item) return;
  editingId = id;
  document.getElementById('modalTitle').textContent = 'Edit Merch';
  document.getElementById('fImage').value    = item.image    || '';
  document.getElementById('fSeries').value     = item.series     || '';
  document.getElementById('fLiver').value    = item.liver || '';
  document.getElementById('fType').value     = item.type     || '';
  document.getElementById('fCost').value     = item.cost     || '';
  document.getElementById('fCurrency').value = item.currency || 'JPY';
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

/* ══════════════════════════════════════════════════════
   PERMISSIONS
   ══════════════════════════════════════════════════════ */
function applyPermissions() {
  document.getElementById('headerEmail').textContent = currentUser.username;
  document.getElementById('superBadge').style.display = isSuperuser ? '' : 'none';
  document.getElementById('btnAdd').style.display    = isSuperuser ? '' : 'none';
  document.getElementById('btnImport').style.display = isSuperuser ? '' : 'none';
  document.getElementById('btnExport').style.display = isSuperuser ? '' : 'none';
}

/* ══════════════════════════════════════════════════════
   UTILITY
   ══════════════════════════════════════════════════════ */
function showScreen(screen) {
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('authPage').style.display = screen === 'auth' ? '' : 'none';
  document.getElementById('appPage').style.display  = screen === 'app'  ? '' : 'none';
}

function setView(v) {
  currentView = v;
  document.getElementById('viewGrid').classList.toggle('active', v === 'grid');
  document.getElementById('viewTable').classList.toggle('active', v === 'table');
  render();
}

function fmtNum(n) {
  return n % 1 === 0 ? Number(n).toLocaleString() : Number(n).toFixed(2);
}

function setSaveLoading(on) {
  const btn = document.getElementById('saveBtn');
  btn.disabled = on;
  btn.textContent = on ? 'Saving…' : 'Save';
}

function setAuthLoading(id, on) {
  const btn = document.getElementById(id);
  btn.disabled = on;
  btn.textContent = on ? 'Please wait…' : id === 'loginBtn' ? 'Sign In' : 'Create Account';
}

function showAuthError(msg) {
  document.getElementById('authMessage').innerHTML = `<div class="auth-error">${msg}</div>`;
}
function showAuthSuccess(msg) {
  document.getElementById('authMessage').innerHTML = `<div class="auth-success">${msg}</div>`;
}
function clearAuthMessage() {
  document.getElementById('authMessage').innerHTML = '';
}

function toast(msg, isError = false) {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' toast-error' : '');
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 2900);
}

function populateSelects() {
  const tf = document.getElementById('typeFilter');
  const fs = document.getElementById('fType');
  TYPE_OPTIONS.forEach(t => {
    tf.innerHTML += `<option value="${t}">${t}</option>`;
    fs.innerHTML += `<option value="${t}">${t}</option>`;
  });
  const curr = document.getElementById('fCurrency');
  CURRENCY_OPTIONS.forEach(c => { curr.innerHTML += `<option value="${c}">${c}</option>`; });
}

function bindEvents() {
  document.getElementById('searchInput').addEventListener('input', render);
  document.getElementById('statusFilter').addEventListener('change', render);
  document.getElementById('typeFilter').addEventListener('change', render);
  document.getElementById('liverFilter').addEventListener('change', render);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById('importFileInput').addEventListener('change', e => {
    if (e.target.files[0]) importJson(e.target.files[0]);
    e.target.value = '';
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // Allow Enter key on auth inputs
  ['loginUsername','loginPassword'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
  });
}
