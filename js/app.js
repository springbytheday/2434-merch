/* ═══════════════════════════════════════════════════════
   Merch Archive — app.js
   Public browsing + optional login for status tracking
   ═══════════════════════════════════════════════════════ */

/* ── Supabase client ──────────────────────────────────── */
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

/* ── App state ────────────────────────────────────────── */
let currentUser  = null;   // null = logged out (guest)
let isSuperuser  = false;
let allItems     = [];
let userStatuses = {};     // only populated when logged in
let editingId    = null;
let currentView  = 'grid';

const TYPE_OPTIONS     = ['Acrylic Stand','Cheki Card','Plushie','Tapestry','Keychain','Pin Badge','Trading Card','Fan Book','Voice Pack','Other'];
const CURRENCY_OPTIONS = ['JPY','USD','EUR','GBP','AUD','CAD','SGD','TWD','KRW'];

/* ══════════════════════════════════════════════════════
   BOOTSTRAP — load merch immediately, auth is optional
   ══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  populateSelects();
  bindEvents();

  // Always load the catalogue — no login required
  await loadMerch();

  // Check if already logged in
  const { data: { session } } = await sb.auth.getSession();
  if (session) await onSignedIn(session.user);
  else onSignedOut();

  // React to future auth changes
  sb.auth.onAuthStateChange(async (_event, session) => {
    if (session) await onSignedIn(session.user);
    else onSignedOut();
  });
});

/* ══════════════════════════════════════════════════════
   AUTH
   ══════════════════════════════════════════════════════ */
function openAuthModal(tab = 'login') {
  switchTab(tab);
  clearAuthMessage();
  document.getElementById('authOverlay').classList.add('open');
}

function closeAuthModal() {
  document.getElementById('authOverlay').classList.remove('open');
}

function switchTab(tab) {
  document.getElementById('formLogin').style.display  = tab === 'login'  ? '' : 'none';
  document.getElementById('formSignup').style.display = tab === 'signup' ? '' : 'none';
  document.getElementById('tabLogin').classList.toggle('active',  tab === 'login');
  document.getElementById('tabSignup').classList.toggle('active', tab === 'signup');
  clearAuthMessage();
}

function usernameToEmail(username) {
  return username.toLowerCase() + '@speciale.co';
}

function validateUsername(username) {
  if (!username) return 'Please enter a username.';
  if (username.length < 3) return 'Username must be at least 3 characters.';
  if (username.length > 30) return 'Username must be 30 characters or fewer.';
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return 'Only letters, numbers, and underscores allowed.';
  return null;
}

async function handleLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!username || !password) return showAuthError('Please enter your username and password.');

  setAuthLoading('loginBtn', true);
  const { error } = await sb.auth.signInWithPassword({
    email: usernameToEmail(username), password,
  });
  setAuthLoading('loginBtn', false);

  if (error) {
    if (error.message.includes('Invalid login')) showAuthError('Incorrect username or password.');
    else showAuthError(error.message);
  }
  // success → onAuthStateChange → onSignedIn → closeAuthModal
}

async function handleSignup() {
  const username = document.getElementById('signupUsername').value.trim();
  const password = document.getElementById('signupPassword').value;
  const confirm  = document.getElementById('signupConfirm').value;

  const err = validateUsername(username);
  if (err) return showAuthError(err);
  if (!password) return showAuthError('Please enter a password.');
  if (password !== confirm) return showAuthError('Passwords do not match.');
  if (password.length < 6) return showAuthError('Password must be at least 6 characters.');

  setAuthLoading('signupBtn', true);
  const { error } = await sb.auth.signUp({
    email: usernameToEmail(username),
    password,
    options: { data: { username } },
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
  // onAuthStateChange → onSignedOut handles the rest
}

async function onSignedIn(user) {
  currentUser = user;
  currentUser.username = user.user_metadata?.username
    || user.email.replace('@speciale.co', '');
  isSuperuser = user.email === usernameToEmail(SUPERUSER_USERNAME);

  await loadUserStatuses();
  applyHeaderLoggedIn();
  closeAuthModal();
  render();
}

function onSignedOut() {
  currentUser  = null;
  isSuperuser  = false;
  userStatuses = {};
  applyHeaderLoggedOut();
  render();
}

/* ══════════════════════════════════════════════════════
   DATA
   ══════════════════════════════════════════════════════ */
async function loadMerch() {
  const { data, error } = await sb
    .from('merch')
    .select('*');

  if (error) { toast('Failed to load merch: ' + error.message, true); return; }
  allItems = data || [];

  // Show the app now — user can browse immediately
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('appPage').style.display = '';
  render();
}

async function loadUserStatuses() {
  if (!currentUser) return;
  const { data, error } = await sb
    .from('user_statuses')
    .select('merch_id, status')
    .eq('user_id', currentUser.id);

  if (error) { toast('Failed to load your statuses', true); return; }
  userStatuses = {};
  (data || []).forEach(s => { userStatuses[s.merch_id] = s.status; });
}

/* ── Status toggle — requires login ──────────────────── */
async function cycleStatus(itemId) {
  if (!currentUser) {
    openAuthModal('login');
    return;
  }

  const current = userStatuses[itemId] || 'none';
  const next    = current === 'none' ? 'owned' : current === 'owned' ? 'wishlist' : 'none';

  // Optimistic update
  userStatuses[itemId] = next;
  render();

  const { error } = next === 'none'
    ? await sb.from('user_statuses').delete()
        .eq('user_id', currentUser.id).eq('merch_id', itemId)
    : await sb.from('user_statuses').upsert(
        { user_id: currentUser.id, merch_id: itemId, status: next },
        { onConflict: 'user_id,merch_id' }
      );

  if (error) { toast('Error saving status', true); await loadUserStatuses(); render(); }
}

/* ── Superuser: add / edit / delete ──────────────────── */
async function saveItem() {
  const series = document.getElementById('fSeries').value.trim();
  if (!series) { document.getElementById('fSeries').focus(); return; }
  setSaveLoading(true);
  const payload = {
    series:    series,
    liver:   document.getElementById('fLiver').value.trim(),
    type:     document.getElementById('fType').value,
    cost:     parseFloat(document.getElementById('fCost').value) || 0,
    currency: document.getElementById('fCurrency').value,
    image:    document.getElementById('fImage').value.trim(),
  };

  const { error } = editingId
    ? await sb.from('merch').update(payload).eq('id', editingId)
    : await sb.from('merch').insert(payload);

  setSaveLoading(false);
  if (error) { toast('Save failed: ' + error.message, true); return; }

  toast(editingId ? 'Item updated' : 'Item added');
  closeModal();
  await loadMerch();
}

async function deleteItem(id) {
  if (!confirm('Delete this item? This cannot be undone.')) return;
  const { error } = await sb.from('merch').delete().eq('id', id);
  if (error) { toast('Delete failed: ' + error.message, true); return; }
  toast('Item deleted');
  await loadMerch();
}

function exportJson() {
  const blob = new Blob([JSON.stringify(allItems, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'merch.json'; a.click();
  URL.revokeObjectURL(url);
  toast('Exported merch.json');
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error();
      const { error } = await sb.from('merch').upsert(data);
      if (error) throw error;
      await loadMerch();
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
    const matchQ      = !q || (item.liver||'').toLowerCase().includes(q)
                          || (item.series||'').toLowerCase().includes(q)
                          || (item.notes||'').toLowerCase().includes(q);
    const matchStatus = !statusFilter || myStatus === statusFilter;
    const matchType   = !typeFilter || item.type === typeFilter;
    const matchLiver  = !liverFilter || item.series === liverFilter;
    return matchQ && matchStatus && matchType && matchLiver;
  });
}

function updateStats() {
  document.getElementById('statTotal').textContent  = allItems.length;

  const loggedIn = !!currentUser;
  // Show personal stats only when logged in
  document.getElementById('statOwnedWrap').style.display   = loggedIn ? '' : 'none';
  document.getElementById('statWishlistWrap').style.display = loggedIn ? '' : 'none';

  if (loggedIn) {
    const myOwned    = allItems.filter(i => userStatuses[i.id] === 'owned');
    const myWishlist = allItems.filter(i => userStatuses[i.id] === 'wishlist');
    document.getElementById('statOwned').textContent    = myOwned.length;
    document.getElementById('statWishlist').textContent = myWishlist.length;

  }
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
    grid.innerHTML = `<div class="empty-state"><p>No items found</p><p>Try adjusting your filters.</p></div>`;
  } else {
    items.forEach(item => grid.appendChild(createCard(item)));
  }
  container.appendChild(grid);
}

function createCard(item) {
  const myStatus   = userStatuses[item.id] || 'none';
  const loggedIn   = !!currentUser;
  const card       = document.createElement('div');
  card.className   = 'card';

  const imgHtml = item.image
    ? `<img class="card-image" src="${item.image}" alt="${item.liver}" loading="lazy">`
    : `<div class="card-image-placeholder">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        <span>No image</span>
      </div>`;

  // Status toggle: logged-in users cycle status; guests see a prompt
  const toggleClass = myStatus === 'owned' ? 'is-owned' : myStatus === 'wishlist' ? 'is-wishlist' : '';
  const toggleLabel = !loggedIn
    ? '♡ Sign in to track'
    : myStatus === 'owned' ? '✓ Owned'
    : myStatus === 'wishlist' ? '♡ Wishlist'
    : '+ Track this';
  const toggleHint = loggedIn
    ? `<span style="font-size:.7rem;opacity:.6">· click to cycle</span>`
    : '';

  const superActions = isSuperuser
    ? `<div class="card-actions">
        <button class="btn btn-ghost btn-sm" onclick="openEdit(${item.id})">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteItem(${item.id})">Delete</button>
       </div>`
    : '';

  // Only show status badge when logged in
  const statusBadge = loggedIn
    ? `<span class="badge badge-${myStatus === 'none' ? 'none' : myStatus}">
        ${myStatus === 'owned' ? '✓ Owned' : myStatus === 'wishlist' ? '♡ Wishlist' : '— Untracked'}
       </span>`
    : '';

  card.innerHTML = `
    ${imgHtml}
    <div class="card-body">
      <div class="card-badges">
        ${statusBadge}
        <span class="badge badge-type">${item.type}</span>
      </div>
      <div class="card-name">${item.series}</div>
      ${item.liver ? `<div class="card-group">${item.liver}</div>` : ''}
      ${item.cost   ? `<div class="card-cost">${fmtNum(item.cost)} ${item.currency || 'JPY'}</div>` : ''}
    </div>
    <button class="status-toggle ${toggleClass}" onclick="cycleStatus(${item.id})">
      ${toggleLabel} ${toggleHint}
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

  const loggedIn = !!currentUser;
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th></th><th>Liver</th><th>Series</th><th>Type</th>
          ${loggedIn ? '<th>My Status</th>' : ''}
          <th>Cost</th>
          ${isSuperuser ? '<th></th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${items.map(item => {
          const myStatus    = userStatuses[item.id] || 'none';
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
            ${loggedIn ? `<td>
              <button class="status-toggle ${toggleClass}" style="border-radius:999px;padding:.2rem .7rem;font-size:.72rem;width:auto"
                onclick="cycleStatus(${item.id})">
                ${myStatus === 'owned' ? '✓ Owned' : myStatus === 'wishlist' ? '♡ Wishlist' : '+ Track'}
              </button>
            </td>` : ''}
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
   MERCH MODAL (superuser only)
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
  document.getElementById('modalTitle').textContent  = 'Edit Merch';
  document.getElementById('fImage').value    = item.image    || '';
  document.getElementById('fSeries').value     = item.series   || '';
  document.getElementById('fLiver').value    = item.liver   || '';
  document.getElementById('fType').value     = item.type     || '';
  document.getElementById('fCost').value     = item.cost     || '';
  document.getElementById('fCurrency').value = item.currency || 'JPY';
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

/* ══════════════════════════════════════════════════════
   HEADER STATE
   ══════════════════════════════════════════════════════ */
function applyHeaderLoggedIn() {
  document.getElementById('btnSignIn').style.display    = 'none';
  document.getElementById('btnSignUp').style.display    = 'none';
  document.getElementById('headerUser').style.display   = '';
  document.getElementById('btnSignOut').style.display   = '';
  document.getElementById('statusFilter').style.display = '';
  document.getElementById('headerUsername').textContent = currentUser.username;
  document.getElementById('superBadge').style.display   = isSuperuser ? '' : 'none';
  document.getElementById('btnAdd').style.display       = isSuperuser ? '' : 'none';
  document.getElementById('btnImport').style.display    = isSuperuser ? '' : 'none';
  document.getElementById('btnExport').style.display    = isSuperuser ? '' : 'none';
}

function applyHeaderLoggedOut() {
  document.getElementById('btnSignIn').style.display    = '';
  document.getElementById('btnSignUp').style.display    = '';
  document.getElementById('headerUser').style.display   = 'none';
  document.getElementById('btnSignOut').style.display   = 'none';
  document.getElementById('statusFilter').style.display = 'none';
  document.getElementById('superBadge').style.display   = 'none';
  document.getElementById('btnAdd').style.display       = 'none';
  document.getElementById('btnImport').style.display    = 'none';
  document.getElementById('btnExport').style.display    = 'none';
}

/* ══════════════════════════════════════════════════════
   UTILITY
   ══════════════════════════════════════════════════════ */
function setView(v) {
  currentView = v;
  document.getElementById('viewGrid').classList.toggle('active',  v === 'grid');
  document.getElementById('viewTable').classList.toggle('active', v === 'table');
  render();
}

function fmtNum(n) {
  return n % 1 === 0 ? Number(n).toLocaleString() : Number(n).toFixed(2);
}

function setSaveLoading(on) {
  const btn = document.getElementById('saveBtn');
  btn.disabled    = on;
  btn.textContent = on ? 'Saving…' : 'Save';
}

function setAuthLoading(id, on) {
  const btn = document.getElementById(id);
  btn.disabled    = on;
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
  t.className   = 'toast' + (isError ? ' toast-error' : '');
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

  // Close modals on overlay click
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById('authOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeAuthModal();
  });

  document.getElementById('importFileInput').addEventListener('change', e => {
    if (e.target.files[0]) importJson(e.target.files[0]);
    e.target.value = '';
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); closeAuthModal(); }
  });

  ['loginUsername','loginPassword'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') handleLogin();
    });
  });
}

window._sb = sb;