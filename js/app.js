/* ═══════════════════════════════════════════════════════
   Merch Archive — app.js
   Public browsing + optional login for status tracking
   ═══════════════════════════════════════════════════════ */

/* ── Supabase client ──────────────────────────────────── */
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
window._sb = sb;

/* ── App state ────────────────────────────────────────── */
let currentUser  = null;   // null = logged out (guest)
let isSuperuser = false;
let isAdmin        = false; // true if user has admin role (granted by owner)
let allItems = [];
let liverRegistry  = {};   // { name: { color, group_name } }
let userStatuses = {};     // only populated when logged in
let chekiStatuses  = {};   // { merch_id: { variant: { member: 'owned'|'wishlist' } } }
let editingId    = null;
let currentView = 'grid';
let currentGroup   = null; // [2026-06-18 #9] currently selected group name

const TYPE_OPTIONS     = ['Acrylic Stand','Cheki Card','Plushie','Tapestry','Keychain','Pin Badge','Trading Card','Fan Book','Voice Pack','Other'];
const CURRENCY_OPTIONS = ['JPY', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'TWD', 'KRW'];
const DEFAULT_LIVER_COLOR = '#8a8780'; // fallback dot color

// [2026-06-19 #4] True if user can add/edit/delete merch & livers (owner or admin)
function canManage() {
  return isSuperuser || isAdmin;
}


/* ══════════════════════════════════════════════════════
   BOOTSTRAP 
   ══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  populateSelects();
  bindEvents();
  applyStaticStrings();

  await Promise.all([loadMerch(), loadLiverRegistry()]); // added loadLiverRegistry()

  // Listen for back/forward navigation
  window.addEventListener('hashchange', () => {
    handleRoute();
    if (currentGroup) render();
  });

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

  if (error) showAuthError(error.message.includes('already registered') ? t('errUsernameTaken') : error.message);
  else { showAuthSuccess(t('successSignup')); switchTab('login'); document.getElementById('loginUsername').value = username; }
}

async function handleLogout() {
  await sb.auth.signOut();
}

async function onSignedIn(user) {
  currentUser = user;
  currentUser.username = user.user_metadata?.username
    || user.email.replace('@speciale.co', '');
  isSuperuser = user.email === usernameToEmail(SUPERUSER_USERNAME);

await Promise.all([loadUserStatuses(), loadChekiStatuses(),loadMyRole()]); // added loadChekiStatuses()
  applyHeaderLoggedIn();
  closeAuthModal();
  render();
}

function onSignedOut() {
  currentUser  = null;
  isSuperuser = false;
  isAdmin       = false;
  userStatuses = {};
  chekiStatuses = {}; // reset cheki statuses on sign out
  applyHeaderLoggedOut();
  render();
}

// Look up the current user's role from user_roles table
async function loadMyRole() {
  if (isSuperuser) { isAdmin = false; return; } // owner doesn't need admin flag
  const { data, error } = await sb.from('user_roles').select('role').eq('user_id', currentUser.id).maybeSingle();
  if (error || !data) { isAdmin = false; return; }
  isAdmin = data.role === 'admin';
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
  renderSidebar();
  handleRoute();
}

// Render sidebar group list
function renderSidebar() {
  const nav    = document.getElementById('sidebarNav');
  const groups = getAllGroups();
  nav.innerHTML = '';

  if (!groups.length) {
    nav.innerHTML = `<div style="padding:.6rem 1.25rem;font-size:.8rem;color:var(--muted)">No groups yet</div>`;
    return;
  }

  groups.forEach(group => {
    const count = allItems.filter(item => itemBelongsToGroup(item, group)).length;
    const btn   = document.createElement('button');
    btn.className = 'sidebar-item' + (currentGroup === group ? ' active' : '');
    btn.innerHTML = `<span>${group}</span><span class="sidebar-item-count">${count}</span>`;
    btn.onclick = () => navigateToGroup(group);
    nav.appendChild(btn);
  });
}

//  Navigate to a group — updates URL hash and renders
function navigateToGroup(groupName) {
  currentGroup = groupName;
  location.hash = encodeURIComponent(groupName);
  renderSidebar();
  showItemView();
  render();
  // Close sidebar on mobile after selecting
  if (window.innerWidth <= 768) closeSidebar();
}

//  Handle URL hash on load / hashchange
function handleRoute() {
  const hash = decodeURIComponent(location.hash.slice(1));
  const groups = getAllGroups();

  if (hash && groups.includes(hash)) {
    currentGroup = hash;
    showItemView();
  } else {
    currentGroup = null;
    showGroupHome();
  }
  renderSidebar();
  if (currentGroup) render();
}

// Show the group selection home screen
function showGroupHome() {
  document.getElementById('groupHome').style.display = '';
  document.getElementById('itemView').style.display  = 'none';
  renderGroupHome();
}

//  Show the item grid/table view
function showItemView() {
  document.getElementById('groupHome').style.display = 'none';
  document.getElementById('itemView').style.display  = '';
}

// Render group cards on the home screen
function renderGroupHome() {
  const grid   = document.getElementById('groupHomeGrid');
  const groups = getAllGroups();
  grid.innerHTML = '';

  if (!groups.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>No groups yet</p><p>Add livers with a group name in the Liver Registry.</p></div>`;
    return;
  }

  groups.forEach(group => {
    const livers = getLiversInGroup(group);
    const items  = allItems.filter(item => itemBelongsToGroup(item, group));

    const card = document.createElement('div');
    card.className = 'group-home-card';
    card.onclick = () => navigateToGroup(group);

    const dots = livers.slice(0, 12).map(name => {
      const color = getLiverColor(name);
      return `<div class="group-dot" style="background:${color}" title="${name}"></div>`;
    }).join('');

    card.innerHTML = `
      <div class="group-home-card-name">${group}</div>
      <div class="group-home-card-meta">${livers.length} liver${livers.length !== 1 ? 's' : ''} · ${items.length} item${items.length !== 1 ? 's' : ''}</div>
      <div class="group-home-card-dots">${dots}</div>`;
    grid.appendChild(card);
  });
}

// Toggle mobile sidebar
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

// Toggle the mobile "More actions" dropdown
function toggleHeaderOverflow() {
  document.getElementById('headerOverflowGroup').classList.toggle('open');
}
function closeHeaderOverflow() {
  document.getElementById('headerOverflowGroup').classList.remove('open');
}

// [NEW] Load liver name→color map from Supabase
async function loadLiverRegistry() {
  const { data, error } = await sb.from('livers').select('name, color, group_name').order('name');
  if (error) return;
  liverRegistry = {};
  (data || []).forEach(l => { liverRegistry[l.name] = { color: l.color, group_name: l.group_name || null }; });
}

//  Look up a liver's color, falling back to grey
function getLiverColor(name) {
  return liverRegistry[name] ?.color || DEFAULT_LIVER_COLOR;
}

// Get a liver's group name
function getLiverGroup(name) {
  return liverRegistry[name]?.group_name || null;
}

//  Get all unique group names from registry
function getAllGroups() {
  return [...new Set(
    Object.values(liverRegistry)
      .map(l => l.group_name)
      .filter(Boolean)
  )].sort();
}

// Get all liver names belonging to a group
function getLiversInGroup(groupName) {
  return Object.entries(liverRegistry)
    .filter(([, v]) => v.group_name === groupName)
    .map(([name]) => name);
}

//  Check if an item belongs to a group
function itemBelongsToGroup(item, groupName) {
  const groupLivers = getLiversInGroup(groupName);
  if (item.type === 'Cheki Card') {
    return (item.cheki_members || []).some(m => groupLivers.includes(m));
  }
  return groupLivers.includes(item.liver);
}

// Check if cheki member belongs to a group
function memberBelongsToGroup(members, groupName) {
  const groupLivers = getLiversInGroup(groupName);

  const liversinCheki = groupLivers.filter(
    liver => members.includes(liver)
  )

  return liversinCheki;
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

  const entry = userStatuses[itemId] || { status: 'none', notes: '' };
  const next    = entry.status === 'none' ? 'wishlist' : entry.status === 'wishlist' ? 'owned' : 'none';

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
  const next    = current === 'none' ? 'wishlist' : current === 'wishlist' ? 'owned' : 'none';
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
  const status = (userStatuses[itemId]?.status) || 'none';
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

// Write an entry to audit_log. Fire-and-forget — never blocks the UI on failure.
async function logAudit(action, tableName, recordId, details) {
  if (!currentUser) return;
  try {
    await sb.from('audit_log').insert({
      user_id:    currentUser.id,
      username:   currentUser.username,
      action,            // 'create' | 'update' | 'delete'
      table_name: tableName,
      record_id:  recordId,
      details,
    });
  } catch (e) { /* audit log failures should never break the main action */ }
}

/* ── Owner/Admin: CRUD ──────────────────── */

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

  let resultId = editingId;
  const { data, error } = editingId
    ? await sb.from('merch').update(payload).eq('id', editingId).select().maybeSingle()
    : await sb.from('merch').insert(payload).select().maybeSingle();

  setSaveLoading(false);
  if (error) { toast(t('saveError') + ': ' + error.message, true); return; }

  // Log this create/update to audit_log
  if (data) resultId = data.id;
  logAudit(editingId ? 'update' : 'create', 'merch', resultId, payload);

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
  const itemBeingDeleted = allItems.find(i => i.id === id); // capture for log details
  const { error } = await sb.from('merch').delete().eq('id', id);
  if (error) { toast(t('deleteError') + ': ' + error.message, true); return; }
  logAudit('delete', 'merch', id, itemBeingDeleted);
  toast(t('deletedMsg'));
  await loadMerch();
}

// [2026-06-19 #1] CSV columns in fixed order — must match parseCsvRow()
const CSV_COLUMNS = ['id','liver','series','type','release_date','cost','currency','image','cheki_members','cheki_variants'];

// [2026-06-19 #1] Escape a single CSV field — wraps in quotes if it contains comma/quote/newline
function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

// [2026-06-19 #1] Convert array fields (cheki_members/variants) to semicolon-separated string
function arrToCell(arr) {
  return Array.isArray(arr) ? arr.join(';') : '';
}

// [2026-06-19 #1] Convert semicolon-separated string back to array (or null if empty)
function cellToArr(str) {
  const trimmed = (str || '').trim();
  if (!trimmed) return null;
  return trimmed.split(';').map(s => s.trim()).filter(Boolean);
}

// [2026-06-19 #1] Export all merch items as a downloadable CSV file
function exportJson() {
  const header = CSV_COLUMNS.join(',');
  const rows = allItems.map(item => CSV_COLUMNS.map(col => {
    if (col === 'cheki_members')  return csvEscape(arrToCell(item.cheki_members));
    if (col === 'cheki_variants') return csvEscape(arrToCell(item.cheki_variants));
    return csvEscape(item[col]);
  }).join(','));

  const csv  = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'merch.csv'; a.click();
  URL.revokeObjectURL(url);
  toast(t('exportedMsg'));
}

// [2026-06-19 #1] Parse a single CSV line into fields, respecting quoted commas
function parseCsvLine(line) {
  const fields = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cur += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { fields.push(cur); cur = ''; }
      else cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

// [2026-06-19 #1] Import merch items from an uploaded CSV file
function importCSV(file) {
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const text  = e.target.result.replace(/\r\n/g, '\n').trim();
      const lines = text.split('\n').filter(l => l.length > 0);
      if (lines.length < 2) throw new Error('CSV has no data rows');

      const headerCols = parseCsvLine(lines[0]).map(h => h.trim());
      const rows = lines.slice(1).map(line => {
        const fields = parseCsvLine(line);
        const obj = {};
        headerCols.forEach((col, i) => {
          let val = fields[i] !== undefined ? fields[i] : '';
          if (col === 'cheki_members' || col === 'cheki_variants') {
            obj[col] = cellToArr(val);
          } else if (col === 'cost') {
            obj[col] = val === '' ? 0 : parseFloat(val);
          } else if (col === 'id') {
            if (val !== '') obj[col] = parseInt(val, 10);
          } else if (col === 'release_date') {
            obj[col] = val === '' ? null : val;
          } else {
            obj[col] = val;
          }
        });
        return obj;
      });

      const { error } = await sb.from('merch').upsert(rows);
      if (error) throw error;
      await loadMerch();
      toast(rows.length + ' ' + t('importedMsg'));
    } catch (err) { toast(t('importError') + ': ' + (err.message || ''), true); }
  };
  reader.readAsText(file);
}


/* ══════════════════════════════════════════════════════
   LIVER REGISTRY (superuser) — [NEW]
   ══════════════════════════════════════════════════════ */
function openRegistry() {
  closeHeaderOverflow();
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
    : livers.map(([name, data]) => `
      <div class="registry-row">
        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
          <div class="registry-swatch" style="background:${data.color}"></div>
          <span style="font-size:.875rem;">${name}</span>
          <!-- [2026-06-18 #13] Show group badge if set -->
          ${data.group_name ? `<span style="font-size:.7rem;background:var(--accent-lt);color:#7a6030;padding:1px 7px;border-radius:999px;">${data.group_name}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <!-- [2026-06-18 #13] Inline group edit -->
          <input type="text" value="${data.group_name || ''}" placeholder="Group…"
            style="width:100px;padding:3px 7px;border:1px solid var(--border);border-radius:4px;font-size:.78rem;font-family:inherit;"
            onchange="updateLiverGroup('${name}', this.value)">
          <input type="color" value="${data.color}" class="registry-color-input"
            oninput="updateLiverColor('${name}', this.value)">
          <button class="btn btn-danger btn-sm" onclick="deleteLiver('${name}')">✕</button>
        </div>
      </div>`).join('');
}
 
async function addLiver() {
  const name  = document.getElementById('newLiverName').value.trim();
  const group = document.getElementById('newLiverGroup').value.trim() || null;
  const color = document.getElementById('newLiverColor').value;
  if (!name) return;
  const { error } = await sb.from('livers').upsert({ name, color, group_name: group }, { onConflict: 'name' });
  if (error) { toast('Failed to add liver', true); return; }
  liverRegistry[name] = { color, group_name: group };
  logAudit('create', 'livers', null, { name, color, group_name: group });
  document.getElementById('newLiverName').value  = '';
  document.getElementById('newLiverGroup').value = '';
  renderRegistryModal();
  renderSidebar();
  render();
  toast(`${name} added`);
}
 
async function updateLiverColor(name, color) {
  liverRegistry[name] = { ...liverRegistry[name], color };
  const { error } = await sb.from('livers').update({ color }).eq('name', name);
  if (error) toast('Failed to update color', true);
  else {
    logAudit('update', 'livers', null, { name, color });
    renderRegistryModal(); render();
  }
}

// New function to update a liver's group
async function updateLiverGroup(name, group_name) {
  const val = group_name.trim() || null;
  liverRegistry[name] = { ...liverRegistry[name], group_name: val };
  const { error } = await sb.from('livers').update({ group_name: val }).eq('name', name);
  if (error) toast('Failed to update group', true);
  else {
    logAudit('update', 'livers', null, { name, group_name: val });
    renderRegistryModal(); renderSidebar(); renderGroupHome(); render();
  }
}

 
async function deleteLiver(name) {
  if (!confirm(`Remove ${name} from registry?`)) return;
  const { error } = await sb.from('livers').delete().eq('name', name);
  if (error) { toast('Failed to delete', true); return; }
  logAudit('delete', 'livers', null, { name, ...liverBeingDeleted });
  delete liverRegistry[name];
  renderRegistryModal();
  renderSidebar();
  render();
}
/* ══════════════════════════════════════════════════════
   MANAGE USERS (owner only) — [2026-06-19 #8]
   Lets the owner promote/demote other accounts to admin.
   ══════════════════════════════════════════════════════ */
function openUsersModal() {
  closeHeaderOverflow();
  document.getElementById('usersOverlay').classList.add('open');
  loadAndRenderUsers();
}
function closeUsersModal() {
  document.getElementById('usersOverlay').classList.remove('open');
}

// [2026-06-19 #8] Fetch all known users (from user_roles) plus search-by-username
async function loadAndRenderUsers() {
  const list = document.getElementById('usersList');
  list.innerHTML = `<div style="padding:1rem;text-align:center;color:var(--muted);font-size:.85rem">Loading…</div>`;

  // user_roles only contains rows for users who have ever been assigned a role.
  // To promote a brand-new user we look them up by username via the search box instead.
  const { data, error } = await sb.from('user_roles').select('username, role, user_id').eq('role','admin');
  if (error) { list.innerHTML = `<div style="padding:1rem;color:var(--danger);font-size:.85rem">Failed to load users</div>`; return; }

  if (!data || !data.length) {
    list.innerHTML = `<div style="padding:1rem;text-align:center;color:var(--muted);font-size:.85rem">No admins yet — search a username below to promote them</div>`;
    return;
  }

  // We don't have a direct users table to join against from the client,
  // so we display by user_id and role; username resolution happens via search.
  list.innerHTML = data.map(row => `
    <div class="registry-row">
      <span style="font-size:.8rem;color:var(--muted);font-family:monospace;">${row.username}…</span>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="superuser-badge">${row.role}</span>
        <button class="btn btn-danger btn-sm" onclick="setUserRole('${row.user_id}', 'user','${row.username}')">Demote</button>
      </div>
    </div>`).join('');
}

// [2026-06-19 #8] Search a user by username (calls a Postgres function — see SQL note)
async function searchAndPromote() {
  const username = document.getElementById('userSearchInput').value.trim();
  if (!username) return;

  // Look up the auth user id by username via RPC (requires a SQL function — see below)
  const { data, error } = await sb.rpc('get_user_id_by_username', { search_username: username });
  if (error || !data) { toast('User not found', true); return; }

  await setUserRole(data, 'admin',username);
  document.getElementById('userSearchInput').value = '';
}

// [2026-06-19 #8] Promote/demote a user — upserts into user_roles
async function setUserRole(userId, role, username) {
  const { error } = await sb.from('user_roles').upsert({ user_id: userId, role, username }, { onConflict: 'user_id' });
  if (error) { toast('Failed to update role', true); return; }
  toast(role === 'admin' ? 'Promoted to admin' : 'Demoted to user');
  loadAndRenderUsers();
}

/* ══════════════════════════════════════════════════════
   AUDIT LOG (owner only) — [2026-06-19 #8]
   ══════════════════════════════════════════════════════ */
function openAuditLog() {
  closeHeaderOverflow();
  document.getElementById('auditOverlay').classList.add('open');
  loadAndRenderAuditLog();
}
function closeAuditLog() {
  document.getElementById('auditOverlay').classList.remove('open');
}

async function loadAndRenderAuditLog() {
  const list = document.getElementById('auditList');
  list.innerHTML = `<div style="padding:1rem;text-align:center;color:var(--muted);font-size:.85rem">Loading…</div>`;

  const { data, error } = await sb
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) { list.innerHTML = `<div style="padding:1rem;color:var(--danger);font-size:.85rem">Failed to load audit log</div>`; return; }
  if (!data || !data.length) { list.innerHTML = `<div style="padding:1rem;text-align:center;color:var(--muted);font-size:.85rem">No activity logged yet</div>`; return; }

  const actionColors = { create: 'var(--owned)', update: '#7a6030', delete: 'var(--danger)' };

  list.innerHTML = data.map(entry => {
    const when = new Date(entry.created_at).toLocaleString();
    const color = actionColors[entry.action] || 'var(--muted)';
    const summary = summarizeAuditDetails(entry);
    return `
      <div class="audit-row">
        <div class="audit-row-top">
          <span class="audit-action" style="color:${color};border-color:${color}">${entry.action}</span>
          <strong>${entry.username}</strong>
          <span style="color:var(--muted)">→</span>
          <span>${entry.table_name}${entry.record_id ? ` #${entry.record_id}` : ''}</span>
          <span class="audit-time">${when}</span>
        </div>
        ${summary ? `<div class="audit-row-detail">${summary}</div>` : ''}
      </div>`;
  }).join('');
}

// [2026-06-19 #8] Build a short human-readable summary of what changed
function summarizeAuditDetails(entry) {
  if (!entry.details) return '';
  const d = entry.details;
  if (entry.table_name === 'merch') {
    return `${d.liver || ''} ${d.series ? '· ' + d.series : ''} ${d.type ? '· ' + d.type : ''}`.trim();
  }
  if (entry.table_name === 'livers') {
    return `${d.name || ''}${d.group_name ? ' · group: ' + d.group_name : ''}`;
  }
  return '';
}


/* ══════════════════════════════════════════════════════
   RENDER
   ══════════════════════════════════════════════════════ */
function render() {
    if (!currentGroup) {
    renderGroupHome();
    return;
  }
  updateStats();
  updateLiverFilter(currentGroup);
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
    const isCheki = item.type === 'Cheki Card';

    // Filter by current group first
    if (currentGroup && !itemBelongsToGroup(item, currentGroup)) return false;

    // ── Search ──────────────────────────────────────────
    // [CHANGED] for cheki, also search member names
    const matchQ = !q
      || (item.liver || '').toLowerCase().includes(q)
      || (item.series || '').toLowerCase().includes(q)
      || (isCheki && (item.cheki_members || []).some(m => m.toLowerCase().includes(q)));

    // ── Status filter ────────────────────────────────────
    // [CHANGED] cheki: match if ANY dot has the filtered status
    let matchStatus;
    if (!statusFilter) {
      matchStatus = true;
    } else if (isCheki) {
      const variants = item.cheki_variants || [];
      const members = item.cheki_members || [];
      matchStatus = variants.some(v =>
        members.some(m => (chekiStatuses[item.id]?.[v]?.[m] || 'none') === statusFilter)
      );
    } else {
      const myStatus = (userStatuses[item.id]?.status) || 'none';
      matchStatus = myStatus === statusFilter;
    }

    // ── Type & liver ─────────────────────────────────────
    const matchType  = !typeFilter || item.type === typeFilter;
    const matchLiver = !liverFilter
      || item.liver === liverFilter
      || (isCheki && (item.cheki_members || []).includes(liverFilter));

    return matchQ && matchStatus && matchType && matchLiver;
  });
}

function updateStats() {
    const groupItems = currentGroup
    ? allItems.filter(i => itemBelongsToGroup(i, currentGroup))
    : allItems;
  const myOwned    = groupItems.filter(i => (userStatuses[i.id]?.status) === 'owned');
  const myWishlist = groupItems.filter(i => (userStatuses[i.id]?.status) === 'wishlist');
 
  document.getElementById('statTotal').textContent    = groupItems.length;
  document.getElementById('statOwned').textContent    = currentUser ? myOwned.length    : '—';
  document.getElementById('statWishlist').textContent = currentUser ? myWishlist.length : '—';
 
  updateStatActiveState();
}

function updateLiverFilter(groupName) {
  const lf   = document.getElementById('liverFilter');
  const prev = lf.value;
 
  const liverNames = new Set(getLiversInGroup(groupName));
  const sorted = [...liverNames].sort();
  lf.innerHTML = `<option value="">${t('allLivers')}</option>`;
  sorted.forEach(name => {
    const o = document.createElement('option');
    o.value = name; o.textContent = name;
    if (name === prev) o.selected = true;
    lf.appendChild(o);
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

  const statusBadge = myStatus !== 'none' ? `<span class="badge badge-${myStatus}">${t(myStatus)}</span>` : '';
  const toggleLabel = !currentUser ? t('signInToTrack') : myStatus === 'none' ? t('trackHint') : t(myStatus);
  const toggleHint  = currentUser ? `<span style="font-size:.7rem;opacity:.6">${t('cycleHint')}</span>` : '';

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
  const members  = memberBelongsToGroup(item.cheki_members,currentGroup)  || [];
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
        dotStyle = `background:${color}22;border-color:${color}66;`;
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
      <div class="card-name">${item.series}</div>
      ${item.series       ? `<div class="card-group">${item.liver}</div>` : ''}
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
          const isCheki     = item.type === 'Cheki Card';
          const members     = item.cheki_members || [];
          const variants    = item.cheki_variants || [];
          let ownedDots = 0, totalDots = members.length * variants.length;
          if (isCheki) {
            variants.forEach(v => members.forEach(m => {
              if ((chekiStatuses[item.id]?.[v]?.[m]) === 'owned') ownedDots++;
            }));
          }
          const statusCell = loggedIn ? (isCheki
            ? `<td><span style="font-size:.8rem;color:var(--muted)">${ownedDots}/${totalDots} owned</span></td>`
            : `<td><button class="status-toggle ${toggleClass}"
                style="border-radius:999px;padding:.2rem .7rem;font-size:.72rem;width:auto"
                onclick="cycleStatus(${item.id})">
                ${myStatus === 'owned' ? t('owned') : myStatus === 'wishlist' ? t('wishlist') : t('trackHint')}
              </button></td>`) : '';
          return `<tr>
            <td>${item.image ? `<img class="table-thumb" src="${item.image}" alt="">` : `<div class="table-thumb-placeholder">?</div>`}</td>
            <td><strong>${item.liver}</strong></td>
            <td>${item.series || '—'}</td>
            <td><span class="badge badge-type">${tType(item.type)}</span></td>
            ${statusCell}
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
  document.getElementById('fChekiMembers').value = ''; // [CHANGED] clear before picker renders
  toggleChekiFields();

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

// Tracks selected members and renders chips + input inside #memberPicker
let _pickerSelected = [];

function renderMemberPicker(selected = []) {
  _pickerSelected = [...selected];
  _buildPickerDOM();
}

function _buildPickerDOM() {
  const picker = document.getElementById('memberPicker');
  picker.innerHTML = '';

  // Chips for selected members
  _pickerSelected.forEach(name => {
    const color = getLiverColor(name);
    const chip = document.createElement('span');
    chip.className = 'member-chip';
    chip.style.cssText = `background:${color};border-color:${color};`;
    chip.innerHTML = `${name}<span class="chip-remove" onclick="_removeChip('${name}')">✕</span>`;
    picker.appendChild(chip);
  });

  // Autocomplete input
  const input = document.createElement('input');
  input.id = 'memberSearchInput';
  input.className = 'member-search-input';
  input.placeholder = _pickerSelected.length === 0 ? 'Type a liver name…' : '';
  input.autocomplete = 'off';
  input.addEventListener('input', _onPickerInput);
  input.addEventListener('keydown', _onPickerKeydown);
  input.addEventListener('focus', () => { if (input.value) _showDropdown(input.value); });
  picker.appendChild(input);

  syncMemberInput();
}

function _onPickerInput(e) {
  const q = e.target.value;
  if (q.trim()) _showDropdown(q);
  else _hideDropdown();
}

function _showDropdown(q) {
  _hideDropdown();
  const suggestions = Object.keys(liverRegistry)
    .filter(name => !_pickerSelected.includes(name) && name.toLowerCase().includes(q.toLowerCase()))
    .sort();

  if (!suggestions.length) return;

  const drop = document.createElement('div');
  drop.id = 'memberDropdown';
  drop.className = 'member-dropdown';

  suggestions.forEach((name, i) => {
    const color = getLiverColor(name);
    const item = document.createElement('div');
    item.className = 'member-dropdown-item';
    item.dataset.idx = i;
    item.innerHTML = `<span class="dropdown-dot" style="background:${color}"></span>${name}`;
    item.addEventListener('mousedown', e => { e.preventDefault(); _addChip(name); });
    item.addEventListener('mouseenter', () => _setActiveDropdownItem(i));
    drop.appendChild(item);
  });

  // Position below the picker box
  const picker = document.getElementById('memberPicker');
  picker.parentElement.style.position = 'relative';
  picker.parentElement.appendChild(drop);
}

function _hideDropdown() {
  document.getElementById('memberDropdown')?.remove();
}

function _setActiveDropdownItem(idx) {
  document.querySelectorAll('.member-dropdown-item').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
  });
}

function _getActiveIdx() {
  const items = [...document.querySelectorAll('.member-dropdown-item')];
  return items.findIndex(el => el.classList.contains('active'));
}

function _onPickerKeydown(e) {
  const items = [...document.querySelectorAll('.member-dropdown-item')];
  const activeIdx = _getActiveIdx();

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _setActiveDropdownItem(Math.min(activeIdx + 1, items.length - 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _setActiveDropdownItem(Math.max(activeIdx - 1, 0));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (activeIdx >= 0 && items[activeIdx]) {
      _addChip(items[activeIdx].textContent.trim());
    }
  } else if (e.key === 'Escape') {
    _hideDropdown();
  } else if (e.key === 'Backspace' && e.target.value === '' && _pickerSelected.length > 0) {
    _removeChip(_pickerSelected[_pickerSelected.length - 1]);
  }
}

function _addChip(name) {
  if (!_pickerSelected.includes(name)) {
    _pickerSelected.push(name);
  }
  _hideDropdown();
  _buildPickerDOM();
  // Re-focus input after adding
  setTimeout(() => document.getElementById('memberSearchInput')?.focus(), 0);
}

function _removeChip(name) {
  _pickerSelected = _pickerSelected.filter(n => n !== name);
  _hideDropdown();
  _buildPickerDOM();
  setTimeout(() => document.getElementById('memberSearchInput')?.focus(), 0);
}

// [UNCHANGED] Sync selected list → hidden input for saveItem()
function syncMemberInput() {
  document.getElementById('fChekiMembers').value = _pickerSelected.join(', ');
}

// [NEW] Show/hide cheki-specific fields based on type select
function toggleChekiFields() {
  const isCheki = document.getElementById('fType').value === 'Cheki Card';
  document.getElementById('chekiFields').style.display = isCheki ? '' : 'none';
    if (isCheki) renderMemberPicker(parseList(document.getElementById('fChekiMembers').value));
  else _hideDropdown();
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

  // [2026-06-19 #7] Owner badge vs Admin badge
  document.getElementById('superBadge').style.display   = isSuperuser ? '' : 'none';
  document.getElementById('adminBadge').style.display = (!isSuperuser && isAdmin) ? '' : 'none';
  
  // [2026-06-19 #7] canManage() covers both owner and admin
  document.getElementById('btnAdd').style.display       = canManage() ? '' : 'none';
  document.getElementById('btnImport').style.display    = canManage() ? '' : 'none';
  document.getElementById('btnExport').style.display    = canManage() ? '' : 'none';
  document.getElementById('btnRegistry').style.display = canManage() ? '' : 'none';
  
  // [2026-06-19 #7] Owner-only: manage admins and view audit log
  document.getElementById('btnUsers').style.display     = isSuperuser ? '' : 'none';
  document.getElementById('btnAuditLog').style.display   = isSuperuser ? '' : 'none';

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
  document.getElementById('superBadge').style.display = 'none';
  document.getElementById('adminBadge').style.display   = 'none'; // [2026-06-19 #7]
  document.getElementById('btnAdd').style.display       = 'none';
  document.getElementById('btnImport').style.display    = 'none';
  document.getElementById('btnExport').style.display = 'none';
  document.getElementById('btnRegistry').style.display = 'none';
  document.getElementById('btnUsers').style.display      = 'none'; // [2026-06-19 #7]
  document.getElementById('btnAuditLog').style.display   = 'none'; // [2026-06-19 #7]
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
    if (e.target.files[0]) importCSV(e.target.files[0]);
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