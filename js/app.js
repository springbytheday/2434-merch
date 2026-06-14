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
let allItems = [];
let liverRegistry  = {};   // [NEW] { name: color }
let userStatuses = {};     // only populated when logged in
let chekiStatuses  = {};   // [NEW] { merch_id: { variant: { member: 'owned'|'wishlist' } } }
let editingId    = null;
let currentView  = 'grid';

const TYPE_OPTIONS     = ['Acrylic Stand','Cheki Card','Plushie','Tapestry','Keychain','Pin Badge','Trading Card','Fan Book','Voice Pack','Other'];
const CURRENCY_OPTIONS = ['JPY', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'TWD', 'KRW'];
const DEFAULT_LIVER_COLOR = '#8a8780'; // [NEW] fallback dot color

/* ══════════════════════════════════════════════════════
   BOOTSTRAP - load merch immediately, auth is optional
   ══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  populateSelects();
  bindEvents();
  applyStaticStrings();

  await Promise.all([loadMerch(), loadLiverRegistry()]); // [CHANGED] added loadLiverRegistry()

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
  const { error } = await sb.auth.signInWithPassword({ email: usernameToEmail(username), password });
  setAuthLoading('loginBtn', false);

  if (error) showAuthError(error.message.includes('Invalid login') ? t('errLoginWrong') : error.message);
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

await Promise.all([loadUserStatuses(), loadChekiStatuses()]); // [CHANGED] added loadChekiStatuses()
  applyHeaderLoggedIn();
  closeAuthModal();
  render();
}

function onSignedOut() {
  currentUser  = null;
  isSuperuser  = false;
  userStatuses = {};
  chekiStatuses = {}; // [NEW] reset cheki statuses on sign out
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
    .order('release_date', { ascending: true })
    .order('series', { ascending: true })
    .order('liver',{ ascending: true });

  if (error) { toast(t('loadError') + ': ' + error.message, true); return; }
  allItems = data || [];

  // Show the app now — user can browse immediately
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('appPage').style.display = '';
  render();
}

// [NEW] Load liver name→color map from Supabase
async function loadLiverRegistry() {
  const { data, error } = await sb.from('livers').select('name, color').order('name');
  if (error) return;
  liverRegistry = {};
  (data || []).forEach(l => { liverRegistry[l.name] = l.color; });
}

// [NEW] Look up a liver's color, falling back to grey
function getLiverColor(name) {
  return liverRegistry[name] || DEFAULT_LIVER_COLOR;
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

// [NEW] Load per-dot cheki statuses for logged-in user
async function loadChekiStatuses() {
  if (!currentUser) return;
  const { data, error } = await sb.from('user_cheki_statuses').select('merch_id, member, variant, status').eq('user_id', currentUser.id);
  if (error) return;
  chekiStatuses = {};
  (data || []).forEach(r => {
    if (!chekiStatuses[r.merch_id]) chekiStatuses[r.merch_id] = {};
    if (!chekiStatuses[r.merch_id][r.variant]) chekiStatuses[r.merch_id][r.variant] = {};
    chekiStatuses[r.merch_id][r.variant][r.member] = r.status;
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

// [NEW] Cycle a single cheki dot: none → owned → wishlist → none
async function cycleChekiDot(itemId, variant, member) {
  if (!currentUser) { openAuthModal('login'); return; }
  if (!chekiStatuses[itemId]) chekiStatuses[itemId] = {};
  if (!chekiStatuses[itemId][variant]) chekiStatuses[itemId][variant] = {};
  const current = chekiStatuses[itemId][variant][member] || 'none';
  const next    = current === 'none' ? 'owned' : current === 'owned' ? 'wishlist' : 'none';
  chekiStatuses[itemId][variant][member] = next;
  rerenderChekiCard(itemId); // optimistic: replace just this card in DOM
  const { error } = next === 'none'
    ? await sb.from('user_cheki_statuses').delete()
        .eq('user_id', currentUser.id).eq('merch_id', itemId).eq('variant', variant).eq('member', member)
    : await sb.from('user_cheki_statuses').upsert(
        { user_id: currentUser.id, merch_id: itemId, variant, member, status: next },
        { onConflict: 'user_id,merch_id,variant,member' }
      );
  if (error) { toast(t('statusError'), true); await loadChekiStatuses(); render(); }
}
 
// [NEW] Replace just one cheki card in the DOM without re-rendering everything
function rerenderChekiCard(itemId) {
  const item = allItems.find(i => i.id === itemId);
  if (!item) return;
  const existing = document.querySelector(`.cheki-card[data-id="${itemId}"]`);
  if (!existing) return;
  existing.replaceWith(buildChekiCard(item));
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

  const isCheki = document.getElementById('fType').value === 'Cheki Card'; // [NEW]
  const payload = {
    series:    series,
    liver:   document.getElementById('fLiver').value.trim(),
    type:     document.getElementById('fType').value,
    cost:     parseFloat(document.getElementById('fCost').value) || 0,
    currency: document.getElementById('fCurrency').value,
    release_date: document.getElementById('fReleaseDate').value || null,
    image: document.getElementById('fImage').value.trim(),
    cheki_members:   isCheki ? parseList(document.getElementById('fChekiMembers').value) : null,  // [NEW]
    cheki_variants:  isCheki ? parseList(document.getElementById('fChekiVariants').value) : null, // [NEW]
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

// [NEW] Parse "Nagisa, Kuzuha, Lize" → ["Nagisa","Kuzuha","Lize"]
function parseList(str) {
  return str.split(',').map(s => s.trim()).filter(Boolean);
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
   LIVER REGISTRY (superuser) — [NEW]
   ══════════════════════════════════════════════════════ */
function openRegistry() {
  renderRegistryModal();
  document.getElementById('registryOverlay').classList.add('open');
}
function closeRegistry() {
  document.getElementById('registryOverlay').classList.remove('open');
}
 
function renderRegistryModal() {
  const list = document.getElementById('registryList');
  const livers = Object.entries(liverRegistry).sort((a,b) => a[0].localeCompare(b[0]));
  list.innerHTML = livers.length === 0
    ? `<div style="padding:1rem;text-align:center;color:var(--muted);font-size:.85rem">No livers added yet</div>`
    : livers.map(([name, color]) => `
      <div class="registry-row">
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="registry-swatch" style="background:${color}"></div>
          <span>${name}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="color" value="${color}" class="registry-color-input"
            oninput="updateLiverColor('${name}', this.value)">
          <button class="btn btn-danger btn-sm" onclick="deleteLiver('${name}')">✕</button>
        </div>
      </div>`).join('');
}
 
async function addLiver() {
  const name  = document.getElementById('newLiverName').value.trim();
  const color = document.getElementById('newLiverColor').value;
  if (!name) return;
  const { error } = await sb.from('livers').upsert({ name, color }, { onConflict: 'name' });
  if (error) { toast('Failed to add liver', true); return; }
  liverRegistry[name] = color;
  document.getElementById('newLiverName').value = '';
  renderRegistryModal();
  render();
  toast(`${name} added`);
}
 
async function updateLiverColor(name, color) {
  liverRegistry[name] = color;
  const { error } = await sb.from('livers').update({ color }).eq('name', name);
  if (error) toast('Failed to update color', true);
  else render();
}
 
async function deleteLiver(name) {
  if (!confirm(`Remove ${name} from registry?`)) return;
  const { error } = await sb.from('livers').delete().eq('name', name);
  if (error) { toast('Failed to delete', true); return; }
  delete liverRegistry[name];
  renderRegistryModal();
  render();
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
 
  document.getElementById('statTotal').textContent    = allItems.length;
  document.getElementById('statOwned').textContent    = currentUser ? myOwned.length    : '—';
  document.getElementById('statWishlist').textContent = currentUser ? myWishlist.length : '—';
 
  updateStatActiveState();
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
    items.forEach(item => grid.appendChild(
    // [CHANGED] route cheki items to their own card builder
      item.type === 'Cheki Card' ? buildChekiCard(item) : buildRegularCard(item)));
  }
  container.appendChild(grid);
}

function buildRegularCard(item) {
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

/* ── Cheki card — [NEW] ───────────────────────────────── */
function buildChekiCard(item) {
  const members  = item.cheki_members  || [];
  const variants = item.cheki_variants || ['Normal','Rare'];
  const entry    = userStatuses[item.id] || { status: 'none', notes: '' };
  const myNotes  = entry.notes || '';
 
  // Count dots
  let ownedCount = 0, wishCount = 0;
  const totalDots = members.length * variants.length;
  variants.forEach(v => {
    members.forEach(m => {
      const s = chekiStatuses[item.id]?.[v]?.[m] || 'none';
      if (s === 'owned')    ownedCount++;
      if (s === 'wishlist') wishCount++;
    });
  });
 
  const variantRows = variants.map(variant => {
    const dots = members.map(member => {
      const status = chekiStatuses[item.id]?.[variant]?.[member] || 'none';
      const color  = getLiverColor(member);
      let dotStyle, dotInner = '';
      if (status === 'owned') {
        dotStyle = `background:${color};border-color:${color};`;
        dotInner = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
      } else if (status === 'wishlist') {
        dotStyle = `background:transparent;border-color:${color};`;
        dotInner = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
      } else {
        dotStyle = 'background:var(--bg);border-color:var(--border);';
      }
      return `<div class="cheki-dot" style="${dotStyle}" title="${member} — ${variant}"
        onclick="cycleChekiDot(${item.id},'${variant}','${member}')">
        ${dotInner}
      </div>`;
    }).join('');
    return `<div class="cheki-variant-block">
      <div class="cheki-variant-label">${variant}</div>
      <div class="cheki-dots-row">${dots}</div>
    </div>`;
  }).join('');
 
  const imgHtml = item.image
    ? `<img class="card-image" src="${item.image}" alt="${item.liver}" loading="lazy">`
    : `<div class="card-image-placeholder">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        <span>${t('noImage')}</span>
      </div>`;
 
  const notesHtml = currentUser ? `
    <div class="card-notes-section">
      <textarea class="card-note-input" placeholder="${t('notesPlaceholder')}"
        oninput="onNoteInput(${item.id}, this.value)">${myNotes}</textarea>
      <span class="note-saved" data-id="${item.id}">${t('noteSaved')}</span>
    </div>` : '';
 
  const superActions = isSuperuser ? `
    <div class="card-actions">
      <button class="btn btn-ghost btn-sm" onclick="openEdit(${item.id})">${t('edit')}</button>
      <button class="btn btn-danger btn-sm" onclick="deleteItem(${item.id})">${t('delete')}</button>
    </div>` : '';
 
  const card = document.createElement('div');
  card.className = 'card cheki-card';
  card.dataset.id = item.id;
  card.innerHTML = `
    ${imgHtml}
    <div class="card-body">
      <div class="card-badges">
        <span class="badge badge-type">${tType(item.type)}</span>
      </div>
      <div class="card-name">${item.liver}</div>
      ${item.series       ? `<div class="card-group">${item.series}</div>` : ''}
      ${item.cost         ? `<div class="card-cost">${fmtNum(item.cost)} ${item.currency || 'JPY'}</div>` : ''}
      <div class="cheki-variants-wrap">${variantRows}</div>
      <div class="cheki-mini-stats">
        <div class="cheki-mini-stat"><span class="cheki-mini-val">${ownedCount}</span><span class="cheki-mini-lbl">${t('owned')}</span></div>
        <div class="cheki-mini-stat"><span class="cheki-mini-val">${wishCount}</span><span class="cheki-mini-lbl">${t('wishlist')}</span></div>
        <div class="cheki-mini-stat"><span class="cheki-mini-val">${totalDots}</span><span class="cheki-mini-lbl">${t('total')}</span></div>
      </div>
      ${notesHtml}
    </div>
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
  document.getElementById('fType').value = item.type || '';
  document.getElementById('fReleaseDate').value = item.release_date || '';
  document.getElementById('fCost').value     = item.cost     || '';
  document.getElementById('fCurrency').value = item.currency || 'JPY';
  document.getElementById('fChekiMembers').value     = (item.cheki_members  || []).join(', ');
  document.getElementById('fChekiVariants').value = (item.cheki_variants || []).join(', ');
  toggleChekiFields();
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

// [NEW] Show/hide cheki-specific fields based on type select
function toggleChekiFields() {
  const isCheki = document.getElementById('fType').value === 'Cheki Card';
  document.getElementById('chekiFields').style.display = isCheki ? '' : 'none';
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
  document.getElementById('btnExport').style.display = isSuperuser ? '' : 'none';
  document.getElementById('btnRegistry').style.display  = isSuperuser ? '' : 'none'; 
  // Re-apply translated strings that vary by login state
  document.getElementById('superBadge').textContent     = t('ownerBadge');
  document.getElementById('btnAdd').textContent         = t('addItem');
  document.getElementById('btnSignOut').textContent = t('signOut');

  document.getElementById('statItemOwned').classList.add('stat-item-clickable');
  document.getElementById('statItemWishlist').classList.add('stat-item-clickable');
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
  document.getElementById('btnExport').style.display = 'none';
  document.getElementById('btnRegistry').style.display  = 'none';
  document.getElementById('btnSignIn').textContent      = t('signIn');
  document.getElementById('btnSignUp').textContent = t('createAccount');
  document.getElementById('statItemOwned').classList.remove('stat-item-clickable', 'active');
  document.getElementById('statItemWishlist').classList.remove('stat-item-clickable', 'active');
}

/* ══════════════════════════════════════════════════════
   UTILITY
   ══════════════════════════════════════════════════════ */
function toggleReveal(inputId, btn) {
  const input = document.getElementById(inputId);
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  btn.querySelector('.eye-show').style.display = isHidden ? 'none' : '';
  btn.querySelector('.eye-hide').style.display = isHidden ? '' : 'none';
  btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
}

function filterByStat(status) {
  if (!currentUser) return;
  const sf = document.getElementById('statusFilter');
  if (sf.value === status && status !== '') {
    sf.value = '';
  } else {
    sf.value = status;
  }
  updateStatActiveState();
  render();
}

function updateStatActiveState() {
  const current = document.getElementById('statusFilter').value;
  document.getElementById('statItemOwned').classList.toggle('active', current === 'owned');
  document.getElementById('statItemWishlist').classList.toggle('active', current === 'wishlist');
}

function setView(v) {
  currentView = v;
  document.getElementById('viewGrid').classList.toggle('active',  v === 'grid');
  document.getElementById('viewTable').classList.toggle('active', v === 'table');
  render();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(currentLang === 'ja' ? 'ja-JP' : 'en-GB', {
    year: 'numeric', month: 'short', day: 'numeric'
  });
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
  document.getElementById('fType').addEventListener('change', toggleChekiFields);

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
  document.getElementById('newLiverName').addEventListener('keydown', e => { if (e.key === 'Enter') addLiver(); });
}