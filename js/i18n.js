/* ═══════════════════════════════════════════════════════
   i18n.js — UI strings for English and Japanese
   ═══════════════════════════════════════════════════════ */

const STRINGS = {
  en: {
    /* ── Header ── */
    signIn:          'Sign in',
    createAccount:   'Create account',
    signOut:         'Sign out',
    ownerBadge:      'Owner',
    adminBadge:      'Admin',
    addItem:         'Add Item',
    import:          'Import',
    export:          'Export',
    manageUsers:     'Manage Users',
    auditLog:        'Audit Log',

    /* ── Stats ── */
    statTotal:       'Total Items',
    statOwned:       'My Owned',
    statWishlist:    'My Wishlist',
    statGroups:      'Livers',
    statSpent:       'My Total Spent',

    /* ── Filters ── */
    searchPlaceholder: 'Search by liver, series…',
    allStatuses:     'All statuses',
    allTypes:        'All types',
    allSeries:       'All series',
    allLivers:       'All livers',
    filterOwned:     'My Owned',
    filterWishlist:  'My Wishlist',
    filterUntracked: 'Not tracked',

    /* ── Status badges / toggles ── */
    owned:           '✓ Owned',
    wishlist:        '♡ Wishlist',
    untracked:       '— Untracked',
    trackHint:       '+ Track',
    cycleHint:       '· click to cycle',
    signInToTrack:   'Sign in to track',

    /* ── Cards / table ── */
    noImage:         'No image',
    noItems:         'No items found',
    noItemsSub:      'Try adjusting your filters.',
    colLiver:        'Liver',
    colSeries:       'Series',
    colType:         'Type',
    colStatus:       'My Status',
    colCost:         'Cost',
    edit:            'Edit',
    delete:          'Delete',

    /* ── Add/Edit modal ── */
    addMerch:        'Add Merch',
    editMerch:       'Edit Merch',
    labelImage:      'Image URL or relative path',
    imageTip:        'Put images in the images/ folder and reference as ./images/filename.jpg',
    labelLiver:      'Liver (Vtuber Name) *',
    liverPlaceholder:'e.g. Nagisa Trout',
    labelSeries:     'Series / Agency',
    seriesPlaceholder:'e.g. Nijisanji',
    labelType:       'Item Type',
    labelCost:       'Cost',
    labelCurrency:   'Currency',
    labelReleaseDate:'Release Date',
    cancel:          'Cancel',
    save:            'Save',
    saving:          'Saving…',

    /* ── Auth modal ── */
    authTitle:       'MerchArchive',
    authSubtitle:    'Track your vtuber merch collection',
    tabLogin:        'Sign In',
    tabSignup:       'Create Account',
    labelUsername:   'Username',
    usernamePlaceholder: 'your username',
    signupUsernamePlaceholder: 'letters, numbers, underscores',
    labelPassword:   'Password',
    passwordPlaceholder: '••••••••',
    labelNewPassword:'Password',
    newPasswordPlaceholder: 'Min. 6 characters',
    labelConfirm:    'Confirm Password',
    confirmPlaceholder: '••••••••',
    loginBtn:        'Sign In',
    signupBtn:       'Create Account',

    /* ── Toasts / errors ── */
    loadError:       'Failed to load merch',
    statusError:     'Error saving status',
    saveError:       'Save failed',
    deleteError:     'Delete failed',
    importError:     'Import failed',
    exportedMsg:     'Exported merch.json',
    importedMsg:     'items imported',
    addedMsg:        'Item added',
    updatedMsg:      'Item updated',
    deletedMsg:      'Item deleted',
    deleteConfirm:   'Delete this item? This cannot be undone.',

    /* ── Cheki ── */
    total:              'Total',
    notesPlaceholder:   'Your notes…',
    noteSaved:          '✓ Saved',
    noteError:          'Failed to save note',
    labelChekiMembers:  'Members (comma separated)',
    labelChekiVariants: 'Variants (comma separated)',

    /* ── Registry ── */
    registry:           'Liver Registry',

    /* ── Auth errors ── */
    errUsernameEmpty:    'Please enter a username.',
    errUsernameTooShort: 'Username must be at least 3 characters.',
    errUsernameTooLong:  'Username must be 30 characters or fewer.',
    errUsernameChars:    'Only letters, numbers, and underscores allowed.',
    errPasswordEmpty:    'Please enter a password.',
    errPasswordMismatch: 'Passwords do not match.',
    errPasswordTooShort: 'Password must be at least 6 characters.',
    errLoginFields:      'Please enter your username and password.',
    errLoginWrong:       'Incorrect username or password.',
    errUsernameTaken:    'That username is already taken.',
    successSignup:       'Account created! You can now sign in.',
    waitMsg:             'Please wait…',

    /* ── Loading ── */
    loading:         'Loading…',

    /* ── Type options ── */
    types: {
      'Acrylic Stand': 'Acrylic Stand',
      'Cheki Card':    'Cheki Card',
      'Plushie':       'Plushie',
      'Tapestry':      'Tapestry',
      'Keychain':      'Keychain',
      'Pin Badge':     'Pin Badge',
      'Trading Card':  'Trading Card',
      'Fan Book':      'Fan Book',
      'Voice Pack':    'Voice Pack',
      'Other':         'Other',
    },
  },

  ja: {
    /* ── Header ── */
    signIn:          'ログイン',
    createAccount:   'アカウント作成',
    signOut:         'ログアウト',
    ownerBadge:      'オーナー',
    adminBadge:      '管理者',
    addItem:         '追加',
    import:          'インポート',
    export:          'エクスポート',
    manageUsers:     'ユーザー管理',
    auditLog:        '操作ログ',

    /* ── Stats ── */
    statTotal:       '総数',
    statOwned:       '持ってる',
    statWishlist:    '欲しいもの',
    statGroups:      'ライバー',
    statSpent:       '合計金額',

    /* ── Filters ── */
    searchPlaceholder: 'ライバー名・シリーズで検索…',
    allStatuses:     'すべてのステータス',
    allTypes:        'すべての種類',
    allSeries:       'すべてのシリーズ',
    allLivers:       'すべてのライバー',
    filterOwned:     '持ってる',
    filterWishlist:  '欲しいもの',
    filterUntracked: '未登録',

    /* ── Status badges / toggles ── */
    owned:           '✓ 持ってる',
    wishlist:        '♡ 欲しい',
    untracked:       '— 未登録',
    trackHint:       '+ 登録',
    cycleHint:       '· タップで変更',
    signInToTrack:   'ログインして登録',

    /* ── Cards / table ── */
    noImage:         '画像なし',
    noItems:         '該当なし',
    noItemsSub:      'フィルターを変えてみて。',
    colLiver:        'ライバー',
    colSeries:       'シリーズ',
    colType:         '種類',
    colStatus:       'ステータス',
    colCost:         '値段',
    edit:            '編集',
    delete:          '削除',

    /* ── Add/Edit modal ── */
    addMerch:        'グッズ追加',
    editMerch:       'グッズ編集',
    labelImage:      '画像URLまたはパス',
    imageTip:        'images/ フォルダに置いて ./images/ファイル名.jpg で参照できるよ',
    labelLiver:      'ライバー名 *',
    liverPlaceholder:'例: 魚尾ナギサ',
    labelSeries:     'シリーズ / 事務所',
    seriesPlaceholder:'例: にじさんじ',
    labelType:       '種類',
    labelCost:       '値段',
    labelCurrency:   '通貨',
    labelReleaseDate:'発売日',
    cancel:          'キャンセル',
    save:            '保存',
    saving:          '保存中…',

    /* ── Auth modal ── */
    authTitle:       'MerchArchive',
    authSubtitle:    'グッズコレクションを管理しよう',
    tabLogin:        'ログイン',
    tabSignup:       'アカウント作成',
    labelUsername:   'ユーザー名',
    usernamePlaceholder: 'ユーザー名',
    signupUsernamePlaceholder: '英数字・アンダースコアのみ',
    labelPassword:   'パスワード',
    passwordPlaceholder: '••••••••',
    labelNewPassword:'パスワード',
    newPasswordPlaceholder: '6文字以上',
    labelConfirm:    'パスワード確認',
    confirmPlaceholder: '••••••••',
    loginBtn:        'ログイン',
    signupBtn:       'アカウント作成',

    /* ── Toasts / errors ── */
    loadError:       'グッズの読み込みに失敗したよ',
    statusError:     'ステータスの保存に失敗したよ',
    saveError:       '保存に失敗したよ',
    deleteError:     '削除に失敗したよ',
    importError:     'インポートに失敗したよ',
    exportedMsg:     'merch.json をエクスポートしたよ',
    importedMsg:     '件インポートしたよ',
    addedMsg:        '追加したよ',
    updatedMsg:      '更新したよ',
    deletedMsg:      '削除したよ',
    deleteConfirm:   'このアイテムを削除する？元に戻せないよ。',

    /* ── Cheki ── */
    total:              '合計',
    notesPlaceholder:   'メモを入力…',
    noteSaved:          '✓ 保存済み',
    noteError:          'メモの保存に失敗したよ',
    labelChekiMembers:  'メンバー（カンマ区切り）',
    labelChekiVariants: 'バリエーション（カンマ区切り）',

    /* ── Registry ── */
    registry:           'ライバー登録',

    /* ── Auth errors ── */
    errUsernameEmpty:    'ユーザー名を入力してね。',
    errUsernameTooShort: 'ユーザー名は3文字以上にしてね。',
    errUsernameTooLong:  'ユーザー名は30文字以内にしてね。',
    errUsernameChars:    '英数字とアンダースコアのみ使えるよ。',
    errPasswordEmpty:    'パスワードを入力してね。',
    errPasswordMismatch: 'パスワードが一致してないよ。',
    errPasswordTooShort: 'パスワードは6文字以上にしてね。',
    errLoginFields:      'ユーザー名とパスワードを入力してね。',
    errLoginWrong:       'ユーザー名かパスワードが違うよ。',
    errUsernameTaken:    'そのユーザー名はもう使われてるよ。',
    successSignup:       'アカウント作成完了！ログインしてね。',
    waitMsg:             'しばらく待ってね…',

    /* ── Loading ── */
    loading:         '読み込み中…',

    /* ── Type options ── */
    types: {
      'Acrylic Stand': 'アクリルスタンド',
      'Cheki Card':    'チェキ',
      'Plushie':       'ぬいぐるみ',
      'Tapestry':      'タペストリー',
      'Keychain':      'キーホルダー',
      'Pin Badge':     '缶バッジ',
      'Trading Card':  'トレカ',
      'Fan Book':      'ファンブック',
      'Voice Pack':    'ボイスパック',
      'Other':         'その他',
    },
  },
};

/* ── Language state ───────────────────────────────────── */
const STORAGE_LANG_KEY = 'merch_lang';

function detectLang() {
  // 1. Saved preference
  const saved = localStorage.getItem(STORAGE_LANG_KEY);
  if (saved === 'ja' || saved === 'en') return saved;
  // 2. Browser language
  const lang = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
  return lang.startsWith('ja') ? 'ja' : 'en';
}

let currentLang = detectLang();

function t(key) {
  return STRINGS[currentLang][key] ?? STRINGS['en'][key] ?? key;
}

function tType(typeKey) {
  return STRINGS[currentLang].types[typeKey] ?? typeKey;
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem(STORAGE_LANG_KEY, lang);
  applyStaticStrings();
  // Re-render dynamic content
  if (typeof render === 'function') render();
  if (typeof applyHeaderLoggedIn === 'function' && typeof currentUser !== 'undefined' && currentUser) {
    applyHeaderLoggedIn();
  } else if (typeof applyHeaderLoggedOut === 'function') {
    applyHeaderLoggedOut();
  }
}

/* ── Apply all static strings to the DOM ─────────────── */
function applyStaticStrings() {
  const set = (id, val, attr = 'textContent') => {
    const el = document.getElementById(id);
    if (el) el[attr] = val;
  };
  const setPlaceholder = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.placeholder = val;
  };
  const setAttr = (id, attr, val) => {
    const el = document.getElementById(id);
    if (el) el.setAttribute(attr, val);
  };

  // Lang toggle buttons
  document.getElementById('langEN')?.classList.toggle('active', currentLang === 'en');
  document.getElementById('langJA')?.classList.toggle('active', currentLang === 'ja');
  document.documentElement.lang = currentLang;

  // Header
  set('btnSignIn',    t('signIn'));
  set('btnSignUp',    t('createAccount'));
  set('btnSignOut',   t('signOut'));
  set('superBadge',   t('ownerBadge'));
  set('adminBadge',   t('adminBadge'));    // [2026-06-19 #14]
  set('btnAdd',       t('addItem'));
  set('btnImport',    t('import'));
  set('btnExport',    t('export'));
  set('btnUsersLabel',    t('manageUsers')); // [2026-06-19 #14]
  set('btnAuditLogLabel', t('auditLog'));    // [2026-06-19 #14]

  // Stats
  set('labelStatTotal',    t('statTotal'));
  set('labelStatOwned',    t('statOwned'));
  set('labelStatWishlist', t('statWishlist'));
  set('labelStatGroups',   t('statGroups'));

  // Filters
  setPlaceholder('searchInput', t('searchPlaceholder'));

  // Status filter options
  const sf = document.getElementById('statusFilter');
  if (sf) {
    sf.options[0].textContent = t('allStatuses');
    sf.options[1].textContent = t('filterOwned');
    sf.options[2].textContent = t('filterWishlist');
    sf.options[3].textContent = t('filterUntracked');
  }

  // Type filter options
  const tf = document.getElementById('typeFilter');
  if (tf) {
    tf.options[0].textContent = t('allTypes');
    Object.keys(STRINGS.en.types).forEach((key, i) => {
      if (tf.options[i + 1]) tf.options[i + 1].textContent = tType(key);
    });
  }

  // Liver filter first option
  const lf = document.getElementById('liverFilter');
  if (lf && lf.options[0]) lf.options[0].textContent = t('allLivers');

  // Loading screen
  set('loadingText', t('loading'));

  // Auth modal
  set('authModalTitle',    t('authTitle'));
  set('authModalSubtitle', t('authSubtitle'));
  set('tabLogin',          t('tabLogin'));
  set('tabSignup',         t('tabSignup'));
  set('labelLoginUsername',  t('labelUsername'));
  set('labelLoginPassword',  t('labelPassword'));
  set('labelSignupUsername', t('labelUsername'));
  set('labelSignupPassword', t('labelNewPassword'));
  set('labelSignupConfirm',  t('labelConfirm'));
  set('loginBtn',   t('loginBtn'));
  set('signupBtn',  t('signupBtn'));
  setPlaceholder('loginUsername', t('usernamePlaceholder'));
  setPlaceholder('loginPassword', t('passwordPlaceholder'));
  setPlaceholder('signupUsername', t('signupUsernamePlaceholder'));
  setPlaceholder('signupPassword', t('newPasswordPlaceholder'));
  setPlaceholder('signupConfirm',  t('confirmPlaceholder'));

  // Merch modal
  set('labelFImage',    t('labelImage'));
  set('fImageTip',      t('imageTip'));
  set('labelFName',     t('labelLiver'));
  set('labelFGroup',    t('labelSeries'));
  set('labelFType',     t('labelType'));
  set('labelFCost',           t('labelCost'));
  set('labelFCurrency',       t('labelCurrency'));
  set('labelFReleaseDate',    t('labelReleaseDate'));
  set('labelFChekiMembers',   t('labelChekiMembers'));
  set('labelFChekiVariants',  t('labelChekiVariants'));
  set('btnRegistryLabel',     t('registry'));
  set('cancelBtn',      t('cancel'));
  set('saveBtn',        t('save'));
  setPlaceholder('fName',  t('liverPlaceholder'));
  setPlaceholder('fGroup', t('seriesPlaceholder'));

  // Merch type select options (in modal)
  const fs = document.getElementById('fType');
  if (fs) {
    Object.keys(STRINGS.en.types).forEach((key, i) => {
      if (fs.options[i]) fs.options[i].textContent = tType(key);
    });
  }
}
