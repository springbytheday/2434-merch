/* ═══════════════════════════════════════════════════════
   Merch Archive — app.js
   Public browsing + optional login for status tracking
   ═══════════════════════════════════════════════════════ */

/* ── Supabase client ──────────────────────────────────── */
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
window._sb = sb;

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
   BOOTSTRAP - load merch immediately, auth is optional
   ══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  populateSelects();
  bindEvents();
  applyStaticStrings();

  await loadMerch();

  const { data: { session } } = await sb.auth.getSession();
  if (session) await onSignedIn(session.user);
  else onSignedOut();

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
  if (!username)              return t('errUsernameEmpty');
  if (username.length < 3)   return t('errUsernameTooShort');
  if (username.length > 30)  return t('errUsernameTooLong');
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return t('errUsernameChars');
  return null;
}

async function handleLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!username || !password) return showAuthError(t('errLoginFields'));

  setAuthLoading('loginBtn', true);
  const { error } = await sb.auth.signInWithPassword({
    email: usernameToEmail(username), password,
  });
  setAuthLoading('loginBtn', false);

  if (error) {
    if (error.message.includes('Invalid login')) showAuthError(t('errLoginWrong'));
    else showAuthError(error.message);
  }
}

async function handleSignup() {
  const username = document.getElementById('signupUsername').value.trim();
  const password = document.getElementById('signupPassword').value;
  const confirm  = document.getElementById('signupConfirm').value;

  const err = validateUsername(username);
  if (err) return showAuthError(err);
  if (!password) return showAuthError(t('errPasswordEmpty'));
  if (password !== confirm) return showAuthError(t('errPasswordMismatch'));
  if (password.length < 6) return showAuthError(t('errPasswordTooShort'));

  setAuthLoading('signupBtn', true);
  const { error } = await sb.auth.signUp({
    email: usernameToEmail(username),
    password,
    options: { data: { username } },
  });
  setAuthLoading('signupBtn', false);

  if (error) {
    if (error.message.includes('already registered')) showAuthError(t('errUsernameTaken'));
    else showAuthError(error.message);
  } else {
    showAuthSuccess(t('successSignup'));
    switchTab('login');
    document.getElementById('loginUsername').value = username;
  }
}


async function handleLogout() {
  await sb.auth.signOut();
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
    .select('*')
    .order('released_date', { ascending: true })
    .order('series', { ascending: true })
    .order('liver',{ ascending: true });

  if (error) { toast(t('loadError') + ': ' + error.message, true); return; }
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
    .select('merch_id, status, notes')
    .eq('user_id', currentUser.id);

  if (error) { toast(t('statusError'), true); return; }
  userStatuses = {};
  (data || []).forEach(s => {
    userStatuses[s.merch_id] = { status: s.status, notes: s.notes || '' };
  });
}

/* ── Status toggle ─ requires login ──────────────────────────────────── */
async function cycleStatus(itemId) {
  if (!currentUser) { openAuthModal('login'); return; }

  const entry   = userStatuses[itemId] || { status: 'none', notes: '' };
  const current = entry.status;
  const next    = current === 'none' ? 'owned' : current === 'owned' ? 'wishlist' : 'none';

  // Optimistic update — preserve notes
  userStatuses[itemId] = { status: next, notes: entry.notes };
  render();

  const { error } = next === 'none'
    ? await sb.from('user_statuses').delete()
        .eq('user_id', currentUser.id).eq('merch_id', itemId)
    : await sb.from('user_statuses').upsert(
        { user_id: currentUser.id, merch_id: itemId, status: next, notes: entry.notes },
        { onConflict: 'user_id,merch_id' }
      );

  if (error) { toast(t('statusError'), true); await loadUserStatuses(); render(); }
}

/* ── Save note (debounced, called on textarea input) ──── */
const _noteTimers = {};
function onNoteInput(itemId, value) {
  // Update local state immediately so it survives re-renders
  if (!userStatuses[itemId]) userStatuses[itemId] = { status: 'none', notes: '' };
  userStatuses[itemId].notes = value;

  // Debounce the Supabase write by 800ms
  clearTimeout(_noteTimers[itemId]);
  _noteTimers[itemId] = setTimeout(() => saveNote(itemId, value), 800);
}

async function saveNote(itemId, notes) {
  if (!currentUser) return;
  console.log(itemId);
  console.log(notes);
  const status = (userStatuses[itemId]?.status) || 'none';
  console.log(status);

  const { error } = await sb.from('user_statuses').upsert(
    { user_id: currentUser.id, merch_id: itemId, status: status, notes: notes },
    { onConflict: 'user_id,merch_id' }
  );
  if (error) console.log(error);
  if (error) toast(t('noteError'), true);
  else showNoteSaved(itemId);
}

function showNoteSaved(itemId) {
  const el = document.querySelector(`.note-saved[data-id="${itemId}"]`);
  if (!el) return;
  el.style.opacity = '1';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => { el.style.opacity = '0'; }, 1500);
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
  if (error) { toast(t('saveError') + ': ' + error.message, true); return; }

  toast(editingId ? t('updatedMsg') : t('addedMsg'));
  closeModal();
  await loadMerch();
}

async function deleteItem(id) {
  if (!confirm(t('deleteConfirm'))) return;
  const { error } = await sb.from('merch').delete().eq('id', id);
  if (error) { toast(t('deleteError') + ': ' + error.message, true); return; }
  toast(t('deletedMsg'));
  await loadMerch();
}

function exportJson() {
  const blob = new Blob([JSON.stringify(allItems, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'merch.json'; a.click();
  URL.revokeObjectURL(url);
  toast(t('exportedMsg'));
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
      toast(data.length + ' ' + t('importedMsg'));
    } catch (err) {
      toast(t('importError') + ': ' + (err.message || ''), true);
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
    const myStatus = (userStatuses[item.id]?.status) || 'none';
    const matchQ      = !q || (item.liver||'').toLowerCase().includes(q)
                          || (item.series||'').toLowerCase().includes(q);
    const matchStatus = !statusFilter || myStatus === statusFilter;
    const matchType   = !typeFilter || item.type === typeFilter;
    const matchLiver  = !liverFilter || item.liver === liverFilter;
    return matchQ && matchStatus && matchType && matchLiver;
  });
}

function updateStats() {
  const myOwned    = allItems.filter(i => (userStatuses[i.id]?.status) === 'owned');
  const myWishlist = allItems.filter(i => (userStatuses[i.id]?.status) === 'wishlist');
  const groups     = new Set(allItems.map(i => i.series).filter(Boolean));

  document.getElementById('statTotal').textContent    = allItems.length;
  document.getElementById('statOwned').textContent    = currentUser ? myOwned.length    : '—';
  document.getElementById('statWishlist').textContent = currentUser ? myWishlist.length : '—';

}

function updateLiverFilter() {
  const gf   = document.getElementById('liverFilter');
  const prev = gf.value;
  const livers = [...new Set(allItems.map(i => i.liver).filter(Boolean))].sort();
  gf.innerHTML = `<option value="">${t('allLivers')}</option>`;
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
    grid.innerHTML = `<div class="empty-state"><p>${t('noItems')}</p><p>${t('noItemsSub')}</p></div>`;
  } else {
    items.forEach(item => grid.appendChild(createCard(item)));
  }
  container.appendChild(grid);
}

function createCard(item) {
  const entry       = userStatuses[item.id] || { status: 'none', notes: '' };
  const myStatus    = entry.status;
  const myNotes     = entry.notes || '';
  const toggleClass = myStatus === 'owned' ? 'is-owned' : myStatus === 'wishlist' ? 'is-wishlist' : '';

  const card = document.createElement('div');
  card.className = 'card';

  const imgHtml = item.image
    ? `<img class="card-image" src="${item.image}" alt="${item.liver}" loading="lazy">`
    : `<div class="card-image-placeholder">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        <span>${t('noImage')}</span>
      </div>`;

  const statusBadge = myStatus !== 'none'
    ? `<span class="badge badge-${myStatus}">${t(myStatus)}</span>`
    : '';

  let toggleLabel, toggleHint;
  if (!currentUser) {
    toggleLabel = t('signInToTrack');
    toggleHint  = '';
  } else {
    toggleLabel = myStatus === 'none' ? t('trackHint') : t(myStatus);
    toggleHint  = `<span style="font-size:.7rem;opacity:.6">${t('cycleHint')}</span>`;
  }

  // Notes section — only shown when logged in
  const notesHtml = currentUser ? `
    <div class="card-notes-section">
      <textarea
        class="card-note-input"
        placeholder="${t('notesPlaceholder')}"
        oninput="onNoteInput(${item.id}, this.value)"
      >${myNotes}</textarea>
      <span class="note-saved" data-id="${item.id}">${t('noteSaved')}</span>
    </div>` : '';

  const superActions = isSuperuser
    ? `<div class="card-actions">
        <button class="btn btn-ghost btn-sm" onclick="openEdit(${item.id})">${t('edit')}</button>
        <button class="btn btn-danger btn-sm" onclick="deleteItem(${item.id})">${t('delete')}</button>
       </div>`
    : '';

  card.innerHTML = `
    ${imgHtml}
    <div class="card-body">
      <div class="card-badges">
        ${statusBadge}
        <span class="badge badge-type">${tType(item.type)}</span>
      </div>
      <div class="card-name">${item.series}</div>
      ${item.liver ? `<div class="card-group">${item.liver}</div>` : ''}
      ${item.cost   ? `<div class="card-cost">${fmtNum(item.cost)} ${item.currency || 'JPY'}</div>` : ''}
      ${notesHtml}
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
    container.innerHTML = `<div class="empty-state"><p>${t('noItems')}</p><p>${t('noItemsSub')}</p></div>`;
    return;
  }

  const loggedIn = !!currentUser;
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th></th>
          <th>${t('colSeries')}</th>
          <th>${t('colLiver')}</th>
          <th>${t('colType')}</th>
          ${loggedIn ? `<th>${t('colStatus')}</th>` : ''}
          <th>${t('colCost')}</th>
          ${isSuperuser ? '<th></th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${items.map(item => {
          const myStatus    = (userStatuses[item.id]?.status) || 'none';
          const toggleClass = myStatus === 'owned' ? 'is-owned' : myStatus === 'wishlist' ? 'is-wishlist' : '';
          const toggleLabel = myStatus === 'owned' ? t('owned') : myStatus === 'wishlist' ? t('wishlist') : t('trackHint');
          return `
          <tr>
            <td>${item.image
              ? `<img class="table-thumb" src="${item.image}" alt="">`
              : `<div class="table-thumb-placeholder">?</div>`}
            </td>
            <td><strong>${item.series}</strong></td>
            <td>${item.liver || '—'}</td>
            <td><span class="badge badge-type">${tType(item.type)}</span></td>
            ${loggedIn ? `<td>
              <button class="status-toggle ${toggleClass}"
                style="border-radius:999px;padding:.2rem .7rem;font-size:.72rem;width:auto"
                onclick="cycleStatus(${item.id})">
                ${toggleLabel}
              </button>
            </td>` : ''}
            <td style="white-space:nowrap">${item.cost ? `${fmtNum(item.cost)} ${item.currency || 'JPY'}` : '—'}</td>
            ${isSuperuser ? `<td style="white-space:nowrap">
              <button class="btn btn-ghost btn-sm" onclick="openEdit(${item.id})">${t('edit')}</button>
              <button class="btn btn-danger btn-sm" onclick="deleteItem(${item.id})">${t('delete')}</button>
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
  document.getElementById('modalTitle').textContent = t('addMerch');
  document.getElementById('merch-form').reset();
  document.getElementById('modalOverlay').classList.add('open');
}

function openEdit(id) {
  const item = allItems.find(i => i.id === id);
  if (!item) return;
  editingId = id;
  document.getElementById('modalTitle').textContent  = t('editMerch');
  document.getElementById('fImage').value    = item.image    || '';
  document.getElementById('fSeries').value     = item.series    || '';
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
  // Re-apply translated strings that vary by login state
  document.getElementById('superBadge').textContent     = t('ownerBadge');
  document.getElementById('btnAdd').textContent         = t('addItem');
  document.getElementById('btnSignOut').textContent     = t('signOut');
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
  document.getElementById('btnSignIn').textContent      = t('signIn');
  document.getElementById('btnSignUp').textContent      = t('createAccount');
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
  btn.textContent = on ? t('saving') : t('save');
}

function setAuthLoading(id, on) {
  const btn = document.getElementById(id);
  btn.disabled    = on;
  btn.textContent = on ? t('waitMsg') : id === 'loginBtn' ? t('loginBtn') : t('signupBtn');
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
  TYPE_OPTIONS.forEach(key => {
    tf.innerHTML += `<option value="${key}">${tType(key)}</option>`;
    fs.innerHTML += `<option value="${key}">${tType(key)}</option>`;
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