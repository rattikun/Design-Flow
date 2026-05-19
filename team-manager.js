
// ══ CONSTANTS ════════════════════════════
const LT = { personal: '📋 ลากิจ', vacation: '🏖️ ลาพักร้อน', birthday: '🎂 ลาวันเกิด', dental: '🦷 ลาทำฟัน', accumulated: '📅 วันลาสะสม', sick: '🤒 ลาป่วย', funeral: '🕯️ ลาฌาปนกิจ', maternity: '🤱 ลาคลอด', ordain: '🙏 ลาบวช', training: '📚 ลาฝึกอบรม', sterilize: '⚕️ ลาทำหมัน', other: '📌 อื่นๆ' };
const LQ = { personal: { q: 3, n: '' }, vacation: { q: 7, n: '' }, birthday: { q: 1, n: '' }, dental: { q: 2, n: 'ส่งบิล' }, accumulated: { q: null, n: 'หัวหน้า/PM เท่านั้น' }, sick: { q: 30, n: '' }, funeral: { q: 7, n: '' }, maternity: { q: 98, n: '' }, ordain: { q: null, n: 'แจ้ง/อนุมัติ' }, training: { q: null, n: 'แจ้ง/อนุมัติ' }, sterilize: { q: null, n: 'แจ้ง/อนุมัติ' }, other: { q: null, n: '' } };
const RDOC = ['sick'], ESC = ['sick', 'personal'];
const RL = { junior: 'Junior', senior: 'Senior', lead: 'Team Lead', pm: 'Project Manager' };
const RC = { junior: 'var(--accent)', senior: 'var(--purple)', lead: 'var(--yellow)', pm: 'var(--orange)' };
const EX_LABEL = { solo: '🏃 เดี่ยว', group_ex: '🤸 กลุ่มออกกำลังกาย', group_eat: '🍽️ กลุ่มกินข้าว' };
const EX_REWARD = { solo: 100, group_ex: 500, group_eat: 300 };

// ══ STORAGE ══════════════════════════════
const LS = {
  get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  rm: k => localStorage.removeItem(k)
};
const getUsers = () => LS.get('tf_users') || initUsers();
const saveUsers = u => LS.set('tf_users', u);
const getLeaves = () => LS.get('tf_leaves') || [];
const saveLeaves = l => LS.set('tf_leaves', l);
const getExs = () => LS.get('tf_exs') || [];
const saveExs = e => LS.set('tf_exs', e);
const getQs = () => LS.get('tf_qs') || {};
const saveQs = q => LS.set('tf_qs', q);

function hp(p) { let h = 5381; for (let i = 0; i < p.length; i++)h = ((h << 5) + h) + p.charCodeAt(i); return (h >>> 0).toString(16); }

function uName(email, fallback) {
  const u = (getUsers() || []).find(x => x.email.toLowerCase() === (email || '').toLowerCase());
  if (u) {
    const nick = u.nickname || u.name.split(' ')[0];
    return nick + (u.dept ? ` ${u.dept}` : '');
  }
  return fallback || email;
}
function uNick(email, fallback) {
  const u = (getUsers() || []).find(x => x.email.toLowerCase() === (email || '').toLowerCase());
  if (u) return u.nickname || u.name.split(' ')[0];
  return (fallback || email || '').split(' ')[0];
}

function initUsers() {
  const u = [];
  saveUsers(u); return u;
}

const _REMOVED_DEFAULT_EMAILS = ['pm@team.com', 'lead.uxui@team.com', 'lead.media@team.com', 'lead.art@team.com'];

function ensureDefaultAccounts() {
  let users = LS.get('tf_users');
  if (!users || !Array.isArray(users)) { saveUsers([]); return; }
  const filtered = users.filter(u => !_REMOVED_DEFAULT_EMAILS.includes(u.email));
  if (filtered.length !== users.length) saveUsers(filtered);
}

// ══ AUTH ═════════════════════════════════
let cu = null, lid = 1, eid = 1;
const _localLeaveChanges = new Map(); // id → updated leave object
const _deletedLeaveIds = new Set();    // ids removed locally
const _pendingNewLeaves = new Map();   // id → new leave not yet confirmed in Firebase
function _markLeaveModified(r) { _localLeaveChanges.set(r.id, r); }
function _markLeaveDeleted(id) { _deletedLeaveIds.add(id); _localLeaveChanges.delete(id); _pendingNewLeaves.delete(id); }
function _applyLocalLeaveChanges() {
  const hasChanges = _localLeaveChanges.size || _deletedLeaveIds.size || _pendingNewLeaves.size;
  if (!hasChanges) return;
  let ls = getLeaves();
  if (_deletedLeaveIds.size) ls = ls.filter(r => !_deletedLeaveIds.has(r.id));
  if (_localLeaveChanges.size) ls = ls.map(r => _localLeaveChanges.has(r.id) ? _localLeaveChanges.get(r.id) : r);
  if (_pendingNewLeaves.size) {
    const existingIds = new Set(ls.map(r => r.id));
    _pendingNewLeaves.forEach((r, id) => { if (!existingIds.has(id)) ls.unshift(r); });
  }
  saveLeaves(ls);
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const pass = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-err');

  if (!email || !pass) {
    errEl.textContent = 'กรุณากรอกอีเมลและรหัสผ่าน';
    errEl.style.display = 'block';
    return;
  }

  ensureDefaultAccounts();

  // Step 1: ลอง validate กับ API (source of truth)
  if (typeof api === 'function') {
    try {
      const res = await api('login', { email, passHash: hp(pass) });
      if (res.ok && res.user) {
        // API ตอบ ok → เก็บ user, bootstrap, แล้วเข้าระบบ
        const u = mapUserFromAPI(res.user);
        u.pass = hp(pass);
        cu = u;
        const users = getUsers();
        const idx = users.findIndex(x => x.email.toLowerCase() === email);
        if (idx >= 0) users[idx] = u; else users.push(u);
        saveUsers(users);
        errEl.style.display = 'none';
        LS.set('tf_sess', email);
        await bootstrap();
        initIDs();
        launchApp();
        return;
      }

      if (res._network) {
        console.warn('[doLogin] Network error, trying LS fallback...');
      } else {
        console.warn('[doLogin] API rejected, trying LS fallback...');
      }
    } catch (e) {
      console.error('[doLogin] API Error:', e);
    }
  }

  // Step 2: Fallback — LS-only login (offline mode / local accounts)
  const u = getUsers().find(u => u.email.toLowerCase() === email && u.pass === hp(pass));
  if (!u) {
    errEl.textContent = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';
  cu = u;
  LS.set('tf_sess', email);
  launchApp();
}
function resetAndLogin() { localStorage.clear(); location.reload(); }
function doLogout() {
  cu = null; LS.rm('tf_sess');
  document.getElementById('main-app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-email').value = '';
  document.getElementById('login-pass').value = '';
}
async function tryRestore() {
  ensureDefaultAccounts();
  const e = LS.get('tf_sess'); if (!e) return;
  const u = getUsers().find(x => x.email.toLowerCase() === e.toLowerCase());
  if (!u) return;
  cu = u;
  // launch ทันที (เร็ว) แล้ว bootstrap เบื้องหลัง
  migrateExIds();
  launchApp();
  if (typeof bootstrap === 'function') {
    bootstrap().then(res => {
      if (res.ok) {
        migrateExIds();
        migrateOldExIds().then(() => {
          _applyLocalLeaveChanges(); // re-apply local changes overwritten by bootstrap
          initIDs(); // Update lid from fresh data
          // refresh visible page หลัง sync เสร็จ
          const active = document.querySelector('.page.active');
          if (active) {
            const id = active.id.replace('page-', '');
            if (typeof showPage === 'function') showPage(id);
          }
        });
      }
    });
  }
}
function initIDs() {
  const es = getExs(); if (es.length) eid = Math.max(...es.map(x => x.id || 0)) + 1;
  const ls = getLeaves(); if (ls.length) lid = Math.max(...ls.map(x => x.id || 0)) + 1;
  console.log('[initIDs] eid:', eid, 'lid:', lid);
}
let _lastSyncAt = 0;
function _bgSync() {
  const now = Date.now();
  if (now - _lastSyncAt < 30000) return; // ไม่ sync ถี่กว่า 30 วินาที
  _lastSyncAt = now;
  if (typeof bootstrap !== 'function') return;
  bootstrap().then(res => {
    if (!res.ok) return;
    migrateExIds();
    _applyLocalLeaveChanges();
    initIDs();
    const active = document.querySelector('.page.active');
    if (active) {
      const pageId = active.id.replace('page-', '');
      if (typeof showPage === 'function') showPage(pageId);
    }
  });
}

function launchApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-app').style.display = 'flex';
  setupSidebar(); initApp();
  const hashId = location.hash.slice(1);
  if (VALID_PAGES.has(hashId) && document.getElementById('page-' + hashId)) showPage(hashId, { updateHash: false });

  // โหลดวันหยุดธนาคารไทยไว้ใน cache ตอน launch
  fetchThaiHolidays();

  // sync ทุก 60 วินาที
  setInterval(_bgSync, 60000);

  // sync ทันทีที่ผู้ใช้กลับมาที่แท็บ
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) _bgSync();
  });
}

// ══ SIDEBAR ══════════════════════════════
function setupSidebar() {
  const r = cu.role;
  const nick = cu.nickname || cu.name.split(' ')[0];
  const roleLbl = RL[r];
  const dept = cu.dept ? ' ' + cu.dept : '';
  const char = cu.name.charAt(0).toUpperCase();
  const color = RC[r];

  // Sidebar
  const sbAvatar = document.getElementById('sb-avatar');
  if (sbAvatar) { sbAvatar.textContent = char; sbAvatar.style.color = color; }
  const sbNick = document.getElementById('sb-nickname');
  if (sbNick) sbNick.textContent = nick;
  const sbRole = document.getElementById('sb-role');
  if (sbRole) sbRole.textContent = `(${roleLbl}${dept})`;
  const sbFull = document.getElementById('sb-fullname');
  if (sbFull) sbFull.textContent = cu.name;

  // Dashboard Profile Card
  const dbAvatar = document.getElementById('db-profile-avatar');
  if (dbAvatar) { dbAvatar.textContent = char; dbAvatar.style.color = color; }
  const dbNick = document.getElementById('db-profile-nickname');
  if (dbNick) dbNick.textContent = nick;
  const dbRD = document.getElementById('db-profile-rd');
  if (dbRD) dbRD.textContent = `(${roleLbl}${dept})`;
  const dbFull = document.getElementById('db-profile-fullname');
  if (dbFull) dbFull.textContent = cu.name;

  document.getElementById('nav-sec-members').style.display = (r === 'lead' || r === 'pm') ? 'block' : 'none';
  const _nav = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v; };
  _nav('nav-leave-review', r === 'lead' ? 'flex' : 'none');
  _nav('nav-leave-pm', r === 'pm' ? 'flex' : 'none');
  _nav('nav-ex-review', r === 'pm' ? 'flex' : 'none');
  _nav('nav-balance', (r === 'lead' || r === 'pm') ? 'flex' : 'none');
  _nav('nav-team-hist', (r === 'pm' || r === 'lead') ? 'flex' : 'none');
  _nav('nav-my-balance', 'flex');
  _nav('nav-leaderboard', (r === 'lead' || r === 'pm') ? 'flex' : 'none');
}

// ══ NAVIGATION ═══════════════════════════
const VALID_PAGES = new Set(['dashboard', 'leave-review', 'leave-pm', 'leave-history', 'leave-balance', 'my-balance', 'exercise-log', 'exercise-share', 'exercise-review', 'leaderboard', 'members', 'team-hist']);

// null = ทุก role เข้าได้, array = เฉพาะ role ที่ระบุ
const PAGE_ROLES = {
  'dashboard':        null,
  'leave-history':    null,
  'exercise-log':     null,
  'exercise-share':   null,
  'my-balance':       null,
  'leave-review':     ['lead'],
  'leave-pm':         ['pm'],
  'leave-balance':    ['lead', 'pm'],
  'exercise-review':  ['pm'],
  'leaderboard':      ['lead', 'pm'],
  'members':          ['lead', 'pm'],
  'team-hist':        ['lead', 'pm'],
};

function canAccessPage(id) {
  if (!cu) return false;
  const allowed = PAGE_ROLES[id];
  return allowed === null || allowed === undefined || allowed.includes(cu.role);
}

function showPage(id, { updateHash = true } = {}) {
  if (!canAccessPage(id)) {
    console.warn(`[Route Guard] ไม่มีสิทธิ์เข้าหน้า "${id}" (role: ${cu?.role}) — redirect ไป dashboard`);
    showPage('dashboard');
    return;
  }
  closeSidebar();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pg = document.getElementById('page-' + id); if (pg) pg.classList.add('active');
  const nv = document.querySelector('[onclick="showPage(\'' + id + '\')"]'); if (nv) nv.classList.add('active');
  if (updateHash) history.replaceState(null, '', '#' + id);
  ({ dashboard: updateDashboard, members: renderMembers, 'leave-review': renderLR, 'leave-pm': renderLP, 'leave-history': () => { renderMyBal(); renderHist('pending'); }, 'leave-balance': renderBal, 'my-balance': renderMyBal, 'exercise-review': renderExR, 'exercise-share': renderExShare, leaderboard: updateLB, 'exercise-log': updateQuota, 'team-hist': renderTeamHist })[id]?.();
}

window.addEventListener('hashchange', () => {
  if (!cu) return;
  const id = location.hash.slice(1);
  if (VALID_PAGES.has(id) && document.getElementById('page-' + id)) showPage(id, { updateHash: false });
});

// ══ INIT ═════════════════════════════════
function initApp() {
  const t = new Date().toISOString().split('T')[0];
  ['leave-start', 'leave-end', 'ex-date'].forEach(id => setVal(id, t));
  document.getElementById('leave-name').value = cu.name;
  document.getElementById('ex-name').value = cu.name;
  document.getElementById('bal-year').textContent = new Date().getFullYear();
  document.getElementById('week-label').textContent = '// ' + getWkLabel();
  const ls = getLeaves(), es = getExs();
  lid = ls.length ? Math.max(...ls.map(l => l.id)) + 1 : 1;
  eid = es.length ? Math.max(...es.map(e => e.id)) + 1 : 1;
  setupLeaveFormForRole();
  setupExForm();
  initDatePickers();
  updateDashboard(); updateBadges(); updateQuota();
}

function openLeaveModal() {
  _editingLeaveId = null;
  document.getElementById('modal-leave-title').innerHTML = '<i class="fa-solid fa-circle-plus" style="margin-right:8px;color:var(--accent);"></i>ยื่นใบลา';
  document.getElementById('modal-leave-submit-btn').innerHTML = '<i class="fa-solid fa-circle-plus" style="margin-right:6px;"></i> ยื่นใบลา';
  setupLeaveFormForRole();
  clearLeaveForm();
  document.getElementById('leave-name').value = cu.name;
  document.getElementById('add-for-member-section').style.display = (cu.role === 'lead' || cu.role === 'pm') ? 'block' : 'none';
  const t = new Date().toISOString().split('T')[0];
  setVal('leave-start', t);
  setVal('leave-end', t);
  openModal('modal-leave');
}
function editLeave(id) {
  const r = getLeaves().find(x => x.id === id);
  if (!r || r.email !== cu.email || !r.status.startsWith('pending')) return;
  _editingLeaveId = id;
  document.getElementById('modal-leave-title').innerHTML = '<i class="fa-solid fa-pen" style="margin-right:8px;color:var(--yellow);"></i>แก้ไขใบลา';
  document.getElementById('modal-leave-submit-btn').innerHTML = '<i class="fa-solid fa-floppy-disk" style="margin-right:6px;"></i> บันทึกการแก้ไข';
  setupLeaveFormForRole();
  document.getElementById('add-for-member-section').style.display = 'none';
  document.getElementById('leave-name').value = r.name;
  setVal('leave-type', r.type);
  setVal('leave-start', r.start);
  setVal('leave-end', r.end);
  setVal('leave-period', r.isHalf ? r.period : 'full');
  document.getElementById('leave-reason').value = r.reason || '';
  document.getElementById('leave-link').value = r.docName || '';
  onLeaveChange();
  openModal('modal-leave');
}

const MGMT_ONLY_TYPES = ['funeral', 'maternity', 'training', 'sterilize', 'ordain', 'other', 'accumulated'];
function setupLeaveFormForRole() {
  const isMgr = cu.role === 'lead' || cu.role === 'pm';
  const qs = getQs();
  const hasAccumulated = isMgr || (qs[cu.email]?.accumulated != null && qs[cu.email].accumulated > 0);
  document.getElementById('add-for-member-section').style.display = isMgr ? 'block' : 'none';
  if (isMgr) {
    const sel = document.getElementById('for-member-select');
    const members = cu.role === 'pm' ? getUsers().filter(u => ['junior', 'senior', 'lead'].includes(u.role)) : getMyTeamMembers();
    sel.innerHTML = '<option value="">— ยื่นให้ตัวเอง —</option>' + members.map(u => '<option value="' + u.email + '">' + uName(u.email, u.name) + '</option>').join('');
    sel.onchange = () => onLeaveChange();
  }
  const typeSel = document.getElementById('leave-type');
  const ls = getLeaves();
  const targetEmail = cu.email;
  Array.from(typeSel.options).forEach(opt => {
    const t = opt.value;
    let restricted;
    if (t === 'accumulated') restricted = !hasAccumulated;
    else restricted = MGMT_ONLY_TYPES.includes(t) && !isMgr;

    if (!restricted && LQ[t]?.q != null) {
      const effQ = qs[targetEmail]?.[t] ?? LQ[t].q;
      const used = ls.filter(r => r.email === targetEmail && r.type === t && r.status === 'approved').reduce((s, r) => s + r.days, 0);
      const rem = effQ - used;
      if (rem <= 0) {
        opt.disabled = true;
        opt.style.color = 'var(--text3)';
        if (!opt.dataset.origText) opt.dataset.origText = opt.text;
        opt.text = opt.dataset.origText + ' — หมดโควต้า';
        return;
      }
    }
    opt.disabled = restricted;
    opt.hidden = restricted;
    opt.style.color = '';
    if (opt.dataset.origText) { opt.text = opt.dataset.origText; delete opt.dataset.origText; }
  });
  if (typeSel.options[typeSel.selectedIndex]?.disabled) typeSel.value = 'sick';
}

// Sync split display (DD / MM / YYYY fields) from native YYYY-MM-DD value
function _syncDisplayFromNative(wrap, native) {
  const dEl = wrap.querySelector('[data-part="d"]');
  const mEl = wrap.querySelector('[data-part="m"]');
  const yEl = wrap.querySelector('[data-part="y"]');
  if (!dEl) return;
  if (!native.value) { dEl.value = ''; mEl.value = ''; yEl.value = ''; return; }
  const [y, m, d] = native.value.split('-').map(Number);
  dEl.value = String(d).padStart(2, '0');
  mEl.value = String(m).padStart(2, '0');
  yEl.value = String(y);
}

// Read split fields → validate → update native input
function _syncNativeFromDisplay(wrap, native, onChange) {
  const dEl = wrap.querySelector('[data-part="d"]');
  const mEl = wrap.querySelector('[data-part="m"]');
  const yEl = wrap.querySelector('[data-part="y"]');
  if (!dEl) return;
  const d = parseInt(dEl.value);
  const m = parseInt(mEl.value);
  const y = parseInt(yEl.value);
  if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1000) {
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d) {
      native.value = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (onChange) onChange(native.value);
      return;
    }
  }
  if (!d && !m && !y) native.value = '';
}

function initNativeDateInput(id, onChange) {
  const native = document.getElementById(id);
  if (!native) return;
  const wrap = native.closest('.date-wrap');
  if (!wrap) return;
  const dEl = wrap.querySelector('[data-part="d"]');
  const mEl = wrap.querySelector('[data-part="m"]');
  const yEl = wrap.querySelector('[data-part="y"]');
  if (!dEl) return;

  function syncParts() { _syncNativeFromDisplay(wrap, native, onChange); }

  // วว — กรองเฉพาะตัวเลข, auto-advance ไป เดือน
  dEl.addEventListener('input', () => {
    dEl.value = dEl.value.replace(/\D/g, '').slice(0, 2);
    if (dEl.value.length === 2) mEl.focus();
    syncParts();
  });
  // ดด — auto-advance ไป ปีปปปป
  mEl.addEventListener('input', () => {
    mEl.value = mEl.value.replace(/\D/g, '').slice(0, 2);
    if (mEl.value.length === 2) yEl.focus();
    syncParts();
  });
  // ปปปป
  yEl.addEventListener('input', () => {
    yEl.value = yEl.value.replace(/\D/g, '').slice(0, 4);
    syncParts();
  });

  // Backspace เมื่อ field ว่าง → ย้อนกลับ field ก่อน
  mEl.addEventListener('keydown', e => {
    if (e.key === 'Backspace' && mEl.value === '') { e.preventDefault(); dEl.focus(); dEl.select(); }
  });
  yEl.addEventListener('keydown', e => {
    if (e.key === 'Backspace' && yEl.value === '') { e.preventDefault(); mEl.focus(); mEl.select(); }
  });

  // Calendar picker → sync display
  native.addEventListener('change', () => {
    _syncDisplayFromNative(wrap, native);
    if (onChange) onChange(native.value);
  });

  // Init ถ้ามีค่าเริ่มต้น
  if (native.value) _syncDisplayFromNative(wrap, native);
}

function initDatePickers() {
  initNativeDateInput('leave-start');
  initNativeDateInput('leave-end');
  initNativeDateInput('new-birth');
  initNativeDateInput('edit-birth');
  initNativeDateInput('ex-date', () => { updateQuota(); clearExErr(); });
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = val;
  const wrap = el.closest('.date-wrap');
  if (wrap) _syncDisplayFromNative(wrap, el);
}

// ══ MEMBER MANAGEMENT ════════════════════
function renderMembers() {
  const allUsers = getUsers();
  const ve = getVisibleEmails();
  const users = ve ? allUsers.filter(u => ve.has(u.email)) : allUsers;
  const canE = cu.role === 'lead' || cu.role === 'pm';
  document.getElementById('members-tbody').innerHTML = users.map(u => `
    <tr>
      <td><div class="name">${uName(u.email, u.name)}</div><div class="meta">${u.name} • ${u.email}</div></td>
      <td><span class="chip" style="background:${u.role === 'pm' ? 'var(--orange-bg)' : u.role === 'lead' ? 'var(--yellow-bg)' : 'var(--purple-bg)'};color:${RC[u.role]};">${RL[u.role]}</span></td>
      <td><span style="color:var(--text2);font-size:17px;">${u.dept || '—'}</span></td>
      <td><span style="font-size:16px;font-weight:500;color:${(u.locationType || 'bkk') === 'bkk' ? 'var(--accent)' : 'var(--orange)'};">${(u.locationType || 'bkk') === 'bkk' ? 'กรุงเทพ' : 'ต่างจังหวัด'}</span></td>
      <td><span class="meta">${u.addedBy || 'system'}</span></td>
      <td>${canE ? `
        <button class="btn btn-ghost btn-sm" onclick="openEdit('${u.email}')">✎ แก้ไข</button>
      `: '—'}</td>
    </tr>`).join('');
}
function openAddMember() {
  ['new-name', 'new-nickname', 'new-discord', 'new-birth', 'new-email', 'new-pass', 'new-dept'].forEach(id => setVal(id, ''));
  document.getElementById('new-role').value = 'junior';
  document.getElementById('add-err').style.display = 'none';
  openModal('modal-add');
}
function addMember() {
  const name = document.getElementById('new-name').value.trim(), email = document.getElementById('new-email').value.trim().toLowerCase();
  const pass = document.getElementById('new-pass').value, role = document.getElementById('new-role').value, dept = document.getElementById('new-dept').value.trim();
  const err = document.getElementById('add-err');
  if (!name || !email || !pass) { err.textContent = 'กรุณากรอกข้อมูลให้ครบ'; err.style.display = 'block'; return; }
  if (pass.length < 6) { err.textContent = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'; err.style.display = 'block'; return; }
  const users = getUsers();
  const nickname = document.getElementById('new-nickname').value.trim(), birth = document.getElementById('new-birth').value;
  const discordId = document.getElementById('new-discord').value.trim();
  if (users.find(u => u.email.toLowerCase() === email)) { err.textContent = 'อีเมลนี้มีในระบบแล้ว'; err.style.display = 'block'; return; }
  const userId = _nextUserId();
  const newUser = { email, name, nickname, discordId, birthday: birth, role, dept, pass: hp(pass), addedBy: cu.name, addedAt: new Date().toISOString(), locationType: document.getElementById('new-loc').value || 'bkk', userId };
  users.push(newUser);
  saveUsers(users);
  if (typeof apiSync === 'function') apiSync('addUser', newUser);
  closeModal('modal-add'); renderMembers(); setupLeaveFormForRole(); toast('✅ เพิ่มสมาชิก ' + name + ' เรียบร้อย');
}
function openEdit(email) {
  const u = getUsers().find(x => x.email === email); if (!u) return;
  document.getElementById('edit-key').value = email;
  document.getElementById('edit-name').value = u.name;
  document.getElementById('edit-nickname').value = u.nickname || '';
  document.getElementById('edit-discord').value = u.discordId || '';
  setVal('edit-birth', u.birthday || '');
  document.getElementById('edit-email').value = u.email;
  document.getElementById('edit-pass').value = '';
  document.getElementById('edit-role').value = u.role;
  document.getElementById('edit-dept').value = u.dept || '';
  document.getElementById('edit-loc').value = u.locationType || 'bkk';

  const act = document.getElementById('edit-modal-actions');
  if (act) {
    act.innerHTML = `
      ${u.email !== cu.email ? `<button class="btn btn-red" style="margin-right:auto;" onclick="confDel('${u.email}')">🗑️ ลบสมาชิก</button>` : '<div style="margin-right:auto;"></div>'}
      <button class="btn btn-ghost" onclick="closeModal('modal-edit')">ยกเลิก</button>
      <button class="btn btn-primary" onclick="saveMember()">บันทึก</button>
    `;
  }

  openModal('modal-edit');
}
function saveMember() {
  const ek = document.getElementById('edit-key').value, name = document.getElementById('edit-name').value.trim();
  const pass = document.getElementById('edit-pass').value, role = document.getElementById('edit-role').value, dept = document.getElementById('edit-dept').value.trim();
  if (!name) { toast('⚠️ กรุณากรอกชื่อ'); return; } if (pass && pass.length < 6) { toast('⚠️ รหัสผ่านต้องมีอย่างน้อย 6 ตัว'); return; }
  const users = getUsers(), idx = users.findIndex(u => u.email === ek); if (idx < 0) { console.warn('[saveMember] not found ek=', ek, 'users=', users.map(u => u.email)); toast('⚠️ ไม่พบข้อมูลผู้ใช้ กรุณาลองใหม่'); return; }
  const nickname = document.getElementById('edit-nickname').value.trim(), birth = document.getElementById('edit-birth').value;
  const discordId = document.getElementById('edit-discord').value.trim();
  users[idx].name = name; users[idx].nickname = nickname; users[idx].discordId = discordId; users[idx].birthday = birth; users[idx].role = role; users[idx].dept = dept; users[idx].locationType = document.getElementById('edit-loc').value || 'bkk'; if (pass && pass.length >= 6) users[idx].pass = hp(pass);
  saveUsers(users);
  if (typeof apiSync === 'function') apiSync('updateUser', users[idx]);
  if (ek === cu.email) { cu = users[idx]; LS.set('tf_sess', cu.email); setupSidebar(); }
  closeModal('modal-edit'); renderMembers(); toast('✅ บันทึก ' + name + ' เรียบร้อย');
}
function confDel(email) {
  closeModal('modal-edit');
  const u = getUsers().find(x => x.email === email); if (!u) return;
  document.getElementById('conf-title').textContent = 'ลบสมาชิก';
  document.getElementById('conf-body').innerHTML = 'ต้องการลบ <strong>' + u.name + '</strong> (' + u.email + ') ออกจากระบบ?';
  document.getElementById('conf-ok').onclick = () => delMember(email); openModal('modal-confirm');
}
function delMember(email) {
  saveUsers(getUsers().filter(x => x.email !== email));
  if (typeof apiSync === 'function') apiSync('deleteUser', { email });
  closeModal('modal-confirm'); renderMembers(); toast('🗑️ ลบสมาชิกเรียบร้อย');
}

// ══ CHANGE PASSWORD ══════════════════════
function openChangePass() {
  document.getElementById('cp-old').value = '';
  document.getElementById('cp-new').value = '';
  document.getElementById('cp-confirm').value = '';
  document.getElementById('cp-err').style.display = 'none';
  openModal('modal-change-pass');
}
async function doChangePass() {
  const old = document.getElementById('cp-old').value, n1 = document.getElementById('cp-new').value, n2 = document.getElementById('cp-confirm').value;
  const err = document.getElementById('cp-err');
  if (!old || !n1 || !n2) { err.textContent = '⚠️ กรุณากรอกข้อมูลให้ครบ'; err.style.display = 'block'; return; }
  if (hp(old) !== cu.pass) { err.textContent = '⚠️ รหัสผ่านเดิมไม่ถูกต้อง'; err.style.display = 'block'; return; }
  if (n1.length < 6) { err.textContent = '⚠️ รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร'; err.style.display = 'block'; return; }
  if (n1 !== n2) { err.textContent = '⚠️ ยืนยันรหัสผ่านใหม่ไม่ตรงกัน'; err.style.display = 'block'; return; }

  err.style.display = 'none';
  const newHash = hp(n1);
  const res = await apiSync('updateUser', { email: cu.email, pass: newHash });
  if (res.ok) {
    cu.pass = newHash;
    const users = getUsers(), idx = users.findIndex(u => u.email === cu.email);
    if (idx >= 0) { users[idx].pass = newHash; saveUsers(users); }
    closeModal('modal-change-pass'); toast('✅ เปลี่ยนรหัสผ่านเรียบร้อยแล้ว');
  } else {
    err.textContent = '⚠️ ' + (res.error || 'เกิดข้อผิดพลาดในการเชื่อมต่อ'); err.style.display = 'block';
  }
}

// ══ LEAVE FORM ═══════════════════════════
function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y.slice(2)}`;
}

function countWorkingDays(startStr, endStr) {
  if (!startStr || !endStr || startStr > endStr) return 0;
  const holidays = typeof getHolidaySet === 'function' ? getHolidaySet() : new Set();
  let count = 0;
  const d = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  while (d <= end) {
    const day = d.getDay();
    const ds = d.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && !holidays.has(ds)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function calcEndDateByDays(startStr, numDays) {
  if (!startStr || !numDays || numDays < 1) return '';
  const holidays = typeof getHolidaySet === 'function' ? getHolidaySet() : new Set();
  const d = new Date(startStr + 'T00:00:00');
  let count = 0;
  while (count < numDays) {
    const day = d.getDay();
    const ds = d.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && !holidays.has(ds)) {
      count++;
      if (count === numDays) break;
    }
    d.setDate(d.getDate() + 1);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function onLeaveDaysChange() {
  const start = document.getElementById('leave-start').value;
  const val = document.getElementById('leave-days').value;
  const periodEl = document.getElementById('leave-period');
  const endEl = document.getElementById('leave-end');
  if (!val) { onLeaveChange(); return; }
  if (val === 'morning' || val === 'afternoon') {
    periodEl.value = val;
    setVal('leave-end', start || '');
    endEl.disabled = true;
  } else {
    periodEl.value = 'full';
    endEl.disabled = false;
    const numDays = parseInt(val);
    const endGroup = document.getElementById('leave-end-group');
    if (numDays === 1) {
      if (start) setVal('leave-end', start);
      if (endGroup) endGroup.style.display = 'none';
    } else {
      if (endGroup) endGroup.style.display = 'block';
      if (start && numDays >= 2) setVal('leave-end', calcEndDateByDays(start, numDays));
    }
  }
  onLeaveChange();
}

function onLeaveChange() {
  try {
    const type = document.getElementById('leave-type').value;
    const start = document.getElementById('leave-start').value;
    const end = document.getElementById('leave-end').value;
    const period = document.getElementById('leave-period').value;
    const hints = document.getElementById('leave-hints');
    const docG = document.getElementById('doc-group');
    // recalc end date when start changes, based on leave-days dropdown
    const leaveVal = document.getElementById('leave-days')?.value;
    const selectedNumDays = (leaveVal && leaveVal !== 'morning' && leaveVal !== 'afternoon') ? parseInt(leaveVal) : null;
    if (selectedNumDays !== null && selectedNumDays >= 1 && start) {
      setVal('leave-end', calcEndDateByDays(start, selectedNumDays));
    }
    const endCurrent = document.getElementById('leave-end').value;
    // Allow continuing if we have a valid selected-days value even if endCurrent is temporarily empty
    if (!start || (!endCurrent && selectedNumDays === null)) { hints.innerHTML = ''; docG.style.display = 'none'; return; }
    if (endCurrent && start > endCurrent) { hints.innerHTML = ''; docG.style.display = 'none'; return; }
    document.getElementById('leave-period-group')?.style && (document.getElementById('leave-period-group').style.display = 'none');
    const isHalf = document.getElementById('leave-period').value !== 'full';
    const endEl = document.getElementById('leave-end');
    if (isHalf) { setVal('leave-end', start); endEl.disabled = true; } else { endEl.disabled = false; }
    const rawDays = countWorkingDays(start, isHalf ? start : (endCurrent || start));
    // Use the dropdown-selected days as the authoritative count (user explicitly chose this many days)
    // Fall back to calculated working days only when no dropdown value is selected
    const diff = isHalf ? 0.5 : (selectedNumDays !== null ? selectedNumDays : rawDays);
    const forMember = (document.getElementById('for-member-select')?.value || '') !== '';
    const forMemberEmail = document.getElementById('for-member-select')?.value || '';
    const checkEmail = forMemberEmail ? forMemberEmail : cu.email;
    // ตรวจสอบว่าวันก่อนหน้า start มีใบลาของคนนี้อยู่แล้วหรือไม่
    const _prevDate = new Date(start + 'T00:00:00'); _prevDate.setDate(_prevDate.getDate() - 1);
    const _prevDay = _prevDate.toISOString().slice(0, 10);
    const prevDayHasLeave = type === 'sick' && start ? getLeaves().some(r =>
      r.email === checkEmail && r.status !== 'rejected' &&
      r.start <= _prevDay && r.end >= _prevDay
    ) : false;
    const needDoc = (type === 'sick' && (diff >= 2 || prevDayHasLeave)) || type === 'dental';
    const willEsc = ESC.includes(type) && diff > 3;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const da = Math.ceil((new Date(start) - today) / 864e5);
    const isMgr = cu.role === 'pm' || cu.role === 'lead';
    const needAdv = type !== 'sick' && !forMember && !isMgr;
    const advOk = !needAdv || da >= 7;
    // Show doc-group and set contextual reason
    docG.style.display = needDoc ? 'block' : 'none';
    if (needDoc) {
      const docReason = document.getElementById('doc-reason');
      if (docReason) {
        let reasonText = '📄 ต้องแนบใบรับรองแพทย์';
        if (type === 'dental') {
          reasonText = '🦷 ลาทำฟัน — ต้องแนบใบรับรองแพทย์ทุกครั้ง';
        } else if (type === 'sick' && prevDayHasLeave && diff >= 2) {
          reasonText = '📄 ลาป่วย ' + diff + ' วัน และต่อเนื่องจากการลาวันก่อนหน้า — ต้องแนบใบรับรองแพทย์';
        } else if (type === 'sick' && prevDayHasLeave) {
          reasonText = '📄 ต่อเนื่องจากการลาวันก่อนหน้า — ต้องแนบใบรับรองแพทย์';
        } else if (type === 'sick' && diff >= 2) {
          reasonText = '📄 ลาป่วย ' + diff + ' วัน — ต้องแนบใบรับรองแพทย์';
        }
        docReason.innerHTML = reasonText;
      }
    }
    let hs = [];
    if (isHalf) hs.push('<span style="color:var(--accent);">🌓 ลาครึ่งวัน' + (period === 'morning' ? ' (เช้า)' : ' (บ่าย)') + ' = 0.5 วัน</span>');
    if (isMgr && da < 0) hs.push('<span style="color:var(--yellow);">🕐 ลาย้อนหลัง ' + Math.abs(da) + ' วัน</span>');
    if (needAdv && !advOk) hs.push('<span style="color:var(--red);">⏰ ต้องลาล่วงหน้า 7 วัน — ขาดอีก ' + Math.max(0, 7 - da) + ' วัน</span>');
    else if (needAdv && advOk && !isHalf && da >= 0) hs.push('<span style="color:var(--green);">✓ ลาล่วงหน้า ' + da + ' วัน — ผ่านเกณฑ์</span>');
    if (type === 'sick') {
      const retroOk = isMgr || forMember || da >= -7;
      const retroLabel = !retroOk ? ' &nbsp;|&nbsp; <span style="color:var(--red);">เกินกำหนด ' + Math.abs(da) + ' วัน</span>' : (da < 0 ? ' &nbsp;|&nbsp; <span style="color:var(--yellow);">ย้อนหลัง ' + Math.abs(da) + ' วัน</span>' : '');
      hs.push('<span style="color:' + (!retroOk ? 'var(--red)' : 'var(--accent)') + ';">💊 ลาป่วย — ย้อนหลังได้ไม่เกิน 7 วัน' + retroLabel + '</span>');
    }
    if (type === 'dental') hs.push('<span style="color:var(--red);">📄 ลาทำฟัน — ต้องแนบใบรับรองแพทย์ทุกครั้ง</span>');
    if (isMgr && !forMember) hs.push('<span style="color:var(--purple);">🔓 PM/หัวหน้า — ลาย้อนหลังได้ทุกกรณี</span>');
    else if (forMember) hs.push('<span style="color:var(--purple);">✎ ยื่นแทนสมาชิก — ข้ามกฎลาล่วงหน้า</span>');
    if (willEsc) hs.push('<span style="color:var(--orange);">⚡ ลา ' + diff + ' วัน → จะส่งตรงถึง PM อัตโนมัติ</span>');
    if (type === 'birthday') hs.push('<span style="color:var(--purple);">🎂 หัวหน้าพิจารณาเสมอ</span>');
    // แสดงวันหยุดธนาคารที่ถูกข้ามในช่วงที่เลือก
    if (!isHalf && start && endCurrent && start <= endCurrent) {
      const hols = typeof getHolidaySet === 'function' ? getHolidaySet() : new Set();
      const skipped = [];
      const _d = new Date(start + 'T00:00:00'), _e = new Date(endCurrent + 'T00:00:00');
      while (_d <= _e) {
        const _ds = _d.toISOString().slice(0, 10), _dw = _d.getDay();
        if (_dw !== 0 && _dw !== 6 && hols.has(_ds)) skipped.push(_ds);
        _d.setDate(_d.getDate() + 1);
      }
      if (skipped.length) {
        const names = skipped.map(_ds => {
          const _hd = new Date(_ds + 'T00:00:00');
          return _hd.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
        }).join(', ');
        hs.push('<span style="color:var(--yellow);">🏦 ข้ามวันหยุดธนาคาร ' + skipped.length + ' วัน (' + names + ')</span>');
      }
    }
    hints.innerHTML = hs.map(h => '<div style="padding:8px 12px;background:var(--surface3);border-radius:6px;font-size:17px;margin-bottom:6px;">' + h + '</div>').join('');
  } catch (e) { console.error('[onLeaveChange error]', e); }
}
async function handleDoc(input) {
  const f = input.files[0]; if (!f) return;
  const label = document.getElementById('doc-text'), box = document.getElementById('doc-box'), icon = document.getElementById('doc-icon');

  label.textContent = '⏳ กำลังอัปโหลด...';
  label.style.color = 'var(--accent)';
  box.style.borderColor = 'var(--accent)';

  // แสดง Progress Bar แบบจำลอง
  const progContainer = document.getElementById('leave-upload-progress-container');
  const progBar = document.getElementById('leave-upload-progress-bar');
  const progText = document.getElementById('leave-upload-progress-text');
  progContainer.style.display = 'block';

  let progress = 0;
  const interval = setInterval(() => {
    if (progress < 90) {
      progress += Math.random() * 10;
      if (progress > 90) progress = 90;
      progBar.style.width = progress + '%';
      progText.textContent = Math.round(progress) + '%';
    }
  }, 300);

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const res = await api('uploadFile', {
        action: 'uploadFile',
        fileName: f.name,
        mimeType: f.type,
        base64: e.target.result
      });
      if (res.ok && res.url) {
        clearInterval(interval);
        progBar.style.width = '100%';
        progText.textContent = '100%';

        label.textContent = '✅ อัปโหลดแล้ว: ' + f.name;
        label.style.color = 'var(--green)';
        box.style.borderColor = 'var(--green)';
        icon.textContent = '📄';
        input.dataset.url = res.url;
        toast('✅ อัปโหลดไฟล์ไปที่ Google Drive เรียบร้อย');
      } else {
        throw new Error(res.error || 'Upload failed');
      }
    } catch (err) {
      clearInterval(interval);
      label.textContent = '❌ อัปโหลดล้มเหลว';
      label.style.color = 'var(--red)';
      box.style.borderColor = 'var(--red)';
      toast('❌ ไม่สามารถอัปโหลดได้: ' + err.message);
    } finally {
      setTimeout(() => { progContainer.style.display = 'none'; }, 1500);
    }
  };
  reader.readAsDataURL(f);
}
function leaveConflict(targetEmail, newStart, newEnd, newIsHalf, newPeriod, excludeId) {
  return getLeaves().find(r =>
    r.email === targetEmail &&
    r.status !== 'rejected' &&
    r.id !== excludeId &&
    r.start <= newEnd && r.end >= newStart &&
    !(r.isHalf && newIsHalf && r.start === newStart && r.period !== newPeriod)
  ) || null;
}
function submitLeave() {
  const type = document.getElementById('leave-type').value;
  if (!type) { toast('⚠️ กรุณาเลือกประเภทการลา'); return; }
  const start = document.getElementById('leave-start').value;
  const period = document.getElementById('leave-period').value;
  const reason = document.getElementById('leave-reason').value.trim();
  const link = document.getElementById('leave-link').value.trim();
  const forMemberEmail = _editingLeaveId ? '' : (document.getElementById('for-member-select')?.value || '');
  const isHalf = period !== 'full';
  const end = isHalf ? start : document.getElementById('leave-end').value;
  if (!start || !end) { toast('⚠️ กรุณาเลือกวันที่'); return; }
  if (!reason) { toast('⚠️ กรุณาระบุหมายเหตุ / เหตุผล'); return; }
  if (!isHalf && start > end) { toast('⚠️ วันที่ไม่ถูกต้อง'); return; }
  const rawDays = countWorkingDays(start, end);
  // Use dropdown-selected days as the authoritative count (matches what onLeaveChange uses)
  const _submitLeaveVal = document.getElementById('leave-days')?.value;
  const _submitSelectedDays = (_submitLeaveVal && _submitLeaveVal !== 'morning' && _submitLeaveVal !== 'afternoon') ? parseInt(_submitLeaveVal) : null;
  const diff = isHalf ? 0.5 : (_submitSelectedDays !== null ? _submitSelectedDays : rawDays);

  // --- EDIT MODE ---
  if (_editingLeaveId !== null) {
    const ls = getLeaves(), idx = ls.findIndex(r => r.id === _editingLeaveId); if (idx < 0) return;
    const r = ls[idx];
    const conf = leaveConflict(r.email, start, end, isHalf, period, _editingLeaveId);
    if (conf) { toast('⚠️ มีใบลาที่ทับซ้อนกันอยู่แล้ว (' + LT[conf.type] + ' ' + conf.start + (conf.start !== conf.end ? ' → ' + conf.end : '') + ')'); return; }
    const _ePrev = new Date(start + 'T00:00:00'); _ePrev.setDate(_ePrev.getDate() - 1);
    const _ePrevDay = _ePrev.toISOString().slice(0, 10);
    const _ePrevLeave = type === 'sick' ? getLeaves().some(rx => rx.id !== _editingLeaveId && rx.email === r.email && rx.status !== 'rejected' && rx.start <= _ePrevDay && rx.end >= _ePrevDay) : false;
    if (((type === 'sick' && (diff >= 2 || _ePrevLeave)) || type === 'dental') && !link) { toast('⚠️ กรุณาแนบลิงก์ใบรับรองแพทย์'); return; }
    r.type = type; r.start = start; r.end = end; r.period = period; r.reason = reason;
    r.days = diff; r.isHalf = isHalf; r.hasDoc = !!link; r.docName = link || null;
    saveLeaves(ls);
    apiSync('updateLeave', r);
    _editingLeaveId = null;
    updateDashboard(); clearLeaveForm(); renderMyBal(); renderHist('all'); closeModal('modal-leave');
    toast('✏️ แก้ไขใบลาเรียบร้อยแล้ว');
    return;
  }

  // --- ADD MODE ---
  const isMgrSubmit = cu.role === 'pm' || cu.role === 'lead';
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const da = Math.ceil((new Date(start) - t0) / 864e5);
  if (!isMgrSubmit && !forMemberEmail) {
    if (type === 'sick') {
      if (da < -7) { toast('⚠️ ลาป่วยย้อนหลังได้ไม่เกิน 7 วัน'); return; }
    } else {
      if (da < 7) { toast('⏰ ต้องลาล่วงหน้า 7 วัน (ตอนนี้ ' + da + ' วัน)'); return; }
    }
  }
  let targetEmail = cu.email, targetName = cu.nickname || cu.name.split(' ')[0];
  if (forMemberEmail) { const m = getUsers().find(u => u.email === forMemberEmail); if (m) { targetEmail = m.email; targetName = m.nickname || m.name.split(' ')[0]; } }
  // เช็กวันก่อนหน้า start ว่ามีใบลาของ targetEmail อยู่แล้วหรือไม่
  const _aPrev = new Date(start + 'T00:00:00'); _aPrev.setDate(_aPrev.getDate() - 1);
  const _aPrevDay = _aPrev.toISOString().slice(0, 10);
  const _aPrevLeave = type === 'sick' ? getLeaves().some(r => r.email === targetEmail && r.status !== 'rejected' && r.start <= _aPrevDay && r.end >= _aPrevDay) : false;
  const needDocAdd = (type === 'sick' && (diff >= 2 || _aPrevLeave)) || type === 'dental';
  if (needDocAdd && !link) { toast('⚠️ กรุณาแนบลิงก์ใบรับรองแพทย์' + (_aPrevLeave ? ' (ต่อเนื่องจากการลาวันก่อนหน้า)' : '')); return; }
  const conf = leaveConflict(targetEmail, start, end, isHalf, period, null);
  if (conf) { toast('⚠️ ' + (forMemberEmail ? targetName : 'คุณ') + ' มีใบลาที่ทับซ้อนกันอยู่แล้ว (' + LT[conf.type] + ' ' + conf.start + (conf.start !== conf.end ? ' → ' + conf.end : '') + ')'); return; }
  const isPM = cu.role === 'pm';
  const isLead = cu.role === 'lead';
  const ls = getLeaves();
  const targetUser = getUsers().find(u => u.email === targetEmail);
  const targetDept = (targetUser && targetUser.dept) ? targetUser.dept : (cu.dept || '');
  let initialStatus;
  if (isPM && forMemberEmail) initialStatus = 'approved';
  else if (isPM) initialStatus = 'pending_pm';
  else if (isLead) initialStatus = 'pending_pm';
  else initialStatus = deptHasLead(targetDept) ? 'pending_lead' : 'pending_pm';
  const _maxFromLeaves = ls.length ? Math.max(...ls.map(l => l.id || 0)) : 0;
  const _savedCounter = parseInt(LS.get('tf_lid_counter') || '0', 10);
  const _newId = Math.max(_maxFromLeaves, _savedCounter) + 1;
  lid = _newId + 1;
  LS.set('tf_lid_counter', String(_newId));
  const _yr = new Date().getFullYear();
  const _refNo = 'LV' + _yr + '-' + String(_newId).padStart(4, '0');
  const newLeave = { id: _newId, refNo: _refNo, name: targetName, email: targetEmail, dept: targetDept, type, start, end, period, reason, days: diff, isHalf, hasDoc: !!link, docName: link || null, status: initialStatus, autoEscalated: false, isLeadLeave: isLead, addedBy: forMemberEmail ? cu.name : null, submittedAt: new Date().toISOString(), leadAction: null, pmAction: null, leadNote: '', pmNote: '' };
  ls.unshift(newLeave);
  saveLeaves(ls);
  _pendingNewLeaves.set(newLeave.id, newLeave);

  apiSync('addLeave', newLeave).then(res => { if (res.ok) _pendingNewLeaves.delete(newLeave.id); });

  if (!isPM) {
    if (isLead) notifyLeave(newLeave, 'new_leave_lead', 'pm');
    else notifyLeave(newLeave, 'new_leave_member', 'lead');
  }

  updateBadges(); updateDashboard(); clearLeaveForm(); renderMyBal(); closeModal('modal-leave');
  const who = forMemberEmail ? ' (ให้ ' + targetName + ')' : '';
  let msg = '✅ ยื่นใบลา' + (isHalf ? 'ครึ่งวัน' : ' ' + diff + ' วัน') + who + ' เรียบร้อย';
  if (isPM) msg = '✅ บันทึกใบลา' + (isHalf ? 'ครึ่งวัน' : ' ' + diff + ' วัน') + 'เรียบร้อย (อนุมัติอัตโนมัติ)';
  else if (isLead) msg = '📤 ใบลาของหัวหน้าถูกส่งไปยัง PM เรียบร้อย';
  else msg = '📤 ใบลาถูกส่งไปยังหัวหน้าเพื่อพิจารณาขั้นแรก';
  toast(msg);
}
function clearLeaveForm() {
  ['leave-reason', 'leave-link', 'leave-start', 'leave-end', 'leave-days'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('leave-period').value = 'full';
  document.getElementById('leave-end').disabled = false;
  if (document.getElementById('for-member-select')) document.getElementById('for-member-select').value = '';
  document.getElementById('doc-group').style.display = 'none';
  document.getElementById('leave-hints').innerHTML = '';
}

// ══ LEAVE REVIEW ═════════════════════════
function renderLR() {
  const ve = getVisibleEmails();
  const ls = getLeaves().filter(r => r.status === 'pending_lead' && (ve === null || ve.has(r.email)));
  const el = document.getElementById('leave-review-list');
  if (!ls.length) { el.innerHTML = '<div class="card"><div style="color:var(--text3);text-align:center;padding:20px;font-size:17px;">ไม่มีรายการรอรีวิว 🎉</div></div>'; return; }
  el.innerHTML = ls.map(r => {
    const dLabel = r.isHalf ? ('ครึ่งวัน — ' + (r.period === 'morning' ? 'เช้า' : 'บ่าย')) : r.days + ' วัน';
    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:20px;font-weight:700;color:var(--text);">${uName(r.email, r.name)} <span style="font-size:16px;color:var(--text3);font-family:var(--mono);">${r.email}</span>${r.refNo ? ` <span style="font-size:14px;font-family:var(--mono);color:var(--accent);background:var(--accent-bg);padding:1px 8px;border-radius:20px;">${r.refNo}</span>` : ''}</div>
          <div style="font-size:17px;color:var(--text3);font-family:var(--mono);margin-top:2px;">
            ${LT[r.type]} • ${r.start}${r.start !== r.end ? ' → ' + r.end : ''} 
            <strong style="color:var(--yellow);">(${dLabel})</strong>
            <span style="font-size:14px;background:var(--accent-bg);color:var(--accent);padding:1px 8px;border-radius:20px;font-weight:700;margin-left:4px;font-family:var(--mono);">W${getWkNum(r.start)}</span>
            ${r.addedBy ? ` <span style="color:var(--purple);font-size:15px;">✎ เพิ่มโดย ${r.addedBy}</span>` : ''}
          </div>
          <div style="font-size:17px;color:var(--text2);margin-top:6px;">${r.reason}</div>
          ${r.hasDoc ? `<div style="margin-top:6px;">${r.docName?.startsWith('http') ? `<a href="${r.docName}" target="_blank" style="background:var(--green-bg);color:var(--green);font-size:15px;padding:2px 8px;border-radius:20px;text-decoration:none;">📄 ดูเอกสารบน Drive</a>` : `<span style="background:var(--green-bg);color:var(--green);font-size:15px;padding:2px 8px;border-radius:20px;">📄 ${r.docName}</span>`}</div>` : ''}
        </div>
        <span class="chip chip-pending">รอพิจารณา</span>
      </div>
      <div class="flow-steps" style="margin-top:10px;">
        <span class="flow-step done">✓ ยื่น</span><span class="flow-arrow">→</span>
        <span class="flow-step active-step">● หัวหน้า</span><span class="flow-arrow">→</span>
        <span class="flow-step">○ PM</span>
      </div>
      <div style="margin-top:12px;"><label>หมายเหตุ (ไม่บังคับ)</label><input type="text" placeholder="บันทึกหมายเหตุ..." id="ln-${r.id}" style="margin-top:6px;" /></div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <button class="btn btn-green btn-sm" onclick="lAct(${r.id},'approve')"><i class="fa-solid fa-check"></i> อนุมัติ</button>
        <button class="btn btn-red btn-sm" onclick="lAct(${r.id},'reject')"><i class="fa-solid fa-xmark"></i> ไม่อนุมัติ</button>
        <button class="btn btn-ghost btn-sm" onclick="pmDeleteLeave(${r.id})" style="margin-left:auto;color:var(--red);border-color:rgba(255,80,80,0.3);font-size:13px;padding:3px 10px;"><i class="fa-solid fa-trash"></i> ลบใบลา</button>
      </div>
    </div>`;
  }).join('');
}
function lAct(id, action) {
  const ls = getLeaves(), idx = ls.findIndex(r => r.id === id); if (idx < 0) return;
  const r = ls[idx]; r.leadNote = document.getElementById('ln-' + id)?.value || '';
  r.leadAction = action;
  if (action === 'approve') {
    r.status = 'pending_pm';
    toast('✅ ส่งต่อใบลาของ ' + r.name + ' ให้ PM พิจารณาแล้ว');
    notifyLeave(r, 'lead_approved_leave', 'pm');
  } else {
    r.status = 'rejected';
    toast('✕ ไม่อนุมัติ ' + r.name);
  }
  saveLeaves(ls);
  _markLeaveModified(r);
  apiSync('updateLeave', r);
  updateBadges(); updateDashboard(); renderLR();
}

// ══ LEAVE PM ═════════════════════════════
function renderLP() {
  const ls = getLeaves().filter(r => r.status === 'pending_pm');
  const el = document.getElementById('leave-pm-list');
  if (!ls.length) { el.innerHTML = '<div class="card"><div style="color:var(--text3);text-align:center;padding:20px;font-size:17px;">ไม่มีรายการ 🎉</div></div>'; return; }
  el.innerHTML = ls.map(r => {
    const dLabel = r.isHalf ? ('ครึ่งวัน — ' + (r.period === 'morning' ? 'เช้า' : 'บ่าย')) : r.days + ' วัน';
    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:20px;font-weight:700;color:var(--text);">${uName(r.email, r.name)} <span style="font-size:16px;color:var(--text3);font-family:var(--mono);">${r.email}</span>${r.refNo ? ` <span style="font-size:14px;font-family:var(--mono);color:var(--accent);background:var(--accent-bg);padding:1px 8px;border-radius:20px;">${r.refNo}</span>` : ''}</div>
          <div style="font-size:17px;color:var(--text3);font-family:var(--mono);margin-top:2px;">
            ${LT[r.type]} • ${r.start}${r.start !== r.end ? ' → ' + r.end : ''} 
            <strong style="color:var(--yellow);">(${dLabel})</strong>
            <span style="font-size:14px;background:var(--accent-bg);color:var(--accent);padding:1px 8px;border-radius:20px;font-weight:700;margin-left:4px;font-family:var(--mono);">W${getWkNum(r.start)}</span>
            ${r.addedBy ? ` <span style="color:var(--purple);font-size:15px;">✎ เพิ่มโดย ${r.addedBy}</span>` : ''}
          </div>
          <div style="font-size:17px;color:var(--text2);margin-top:6px;">${r.reason}</div>
          ${r.autoEscalated ? '<div style="font-size:16px;color:var(--purple);margin-top:4px;">⚡ ส่งอัตโนมัติ — ลาเกิน 3 วัน</div>' : ''}
          ${r.leadNote ? `<div style="font-size:16px;color:var(--orange);margin-top:4px;">💬 หัวหน้า: ${r.leadNote}</div>` : ''}
          ${r.hasDoc ? `<div style="margin-top:6px;">${r.docName?.startsWith('http') ? `<a href="${r.docName}" target="_blank" style="background:var(--green-bg);color:var(--green);font-size:15px;padding:2px 8px;border-radius:20px;text-decoration:none;">📄 ดูเอกสารบน Drive</a>` : `<span style="background:var(--green-bg);color:var(--green);font-size:15px;padding:2px 8px;border-radius:20px;">📄 ${r.docName}</span>`}</div>` : ''}
        </div>
        <span class="chip ${r.autoEscalated ? 'chip-pm' : 'chip-escalated'}">${r.autoEscalated ? '⚡ Auto→PM' : 'ส่งจากหัวหน้า'}</span>
      </div>
      <div class="flow-steps" style="margin-top:10px;">
        <span class="flow-step done">✓ ยื่น</span><span class="flow-arrow">→</span>
        <span class="flow-step ${r.isLeadLeave ? 'pending-step' : 'done'}">${r.isLeadLeave ? '— ข้าม' : '✓ หัวหน้า'}</span><span class="flow-arrow">→</span>
        <span class="flow-step active-step">● PM</span>
      </div>
      <div style="margin-top:12px;"><label>หมายเหตุ PM</label><input type="text" placeholder="บันทึกหมายเหตุ..." id="pn-${r.id}" style="margin-top:6px;" /></div>
      <div style="margin-top:12px;display:flex;gap:8px;">
        <button class="btn btn-green btn-sm" onclick="pAct(${r.id},'approve')"><i class="fa-solid fa-check"></i> อนุมัติ</button>
        <button class="btn btn-red btn-sm" onclick="pAct(${r.id},'reject')"><i class="fa-solid fa-xmark"></i> ไม่อนุมัติ</button>
      </div>
    </div>`;
  }).join('');
}
function pAct(id, action) {
  const ls = getLeaves(), idx = ls.findIndex(r => r.id === id); if (idx < 0) return;
  const r = ls[idx];
  r.pmNote = document.getElementById('pn-' + id)?.value || '';
  r.pmAction = action;
  r.status = action === 'approve' ? 'approved' : 'rejected';
  saveLeaves(ls);
  _markLeaveModified(r);
  apiSync('updateLeave', r);
  if (action === 'approve') { notifyLeave(r, 'pm_approved_leave', 'member'); syncLeaveApprovedToSheets(r, cu.name); }
  toast(action === 'approve' ? '✅ PM อนุมัติ ' + r.name : '✕ PM ไม่อนุมัติ ' + r.name);
  updateBadges(); updateDashboard(); renderLP();
}

// ══ LEAVE HISTORY ════════════════════════
let _histFilter = 'pending';
function filterHist(f, btn) {
  if (f !== null) _histFilter = f;
  const card = document.getElementById('hist-tbody')?.closest('.card');
  if (card) card.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderHist(_histFilter);
}
function renderHist(f) {
  let data = getLeaves().filter(r => r.email === cu.email);

  // populate year dropdown
  const yrSel = document.getElementById('hist-year');
  if (yrSel) {
    const years = [...new Set(data.map(r => r.start?.slice(0, 4)).filter(Boolean))].sort((a, b) => b - a);
    const curYear = String(new Date().getFullYear());
    if (yrSel.options.length === 0 || yrSel.dataset.built !== years.join(',')) {
      yrSel.innerHTML = years.map(y => `<option value="${y}"${y === curYear ? ' selected' : ''}>${y}</option>`).join('');
      yrSel.dataset.built = years.join(',');
    }
    const selYear = yrSel.value;
    if (selYear) data = data.filter(r => r.start?.startsWith(selYear));
  }

  if (f === 'pending') data = data.filter(r => r.status.startsWith('pending'));
  else if (f !== 'all') data = data.filter(r => r.status === f);
  const tb = document.getElementById('hist-tbody');
  if (!data.length) { tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:20px;">ไม่มีรายการ</td></tr>'; return; }
  const ch = { pending_lead: '<span class="chip chip-pending">รอหัวหน้า</span>', pending_pm: '<span class="chip chip-escalated">รอ PM</span>', approved: '<span class="chip chip-approved">อนุมัติ</span>', rejected: '<span class="chip chip-rejected">ปฏิเสธ</span>' };
  tb.innerHTML = data.map(r => {
    const dLabel = r.isHalf ? (r.period === 'morning' ? '½เช้า' : '½บ่าย') : r.days + 'd';
    const isOwner = r.email === cu.email;
    const isLeadOfMember = cu.role === 'lead' && r.status.startsWith('pending') && getMyTeamMembers().some(u => u.email === r.email);
    const canEdit = isOwner && r.status.startsWith('pending');
    const canDelete = canEdit || isLeadOfMember;
    const cancelBtn = canDelete ? `<button class="btn btn-red btn-sm" onclick="cancelLeave(${r.id})" style="margin-left:8px;padding:3px 10px;font-size:13px;"><i class="fa-solid fa-trash"></i> ยกเลิก</button>` : '';
    const editBtn = canEdit ? `<button class="btn btn-ghost btn-sm" onclick="editLeave(${r.id})" style="margin-left:4px;padding:3px 10px;font-size:13px;color:var(--yellow);border-color:rgba(245,200,66,.3);"><i class="fa-solid fa-pen"></i> แก้ไข</button>` : '';
    const pmDelBtn = cu.role === 'pm' && !canDelete ? `<button class="btn btn-red btn-sm" onclick="pmDeleteLeave(${r.id})" style="margin-left:8px;padding:3px 10px;font-size:13px;"><i class="fa-solid fa-trash"></i> ลบ (PM)</button>` : '';
    return `<tr>
      <td><div class="name">${uName(r.email, r.name)}</div>${r.refNo ? `<span style="font-size:13px;font-family:var(--mono);color:var(--accent);background:var(--accent-bg);padding:1px 7px;border-radius:20px;">${r.refNo}</span> ` : ''}${r.hasDoc ? (r.docName?.startsWith('http') ? `<a href="${r.docName}" target="_blank" style="text-decoration:none;font-size:14px;background:var(--green-bg);color:var(--green);padding:1px 6px;border-radius:20px;">📄</a>` : '<span style="background:var(--green-bg);color:var(--green);font-size:14px;padding:1px 6px;border-radius:20px;">📄</span>') : ''}${r.addedBy ? '<span style="color:var(--purple);font-size:14px;"> ✎' + r.addedBy + '</span>' : ''}</td>
      <td>${LT[r.type]}</td>
      <td><span class="meta">${r.start}${r.start !== r.end ? ' → ' + r.end : ''}</span><br><span style="font-size:15px;color:var(--yellow);font-family:var(--mono);">${dLabel}</span></td>
      <td style="color:var(--text2);font-size:14px;max-width:200px;">${r.reason || '—'}</td>
      <td>${ch[r.status] || ''}</td>
      <td>${bFlow(r)}${editBtn}${cancelBtn}${pmDelBtn}</td>
    </tr>`;
  }).join('');
}
function pmDeleteLeave(id) {
  if (cu.role !== 'pm') return;
  const ls = getLeaves(), idx = ls.findIndex(r => r.id == id); if (idx < 0) return;
  const r = ls[idx];
  document.getElementById('conf-title').textContent = '🗑 ลบใบลา (PM)';
  document.getElementById('conf-body').innerHTML =
    'ลบใบลาของ <strong>' + uName(r.email, r.name) + ' — ' + LT[r.type] + '</strong><br>' +
    '<span style="font-family:var(--mono);color:var(--text3);">' + r.start + (r.start !== r.end ? ' → ' + r.end : '') + '</span><br>' +
    (r.status === 'approved' ? '<span style="color:var(--yellow);font-size:14px;">⚠️ ใบลานี้อนุมัติแล้ว โควต้าจะถูกคืนให้เจ้าของ</span>' : '');
  document.getElementById('conf-ok').onclick = () => {
    closeModal('modal-confirm');
    const ls2 = getLeaves(), i2 = ls2.findIndex(x => x.id == id); if (i2 < 0) return;
    const leave = ls2[i2];
    ls2.splice(i2, 1);
    saveLeaves(ls2);
    _markLeaveDeleted(leave.id);
    apiSync('deleteLeave', { id: leave.id });
    toast('🗑 ลบใบลาเรียบร้อย' + (leave.status === 'approved' ? ' (คืนโควต้า ' + leave.days + ' วัน)' : ''));
    updateBadges(); updateDashboard(); renderHist(_histFilter); renderMyBal(); renderLR(); renderLP(); renderBal(); renderTeamHist();
  };
  openModal('modal-confirm');
}
function cancelLeave(id) {
  const ls = getLeaves(), idx = ls.findIndex(r => r.id == id); if (idx < 0) return;
  const r = ls[idx];
  const isOwner = r.email === cu.email;
  const isLeadOfMember = cu.role === 'lead' && getMyTeamMembers().some(u => u.email === r.email);
  if ((!isOwner && !isLeadOfMember) || !r.status.startsWith('pending')) return;
  const whoName = r.email !== cu.email ? uName(r.email, r.name) + ' — ' : '';
  document.getElementById('conf-title').textContent = '🗑 ยกเลิกใบลา';
  document.getElementById('conf-body').innerHTML =
    'ต้องการยกเลิกใบลาของ <strong>' + whoName + LT[r.type] + '</strong><br>' +
    '<span style="font-family:var(--mono);color:var(--text3);">' + r.start + (r.start !== r.end ? ' → ' + r.end : '') + '</span> ใช่หรือไม่?';
  document.getElementById('conf-ok').onclick = () => {
    closeModal('modal-confirm');
    const ls2 = getLeaves(), i2 = ls2.findIndex(x => x.id == id); if (i2 < 0) return;
    ls2.splice(i2, 1);
    saveLeaves(ls2);
    _markLeaveDeleted(r.id);
    apiSync('deleteLeave', { id: r.id });
    toast('🗑 ยกเลิกใบลาเรียบร้อยแล้ว');
    updateBadges(); updateDashboard(); renderHist('all'); renderMyBal(); renderLR(); renderTeamHist();
  };
  openModal('modal-confirm');
}
function bFlow(r) {
  const steps = []; steps.push({ l: 'ยื่น', d: true });
  if (r.isLeadLeave) {
    steps.push({ l: 'PM', d: r.pmAction !== null, a: r.status === 'pending_pm' });
  } else {
    steps.push({ l: 'หัวหน้า', d: r.leadAction !== null, a: r.status === 'pending_lead' });
    steps.push({ l: 'PM', d: r.pmAction !== null, a: r.status === 'pending_pm' });
  }
  return '<div class="flow-steps">' + steps.map((x, i) => (i ? '<span class="flow-arrow">→</span>' : '') + '<span class="flow-step ' + (x.d ? 'done' : x.a ? 'active-step' : 'pending-step') + '">' + (x.d ? '✓' : x.a ? '●' : '○') + ' ' + x.l + '</span>').join('') + '</div>';
}

// ══ LEAVE BALANCE (team) ═════════════════
function deptHasLead(dept) {
  if (!dept) return false;
  return getUsers().some(u => u.role === 'lead' && u.dept && u.dept.trim().toLowerCase() === dept.trim().toLowerCase());
}

function getMyTeamMembers() {
  const all = getUsers();
  if (cu.role === 'pm') return all.filter(u => ['junior', 'senior', 'lead'].includes(u.role));
  if (cu.role === 'lead') return all.filter(u => (u.role === 'junior' || u.role === 'senior') && (u.addedBy === cu.name || (cu.dept && u.dept && u.dept.trim().toLowerCase() === cu.dept.trim().toLowerCase())));
  return [];
}
// emails ที่ lead มองเห็นได้ (ตัวเอง + สมาชิกในทีม) — PM คืน null = เห็นทั้งหมด
function getVisibleEmails() {
  if (cu.role === 'pm') return null;
  if (cu.role === 'lead') return new Set([cu.email, ...getMyTeamMembers().map(u => u.email)]);
  return new Set([cu.email]);
}
let selMember = null;
let _balSort = { col: 'name', dir: 'asc' };
let _teamHistDept = 'all', _teamHistStatus = 'approved', _teamHistSort = { col: 'start', dir: 'desc' };
function _teamHistSortBy(col) {
  if (_teamHistSort.col === col) _teamHistSort.dir = _teamHistSort.dir === 'asc' ? 'desc' : 'asc';
  else { _teamHistSort.col = col; _teamHistSort.dir = 'asc'; }
  renderTeamHist();
}
function filterTeamHist(status, btn) {
  if (btn) { document.querySelectorAll('#team-hist-status-tabs .tab').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
  _teamHistStatus = status;
  renderTeamHist();
}
function filterTeamHistDept(dept) {
  _teamHistDept = dept;
  renderTeamHist();
}
function renderTeamHist() {
  const yrSel = document.getElementById('team-hist-year');
  const allLeaves = getLeaves();
  const years = [...new Set(allLeaves.map(r => r.start?.slice(0, 4)).filter(Boolean))].sort((a, b) => b - a);
  const curYear = String(new Date().getFullYear());
  if (!years.includes(curYear)) years.unshift(curYear);
  if (yrSel.dataset.built !== years.join(',')) {
    yrSel.innerHTML = years.map(y => `<option value="${y}"${y === curYear ? ' selected' : ''}>${y}</option>`).join('');
    yrSel.dataset.built = years.join(',');
  }
  const selYear = yrSel.value || curYear;

  const users = getUsers();
  const isPM = cu.role === 'pm';
  const isLead = cu.role === 'lead';
  const myTeamEmails = isLead ? new Set([cu.email, ...getMyTeamMembers().map(u => u.email)]) : null;

  const deptSel = document.getElementById('team-hist-dept-sel');
  if (deptSel) {
    deptSel.parentElement.style.display = isPM ? 'flex' : 'none';
    if (isPM) {
      const depts = [...new Set(users.map(u => u.dept).filter(Boolean))].sort();
      if (deptSel.dataset.built !== depts.join(',')) {
        deptSel.innerHTML = '<option value="all">ทุกแผนก</option>' + depts.map(d => `<option value="${d}">${d}</option>`).join('');
        deptSel.dataset.built = depts.join(',');
      }
      deptSel.value = _teamHistDept;
    }
  }

  let data = allLeaves.filter(r => r.start?.startsWith(selYear) && (_teamHistStatus === 'pending' ? r.status.startsWith('pending') : r.status === _teamHistStatus));
  if (isLead) {
    data = data.filter(r => myTeamEmails.has(r.email));
  } else if (_teamHistDept !== 'all') {
    const deptEmails = new Set(users.filter(u => u.dept === _teamHistDept).map(u => u.email));
    data = data.filter(r => deptEmails.has(r.email));
  }
  const searchQ = (document.getElementById('team-hist-search')?.value || '').trim().toLowerCase();
  if (searchQ) {
    const uMap = new Map(users.map(u => [u.email, u]));
    data = data.filter(r => {
      const dept = (uMap.get(r.email)?.dept || r.dept || '').toLowerCase();
      const typeTh = (LT[r.type] || r.type || '').toLowerCase();
      return (r.refNo || '').toLowerCase().includes(searchQ)
        || (r.name || '').toLowerCase().includes(searchQ)
        || (r.email || '').toLowerCase().includes(searchQ)
        || dept.includes(searchQ)
        || typeTh.includes(searchQ)
        || (r.reason || '').toLowerCase().includes(searchQ);
    });
  }
  const _sc = _teamHistSort.col, _sd = _teamHistSort.dir;
  data.sort((a, b) => {
    let va, vb;
    if (_sc === 'start') { va = a.start || ''; vb = b.start || ''; }
    else if (_sc === 'name') { va = (a.name || '').toLowerCase(); vb = (b.name || '').toLowerCase(); }
    else if (_sc === 'dept') { va = (a.dept || '').toLowerCase(); vb = (b.dept || '').toLowerCase(); }
    else if (_sc === 'type') { va = a.type || ''; vb = b.type || ''; }
    else if (_sc === 'days') { va = a.days || 0; vb = b.days || 0; }
    else if (_sc === 'refNo') { va = a.refNo || ''; vb = b.refNo || ''; }
    else { va = ''; vb = ''; }
    return _sd === 'asc' ? (va > vb ? 1 : va < vb ? -1 : 0) : (va < vb ? 1 : va > vb ? -1 : 0);
  });

  ['refNo', 'name', 'dept', 'type', 'start', 'days'].forEach(col => {
    const el = document.getElementById('th-' + col);
    if (el) el.textContent = _teamHistSort.col === col ? (_teamHistSort.dir === 'asc' ? '↑' : '↓') : '↕';
  });
  const tb = document.getElementById('team-hist-tbody');
  if (!data.length) { tb.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text3);padding:20px;">ไม่มีรายการ</td></tr>'; return; }
  const ch = { approved: '<span class="chip chip-approved">อนุมัติ</span>', rejected: '<span class="chip chip-rejected">ปฏิเสธ</span>', pending_lead: '<span class="chip chip-pending">รอหัวหน้า</span>', pending_pm: '<span class="chip chip-escalated">รอ PM</span>' };
  tb.innerHTML = data.map(r => {
    const u = users.find(x => x.email === r.email);
    const dept = u?.dept || r.dept || '—';
    const dLabel = r.isHalf ? (r.period === 'morning' ? '½เช้า' : '½บ่าย') : r.days + 'd';
    return `<tr>
      <td><span style="font-size:13px;font-family:var(--mono);color:var(--accent);background:var(--accent-bg);padding:1px 7px;border-radius:20px;white-space:nowrap;">${r.refNo || '—'}</span></td>
      <td><div class="name">${uName(r.email, r.name)}</div><div class="meta">${r.email}</div></td>
      <td><span style="font-size:14px;color:var(--text2);">${dept}</span></td>
      <td>${LT[r.type] || r.type}</td>
      <td><span class="meta">${r.start}${r.start !== r.end ? ' → ' + r.end : ''}</span></td>
      <td><span style="font-family:var(--mono);font-weight:700;color:var(--yellow);">${dLabel}</span></td>
      <td style="color:var(--text2);font-size:14px;max-width:180px;">${r.reason || '—'}</td>
      <td>${ch[r.status] || ''}</td>
      <td>${isPM ? `<button class="btn btn-red btn-sm" onclick="pmDeleteLeave(${r.id})" style="padding:3px 10px;font-size:13px;"><i class="fa-solid fa-trash"></i></button>` : ''}</td>
    </tr>`;
  }).join('');
}
function renderBal() {
  const isPM = cu.role === 'pm';
  document.getElementById('pm-reset-wrap').style.display = isPM ? 'flex' : 'none';
  const members = getMyTeamMembers();
  const nd = document.getElementById('bal-nodata');
  const tabs = document.getElementById('bal-tabs');
  if (!members.length) {
    nd.style.display = 'block'; nd.innerHTML = '<div style="color:var(--text3);text-align:center;padding:32px;"><div style="font-size:36px;">👥</div><div style="font-size:18px;color:var(--text2);margin-top:8px;">ยังไม่มีสมาชิกในทีม</div></div>';
    if (tabs) tabs.innerHTML = ''; const ov = document.getElementById('bal-overview'); if (ov) ov.innerHTML = ''; return;
  }
  nd.style.display = 'none';

  // populate year dropdown
  const yrSel = document.getElementById('bal-year-sel');
  const allLeaves = getLeaves();
  const years = [...new Set(allLeaves.map(r => r.start?.slice(0, 4)).filter(Boolean))].sort((a, b) => b - a);
  const curYear = String(new Date().getFullYear());
  if (!years.includes(curYear)) years.unshift(curYear);
  if (yrSel.dataset.built !== years.join(',')) {
    yrSel.innerHTML = years.map(y => `<option value="${y}"${y === curYear ? ' selected' : ''}>${y}</option>`).join('');
    yrSel.dataset.built = years.join(',');
  }
  const selYear = yrSel.value || curYear;
  document.getElementById('bal-year').textContent = selYear;

  renderBalOverview(members, isPM, selYear);
  if (isPM) renderAccuHistoryPanel(members);
}

function renderAccuHistoryPanel(members) {
  const panel = document.getElementById('accu-history-panel');
  if (!panel) return;
  const qs = getQs();

  const rows = [];
  members.forEach(u => {
    const history = qs[u.email]?.accuHistory || [];
    history.forEach((h, i) => {
      rows.push({ u, h, idx: i });
    });
  });

  if (!rows.length) {
    panel.style.display = 'none';
    return;
  }

  rows.sort((a, b) => (b.h.date || '').localeCompare(a.h.date || ''));

  panel.style.display = 'block';
  panel.innerHTML = `
    <div class="card">
      <div class="card-title" style="margin-bottom:16px;">📅 ประวัติการเพิ่มวันลาสะสม</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>รหัส</th>
              <th>สมาชิก</th>
              <th>วันที่</th>
              <th>ชิ้นงาน / เหตุผล</th>
              <th style="text-align:center;">วัน</th>
              <th>เพิ่มโดย</th>
              <th>เพิ่มเมื่อ</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(({ u, h }) => `
              <tr>
                <td><span style="font-size:13px;font-family:var(--mono);color:var(--accent);background:var(--accent-bg);padding:1px 7px;border-radius:20px;white-space:nowrap;">${h.refNo || '—'}</span></td>
                <td><span style="font-weight:600;color:var(--text);">${uName(u.email, u.name)}</span><br><span style="font-size:15px;color:var(--text3);">${u.dept || ''}</span></td>
                <td><span style="font-family:var(--mono);font-size:14px;color:var(--text2);">${h.date || '—'}</span></td>
                <td style="color:var(--text2);">${h.scope || '—'}</td>
                <td style="text-align:center;"><span style="font-family:var(--mono);font-weight:700;color:var(--yellow);">${h.days}d</span></td>
                <td style="font-size:14px;color:var(--text3);">${h.addedBy || '—'}</td>
                <td style="font-size:15px;color:var(--text3);font-family:var(--mono);">${h.addedAt ? h.addedAt.slice(0, 10) : '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function _balSortBy(col) {
  if (_balSort.col === col) _balSort.dir = _balSort.dir === 'asc' ? 'desc' : 'asc';
  else { _balSort.col = col; _balSort.dir = 'asc'; }
  renderBal();
}
function renderBalOverview(members, isPM, selYear) {
  const isMgr = isPM || cu.role === 'lead';
  const ls = getLeaves().filter(r => r.start?.startsWith(selYear)), qs = getQs();
  const fixedTypes = Object.keys(LQ).filter(t => LQ[t].q !== null);
  const nullTypes = Object.keys(LQ).filter(t => LQ[t].q === null);
  const allTypes = isMgr ? [...fixedTypes, ...nullTypes] : fixedTypes;

  // compute data for sorting
  const memberData = members.map(u => {
    const cols = {};
    allTypes.forEach(type => {
      const def = LQ[type], cq = qs[u.email]?.[type] ?? null;
      const used = ls.filter(r => r.email === u.email && r.type === type && r.status === 'approved').reduce((s, r) => s + r.days, 0);
      if (def.q === null && cq === null) { cols[type] = { display: (ls.filter(r => r.email === u.email && r.type === type && r.status === 'approved').length || 0), isCount: true }; }
      else { const effQ = cq !== null ? cq : def.q; cols[type] = { rem: Math.max(0, effQ - used), effQ, used }; }
    });
    return { u, cols };
  });

  // sort
  memberData.sort((a, b) => {
    let va, vb;
    if (_balSort.col === 'name') { va = uName(a.u.email, a.u.name).toLowerCase(); vb = uName(b.u.email, b.u.name).toLowerCase(); }
    else { va = a.cols[_balSort.col]?.rem ?? a.cols[_balSort.col]?.display ?? 0; vb = b.cols[_balSort.col]?.rem ?? b.cols[_balSort.col]?.display ?? 0; }
    return _balSort.dir === 'asc' ? (va > vb ? 1 : va < vb ? -1 : 0) : (va < vb ? 1 : va > vb ? -1 : 0);
  });

  const arrow = col => _balSort.col === col ? (_balSort.dir === 'asc' ? ' ↑' : ' ↓') : ' ↕';
  const thStyle = 'text-align:center;white-space:nowrap;cursor:pointer;user-select:none;';

  const rows = memberData.map(({ u, cols }) => {
    const cells = allTypes.map(type => {
      const d = cols[type];
      if (d.isCount) return '<td style="text-align:center;font-family:var(--mono);font-size:17px;"><span style="color:var(--text2);">' + (d.display || '—') + '</span>' + (d.display ? '<span style="color:var(--text3);font-size:13px;"> ครั้ง</span>' : '') + '</td>';
      const c = d.rem === 0 ? 'var(--red)' : d.rem <= 2 ? 'var(--yellow)' : 'var(--green)';
      return '<td style="text-align:center;font-family:var(--mono);font-size:17px;"><span style="font-weight:700;color:' + c + ';">' + d.rem + '</span><span style="color:var(--text3);font-size:15px;">/' + d.effQ + '</span></td>';
    }).join('');
    const action = isPM ? '<td style="text-align:right;"><button class="btn btn-ghost btn-sm" onclick="openQuotaModal(\'' + u.email + '\')" style="padding:6px 14px;border-radius:10px;font-size:15px;color:var(--yellow);border-color:rgba(245,200,66,0.2);background:rgba(245,200,66,0.05);"><i class="fa-solid fa-pencil"></i> แก้ไข</button></td>' : '';
    return '<tr><td><div class="name">' + uName(u.email, u.name) + '</div><div class="meta">' + u.email + '</div></td>' + cells + action + '</tr>';
  }).join('');

  const nameTh = '<th style="cursor:pointer;user-select:none;" onclick="_balSortBy(\'name\')">สมาชิก' + arrow('name') + '</th>';
  const ths = allTypes.map(t => '<th style="' + thStyle + '" onclick="_balSortBy(\'' + t + '\')">' + LT[t].replace(/^\S+\s/, '') + arrow(t) + '</th>').join('');
  const actionTh = isPM ? '<th style="text-align:right;">โควต้า</th>' : '';
  document.getElementById('bal-overview').innerHTML = '<div class="card" style="margin-bottom:16px;"><div class="card-title">◈ ภาพรวมวันลาทั้งทีม — ปี ' + selYear + '</div><div style="font-size:16px;color:var(--text3);margin-bottom:12px;">ตัวเลข = วันคงเหลือ/โควต้า &nbsp;|&nbsp; <span style="color:var(--red);">แดง</span>=หมด &nbsp;<span style="color:var(--yellow);">เหลือง</span>=น้อย &nbsp;|&nbsp; คลิก header เพื่อเรียงลำดับ</div><div class="table-wrap"><table><thead><tr>' + nameTh + ths + actionTh + '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}


function openQuotaModal(email) {
  const user = getUsers().find(u => u.email === email);
  if (!user) return;

  document.getElementById('quota-target-name').textContent = uName(user.email, user.name);
  document.getElementById('quota-target-email').textContent = user.email;

  const ls = getLeaves(), qs = getQs();
  const allTypes = Object.keys(LQ);

  const body = document.getElementById('quota-modal-body');
  body.innerHTML = `
    <div style="display:grid; grid-template-columns: 1.5fr 1fr 1fr; gap:12px; padding:0 12px; margin-bottom:4px;">
      <div style="font-size:12px; font-weight:700; color:var(--text3); text-transform:uppercase;">ประเภท</div>
      <div style="font-size:12px; font-weight:700; color:var(--text3); text-transform:uppercase; text-align:center;">ทั้งหมด</div>
      <div style="font-size:12px; font-weight:700; color:var(--text3); text-transform:uppercase; text-align:center;">คงเหลือ</div>
    </div>
    ${allTypes.map(type => {
    const def = LQ[type], cq = qs[email]?.[type] ?? null, effQ = cq !== null ? cq : (def.q ?? 0);
    const used = ls.filter(r => r.email === email && r.type === type && r.status === 'approved').reduce((s, r) => s + r.days, 0);
    const rem = Math.max(0, effQ - used);

    if (type === 'accumulated') {
      const history = qs[email]?.accuHistory || [];
      const totalDays = history.reduce((s, h) => s + (h.days || 0), 0);
      const histRows = history.map((h, i) => `
        <div style="display:grid;grid-template-columns:auto 1fr 2fr 60px 32px;gap:8px;align-items:center;padding:6px 8px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:4px;">
          <span style="font-size:12px;color:var(--accent);background:var(--accent-bg);padding:1px 7px;border-radius:20px;font-family:var(--mono);white-space:nowrap;">${h.refNo || '—'}</span>
          <span style="font-size:13px;color:var(--text2);font-family:var(--mono);">${h.date}</span>
          <span style="font-size:13px;color:var(--text2);">${h.scope}</span>
          <span style="font-size:13px;color:var(--yellow);font-family:var(--mono);font-weight:700;text-align:center;">${h.days}d</span>
          <button onclick="removeAccuHistory('${email}',${i})" style="background:rgba(255,80,80,0.15);border:none;border-radius:6px;color:var(--red);cursor:pointer;font-size:14px;width:28px;height:28px;">✕</button>
        </div>`).join('');
      return `
        <div style="padding:10px 12px;background:rgba(255,255,255,0.02);border-radius:12px;border:1px solid rgba(255,255,255,0.01);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0px;">
            <div>
              <div style="font-size:16px;font-weight:700;color:#fff;">${LT['accumulated']}</div>
              <div style="font-size:12px;color:var(--text3);">รวม ${totalDays} วัน · ใช้ไปแล้ว ${used} วัน · คงเหลือ ${Math.max(0, totalDays - used)} วัน</div>
            </div>
            <input type="hidden" class="quota-total-input" data-type="accumulated" data-used="${used}" value="${totalDays}" />
          </div>
          ${history.length ? `<div style="margin-bottom:10px;">${histRows}</div>` : '<div style="font-size:15px;color:var(--text3);margin-bottom:10px;">ยังไม่มีรายการ</div>'}
          <div style="padding-top:10px;border-top:1px solid rgba(255,255,255,0.06);">
            <div style="font-size:12px;color:var(--accent);font-weight:700;margin-bottom:8px;">+ เพิ่มรายการใหม่</div>
            <div style="display:grid;grid-template-columns:1fr 2fr 80px;gap:8px;align-items:end;">
              <div>
                <div style="font-size:12px;color:var(--text3);margin-bottom:4px;">📅 วันที่เบิกวันหยุด</div>
                <input type="date" id="quota-accu-date" style="width:100%;height:34px;background:var(--surface3);border:1px solid var(--border);border-radius:8px;color:#fff;padding:0 8px;font-size:13px;" />
              </div>
              <div>
                <div style="font-size:12px;color:var(--text3);margin-bottom:4px;">📋 ขอบเขตชิ้นงาน</div>
                <input type="text" id="quota-accu-scope" placeholder="ระบุชิ้นงาน..." style="width:100%;height:34px;background:var(--surface3);border:1px solid var(--border);border-radius:8px;color:#fff;padding:0 8px;font-size:13px;" />
              </div>
              <div>
                <div style="font-size:12px;color:var(--text3);margin-bottom:4px;">จำนวนวัน</div>
                <input type="number" id="quota-accu-days" value="1" min="0.5" step="0.5" style="width:100%;height:34px;background:var(--surface3);border:1px solid var(--border);border-radius:8px;color:#fff;text-align:center;font-size:14px;font-family:var(--mono);" />
              </div>
            </div>
            <button onclick="addAccuHistory('${email}')" style="margin-top:8px;padding:6px 16px;background:var(--accent-bg);color:var(--accent);border:1px solid rgba(108,99,255,0.3);border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;">+ เพิ่ม</button>
          </div>
        </div>`;
    }
    return `
      <div style="display:grid; grid-template-columns: 1.5fr 1fr 1fr; gap:12px; align-items:center; padding:8px 12px; background:rgba(255,255,255,0.02); border-radius:12px; border:1px solid rgba(255,255,255,0.01);">
        <div>
          <div style="font-size:16px; font-weight:700; color:#fff;">${LT[type]}</div>
          <div style="font-size:12px; color:var(--text3);">ใช้ไปแล้ว ${used} วัน</div>
        </div>
        <div>
          <input type="number" class="quota-total-input" data-type="${type}" data-used="${used}" value="${effQ}" min="${used}" max="365"
            oninput="syncQuota(this, 'rem')"
            style="width:100%; height:38px; background:var(--surface3); border:1px solid var(--border); border-radius:8px; color:#fff; text-align:center; font-size:16px; font-family:var(--mono); font-weight:700; outline:none;" />
        </div>
        <div>
          <input type="number" class="quota-rem-input" data-type="${type}" data-used="${used}" value="${rem}" min="0" max="365"
            oninput="syncQuota(this, 'total')"
            style="width:100%; height:38px; background:rgba(61, 214, 140, 0.05); border:1px solid rgba(61, 214, 140, 0.2); border-radius:8px; color:var(--green); text-align:center; font-size:16px; font-family:var(--mono); font-weight:700; outline:none;" />
        </div>
      </div>`;
  }).join('')}`;


  document.getElementById('btn-save-quota').onclick = () => saveQuotas(email);
  openModal('modal-quota');
}

function syncQuota(el, target) {
  const used = parseFloat(el.getAttribute('data-used'));
  const val = parseFloat(el.value) || 0;
  const row = el.closest('div').parentElement;

  if (target === 'rem') {
    const remInput = row.querySelector('.quota-rem-input');
    remInput.value = (Math.max(0, val - used)).toFixed(1).replace(/\.0$/, '');
  } else {
    const totalInput = row.querySelector('.quota-total-input');
    totalInput.value = (val + used).toFixed(1).replace(/\.0$/, '');
  }
}

function saveQuotas(email) {
  const inputs = document.querySelectorAll('.quota-total-input');
  const qs = getQs();
  if (!qs[email]) qs[email] = {};

  inputs.forEach(input => {
    const type = input.getAttribute('data-type');
    const val = parseFloat(input.value);
    if (!isNaN(val) && val >= 0) qs[email][type] = val;
  });

  saveQs(qs);
  apiSync('updateQuotas', { email, data: qs[email] });
  closeModal('modal-quota');
  toast('✅ บันทึกโควต้าสำเร็จ');
  renderBal();
  setupLeaveFormForRole();
}
function addAccuHistory(email) {
  const date = document.getElementById('quota-accu-date').value;
  const scope = document.getElementById('quota-accu-scope').value.trim();
  const days = parseFloat(document.getElementById('quota-accu-days').value);
  if (!date) { toast('⚠️ กรุณาระบุวันที่เบิกวันหยุด'); return; }
  if (!scope) { toast('⚠️ กรุณาระบุขอบเขตชิ้นงาน'); return; }
  if (!days || days <= 0) { toast('⚠️ กรุณาระบุจำนวนวัน'); return; }
  const qs = getQs();
  if (!qs[email]) qs[email] = {};
  if (!qs[email].accuHistory) qs[email].accuHistory = [];
  const _yr = new Date().getFullYear();
  const _maxFromQs = Object.values(qs).flatMap(q => q.accuHistory || []).map(h => parseInt((h.refNo || '').split('-')[1]) || 0).reduce((a, b) => Math.max(a, b), 0);
  const _savedAcCtr = parseInt(LS.get('tf_accu_counter') || '0', 10);
  const _acId = Math.max(_maxFromQs, _savedAcCtr) + 1;
  LS.set('tf_accu_counter', String(_acId));
  const refNo = 'AC' + _yr + '-' + String(_acId).padStart(4, '0');
  const entry = { refNo, date, scope, days, addedBy: cu.name, addedAt: new Date().toISOString() };
  qs[email].accuHistory.push(entry);
  qs[email].accumulated = qs[email].accuHistory.reduce((s, h) => s + (h.days || 0), 0);
  saveQs(qs);
  apiSync('updateQuotas', { email, data: qs[email] });
  if (typeof notifyAccuHistory === 'function') notifyAccuHistory(email, entry);
  toast('✅ เพิ่มวันลาสะสม ' + days + ' วัน เรียบร้อย');
  renderBal(); renderMyBal(); updateDashboard(); setupLeaveFormForRole();
  openQuotaModal(email);
}
function removeAccuHistory(email, idx) {
  const qs = getQs();
  if (!qs[email]?.accuHistory) return;
  qs[email].accuHistory.splice(idx, 1);
  qs[email].accumulated = qs[email].accuHistory.reduce((s, h) => s + (h.days || 0), 0);
  saveQs(qs);
  apiSync('updateQuotas', { email, data: qs[email] });
  renderBal(); renderMyBal(); updateDashboard(); setupLeaveFormForRole();
  openQuotaModal(email);
}



function openTeamQuotaModal() {
  const allTypes = Object.keys(LQ);
  const body = document.getElementById('team-quota-body');
  const qs = getQs();
  const members = getMyTeamMembers();
  const refEmail = members[0]?.email;

  body.innerHTML = allTypes.map(type => {
    const def = LQ[type];
    const saved = refEmail && qs[refEmail]?.[type] != null ? qs[refEmail][type] : (def.q ?? 0);
    const defaultVal = saved;
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 16px; background:rgba(255,255,255,0.02); border-radius:12px; border:1px solid rgba(255,255,255,0.01);">
        <div>
          <div style="font-size:17px; font-weight:700; color:#fff;">${LT[type]}</div>
          <div style="font-size:13px; color:var(--text3);">${def.n || ''}</div>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <input type="number" class="team-quota-input" data-type="${type}" value="${defaultVal}" min="0" max="365"
            style="width:80px; height:38px; background:var(--surface3); border:1px solid var(--border); border-radius:8px; color:#fff; text-align:center; font-size:17px; font-family:var(--mono); font-weight:700; outline:none;" />
          <span style="color:var(--text3); font-size:14px; font-weight:500;">วัน/ปี</span>
        </div>
      </div>`;
  }).join('');

  openModal('modal-team-quota');
}

function saveTeamQuotas() {
  const inputs = document.querySelectorAll('.team-quota-input');
  const qs = getQs();
  const members = getMyTeamMembers();

  const updates = {};
  inputs.forEach(input => {
    const type = input.getAttribute('data-type');
    const val = parseFloat(input.value);
    if (!isNaN(val) && val >= 0) {
      updates[type] = val;
    }
  });

  if (Object.keys(updates).length === 0) return;

  openConfirm('ยืนยันปรับโควต้าทั้งทีม?', `โควต้าของสมาชิกทุกคน (${members.length} คน) จะถูกปรับเป็นค่าใหม่ตามที่กำหนด ยืนยันหรือไม่?`, () => {
    members.forEach(m => {
      if (!qs[m.email]) qs[m.email] = {};
      Object.assign(qs[m.email], updates);
    });

    saveQs(qs);
    members.forEach(m => apiSync('updateQuotas', { email: m.email, data: qs[m.email] }, { silent: true }));
    closeModal('modal-team-quota');
    toast(`✅ อัปเดตโควต้าสมาชิก ${members.length} คนเรียบร้อย`);
    renderBal();
  });
}

function confirmReset() {
  openConfirm('รีเซตประจำปี', 'รีเซตโควต้าทั้งหมดกลับค่าเริ่มต้นสำหรับปี ' + new Date().getFullYear() + '?', () => {
    saveQs({});
    toast('🔄 รีเซตโควต้าเรียบร้อย');
    renderBal();
  });
}
function confirmClearLeaves() {
  openConfirm(
    '⚠️ ล้างข้อมูลการลาทั้งหมด',
    '<span style="color:var(--red);font-weight:700;">คำเตือน:</span> ข้อมูลการลาทุกรายการจะถูกลบออกจากระบบถาวร ไม่สามารถกู้คืนได้<br><br>ยืนยันที่จะดำเนินการหรือไม่?',
    () => {
      saveLeaves([]);
      _localLeaveChanges.clear();
      _deletedLeaveIds.clear();
      apiSync('clearAllLeaves', {});
      updateBadges(); updateDashboard();
      renderBal(); renderLR(); renderLP();
      toast('🗑 ล้างข้อมูลการลาทั้งหมดเรียบร้อย');
    }
  );
}

// ══ MY BALANCE (member) ══════════════════
function renderMyBal() {
  const yr = new Date().getFullYear(); document.getElementById('my-bal-year').textContent = yr;
  const ls = getLeaves(), qs = getQs(), mine = ls.filter(r => r.email === cu.email);
  const isMgr = cu.role === 'pm' || cu.role === 'lead';
  const hiddenForMember = ['training', 'sterilize', 'ordain', 'other', 'maternity', 'funeral'];
  const visibleTypes = Object.keys(LQ).filter(t => isMgr || !hiddenForMember.includes(t));
  const rows = visibleTypes.map(type => {
    const def = LQ[type], cq = qs[cu.email]?.[type] ?? null, effQ = cq !== null ? cq : def.q;
    const used = mine.filter(r => r.type === type && r.status === 'approved').reduce((s, r) => s + r.days, 0);
    const pend = mine.filter(r => r.type === type && r.status.startsWith('pending')).length;
    const pb = pend ? '<span style="font-size:14px;background:var(--yellow-bg);color:var(--yellow);padding:1px 6px;border-radius:20px;margin-left:4px;">+' + pend + ' รอ</span>' : '';
    if (def.q !== null || cq !== null) {
      const effQ2 = effQ ?? 0;
      const rem = Math.max(0, effQ2 - used), pct = effQ2 > 0 ? Math.min(100, (used / effQ2) * 100) : 0;
      const bc = pct >= 90 ? 'bar-danger' : pct >= 60 ? 'bar-warn' : 'bar-ok', rc = rem === 0 ? 'var(--red)' : rem <= 2 ? 'var(--yellow)' : 'var(--green)';
      return '<tr><td>' + LT[type] + (def.n ? ' <span style="font-size:15px;color:var(--text3);">(' + def.n + ')</span>' : '') + '</td><td style="font-family:var(--mono);color:var(--text2);">' + effQ2 + '</td><td style="font-family:var(--mono);color:var(--text2);">' + used.toFixed(1).replace(/\.0$/, '') + pb + '</td><td><span style="font-size:24px;font-weight:500;font-family:var(--mono);color:' + rc + ';">' + rem.toFixed(1).replace(/\.0$/, '') + '</span><span style="font-size:15px;color:var(--text3);"> วัน</span></td><td style="min-width:120px;"><div class="bar-track"><div class="bar-fill ' + bc + '" style="width:' + pct.toFixed(0) + '%"></div></div><div style="font-size:14px;color:var(--text3);margin-top:3px;font-family:var(--mono);">' + pct.toFixed(0) + '%</div></td></tr>';
    } else {
      const appr = mine.filter(r => r.type === type && r.status === 'approved').length;
      return '<tr><td>' + LT[type] + ' <span style="font-size:15px;color:var(--text3);">(' + def.n + ')</span></td><td><span class="notify-badge">แจ้ง/อนุมัติ</span></td><td style="font-family:var(--mono);color:var(--text2);">' + appr + ' ครั้ง' + pb + '</td><td>—</td><td>—</td></tr>';
    }
  }).join('');
  document.getElementById('my-bal-tbody').innerHTML = rows;
  const histEl = document.getElementById('my-leave-hist'), rec = mine.slice(0, 10);
  if (!rec.length) { histEl.innerHTML = '<div style="color:var(--text3);font-size:17px;">ยังไม่มีประวัติการลา</div>'; return; }
  const sc = { pending_lead: '<span class="chip chip-pending">รอหัวหน้า</span>', pending_pm: '<span class="chip chip-escalated">รอ PM</span>', approved: '<span class="chip chip-approved">อนุมัติ</span>', rejected: '<span class="chip chip-rejected">ปฏิเสธ</span>' };
  histEl.innerHTML = '<div class="table-wrap"><table><thead><tr><th>เลขที่</th><th>ประเภท</th><th>วันที่</th><th>จำนวน</th><th>สถานะ</th><th></th></tr></thead><tbody>' + rec.map(r => '<tr><td><span style="font-size:13px;font-family:var(--mono);color:var(--accent);background:var(--accent-bg);padding:1px 7px;border-radius:20px;white-space:nowrap;">' + (r.refNo || '—') + '</span></td><td>' + LT[r.type] + '</td><td><span class="meta">' + r.start + (r.start !== r.end ? ' → ' + r.end : '') + '</span></td><td><span style="font-family:var(--mono);font-weight:700;color:var(--yellow);">' + (r.isHalf ? (r.period === 'morning' ? '½เช้า' : '½บ่าย') : r.days + 'd') + '</span></td><td>' + (sc[r.status] || '') + '</td><td style="white-space:nowrap;">' + (r.status.startsWith('pending') ? '<button class="btn btn-ghost btn-sm" onclick="editLeave(' + r.id + ')" style="padding:3px 10px;font-size:13px;color:var(--yellow);border-color:rgba(245,200,66,.3);margin-right:4px;"><i class="fa-solid fa-pen"></i> แก้ไข</button><button class="btn btn-red btn-sm" onclick="cancelLeave(' + r.id + ')" style="padding:3px 10px;font-size:13px;"><i class="fa-solid fa-trash"></i> ยกเลิก</button>' : '') + '</td></tr>').join('') + '</tbody></table></div>';
}

// ══ EXERCISE ═════════════════════════════
let exMembers = [];
let _editingExId = null;
let _editingLeaveId = null;
function updateExSysMemberSelect() {
  const sel = document.getElementById('ex-sys-member');
  if (!sel) return;
  const allUsers = getUsers();
  const dateVal = document.getElementById('ex-date')?.value || new Date().toISOString().split('T')[0];
  const exType = document.getElementById('ex-type')?.value || 'solo';
  const isGrp = isGroupEx(exType);
  const mk = monthKey(dateVal);
  const wk = wkKey(dateVal);
  const es = _editingExId !== null ? getExs().filter(e => String(e.id) !== String(_editingExId)) : getExs();

  // Filter out current user and already-selected members
  const available = allUsers
    .filter(u => u.email !== cu.email && !exMembers.some(m => m.email === u.email))
    .sort((a, b) => a.name.localeCompare(b.name, 'th'));

  sel.innerHTML = '<option value="">— เลือกสมาชิกในระบบ —</option>' + available.map(u => {
    const nick = u.nickname || u.name.split(' ')[0];
    const dept = u.dept ? ` (${u.dept})` : '';
    let isFull = false;
    let fullReason = '';

    if (isGrp) {
      // กลุ่ม: 1/สัปดาห์ และ 4/เดือน (เหมือนกันทั้ง กทม/ตจว)
      const uWkGrp = es.filter(x => isUserInvolved(x, u.email) && isGroupEx(getExType(x)) && x.status !== 'rejected' && wkKey(x.date) === wk).length;
      const uMoGrp = es.filter(x => isUserInvolved(x, u.email) && isGroupEx(getExType(x)) && x.status !== 'rejected' && monthKey(x.date) === mk).length;
      if (uWkGrp >= 1) { isFull = true; fullReason = 'กลุ่มเต็ม/สป.'; }
      else if (uMoGrp >= 4) { isFull = true; fullReason = 'กลุ่มเต็ม/ด.'; }
    } else {
      // เดี่ยว: ขึ้นกับ locationType ของสมาชิกนั้น
      const uLoc = u.locationType || 'bkk';
      const uWkLimit = uLoc === 'bkk' ? 2 : 3;
      const uMoLimit = uLoc === 'bkk' ? 8 : 12;
      const uWkSolo = es.filter(x => isUserInvolved(x, u.email) && getExType(x) === 'solo' && x.status !== 'rejected' && wkKey(x.date) === wk).length;
      const uMoSolo = es.filter(x => isUserInvolved(x, u.email) && getExType(x) === 'solo' && x.status !== 'rejected' && monthKey(x.date) === mk).length;
      if (uWkSolo >= uWkLimit) { isFull = true; fullReason = `เดี่ยวเต็ม/สป.`; }
      else if (uMoSolo >= uMoLimit) { isFull = true; fullReason = `เดี่ยวเต็ม/ด.`; }
    }

    return `<option value="${u.email}" ${isFull ? 'disabled' : ''}>${nick}${dept}${isFull ? ` (${fullReason})` : ''}</option>`;
  }).join('');
}

function setupExForm() {
  updateExSysMemberSelect();
  exMembers = [];
  renderExMembers();
}
function addExSysMember() {
  const sel = document.getElementById('ex-sys-member');
  const email = sel.value; if (!email) return;
  const u = getUsers().find(x => x.email === email); if (!u) return;
  if (!exMembers.find(m => m.type === 'sys' && m.email === email)) {
    const nick = u.nickname || u.name.split(' ')[0];
    const dept = u.dept ? ` (${u.dept})` : '';
    exMembers.push({ id: 'sys_' + email, type: 'sys', email, name: u.name, displayName: `${nick}${dept}` });
    renderExMembers();
  }
  sel.value = '';
}
function addExOutMember() {
  const n = document.getElementById('ex-out-name').value.trim();
  const d = document.getElementById('ex-out-dept').value.trim();
  if (!n || !d) { toast('⚠️ กรุณากรอกชื่อและแผนกของคนนอกระบบ'); return; }
  const uid = 'out_' + Date.now();
  exMembers.push({ id: uid, type: 'out', name: n, dept: d });
  document.getElementById('ex-out-name').value = '';
  document.getElementById('ex-out-dept').value = '';
  renderExMembers();
}
function removeExMember(id) {
  exMembers = exMembers.filter(m => m.id !== id);
  renderExMembers();
}
function renderExMembers() {
  const el = document.getElementById('ex-member-list'); if (!el) return;
  updateExSysMemberSelect();
  if (!exMembers.length) { el.innerHTML = '<div style="font-size:16px;color:var(--text3);">ยังไม่ได้เพิ่มสมาชิก</div>'; return; }
  el.innerHTML = exMembers.map(m => {
    const label = m.displayName || m.name;
    return '<span class="chip" style="background:var(--surface3);border:1px solid var(--border);padding-right:6px;margin-bottom:4px;">' + (m.type === 'sys' ? '<i class="fa-solid fa-user"></i>' : '<i class="fa-solid fa-user"></i> (นอก) ') + label + ' <button onclick="removeExMember(\'' + m.id + '\')" style="background:none;border:none;color:var(--red);margin-left:6px;cursor:pointer;">✕</button></span>';
  }).join('');
}
// handleExDoc is deprecated as we moved to link-only submission
function toLocalDateString(d) {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const y = dt.getFullYear(), m = String(dt.getMonth() + 1).padStart(2, '0'), d2 = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d2}`;
}
// week aligned to monthly period (starts on the 19th, then every 7 days)
// so wkKey is always within the same monthKey — no cross-period weeks
function wkKey(d) {
  if (!d) return '';
  let dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  if (typeof d === 'string' && d.length === 10) {
    const [y, m, d1] = d.split('-').map(Number);
    dt = new Date(y, m - 1, d1);
  }
  const mk = monthKey(dt);
  if (!mk) return '';
  const [py, pm] = mk.split('-').map(Number);
  const periodStart = new Date(py, pm - 1, 19);
  const offsetDays = Math.round((dt - periodStart) / 86400000);
  const weekStart = new Date(periodStart);
  weekStart.setDate(19 + Math.floor(offsetDays / 7) * 7);
  return toLocalDateString(weekStart);
}
// monthly cycle cuts on 18th: day 1-18 belongs to prev period
// monthly cycle starts on 19th: 19th onwards belongs to the same month, up to 18th of next month
function monthKey(d) {
  if (!d) return '';
  let dt = new Date(d);
  if (typeof d === 'string' && d.length === 10) {
    const [y, m, d1] = d.split('-').map(Number);
    dt = new Date(y, m - 1, d1);
  }
  if (isNaN(dt.getTime())) return '';
  const day = dt.getDate(), m = dt.getMonth(), y = dt.getFullYear();
  if (day >= 19) {
    return `${y}-${String(m + 1).padStart(2, '0')}`;
  } else {
    return m === 0 ? `${y - 1}-12` : `${y}-${String(m).padStart(2, '0')}`;
  }
}
function quarterKey(d) {
  const mk = monthKey(d);
  if (!mk) return '';
  const [y, m] = mk.split('-').map(Number);
  return `${y}-Q${Math.ceil(m / 3)}`;
}
function getWkNum(d) {
  const mk = monthKey(d);
  if (!mk) return 0;
  const [y, m] = mk.split('-').map(Number);
  const dStart = new Date(y, m - 1, 19), dEnd = new Date(y, m, 18);
  const weekOpts = [];
  let curr = new Date(dStart);
  while (curr <= dEnd) {
    const wKey = wkKey(curr);
    if (!weekOpts.includes(wKey)) weekOpts.push(wKey);
    curr.setDate(curr.getDate() + 1);
  }
  return weekOpts.indexOf(wkKey(d)) + 1;
}
function isGroupEx(t) { return t === 'group_ex' || t === 'group_eat'; }
function getExType(e) { if (e.exType) return e.exType; return e.type === 'group' ? 'group_ex' : 'solo'; }
function isUserInvolved(e, email) {
  if (!e || !email) return false;
  const target = email.toLowerCase();
  const creator = (e.email || '').toLowerCase();
  return creator === target || (e.members || []).some(m => m.type === 'sys' && (m.email || '').toLowerCase() === target);
}

function updateExType() {
  const exType = document.getElementById('ex-type').value;
  const isGrp = isGroupEx(exType);
  const egm = document.getElementById('ex-group-members'); if (egm) egm.style.display = isGrp ? 'block' : 'none';
  clearExErr();
  updateQuota();
}
let quotaViewDate = new Date().toISOString().split('T')[0];
function setQuotaDate(d) {
  quotaViewDate = d;
  updateQuota();
}
function setQuotaMonth(mk) {
  if (!mk) return;
  const [y, m] = mk.split('-').map(Number);
  quotaViewDate = `${y}-${String(m).padStart(2, '0')}-20`;
  updateQuota();
}
function onExLogMonthChange(mk) {
  if (!mk) return;
  // Sync hidden ex-history-month so renderExHistory reads the same month
  const histSel = document.getElementById('ex-history-month');
  if (histSel) { histSel.innerHTML = `<option value="${mk}" selected>${mk}</option>`; histSel.value = mk; }
  setQuotaMonth(mk);   // updates quota display
  renderExHistory();   // updates history list
}

function updateQuota() {
  const loc = cu.locationType || 'bkk';
  const isBkk = loc === 'bkk';
  const exDateInput = document.getElementById('ex-date');
  const isModalOpen = document.getElementById('modal-ex-form')?.classList.contains('open');
  const vDate = (isModalOpen && exDateInput?.value) ? exDateInput.value : quotaViewDate;
  let wk = wkKey(vDate);
  const mk = monthKey(vDate), qk = quarterKey(vDate);
  const [moY, moM] = mk.split('-').map(Number);
  const moName = new Date(moY, moM - 1, 1).toLocaleDateString('th-TH', { month: 'long' });
  const exType = document.getElementById('ex-type')?.value || 'solo';
  // เมื่อ edit ใบเบิกที่มีอยู่แล้ว ให้ exclude ใบนั้นออกจาก quota count เพื่อไม่ให้นับซ้ำ
  const all = _editingExId !== null
    ? getExs().filter(e => String(e.id) !== String(_editingExId))
    : getExs();
  const wkLimit = isBkk ? 2 : 3, moLimit = isBkk ? 8 : 12;

  // Stats for the viewed week/month
  const wkSolo = all.filter(e => isUserInvolved(e, cu.email) && getExType(e) === 'solo' && e.status !== 'rejected' && wkKey(e.date) === wk).length;
  const moSolo = all.filter(e => isUserInvolved(e, cu.email) && getExType(e) === 'solo' && e.status !== 'rejected' && monthKey(e.date) === mk).length;
  const wkGrp = all.filter(e => isUserInvolved(e, cu.email) && isGroupEx(getExType(e)) && e.status !== 'rejected' && wkKey(e.date) === wk).length;
  const moGrp = all.filter(e => isUserInvolved(e, cu.email) && isGroupEx(getExType(e)) && e.status !== 'rejected' && monthKey(e.date) === mk).length;
  const qGrp = all.filter(e => isUserInvolved(e, cu.email) && isGroupEx(getExType(e)) && e.status !== 'rejected' && quarterKey(e.date) === qk).length;

  const colaThresh = isBkk ? 6 : 1, colaOk = qGrp >= colaThresh;
  const locLabel = isBkk ? 'กทม.' : 'ตจว.';

  // Build Month Options (Last 6 to Next 2)
  const monthOpts = [];
  const now = new Date();
  for (let i = -6; i <= 2; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 20);
    const mKey = monthKey(d);
    if (!monthOpts.includes(mKey)) monthOpts.push(mKey);
  }

  // Populate unified month dropdown (header) + sync hidden ex-history-month
  const exLogMonthSel = document.getElementById('ex-log-month-select');
  if (exLogMonthSel) {
    const fmtRange = (my, mm) => {
      const start = new Date(my, mm - 1, 19).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
      const end = (mm === 12 ? new Date(my + 1, 0, 18) : new Date(my, mm, 18)).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
      return `${new Date(my, mm - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}  •  ${start} – ${end}`;
    };
    exLogMonthSel.innerHTML = [...monthOpts].reverse().map(mKey => {
      const [my, mm] = mKey.split('-').map(Number);
      return `<option value="${mKey}"${mKey === mk ? ' selected' : ''}>${fmtRange(my, mm)}</option>`;
    }).join('');
  }
  // Keep hidden ex-history-month in sync so renderExHistory() reads the right month
  const histSel = document.getElementById('ex-history-month');
  if (histSel) { histSel.innerHTML = `<option value="${mk}" selected>${mk}</option>`; histSel.value = mk; }

  // Build Week Options for selected month
  const weekOpts = [];
  const [y, m] = mk.split('-').map(Number);
  // Period for Month M: M-19 to (M+1)-18
  const dStart = new Date(y, m - 1, 19), dEnd = new Date(y, m, 18);
  let curr = new Date(dStart);
  while (curr <= dEnd) {
    const wKey = wkKey(curr);
    if (!weekOpts.includes(wKey)) weekOpts.push(wKey);
    curr.setDate(curr.getDate() + 1);
  }

  // Ensure wk is within the current month's weekOpts
  wk = wkKey(vDate);
  if (!weekOpts.includes(wk)) {
    wk = weekOpts[0];
  }

  const fmt = (d) => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  const moRange = `${fmt(dStart)} - ${fmt(dEnd)}`;

  const curWkNum = weekOpts.indexOf(wk) + 1;
  const ws = new Date(wk), we = new Date(ws); we.setDate(ws.getDate() + 6);
  if (we > dEnd) we.setTime(dEnd.getTime());
  const segBar = (used, max, color) => `
    <div style="display:flex;flex-direction:column;gap:6px;">
      <div style="display:flex;gap:4px;width:100%;height:6px;">
        ${Array.from({ length: max }, (_, i) => `<div style="flex:1;border-radius:3px;background:${i < used ? color : 'var(--surface3)'};"></div>`).join('')}
      </div>
    </div>`;

  const qd = document.getElementById('quota-display');
  if (!qd) return;

  const allMo = all.filter(e => isUserInvolved(e, cu.email) && e.status !== 'rejected' && monthKey(e.date) === mk);
  const totalMoMoney = allMo.reduce((sum, e) => sum + (EX_REWARD[getExType(e)] || 100), 0);

  // Calculate days until cutoffs
  const today = new Date();
  const daysUntilSat = (6 - today.getDay() + 7) % 7 || 7;
  let next18 = new Date(today.getFullYear(), today.getMonth(), 18);
  if (today > next18) next18.setMonth(next18.getMonth() + 1);
  const daysUntil18 = Math.ceil((next18 - today) / (1000 * 60 * 60 * 24));

  // Calculate previous month money
  const [cy, cm] = mk.split('-').map(Number);
  let prevM = cm - 1;
  let prevY = cy;
  if (prevM === 0) { prevM = 12; prevY--; }
  const prevMk = `${prevY}-${String(prevM).padStart(2, '0')}`;
  const prevMoAll = all.filter(e => isUserInvolved(e, cu.email) && e.status !== 'rejected' && monthKey(e.date) === prevMk);
  const prevTotalMoney = prevMoAll.reduce((sum, e) => sum + (EX_REWARD[getExType(e)] || 100), 0);
  const moneyDiff = totalMoMoney - prevTotalMoney;
  const diffStr = moneyDiff >= 0 ? `+฿${moneyDiff.toLocaleString()}` : `-฿${Math.abs(moneyDiff).toLocaleString()}`;
  const diffColor = moneyDiff >= 0 ? 'var(--green)' : 'var(--red)';

  const moTotalSoloMoney = allMo.filter(e => getExType(e) === 'solo').reduce((sum, e) => sum + (EX_REWARD[getExType(e)] || 100), 0);
  const moTotalGrpMoney = allMo.filter(e => isGroupEx(getExType(e))).reduce((sum, e) => sum + (EX_REWARD[getExType(e)] || 100), 0);

  qd.innerHTML = `
  <!-- Top 2 Cards -->
  <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-bottom: 20px;">
    <!-- Accumulated Money Card -->
    <div style="background: linear-gradient(110deg, #1f232b 0%, #172a25 100%); border-radius: 16px; padding: 16px; position: relative; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.03); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
      <div>
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:4px;">
          <div style="font-size:15px; color:#d1d5db; font-weight:600;">ยอดเงินสะสมเดือนนี้</div>
          <div style="background:transparent; color:#5eead4; font-size:12px; font-weight:600; padding:2px 10px; border-radius:20px; border:1px solid rgba(94, 234, 212, 0.3);">คาดการณ์</div>
        </div>
        <div style="display:flex; align-items:baseline; gap:8px; margin-bottom: 4px;">
          <span style="font-size:32px; font-weight:700; color:#9ca3af; font-family:var(--mono);">฿</span>
          <span style="font-size:46px; font-weight:700; font-family:var(--mono); color:#6ee7b7; line-height:1; letter-spacing:-1px;">${totalMoMoney.toLocaleString()}</span>
        </div>
        <div style="display:flex; align-items:center; gap: 20px; font-size: 14px; color: #9ca3af; font-weight: 500; flex-wrap: wrap;">
          <div>เดี่ยว <span style="font-family:var(--mono);">฿${moTotalSoloMoney.toLocaleString()}</span> · ${moSolo} ครั้ง</div>
          <div>กลุ่ม <span style="font-family:var(--mono);">฿${moTotalGrpMoney.toLocaleString()}</span> · ${moGrp} ครั้ง</div>
          <div>รวมทั้งหมด <span style="font-family:var(--mono);">${allMo.length}</span> กิจกรรม</div>
        </div>
      </div>
      <div style="text-align:right; display:flex; flex-direction:column; justify-content:center; gap: 4px;">
        <div style="font-size:14px; color:#9ca3af;">เทียบเดือนก่อน</div>
        <div style="font-size:18px; font-weight:700; font-family:var(--mono); color:${diffColor};">^ ${diffStr}</div>
        <div style="font-size:14px; color:#9ca3af;">เดือนก่อน ฿${prevTotalMoney.toLocaleString()}</div>
      </div>
    </div>

    <!-- Cutoff Info Card -->
    <div style="background: var(--surface2); border-radius: 16px; padding: 16px; border: 1px solid var(--border2); display: flex; flex-direction: column;">
      <div style="font-size: 16px; color: var(--text); font-weight: 600; margin-bottom: 4px;">ตัดรอบ</div>
      <div style="display:flex; flex-direction: column; gap: 4px; flex: 1; justify-content: center;">
        <div style="display:flex; justify-content:space-between; align-items:center;  padding: 2px; border-radius: 12px;">
          <div style="display:flex; align-items:center; gap: 12px;">
            <div style="width: 42px; height: 42px; border-radius: 8px; background: rgba(255,255,255,0.05); display:flex; justify-content:center; align-items:center; color: var(--text2);"><i class="fa-regular fa-calendar"></i></div>
            <div>
              <div style="font-size: 13px; color: var(--text3); margin-bottom: 0px;">ตัดรอบรายสัปดาห์</div>
              <div style="font-size: 15px; color: var(--text); font-weight: 500; line-height: 1em;">ทุกวันเสาร์</div>
            </div>
          </div>
          <div style="background: rgba(108,138,255,0.15); color: var(--accent); padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: 600;">อีก ${daysUntilSat} วัน</div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;  padding: 2px; border-radius: 12px;">
          <div style="display:flex; align-items:center; gap: 12px;">
            <div style="width: 42px; height: 42px; border-radius: 8px; background: rgba(255,255,255,0.05); display:flex; justify-content:center; align-items:center; color: var(--text2);"><i class="fa-regular fa-calendar-days"></i></div>
            <div>
              <div style="font-size: 13px; color: var(--text3); margin-bottom: 0px;">ตัดรอบรายเดือน</div>
              <div style="font-size: 15px; color: var(--text); font-weight: 500; line-height: 1em;">ทุกวันที่ 18</div>
            </div>
          </div>
          <div style="background: rgba(108,138,255,0.15); color: var(--accent); padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: 600;">อีก ${daysUntil18} วัน</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Quota Section -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;">
    <!-- CARD 1: SOLO -->
    <div style="background:var(--surface2);border-radius:16px;padding:24px;border:1px solid var(--border2);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
        <div>
          <div style="font-size:20px;font-weight:700;color:var(--text);margin-bottom:0px;">แบบเดี่ยว</div>
          <div style="font-size:15px;color:var(--text3);">${locLabel}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:12px;color:var(--text3);margin-bottom:2px;">เบิกครั้งละ</div>
          <div style="font-size:18px;font-weight:700;color:var(--green);font-family:var(--mono);">฿100</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0px;">
            <div style="font-size:15px;color:var(--text3);">สัปดาห์ที่ ${curWkNum} (${fmt(ws)} - ${fmt(we)})</div>
            <div style="font-size:14px;color:var(--text);font-family:var(--mono);font-weight:600;">${wkSolo} / ${wkLimit} ${wkSolo >= wkLimit ? '<span style="color:var(--green);margin-left:4px;">✓</span>' : ''}</div>
          </div>
          ${segBar(wkSolo, wkLimit, 'var(--green)')}
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0px;">
            <div style="font-size:15px;color:var(--text3);">เดือน ${moName}</div>
            <div style="font-size:14px;color:var(--text);font-family:var(--mono);font-weight:600;">${moSolo} / ${moLimit} ${moSolo >= moLimit ? '<span style="color:var(--green);margin-left:4px;">✓</span>' : ''}</div>
          </div>
          ${segBar(moSolo, moLimit, 'var(--green)')}
        </div>
      </div>
    </div>

    <!-- CARD 2: GROUP -->
    <div style="background:var(--surface2);border-radius:16px;padding:24px;border:1px solid var(--border2);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
        <div>
          <div style="font-size:20px;font-weight:700;color:var(--text);margin-bottom:0px;">แบบกลุ่ม</div>
          <div style="font-size:15px;color:var(--text3);">${locLabel}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:12px;color:var(--text3);margin-bottom:2px;">เบิกครั้งละ</div>
          <div style="font-size:18px;font-weight:700;color:var(--green);font-family:var(--mono);">฿500</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0px;">
            <div style="font-size:15px;color:var(--text3);">สัปดาห์ที่ ${curWkNum} (${fmt(ws)} - ${fmt(we)})</div>
            <div style="font-size:14px;color:var(--text);font-family:var(--mono);font-weight:600;">${wkGrp} / 1 ${wkGrp >= 1 ? '<span style="color:var(--green);margin-left:4px;">✓</span>' : ''}</div>
          </div>
          ${segBar(wkGrp, 1, 'var(--green)')}
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0px;">
            <div style="font-size:15px;color:var(--text3);">เดือน ${moName}</div>
            <div style="font-size:14px;color:var(--text);font-family:var(--mono);font-weight:600;">${moGrp} / 4 ${moGrp >= 4 ? '<span style="color:var(--green);margin-left:4px;">✓</span>' : ''}</div>
          </div>
          ${segBar(moGrp, 4, 'var(--green)')}
        </div>
      </div>
    </div>

    <!-- CARD 3: COLA -->
    <div style="background:var(--surface2);border-radius:16px;padding:24px;border:1px solid var(--border2);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
        ${(() => {
      const [qy, qNum] = qk.split('-Q').map(Number);
      const qStartMonth = (qNum - 1) * 3 + 1;
      const qEndMonth = qNum * 3;
      const qStart = new Date(qy, qStartMonth - 1, 19);
      const qEndY = qEndMonth === 12 ? qy + 1 : qy;
      const qEndM = qEndMonth === 12 ? 1 : qEndMonth + 1;
      const qEnd = new Date(qEndY, qEndM - 1, 18);
      const fmtQ = d => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
      return `
        <div>
          <div style="font-size:20px;font-weight:700;color:var(--text);margin-bottom:0px;">Cola — Q${qNum}</div>
          <div style="font-size:15px;color:var(--text3);">${fmtQ(qStart)} – ${fmtQ(qEnd)}</div>
        </div>`;
    })()}
      </div>
      <div style="display:flex;flex-direction:column;gap:16px; flex:1; justify-content:center;">
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0px;">
            <div style="font-size:15px;color:var(--text3);">แบบกลุ่ม (รวมไตรมาส)</div>
            <div style="font-size:14px;color:var(--text);font-family:var(--mono);font-weight:600;">${qGrp} / ${colaThresh} ${qGrp >= colaThresh ? '<span style="color:var(--green);margin-left:4px;">✓</span>' : ''}</div>
          </div>
          ${segBar(qGrp, colaThresh, 'var(--purple)')}
        </div>
        ${colaOk ? `
          <div style="background: rgba(61, 214, 140, 0.1); border: 1px solid rgba(61, 214, 140, 0.2); padding: 5px; border-radius: 12px; display:flex; align-items:center; gap:10px; color: var(--green); font-size: 13px; font-weight: 500;">
            <i class="fa-regular fa-circle-check" style="font-size: 16px;"></i>
            <span>ผ่านเงื่อนไข — ได้โบนัสไตรมาสถัดไป<strong style="font-family:var(--mono);font-size:14px;">฿1,500/เดือน</strong></span>
          </div>`
      : `
          <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border2); padding: 6px; border-radius: 12px; font-size: 13px; color: var(--text3); display:flex; gap:10px;">
            <i class="fa-solid fa-circle-info" style="opacity:0.5; margin-top:2px;"></i>
            <span>ร่วมกลุ่มให้ครบ ${colaThresh} ครั้ง/ไตรมาส รับโบนัส ฿1,500/เดือน ในไตรมาสถัดไป</span>
          </div>`}
      </div>
    </div>
  </div>`;
  const warn = document.getElementById('ex-warn');
  if (!warn) return;
  const btnSubmit = document.getElementById('btn-submit-ex');
  if (exType === 'solo') {
    if (wkSolo >= wkLimit) { warn.textContent = `⚠️ โควต้าเดี่ยวสัปดาห์นี้เต็มแล้ว (${wkLimit} ครั้ง/${locLabel})`; warn.style.display = 'block'; }
    else if (moSolo >= moLimit) { warn.textContent = `⚠️ โควต้าเดี่ยวเดือนนี้เต็มแล้ว (${moLimit} ครั้ง/${locLabel})`; warn.style.display = 'block'; if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.style.opacity = '0.5'; btnSubmit.style.cursor = 'not-allowed'; } }
    else { warn.style.display = 'none'; if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.style.opacity = '1'; btnSubmit.style.cursor = 'pointer'; } }
  } else {
    if (wkGrp >= 1) { warn.textContent = '⚠️ โควต้ากิจกรรมกลุ่มสัปดาห์นี้เต็มแล้ว (1 ครั้ง)'; warn.style.display = 'block'; }
    else if (moGrp >= 4) { warn.textContent = '⚠️ โควต้ากิจกรรมกลุ่มเดือนนี้เต็มแล้ว (4 ครั้ง)'; warn.style.display = 'block'; if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.style.opacity = '0.5'; btnSubmit.style.cursor = 'not-allowed'; } }
    else { warn.style.display = 'none'; if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.style.opacity = '1'; btnSubmit.style.cursor = 'pointer'; } }
  }

  // Update top page label to show what's being viewed
  const wLabel = document.getElementById('week-label');
  if (wLabel) {
    const ws = new Date(wk), we = new Date(ws); we.setDate(ws.getDate() + 6);
    wLabel.innerHTML = `<span style="color:var(--accent);font-weight:700;">📂 กำลังดู:</span> ${moName} — สัปดาห์ที่ ${weekOpts.indexOf(wk) + 1} <span style="opacity:0.7;font-size:16px;">(${fmt(ws)} - ${fmt(we)})</span>`;
  }

  // Re-enable button if monthly is not full
  if (exType === 'solo' && moSolo < moLimit) { if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.style.opacity = '1'; btnSubmit.style.cursor = 'pointer'; } }
  if (exType !== 'solo' && moGrp < 4) { if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.style.opacity = '1'; btnSubmit.style.cursor = 'pointer'; } }
  updateExSysMemberSelect();
  renderExHistory();
}
function showExErr(msg) { const el = document.getElementById('ex-err'); el.innerHTML = msg; el.style.display = 'block'; el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
function clearExErr() { const el = document.getElementById('ex-err'); if (el) el.style.display = 'none'; }
function submitEx() {
  try {
    const exType = document.getElementById('ex-type').value;
    const act = document.getElementById('ex-act').value.trim();
    const date = document.getElementById('ex-date').value;
    const note = document.getElementById('ex-note').value.trim();
    const link = document.getElementById('ex-link').value.trim();

    console.log('Submitting Ex:', { exType, act, date, link });

    clearExErr();
    const elSucc = document.getElementById('ex-success'); if (elSucc) elSucc.style.display = 'none';

    const missing = [];
    if (!act) missing.push('กิจกรรม (เช่น วิ่ง 5km)');
    if (!date) missing.push('วันที่');
    if (!link) missing.push('หลักฐาน (ลิงก์)');
    if (missing.length) {
      showExErr('⚠️ กรุณากรอกข้อมูลให้ครบ:<br>• ' + missing.join('<br>• '));
      return;
    }

    const loc = cu.locationType || 'bkk', isBkk = loc === 'bkk';
    const wk = wkKey(date), mk = monthKey(date);
    // Skip quota checks when PM edits an already-approved record
    const editingApproved = _editingExId !== null && getExs().find(e => e.id === _editingExId)?.status === 'approved';
    // Exclude the record being edited from quota counts so we don't double-count it
    const all = getExs().filter(e => String(e.id) !== String(_editingExId));

    if (!editingApproved && exType === 'solo') {
      const wkLimit = isBkk ? 2 : 3;
      const moLimit = isBkk ? 8 : 12;
      const locLabel = isBkk ? 'กทม.' : 'ต่างจว.';
      const wkSolo = all.filter(e => isUserInvolved(e, cu.email) && getExType(e) === 'solo' && e.status !== 'rejected' && wkKey(e.date) === wk).length;
      if (wkSolo >= wkLimit) { showExErr(`⚠️ โควต้าเดี่ยวสัปดาห์นี้เต็มแล้ว<br>พื้นที่ ${locLabel} สูงสุด ${wkLimit} ครั้ง/สัปดาห์ (ใช้ไปแล้ว ${wkSolo} ครั้ง)`); return; }
      const moSolo = all.filter(e => isUserInvolved(e, cu.email) && getExType(e) === 'solo' && e.status !== 'rejected' && monthKey(e.date) === mk).length;
      if (moSolo >= moLimit) { showExErr(`⚠️ โควต้าเดี่ยวเดือนนี้เต็มแล้ว<br>พื้นที่ ${locLabel} สูงสุด ${moLimit} ครั้ง/เดือน (ใช้ไปแล้ว ${moSolo} ครั้ง)`); return; }
    } else if (!editingApproved) {
      const wkGrp = all.filter(e => isUserInvolved(e, cu.email) && isGroupEx(getExType(e)) && e.status !== 'rejected' && wkKey(e.date) === wk).length;
      if (wkGrp >= 1) { showExErr(`⚠️ โควต้ากิจกรรมกลุ่มสัปดาห์นี้เต็มแล้ว<br>สูงสุด 1 ครั้ง/สัปดาห์ (ใช้ไปแล้ว ${wkGrp} ครั้ง)`); return; }
      const moGrp = all.filter(e => isUserInvolved(e, cu.email) && isGroupEx(getExType(e)) && e.status !== 'rejected' && monthKey(e.date) === mk).length;
      if (moGrp >= 4) { showExErr(`⚠️ โควต้ากิจกรรมกลุ่มเดือนนี้เต็มแล้ว<br>สูงสุด 4 ครั้ง/เดือน (รวมทุกประเภทกลุ่ม) ใช้ไปแล้ว ${moGrp} ครั้ง`); return; }
    }

    const sysCount = isGroupEx(exType) ? exMembers.filter(m => m.type === 'sys').length : 0;
    const count = 1 + sysCount;
    if (isGroupEx(exType) && count < 3) {
      showExErr(`⚠️ กิจกรรมกลุ่มต้องมีสมาชิกอย่างน้อย 3 คน (ขณะนี้มี ${count} คน)<br>กรุณาเพิ่มสมาชิกให้ครบก่อนยื่น`);
      return;
    }
    const reward = EX_REWARD[exType] || 100;
    const total = reward;
    const summary = `
      <div style="margin-bottom:12px;padding:12px;background:var(--surface3);border-radius:8px;border:1px solid var(--border);">
        <div style="font-size:16px;color:var(--text3);margin-bottom:4px;">ข้อมูลการยื่นเบิก</div>
        <div style="font-size:20px;font-weight:700;color:var(--accent);">${EX_LABEL[exType]}</div>
        <div style="margin-top:8px;"><b>กิจกรรม:</b> ${act}</div>
        <div><b>วันที่:</b> ${date}</div>
        ${isGroupEx(exType) ? `<div><b>สมาชิก:</b> ${count} คน (รวมคุณ)</div>` : ''}
        <div style="margin-top:8px;font-size:22px;color:var(--green);font-weight:500;">ยอดเงินรางวัล (ส่วนตัว): ฿${total}</div>
      </div>
      <div style="font-size:17px;color:var(--text2);">กรุณาตรวจสอบข้อมูลให้ถูกต้องก่อนกดยืนยัน</div>
    `;

    const isEditing = _editingExId !== null;
    document.getElementById('conf-title').textContent = isEditing ? 'ยืนยันการแก้ไขใบเบิก' : 'ยืนยันการยื่นเบิก';
    document.getElementById('conf-body').innerHTML = summary;
    const okBtn = document.getElementById('conf-ok');
    okBtn.textContent = isEditing ? 'บันทึกการแก้ไข' : 'ยืนยันยื่นเบิก';
    okBtn.className = 'btn btn-primary';
    okBtn.onclick = async () => {
      okBtn.disabled = true;
      okBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';
      const label = isEditing ? 'บันทึกการแก้ไข' : 'ยืนยันยื่นเบิก';
      try {
        await doSubmitEx({ exType, act, date, note, link, isGrp: isGroupEx(exType) });
      } finally {
        okBtn.disabled = false;
        okBtn.textContent = label;
      }
    };
    openModal('modal-confirm');
  } catch (err) {
    console.error('submitEx Error:', err);
    toast('❌ เกิดข้อผิดพลาด: ' + err.message);
  }
}

async function doSubmitEx(data) {
  const { exType, act, date, note, link, isGrp } = data;
  const es = getExs();

  if (_editingExId !== null) {
    const i = es.findIndex(e => e.id === _editingExId);
    if (i >= 0) {
      es[i] = { ...es[i], exType, type: isGrp ? 'group' : 'solo', activity: act, date, note, members: isGrp ? [...exMembers] : [], proofDoc: link, proofLink: link };
      saveExs(es);
      await apiSync('updateEx', es[i]);
    }
    _editingExId = null;
    resetExFormUI();
    closeModal('modal-confirm');
    closeModal('modal-ex-form');
    try { updateDashboard(); updateLB(); updateQuota(); updateBadges(); clearExErr(); renderExShare(); renderExR(); } catch (e) { console.error(e); }
    if (isGrp) { exMembers = []; renderExMembers(); }
    toast('✅ แก้ไขใบเบิกเรียบร้อยแล้ว');
    return;
  }

  const newEx = {
    id: generateDSID(),
    name: cu.name,
    nickname: cu.nickname || cu.name.split(' ')[0],
    email: cu.email,
    dept: cu.dept || '',
    exType,
    type: isGrp ? 'group' : 'solo',
    activity: act,
    date,
    note,
    status: 'pending',
    submittedAt: new Date().toISOString(),
    members: isGrp ? [...exMembers] : [],
    proofDoc: link,
    proofLink: link,
    proofLinks: []
  };
  es.unshift(newEx);
  saveExs(es);

  // SYNC TO API
  await apiSync('addEx', newEx);
  notifyNewExercise(newEx);
  syncExerciseToSheets(newEx, 'exercise_submitted');

  // Close modals FIRST to ensure popup always closes
  closeModal('modal-confirm');
  closeModal('modal-ex-form');

  // Then update UI (wrapped in try-catch to prevent silent failures)
  try {
    updateDashboard(); updateLB(); updateQuota(); updateBadges(); clearExErr();
  } catch (e) { console.error('UI update error after submitEx:', e); }

  if (isGrp) { exMembers = []; renderExMembers(); }
  ['ex-act', 'ex-note', 'ex-link'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  toast('✅ ยื่นคำขอเรียบร้อยแล้ว');
}

function resetExFormUI() {
  document.querySelector('#modal-ex-form .modal-title').innerHTML = '<i class="fa-solid fa-circle-plus" style="margin-right:8px;color:var(--accent);"></i>ยื่นเบิกใหม่';
  const btn = document.getElementById('btn-submit-ex');
  if (btn) btn.innerHTML = '<i class="fa-solid fa-circle-plus" style="margin-right:6px;"></i> ยื่นเบิกใหม่';
}
let _exReviewMonth = null;
let _exReviewTab = 'pending';
let _exReviewSort = 'date';
let _exReviewSearch = '';
let _exReviewDeptTab = 'ทั้งหมด';
function setExReviewMonth(mk) { _exReviewMonth = mk; renderExR(); }
function setExReviewTab(t) { _exReviewTab = t; renderExR(); }
function setExReviewSort(s) { _exReviewSort = s; renderExR(); }
function setExReviewSearch(v) { _exReviewSearch = v; renderExR(); }
function setExReviewDeptTab(d) { _exReviewDeptTab = d; renderExR(); }
// ── User ID helpers ──────────────────────────────────────────────────────────
// Format: U01, U02, U03… (padded to 2 digits, expands to 3+ as needed)
function _nextUserId() {
  const users = getUsers();
  const max = users.reduce((acc, u) => {
    const n = parseInt((u.userId || '').replace(/^U/, '')) || 0;
    return Math.max(acc, n);
  }, 0);
  return 'U' + String(max + 1).padStart(2, '0');
}

// ── Exercise ID generator ─────────────────────────────────────────────────────
// Format: DS + YY + userId(e.g. U01) + 3-digit counter per user/year  →  DS26U01001
function generateDSID() {
  const userId = (cu && cu.userId) ? cu.userId : 'U00';
  const yy = String(new Date().getFullYear()).slice(-2);
  const prefix = 'DS' + yy + userId;
  const existing = getExs()
    .map(e => e.id)
    .filter(id => typeof id === 'string' && id.startsWith(prefix))
    .map(id => parseInt(id.slice(prefix.length)) || 0);
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return prefix + String(next).padStart(3, '0');
}

// ── Assign userId to existing users who don't have one ───────────────────────
// Call assignUserIds()       → dry-run (logs only)
// Call assignUserIds(true)   → saves locally + syncs to Firebase
async function assignUserIds(commit = false) {
  const users = getUsers();
  const withId = users.filter(u => u.userId);
  const without = users
    .filter(u => !u.userId)
    .sort((a, b) => new Date(a.addedAt) - new Date(b.addedAt));

  // Find the highest existing userId number to continue from
  let maxN = withId.reduce((acc, u) => {
    const n = parseInt((u.userId || '').replace(/^U/, '')) || 0;
    return Math.max(acc, n);
  }, 0);

  const changes = without.map(u => {
    maxN++;
    return { user: u, newUserId: 'U' + String(maxN).padStart(2, '0') };
  });

  console.group(`[assignUserIds] ${commit ? '🔴 COMMIT' : '🟡 DRY-RUN'} — พบ ${changes.length} คนที่ยังไม่มี User ID`);
  changes.forEach(c => console.log(`  ${c.user.email}  →  ${c.newUserId}`));
  console.groupEnd();

  if (!commit) {
    console.log('👆 ถ้าโอเค รัน assignUserIds(true) เพื่อบันทึกจริง');
    return changes;
  }

  for (const { user, newUserId } of changes) {
    user.userId = newUserId;
    await apiSync('updateUser', user, { silent: true });
  }
  saveUsers(users);
  // อัปเดต cu ถ้าเป็น user ที่ login อยู่
  const me = changes.find(c => c.user.email === cu?.email);
  if (me) cu.userId = me.newUserId;

  console.log(`✅ assign userId เรียบร้อย ${changes.length} คน`);
  toast(`✅ กำหนด User ID เรียบร้อย ${changes.length} คน`);
  return changes;
}

function _makeDSFromDate(date, suffix) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return 'DS' + mm + dd + hh + min + (suffix ? String(suffix).padStart(2, '0') : '');
}

async function migrateOldExIds() {
  const es = getExs();
  const seen = new Set(es.map(e => e.id).filter(id => typeof id === 'string' && id.startsWith('DS') && id.length > 6));
  let changed = false;

  for (const e of es) {
    const isOldFormat = typeof e.id === 'string' && /^DS\d{1,4}$/.test(e.id);
    if (!isOldFormat) continue;

    const date = e.submittedAt ? new Date(e.submittedAt) : new Date();
    let newId = _makeDSFromDate(date, null);
    let suffix = 1;
    while (seen.has(newId)) newId = _makeDSFromDate(date, suffix++);
    seen.add(newId);

    console.log(`[migrateOldExIds] ${e.id} → ${newId}`);
    e.id = newId;
    changed = true;
    if (e._fbKey) apiSync('updateEx', e, { silent: true });
  }

  if (changed) saveExs(es);
}

function migrateExIds() {
  const es = getExs();
  let changed = false;
  const seen = new Set();
  es.forEach((e, idx) => {
    const needsNewId = !e.id || typeof e.id === 'number' ||
      (typeof e.id === 'string' && !e.id.startsWith('DS')) ||
      (typeof e.id === 'string' && seen.has(e.id));

    if (needsNewId) {
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const hh = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      e.id = 'DS' + mm + dd + hh + min + ss + String(idx).padStart(2, '0');
      changed = true;
    }
    seen.add(e.id);
  });
  if (changed) saveExs(es);
}

// ── Normalize long DS IDs to 10-char format ─────────────────────────────────
// Call migrateLongExIds()      → dry-run: logs changes only, touches nothing
// Call migrateLongExIds(true)  → actually saves & syncs to Firebase
async function migrateLongExIds(commit = false) {
  const es = getExs();
  const SUFFIXES = 'abcdefghijklmnopqrstuvwxyz'.split('');

  // Build a set of all existing 10-char IDs so we can detect collisions
  const existing10 = new Set(
    es.map(e => e.id).filter(id => typeof id === 'string' && id.length === 10)
  );

  // Track newly assigned IDs within this run to catch run-internal collisions
  const assigned = new Set(existing10);

  const changes = [];
  const conflicts = [];

  for (const e of es) {
    if (typeof e.id !== 'string' || e.id.length <= 10) continue; // already short or weird

    // Truncate to 10 chars (DS + mm + dd + hh + min)
    const base = e.id.slice(0, 10);
    let newId = base;

    // Resolve collision
    if (assigned.has(newId)) {
      let resolved = false;
      for (const s of SUFFIXES) {
        const candidate = base.slice(0, 9) + s; // replace last char with suffix
        if (!assigned.has(candidate)) {
          newId = candidate;
          resolved = true;
          break;
        }
      }
      if (!resolved) {
        conflicts.push({ old: e.id, reason: 'ไม่มี suffix ว่างเหลือ' });
        continue;
      }
    }

    assigned.add(newId);
    changes.push({ ex: e, oldId: e.id, newId });
  }

  // Report
  console.group(`[migrateLongExIds] ${commit ? '🔴 COMMIT' : '🟡 DRY-RUN'} — พบ ${changes.length} รายการที่ต้องแก้`);
  changes.forEach(c => console.log(`  ${c.oldId}  →  ${c.newId}`));
  if (conflicts.length) console.warn('⚠️ Conflicts ที่แก้ไม่ได้:', conflicts);
  console.groupEnd();

  if (!commit) {
    console.log('👆 ถ้าโอเค รัน migrateLongExIds(true) เพื่อบันทึกจริง');
    return { changes, conflicts };
  }

  // Apply changes
  for (const { ex, newId } of changes) {
    ex.id = newId;
  }
  saveExs(es);

  // Sync to Firebase (sequential to avoid rate-limit)
  for (const { ex } of changes) {
    await apiSync('updateEx', ex, { silent: true });
  }

  console.log(`✅ อัปเดต ${changes.length} รายการเรียบร้อยแล้ว`);
  toast(`✅ ปรับ ID เรียบร้อย ${changes.length} รายการ`);
  return { changes, conflicts };
}

function renderExR() {
  const wrap = document.getElementById('ex-review-container');
  if (!wrap) return;
  if (cu.role !== 'pm') {
    wrap.innerHTML = '<div class="card"><div style="color:var(--text3);text-align:center;padding:20px;font-size:17px;">เฉพาะ PM เท่านั้น</div></div>';
    return;
  }

  if (!document.getElementById('ex-review-controls')) {
    wrap.innerHTML = `
      <div id="ex-review-controls" class="card" style="margin-bottom:16px;"></div>
      <div id="ex-review-stats-card" class="card" style="margin-bottom:16px;"></div>
      <div id="ex-review-list-area" style="margin-top:32px;"></div>
    `;
  }

  const all = getExs();
  const today = new Date().toISOString().split('T')[0];
  const monthOpts = [];
  const now = new Date();
  for (let i = -6; i <= 1; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 20);
    const mk = monthKey(d);
    if (!monthOpts.includes(mk)) monthOpts.push(mk);
  }
  if (!_exReviewMonth || !monthOpts.includes(_exReviewMonth)) _exReviewMonth = monthKey(today);
  const mk = _exReviewMonth;
  const [py, pm] = mk.split('-').map(Number);
  const periodStart = new Date(py, pm - 1, 19), periodEnd = new Date(py, pm, 18);
  const fmt = d => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  const rangeLabel = `${fmt(periodStart)} – ${fmt(periodEnd)}`;
  const moName = new Date(py, pm - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

  const controlsEl = document.getElementById('ex-review-controls');
  if (controlsEl && !controlsEl.innerHTML) {
    controlsEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;background:rgba(255,255,255,0.015);padding:16px 20px;border-radius:16px;border:1px solid rgba(255,255,255,0.03);">
        <div style="display:flex;align-items:center;gap:16px;flex:1;min-width:300px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:40px;height:40px;background:var(--accent-bg);color:var(--accent);display:flex;align-items:center;justify-content:center;border-radius:10px;font-size:20px;"><i class="fa-solid fa-calendar-days"></i></div>
            <div>
              <div style="font-size:14px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">รอบการเบิก</div>
              <div style="display:flex;align-items:center;gap:8px;">
                <select id="ex-review-month-sel" onchange="setExReviewMonth(this.value)" style="background:transparent;border:none;color:#fff;font-size:18px;font-weight:700;padding:0;cursor:pointer;outline:none;font-family:inherit;">
                  ${monthOpts.map(m => {
      const [y2, m2] = m.split('-').map(Number);
      const label = new Date(y2, m2 - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
      return `<option value="${m}" ${m === mk ? 'selected' : ''} style="background:#1a1c26;color:#fff;">${label}</option>`;
    }).join('')}
                </select>
                <i class="fa-solid fa-chevron-down" style="font-size:12px;color:var(--text3);margin-top:2px;"></i>
              </div>
              <div id="ex-review-range-label" style="font-family:var(--mono);color:var(--accent);font-size:14px;font-weight:500;margin-top:2px;opacity:0.8;">${rangeLabel}</div>
            </div>
          </div>
          <div style="width:1px;height:40px;background:rgba(255,255,255,0.05);margin:0 8px;"></div>
          <div style="flex:1;position:relative;">
            <i class="fa-solid fa-magnifying-glass" style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--text3);font-size:14px;"></i>
            <input type="text" id="ex-review-search-input" placeholder="ค้นหาชื่อ, ชื่อเล่น, อีเมล, กิจกรรม หรือรหัส DS..." value="${_exReviewSearch || ''}" oninput="setExReviewSearch(this.value)"
              style="width:100%;height:44px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:0 15px 0 40px;color:#fff;font-size:16px;outline:none;transition:all 0.2s;" />
            <div style="font-size:13px;color:var(--text3);margin-top:6px;padding-left:4px;">
              พิมพ์ <span style="font-family:var(--mono);background:rgba(255,255,255,0.06);padding:1px 7px;border-radius:5px;color:var(--accent);">all&nbsp;คำค้นหา</span> เพื่อค้นหาจากข้อมูลทุกเดือน
            </div>
          </div>
        </div>
      </div>`;
  } else if (controlsEl) {
    const sel = document.getElementById('ex-review-month-sel');
    if (sel && sel.value !== mk) sel.value = mk;
    const lbl = document.getElementById('ex-review-range-label');
    if (lbl && lbl.textContent !== rangeLabel) lbl.textContent = rangeLabel;
    const searchInput = document.getElementById('ex-review-search-input');
    if (searchInput && searchInput.value !== (_exReviewSearch || '')) {
      searchInput.value = _exReviewSearch || '';
    }
  }

  const rawSearch = (_exReviewSearch || '').trimStart();
  const isAllMode = /^all\s/i.test(rawSearch);
  const q = isAllMode ? rawSearch.slice(4).toLowerCase().trim() : rawSearch.toLowerCase();
  // all <คำ> = ค้นหาทุกเดือน, ปกติ = เฉพาะเดือนที่เลือก
  const pool = isAllMode ? all : all.filter(e => monthKey(e.date) === mk);
  // build email→nickname map สำหรับ search
  const nickMap = Object.fromEntries(getUsers().map(u => [u.email, (u.nickname || '').toLowerCase()]));
  const filtered = pool.filter(e => {
    if (!q) return true;
    const nick = nickMap[e.email] || '';
    if ((e.name || '').toLowerCase().includes(q)) return true;
    if (nick.includes(q)) return true;
    if ((e.email || '').toLowerCase().includes(q)) return true;
    if ((e.activity || '').toLowerCase().includes(q)) return true;
    if ((e.id || '').toString().toLowerCase().includes(q)) return true;
    // ค้นหาในรายชื่อสมาชิก (กรณี group exercise)
    return (e.members || []).some(m =>
      (m.name || '').toLowerCase().includes(q) ||
      (m.email || '').toLowerCase().includes(q) ||
      (nickMap[m.email] || '').includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    if (_exReviewSort === 'week') {
      const wa = wkKey(a.date);
      const wb = wkKey(b.date);
      if (wa !== wb) return wb.localeCompare(wa);
    }
    return new Date(b.submittedAt || b.date) - new Date(a.submittedAt || a.date);
  });

  // ── Stats ──────────────────────────────────────────────────────────────
  const pending = sorted.filter(e => e.status === 'pending');
  const approved = sorted.filter(e => e.status === 'approved');
  const rejected = sorted.filter(e => e.status === 'rejected');
  const totalMoney = approved.reduce((s, e) => s + (EX_REWARD[getExType(e)] || 100) * (1 + (e.members || []).length), 0);

  const statBox = (label, val, color) =>
    `<div style="flex:1;min-width:110px;background:#1a1c26;border:1px solid rgba(255,255,255,0.03);border-radius:16px;padding:10px;text-align:center;">
       <div style="font-size:24px;font-weight:500;font-family:var(--mono);color:${color};">${val}</div>
       <div style="font-size:14px;color:var(--text3);margin-top:4px;font-weight:500;">${label}</div>
     </div>`;

  const statsCardEl = document.getElementById('ex-review-stats-card');
  if (statsCardEl) {
    const statsTitle = isAllMode
      ? `📊 สรุปทุกเดือน${q ? ` — ค้นหา "${q}"` : ''}`
      : `📊 สรุปรอบ ${moName}${q ? ` — ค้นหา "${q}"` : ''}`;
    statsCardEl.innerHTML = `
      <div class="card-title" style="margin-bottom:14px; font-size:18px;">${statsTitle}</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        ${statBox('รออนุมัติ', pending.length, 'var(--yellow)')}
        ${statBox('อนุมัติแล้ว', approved.length, 'var(--green)')}
        ${statBox('ปฏิเสธ', rejected.length, 'var(--red)')}
        ${statBox('ยอดเงินรางวัล', '฿' + totalMoney.toLocaleString(), 'var(--accent)')}
      </div>`;
  }

  // ── Row Renderer ────────────────────────────────────────────────────────
  const renderRow = (e, showApproveBtn) => {
    const et = getExType(e);
    const reward = EX_REWARD[et] || 100;
    const tcolor = et === 'solo' ? 'var(--green)' : et === 'group_ex' ? 'var(--purple)' : 'var(--orange)';
    const proofLink = e.proofLink || (e.proofDoc?.startsWith('http') ? e.proofDoc : '');
    const proofLinks = e.proofLinks || [];
    const isGrp = isGroupEx(et);
    const wkNum = getWkNum(e.date);
    const members = e.members || [];
    const allMembers = [{ email: e.email, name: e.name, type: 'sys' }, ...members];
    const chips = allMembers.map(m => {
      const u = m.type === 'sys' ? getUsers().find(x => x.email === m.email) : null;
      const nick = u ? (u.nickname || u.name.split(' ')[0]) : (m.name || '').split(' ')[0];
      const isOut = m.type === 'out';
      return `<div class="member-chip" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.03);padding:2px 8px;border-radius:8px;font-size:14px;display:flex;align-items:center;gap:4px;color:${isOut ? 'var(--text3)' : '#fff'};">
        <i class="fa-solid fa-user" style="font-size:10px;opacity:0.5;"></i> ${nick}${isOut ? ` <span style="font-size:11px;opacity:0.6;">(นอก)</span>` : ''}
      </div>`;
    }).join('');

    return `
      <div style="background:#1a1c26; border-radius:18px; border:1px solid rgba(255,255,255,0.04); padding:15px; position:relative; box-shadow:0 4px 20px rgba(0,0,0,0.2);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span style="font-size:13px; color:var(--text3); font-weight:700; background:rgba(255,255,255,0.05); padding:2px 8px; border-radius:6px; font-family:var(--mono); border:1px solid rgba(255,255,255,0.03);">ID: ${e.id}</span>
            <span style="font-size:22px; font-weight:700; color:#fff;">${e.activity || 'กิจกรรม'}</span>
            <span style="font-size:17px; color:#9094b8; font-weight:500;">(${EX_LABEL[et]})</span>
            <span style="background:#f5c842; color:#000; padding:1px 8px; border-radius:6px; font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Week ${wkNum}</span>
          </div>
          <div style="font-size:22px; font-weight:500; color:${tcolor}; font-family:var(--mono);">฿${reward.toLocaleString()}</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px; color:#5a5e7a; font-size:16px; margin-bottom:${e.rejectReason ? '8px' : '12px'}; font-weight:500;">
          <i class="fa-regular fa-calendar" style="font-size:15px;"></i>
          <span>${new Date(e.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
        ${e.rejectReason ? `
        <div style="display:flex;align-items:flex-start;gap:8px;background:var(--red-bg);border:1px solid rgba(255,107,107,0.2);border-radius:8px;padding:8px 12px;margin-bottom:12px;">
          <i class="fa-solid fa-circle-xmark" style="color:var(--red);font-size:14px;margin-top:3px;flex-shrink:0;"></i>
          <div style="font-size:14px;color:var(--red);font-weight:500;">${e.rejectReason}</div>
        </div>` : ''}

        <!-- Bottom Row: Members & Actions -->
        <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:12px; flex-wrap:wrap;">
          <div style="flex:1; min-width:240px;">
            ${isGrp ? `
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                <span style="font-size:14px; color:#5a5e7a; font-weight:600;">สมาชิกทั้งหมด</span>
                <span style="background:rgba(255,255,255,0.08); color:#5a5e7a; padding:0 8px; border-radius:8px; font-size:12px; font-weight:700;">${allMembers.length}</span>
              </div>
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                ${chips}
              </div>
            ` : `
              <div style="display:flex; align-items:center; gap:12px;">
                <div style="font-size:14px; color:#5a5e7a; font-weight:600; flex-shrink:0;">ผู้ยื่น</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  ${chips}
                </div>
              </div>
            `}
          </div>

          <div style="display:flex; align-items:center; gap:10px;">
            ${proofLink || proofLinks.length ? `
              <a href="${proofLink || proofLinks[0]?.url}" target="_blank" style="width:38px; height:34px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.04); border-radius:8px; display:flex; align-items:center; justify-content:center; color:#fff; text-decoration:none; transition:all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">
                <i class="fa-solid fa-circle-play" style="font-size:22px; color:var(--accent);"></i>
              </a>` : ''}
            
            ${showApproveBtn === 'pending' ? `
              <button class="btn btn-green btn-sm" style="padding:6px 14px; border-radius:8px; font-size:15px; font-weight:500; display:flex; align-items:center; gap:8px;" onclick="event.stopPropagation();apprEx('${e.id}')">
                <i class="fa-solid fa-check" style="font-size:13px;"></i> อนุมัติ
              </button>
              <button class="btn btn-red btn-sm" style="padding:6px 14px; border-radius:8px; font-size:15px; font-weight:500; display:flex; align-items:center; gap:8px;" onclick="event.stopPropagation();rejEx('${e.id}')">
                <i class="fa-solid fa-xmark" style="font-size:13px;"></i> ไม่อนุมัติ
              </button>
            ` : ''}

            ${showApproveBtn === 'approved' ? `
              <button class="btn btn-ghost btn-sm" style="padding:6px 14px; border-radius:8px; font-size:15px;" onclick="event.stopPropagation();revertExToPending('${e.id}')">
                <i class="fa-solid fa-angles-left"></i> รออนุมัติ
              </button>
            ` : ''}

            <button class="btn btn-ghost btn-sm" style="padding:6px 14px; border-radius:8px; font-size:15px; display:flex; align-items:center; gap:8px; color:#9094b8; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.02);" onclick="viewExDetail('${e.id}')">
                <i class="fa-solid fa-magnifying-glass" style="font-size:13px;"></i> รายละเอียด
            </button>
          </div>
        </div>
      </div>`;
  };

  const getItemDept = (e) => {
    if (e.dept) return e.dept;
    const u = getUsers().find(x => x.email === e.email);
    return (u && u.dept) ? u.dept : 'ไม่ระบุ';
  };

  const section = (title, items, status, isGrid = false) => {
    const showApprove = status; // pass status string ('pending'/'approved') directly to renderRow
    if (isGrid && items.length > 0) {
      const depts = ['ทั้งหมด', ...new Set(items.map(e => getItemDept(e)).filter(Boolean))].sort((a, b) => a === 'ไม่ระบุ' ? 1 : b === 'ไม่ระบุ' ? -1 : a.localeCompare(b, 'th'));
      if (!depts.includes(_exReviewDeptTab)) _exReviewDeptTab = 'ทั้งหมด';

      const filteredItems = _exReviewDeptTab === 'ทั้งหมด' ? items : items.filter(e => getItemDept(e) === _exReviewDeptTab);

      const deptTabs = `
        <div style="display:flex; gap:10px; margin-bottom:20px; overflow-x:auto; padding-bottom:8px; scrollbar-width:none; -ms-overflow-style:none;">
          <style>
            .dept-tabs::-webkit-scrollbar { display: none; }
          </style>
          <div class="dept-tabs" style="display:flex; gap:10px;">
            ${depts.map(d => `
              <button onclick="setExReviewDeptTab('${d}')" style="white-space:nowrap; padding:8px 18px; border-radius:12px; border:1px solid ${d === _exReviewDeptTab ? 'var(--accent)' : 'rgba(255,255,255,0.05)'}; background:${d === _exReviewDeptTab ? 'rgba(0,123,255,0.1)' : 'rgba(255,255,255,0.02)'}; color:${d === _exReviewDeptTab ? 'var(--accent)' : '#9094b8'}; font-weight:600; cursor:pointer; font-size:14px; transition:all 0.2s; display:flex; align-items:center; gap:8px;">
                ${d}
                <span style="font-size:12px; opacity:0.6; background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px;">${d === 'ทั้งหมด' ? items.length : items.filter(e => getItemDept(e) === d).length}</span>
              </button>
            `).join('')}
          </div>
        </div>
      `;

      return `
        <div style="margin-bottom:40px; border-top:1px solid rgba(255,255,255,0.05); padding-top:24px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <div style="font-size:22px; font-weight:700; color:#fff;">${title}</div>
          </div>
          ${deptTabs}
          ${filteredItems.length ? `
            <div class="review-grid">${filteredItems.map(e => renderRow(e, showApprove)).join('')}</div>
          ` : `<div style="padding:60px 20px; text-align:center; background:rgba(255,255,255,0.01); border-radius:16px; border:1px dashed rgba(255,255,255,0.05); color:#5a5e7a; font-size:16px;">ไม่พบรายการสำหรับแผนกนี้</div>`}
        </div>`;
    }

    if (!items.length) return `<div style="margin-bottom:40px; border-top:1px solid rgba(255,255,255,0.05); padding-top:24px;"><div style="font-size:22px; font-weight:700; color:#fff; margin-bottom:12px;">${title}</div><div style="padding:16px; font-size:16px; color:#5a5e7a; background:rgba(255,255,255,0.01); border-radius:12px; border:1px dashed rgba(255,255,255,0.05); text-align:center;">— ไม่มีรายการ —</div></div>`;
    return `<div style="margin-bottom:40px; border-top:1px solid rgba(255,255,255,0.05); padding-top:24px;"><div style="font-size:22px; font-weight:700; color:#fff; margin-bottom:16px;">${title}</div><div class="group-grid">${items.map(e => renderRow(e, showApprove)).join('')}</div></div>`;
  };

  const pendingGroup = pending.filter(e => isGroupEx(getExType(e))), pendingSolo = pending.filter(e => !isGroupEx(getExType(e)));
  const apprGroup = approved.filter(e => isGroupEx(getExType(e))), apprSolo = approved.filter(e => !isGroupEx(getExType(e)));

  const tabsHtml = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:24px; flex-wrap:wrap;">
      <div style="display:flex; gap:12px; background:rgba(255,255,255,0.02); padding:6px; border-radius:16px; border:1px solid rgba(255,255,255,0.03); flex:1; min-width:300px;">
        <button onclick="setExReviewTab('pending')" style="flex:1; padding:12px; border-radius:12px; border:none; cursor:pointer; font-size:17px; font-weight:600; display:flex; align-items:center; justify-content:center; gap:8px; background:${_exReviewTab === 'pending' ? 'var(--yellow-bg)' : 'transparent'}; color:${_exReviewTab === 'pending' ? 'var(--yellow)' : '#5a5e7a'};">รออนุมัติ <span style="background:${_exReviewTab === 'pending' ? 'var(--yellow)' : 'rgba(255,255,255,0.05)'}; color:${_exReviewTab === 'pending' ? '#000' : '#5a5e7a'}; padding:0 8px; border-radius:6px;">${pending.length}</span></button>
        <button onclick="setExReviewTab('approved')" style="flex:1; padding:12px; border-radius:12px; border:none; cursor:pointer; font-size:17px; font-weight:600; display:flex; align-items:center; justify-content:center; gap:8px; background:${_exReviewTab === 'approved' ? 'var(--green-bg)' : 'transparent'}; color:${_exReviewTab === 'approved' ? 'var(--green)' : '#5a5e7a'};">อนุมัติแล้ว <span style="background:${_exReviewTab === 'approved' ? 'var(--green)' : 'rgba(255,255,255,0.05)'}; color:${_exReviewTab === 'approved' ? '#000' : '#5a5e7a'}; padding:0 8px; border-radius:6px;">${approved.length}</span></button>
      </div>
    </div>`;

  const listArea = document.getElementById('ex-review-list-area');
  if (listArea) {
    listArea.innerHTML = tabsHtml + (_exReviewTab === 'pending' ?
      section('แบบกลุ่ม', pendingGroup, 'pending') + section('แบบเดี่ยว', pendingSolo, 'pending', true) :
      section('แบบกลุ่ม', apprGroup, 'approved') + section('แบบเดี่ยว', apprSolo, 'approved', true));
  }
}
function apprEx(id) {
  if (cu.role !== 'pm') { toast('⚠️ เฉพาะ PM เท่านั้น'); return; }
  const es = getExs(), i = es.findIndex(e => e.id === id); if (i < 0) return;
  const e = es[i];
  if (isGroupEx(getExType(e))) {
    const totalMemCount = 1 + (e.members || []).length;
    if (totalMemCount < 3) { toast(`⚠️ คำขอนี้มีแค่ ${totalMemCount} คน — ต้องครบ 3 คนถึงจะอนุมัติได้`); return; }

    // ตรวจสอบว่ามีสมาชิกคนไหนที่ approved group ในสัปดาห์เดียวกันแล้วหรือยัง
    const wk = wkKey(e.date);
    const allParticEmails = [e.email, ...(e.members || []).filter(m => m.type === 'sys').map(m => m.email)];
    const conflicts = allParticEmails.filter(email =>
      es.some(x => x.id !== e.id && isGroupEx(getExType(x)) && x.status === 'approved' && wkKey(x.date) === wk && isUserInvolved(x, email))
    );
    if (conflicts.length > 0) {
      const names = conflicts.map(em => { const u = getUsers().find(x => x.email === em); return (u?.nickname || u?.name?.split(' ')[0] || em); });
      const proceed = confirm(`⚠️ สมาชิกต่อไปนี้มีกิจกรรมกลุ่มที่ approved ในสัปดาห์นี้แล้ว:\n${names.join(', ')}\n\nยืนยันอนุมัติต่อ?`);
      if (!proceed) return;
    }
  }
  es[i].status = 'approved';
  es[i].approvedBy = cu.name;
  saveExs(es);
  apiSync('updateEx', es[i]);
  syncExerciseToSheets(es[i], 'exercise_approved');
  toast('✅ อนุมัติแล้ว'); updateDashboard(); updateLB(); updateQuota(); renderExR();
}
function rejEx(id) {
  if (cu.role !== 'pm') { toast('⚠️ เฉพาะ PM เท่านั้น'); return; }
  const es = getExs(), i = es.findIndex(e => e.id === id); if (i < 0) return;

  // เปิด modal ขอเหตุผล
  document.getElementById('conf-title').textContent = 'ระบุเหตุผลไม่อนุมัติ';
  document.getElementById('conf-body').innerHTML = `
    <div style="margin-bottom:12px;color:var(--text2);font-size:16px;">
      กิจกรรม <strong style="color:var(--text);">${es[i].activity || ''}</strong> ของ <strong style="color:var(--text);">${es[i].name || ''}</strong>
    </div>
    <textarea id="reject-reason-input" placeholder="กรอกเหตุผลที่ไม่อนุมัติ..." rows="3"
      style="width:100%;background:var(--surface3);border:1px solid var(--border2);border-radius:10px;padding:12px;color:var(--text);font-size:16px;font-family:inherit;resize:vertical;outline:none;"></textarea>
    <div id="reject-reason-err" style="color:var(--red);font-size:14px;margin-top:6px;display:none;">⚠️ กรุณาระบุเหตุผล</div>
  `;
  const okBtn = document.getElementById('conf-ok');
  okBtn.textContent = 'ยืนยันไม่อนุมัติ';
  okBtn.className = 'btn btn-red';
  okBtn.onclick = () => {
    const reason = (document.getElementById('reject-reason-input')?.value || '').trim();
    if (!reason) { document.getElementById('reject-reason-err').style.display = 'block'; return; }
    es[i].status = 'rejected';
    es[i].rejectReason = reason;
    es[i].rejectedBy = cu.name;
    saveExs(es);
    apiSync('updateEx', es[i]);
    closeModal('modal-confirm');
    toast('✕ ไม่อนุมัติ'); renderExR();
  };
  openModal('modal-confirm');
}
function revertExToPending(id) {
  if (cu.role !== 'pm') { toast('⚠️ เฉพาะ PM เท่านั้น'); return; }
  const es = getExs(), i = es.findIndex(e => e.id === id); if (i < 0) return;
  es[i].status = 'pending';
  es[i].approvedBy = '';
  saveExs(es);
  apiSync('updateEx', es[i]);
  toast('↩️ ปรับกลับเป็นรออนุมัติแล้ว'); renderExR(); updateDashboard(); updateLB(); updateQuota(); updateBadges();
}

// ══ EXERCISE SHARE ═══════════════════════
let _exShareMonth = '';
function onExShareMonthChange() {
  _exShareMonth = document.getElementById('ex-share-month-select')?.value || '';
  renderExShare();
}
function renderExShare() {
  const all = getExs().filter(e => isGroupEx(getExType(e)));
  const isInvolved = (e) => isUserInvolved(e, cu.email);
  const memberCount = (e) => 1 + (e.members || []).length;
  const isLocked = (e) => e.status !== 'pending';

  // Build month dropdown from actual data
  const monthSel = document.getElementById('ex-share-month-select');
  if (monthSel) {
    const months = [...new Set(all.map(e => monthKey(e.date)))].sort().reverse();
    // Default to current month if not set or no longer valid
    if (!_exShareMonth || !months.includes(_exShareMonth)) _exShareMonth = months[0] || '';
    monthSel.innerHTML = months.map(mk => {
      const [y, m] = mk.split('-').map(Number);
      const monthName = new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
      // Period: 19th of this month → 18th of next month
      const startDate = new Date(y, m - 1, 19).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
      const nextM = m === 12 ? new Date(y + 1, 0, 18) : new Date(y, m, 18);
      const endDate = nextM.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
      return `<option value="${mk}"${mk === _exShareMonth ? ' selected' : ''}>${monthName}  •  ${startDate} – ${endDate}</option>`;
    }).join('');
  }

  const sorted = [...all]
    .filter(e => !_exShareMonth || monthKey(e.date) === _exShareMonth)
    .sort((a, b) => {
      const wkDiff = wkKey(b.date).localeCompare(wkKey(a.date)); // Week ล่าสุดก่อน
      if (wkDiff !== 0) return wkDiff;
      return new Date(b.submittedAt || b.date) - new Date(a.submittedAt || a.date); // ใน week เดียวกัน เรียงตามวันที่ submit
    });
  const mine = sorted.filter(isInvolved);
  // กิจกรรมที่เข้าร่วมได้: pending + ยังไม่มีชื่อตัวเอง + quota ยังไม่เต็ม
  const canJoin = sorted.filter(e => {
    if (isInvolved(e)) return false;           // มีชื่ออยู่แล้ว
    if (e.status !== 'pending') return false;  // ล็อกแล้ว (approved/rejected)
    const wk = wkKey(e.date), mk = monthKey(e.date);
    const wkUsed = all.filter(x => isUserInvolved(x, cu.email) && x.status !== 'rejected' && wkKey(x.date) === wk).length;
    if (wkUsed >= 1) return false;             // โควต้าสัปดาห์เต็ม
    const moUsed = all.filter(x => isUserInvolved(x, cu.email) && x.status !== 'rejected' && monthKey(x.date) === mk).length;
    if (moUsed >= 4) return false;             // โควต้าเดือนเต็ม
    return true;
  });

  const renderCard = (e) => {
    const et = getExType(e);
    const locked = isLocked(e);
    const count = memberCount(e);
    const userIsSubmitter = e.email === cu.email;
    const userInMembers = (e.members || []).some(m => m.type === 'sys' && m.email === cu.email);
    const userInvolved = userIsSubmitter || userInMembers;

    // Date formatting
    const d = new Date(e.date);
    const day = d.getDate();
    const month = d.toLocaleDateString('th-TH', { month: 'short' });
    const fullDate = d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const wkNum = getWkNum(e.date);

    // Status config
    const statusCfg = e.status === 'approved'
      ? { label: 'อนุมัติแล้ว', color: 'var(--green)', icon: 'fa-solid fa-circle-check', border: '1px solid rgba(61, 214, 140, 0.3)' }
      : e.status === 'rejected'
        ? { label: 'ไม่อนุมัติ', color: 'var(--red)', icon: 'fa-solid fa-circle-xmark', border: '1px solid rgba(255, 107, 107, 0.3)' }
        : { label: 'รออนุมัติ', color: 'var(--yellow)', icon: 'fa-regular fa-clock', border: '1px solid rgba(245, 200, 66, 0.3)' };

    const typeColor = et === 'group_eat' ? 'var(--orange)' : 'var(--accent)';

    // Member Chips
    const allMembers = [{ kind: 'submitter', email: e.email, name: e.name }, ...(e.members || []).map(m => ({ kind: m.type, email: m.email, name: m.name, dept: m.dept }))];
    const memberChips = allMembers.map(m => {
      const isSubmitter = m.kind === 'submitter';
      const isMe = m.email === cu.email && (isSubmitter || m.kind === 'sys');
      const icon = isSubmitter ? 'fa-crown' : 'fa-user';
      const iconColor = isSubmitter ? 'var(--yellow)' : '#b37fff';

      const bg = isMe ? 'rgba(108, 138, 255, 0.15)' : 'var(--surface3)';
      const border = isMe ? '1px solid rgba(108, 138, 255, 0.2)' : '1px solid var(--border)';
      const fg = isMe ? 'var(--accent)' : 'var(--text2)';

      return `
        <div style="display:flex;align-items:center;gap:6px;background:${bg};border:${border};padding:4px 10px;border-radius:20px;font-size:13px;color:${fg};">
          <i class="fa-solid ${icon}" style="color:${iconColor};font-size:11px;"></i>
          <div style="white-space:nowrap; display: flex; align-items: center; gap: 4px;">
            <span style="font-weight:500;">${uNick(m.email, m.name)}</span>
            ${m.dept ? `<span style="font-size:10px; opacity:0.6; background: rgba(255,255,255,0.05); padding: 1px 4px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">${m.dept}</span>` : ''}
          </div>
          ${(!locked || (cu.role === 'pm' && e.status === 'approved')) && isMe && !isSubmitter && count > 3 ? `<button onclick="leaveExGroup('${e.id}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;margin-left:4px;padding:0;display:flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;transition:background 0.2s;" onmouseover="this.style.background='rgba(255,107,107,0.1)'" onmouseout="this.style.background='none'">✕</button>` : ''}
        </div>`;
    }).join('');

    return `
    <div class="card" style="padding: 20px; border-radius: 16px; border: 1px solid var(--border2); background: var(--surface); box-shadow: 0 4px 20px rgba(0,0,0,0.15); display: flex; flex-direction: column;">
      
      <!-- Top Meta -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="width: 8px; height: 8px; border-radius: 50%; background: ${typeColor};"></div>
          <span style="font-size: 14px; font-weight: 600; color: var(--text2); letter-spacing: 0.5px;">${EX_LABEL[et]}</span>
          <span style="color:var(--text3);font-size:12px;">WEEK ${wkNum}</span>
        </div>
        <div style="display:flex; align-items:center; gap: 6px; color:${statusCfg.color}; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; border: ${statusCfg.border}; background: rgba(0,0,0,0.2);">
          <i class="${statusCfg.icon}"></i>
          <span>${statusCfg.label}</span>
        </div>
      </div>

      <!-- Content Row: Calendar + Details -->
      <div style="display:flex; gap:16px; align-items:flex-start; margin-bottom: 20px;">
        <!-- Calendar Block -->
        <div style="display:flex; flex-direction:column; width: 56px; border-radius: 12px; overflow: hidden; text-align: center; border: 1px solid var(--border2); flex-shrink: 0;">
          <div style="background: var(--orange); color: #000; font-size: 12px; font-weight: 700; padding: 3px 0; text-transform: uppercase;">${month}</div>
          <div style="background: #111; font-size: 24px; font-weight: 700; padding: 4px 0; color: var(--text); font-family: var(--mono);">${day}</div>
        </div>
        <!-- Title & Info -->
        <div style="flex:1; min-width:0; padding-top: 2px;">
          <div style="font-size: 22px; font-weight: 700; color: var(--text); margin-bottom: 6px; line-height: 1.2;">${e.activity}</div>
          <div style="display:flex; align-items:center; gap: 12px; color: var(--text3); font-size: 14px; font-weight: 500;">
            <div style="display:flex; align-items:center; gap:6px;"><i class="fa-regular fa-calendar-days" style="opacity: 0.7;"></i> ${fullDate}</div>
            <div style="display:flex; align-items:center; gap:6px;"><i class="fa-regular fa-user" style="opacity: 0.7;"></i> ${count} คน</div>
          </div>
        </div>
      </div>

      <!-- Members Section -->
      <div style="margin-bottom: auto;">
        <div style="display:flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <span style="font-size: 13px; font-weight: 600; color: var(--text3);">ผู้เข้าร่วม</span>
          <span style="font-size: 13px; font-weight: 700; color: var(--text); font-family: var(--mono);">${count} คน${count < 3 ? ' <span style="color:var(--text3); font-weight: 500; font-family: \'IBM Plex Sans Thai\', sans-serif;">· ครบโควต้า</span>' : ''}</span>
        </div>
        <div style="display:flex; flex-wrap: wrap; gap: 8px;">
          ${memberChips}
        </div>
      </div>

      ${e.note ? `<div style="margin-top:16px;padding:12px;background:rgba(255,255,255,0.03);border-radius:10px;font-size:14px;color:var(--text2);border:1px dashed var(--border2);"><i class="fa-solid fa-pen-clip" style="opacity:0.5; margin-right:6px;"></i> ${e.note}</div>` : ''}

      <!-- Actions -->
      <div style="margin-top: 24px; display:flex; gap: 12px;">
        ${(!locked || (cu.role === 'pm' && e.status === 'approved')) && !userInvolved
        ? `<button class="btn" style="flex:2; justify-content:center; height: 44px; border-radius: 12px; background: var(--accent); color: #fff; font-size: 15px; font-weight: 600; border: none; box-shadow: 0 4px 12px rgba(108, 138, 255, 0.3);" onclick="joinExGroup('${e.id}')"><i class="fa-solid fa-plus" style="margin-right:6px;"></i> เข้าร่วมกลุ่ม</button>`
        : ''}
        ${(!locked || (cu.role === 'pm' && e.status === 'approved')) && userInvolved && !userIsSubmitter
        ? `<button class="btn" style="flex:2; justify-content:center; height: 44px; border-radius: 12px; background: rgba(255, 107, 107, 0.1); color: var(--red); font-size: 15px; font-weight: 600; border: 1px solid rgba(255, 107, 107, 0.2);" onclick="leaveExGroup('${e.id}')"><i class="fa-solid fa-xmark" style="margin-right:6px;"></i> ถอนตัว</button>`
        : ''}
        ${(!locked || (cu.role === 'pm' && e.status === 'approved')) && userInvolved && userIsSubmitter
        ? `<div style="flex:2; display:flex; align-items:center; justify-content:center; height: 44px; border-radius: 12px; background: rgba(255,255,255,0.03); color: var(--text3); font-size: 15px; font-weight: 500; border: 1px solid var(--border2);"><i class="fa-solid fa-crown" style="margin-right:6px; color:var(--yellow);"></i> หัวหน้ากลุ่ม</div>`
        : ''}
        <button class="btn" style="flex:1; justify-content:center; height: 44px; border-radius: 12px; background: transparent; color: var(--text2); font-size: 15px; font-weight: 500; border: 1px solid var(--border2); transition: all 0.2s;" onmouseover="this.style.background='var(--surface2)'; this.style.color='var(--text)';" onmouseout="this.style.background='transparent'; this.style.color='var(--text2)';" onclick="viewExDetail('${e.id}')">รายละเอียด <i class="fa-solid fa-chevron-right" style="margin-left:6px; font-size:11px; opacity:0.6;"></i></button>
      </div>
    </div>`;
  };

  const mineEl = document.getElementById('ex-share-panel-mine');
  const empty = (msg) => `<div style="color:var(--text3);text-align:center;padding:40px 20px;font-size:15px;background:rgba(255,255,255,0.02);border-radius:12px;border:1px dashed var(--border2);">${msg}</div>`;
  if (mineEl) mineEl.innerHTML = mine.length ? mine.map(renderCard).join('') : empty('ยังไม่มีคำขอที่มีชื่อคุณ');

  // เก็บ all sorted (ทั้งหมดของทีม) และ canJoin ไว้ใน window เพื่อให้ applyExShareAllFilter ใช้ได้
  window._exShareMine = mine;
  window._exShareAllSorted = sorted;
  window._exShareCanJoin = canJoin;
  window._exShareRenderCard = renderCard;
  window._exShareEmpty = empty;

  // Update badge counts
  const mineBadge = document.getElementById('ex-share-tab-mine-badge');
  const allBadge = document.getElementById('ex-share-tab-all-badge');
  if (mineBadge) mineBadge.textContent = mine.length;
  if (allBadge) allBadge.textContent = sorted.length;

  // Re-apply active tab style and update text
  setExShareTab(window._exShareTab || 'mine');
  applyExShareAllFilter();
}

function updateExShareSummaryText() {
  const sumEl = document.getElementById('ex-share-summary-text');
  if (!sumEl) return;
  if (window._exShareTab === 'mine') {
    const list = window._exShareMine || [];
    sumEl.innerHTML = `พบ <strong style="color: var(--text);">${list.length} กิจกรรม</strong> ที่มีชื่อฉัน · อัปเดตล่าสุดเมื่อสักครู่`;
  } else {
    const chk = document.getElementById('ex-share-filter-joinable');
    const useFilter = chk ? chk.checked : true;
    const list = useFilter ? (window._exShareCanJoin || []) : (window._exShareAllSorted || []);
    sumEl.innerHTML = `พบ <strong style="color: var(--text);">${list.length} กิจกรรม</strong> ${useFilter ? 'ที่เปิดรับ' : 'ทั้งหมดในทีม'} · อัปเดตล่าสุดเมื่อสักครู่`;
  }
}

function applyExShareAllFilter() {
  const chk = document.getElementById('ex-share-filter-joinable');
  const allEl = document.getElementById('ex-share-panel-all');
  if (!allEl) return;

  // Update visual of custom checkbox
  const customBox = chk?.nextElementSibling;
  if (customBox && customBox.classList.contains('custom-checkbox')) {
    if (chk.checked) {
      customBox.style.background = 'var(--accent)';
      customBox.innerHTML = '<i class="fa-solid fa-check" style="font-size: 10px;"></i>';
      chk.parentElement.style.background = 'rgba(108, 138, 255, 0.1)';
      chk.parentElement.style.borderColor = 'rgba(108, 138, 255, 0.2)';
    } else {
      customBox.style.background = 'transparent';
      customBox.style.border = '1px solid var(--text3)';
      customBox.innerHTML = '';
      chk.parentElement.style.background = 'rgba(255,255,255,0.03)';
      chk.parentElement.style.borderColor = 'var(--border2)';
    }
  }

  const useFilter = chk ? chk.checked : true;
  const list = useFilter ? (window._exShareCanJoin || []) : (window._exShareAllSorted || []);
  const renderCard = window._exShareRenderCard;
  const empty = window._exShareEmpty || ((msg) => `<div style="color:var(--text3);text-align:center;padding:40px 20px;font-size:15px;background:rgba(255,255,255,0.02);border-radius:12px;border:1px dashed var(--border2);">${msg}</div>`);
  if (!renderCard) return;
  const emptyMsg = useFilter
    ? 'ไม่มีกิจกรรมที่เข้าร่วมได้ในขณะนี้ — โควต้าเต็มหรือไม่มีคำขอใหม่'
    : 'ยังไม่มีกิจกรรมกลุ่มในเดือนนี้';
  allEl.innerHTML = list.length ? list.map(renderCard).join('') : empty(emptyMsg);
  updateExShareSummaryText();
}

let _exShareTab = 'mine';
function setExShareTab(tab) {
  window._exShareTab = tab;
  const panelMine = document.getElementById('ex-share-panel-mine');
  const panelAll = document.getElementById('ex-share-panel-all');
  const tabMine = document.getElementById('ex-share-tab-mine');
  const tabAll = document.getElementById('ex-share-tab-all');
  const mineBadge = document.getElementById('ex-share-tab-mine-badge');
  const allBadge = document.getElementById('ex-share-tab-all-badge');
  if (!panelMine || !panelAll || !tabMine || !tabAll) return;

  const activeStyle = { bg: 'rgba(255,255,255,0.06)', color: 'var(--text)' };
  const inactiveStyle = { bg: 'transparent', color: 'var(--text3)' };

  const applyTab = (btn, badge, isActive) => {
    const s = isActive ? activeStyle : inactiveStyle;
    btn.style.background = s.bg;
    btn.style.color = s.color;
    if (badge) {
      badge.style.background = isActive ? 'var(--accent)' : 'rgba(255,255,255,0.06)';
      badge.style.color = isActive ? '#fff' : 'var(--text3)';
    }
  };

  applyTab(tabMine, mineBadge, tab === 'mine');
  applyTab(tabAll, allBadge, tab === 'all');

  panelMine.style.display = tab === 'mine' ? '' : 'none';
  panelAll.style.display = tab === 'all' ? '' : 'none';

  const filterBar = document.getElementById('ex-share-all-filter-bar');
  if (filterBar) filterBar.style.display = tab === 'all' ? 'flex' : 'none';

  updateExShareSummaryText();
}
function joinExGroup(id) {
  const es = getExs(), i = es.findIndex(e => e.id === id);
  if (i < 0) return;
  const e = es[i];
  if (e.status !== 'pending' && !(cu.role === 'pm' && e.status === 'approved')) { toast('⚠️ คำขอนี้ถูก' + (e.status === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ') + 'แล้ว'); return; }

  if (isUserInvolved(e, cu.email)) { toast('⚠️ คุณมีชื่ออยู่ในคำขอนี้แล้ว'); return; }
  const mk = monthKey(e.date);
  const wk = wkKey(e.date);
  // กลุ่ม: 1/สัปดาห์ และ 4/เดือน (เหมือนกันทั้ง กทม/ตจว)
  const wkGrp = es.filter(x => isUserInvolved(x, cu.email) && isGroupEx(getExType(x)) && x.status !== 'rejected' && wkKey(x.date) === wk).length;
  if (wkGrp >= 1) { toast('⚠️ โควต้ากิจกรรมกลุ่มสัปดาห์นั้นของคุณเต็มแล้ว (1/1 ครั้ง/สัปดาห์)'); return; }
  const moGrp = es.filter(x => isUserInvolved(x, cu.email) && isGroupEx(getExType(x)) && x.status !== 'rejected' && monthKey(x.date) === mk).length;
  if (moGrp >= 4) { toast('⚠️ โควต้ากิจกรรมกลุ่มเดือนนั้นของคุณเต็มแล้ว (4/4 ครั้ง/เดือน)'); return; }

  document.getElementById('conf-title').textContent = 'ยืนยันการเข้าร่วมกลุ่ม';
  document.getElementById('conf-body').innerHTML = '<div style="font-size:19px;line-height:1.6;color:var(--text);">เช็กให้ชัวร์ก่อนกดนะ! เพราะ PM จะตรวจสอบสิทธิ์จากหลักฐานที่คุณแจ้งไว้ เพื่อให้งานไม่สะดุด รบกวนตรวจสอบความถูกต้องอีกครั้งครับ/ค่ะ</div>';
  document.getElementById('conf-ok').onclick = () => doJoinExGroup(id);
  openModal('modal-confirm');
}
function doJoinExGroup(id) {
  closeModal('modal-confirm');
  const es = getExs(), i = es.findIndex(e => e.id === id);
  if (i < 0) return;
  const e = es[i];
  // Deduplicate: remove any stale entry for this email before adding (idempotent join)
  e.members = (e.members || []).filter(m => !(m.type === 'sys' && (m.email || '').toLowerCase() === cu.email.toLowerCase()));
  e.members.push({ id: 'sys_' + cu.email, type: 'sys', email: cu.email, name: cu.name });
  saveExs(es);
  apiSync('updateEx', es[i]);
  renderExShare(); updateQuota(); updateLB(); updateDashboard(); updateBadges();
  toast('✅ เพิ่มชื่อคุณเข้ากลุ่มเรียบร้อย');
}
function leaveExGroup(id) {
  const es = getExs(), i = es.findIndex(e => e.id === id);
  if (i < 0) return;
  const e = es[i];
  if (e.status !== 'pending' && !(cu.role === 'pm' && e.status === 'approved')) { toast('⚠️ คำขอนี้ถูก' + (e.status === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ') + 'แล้ว'); return; }

  const count = 1 + (e.members || []).length;
  if (count <= 3) { toast('⚠️ ไม่สามารถลบชื่อได้ ต้องมีสมาชิกในกลุ่มอย่างน้อย 3 คน'); return; }

  const oldMembers = e.members || [];
  const found = oldMembers.some(m => m.type === 'sys' && m.email === cu.email);
  if (!found) { toast('⚠️ ไม่พบชื่อคุณในกลุ่มนี้'); return; }

  // แสดง popup ยืนยัน
  document.getElementById('conf-title').textContent = 'ยืนยันการถอนตัว';
  document.getElementById('conf-body').innerHTML = `
    <div style="font-size:19px;line-height:1.7;color:var(--text);">
      คุณต้องการ <strong style="color:var(--red);">ถอนตัวออกจากกลุ่ม</strong> กิจกรรม
      <strong style="color:var(--text);">"${e.activity}"</strong> ใช่หรือไม่?<br>
      <span style="font-size:16px;color:var(--text3);">วันที่ ${new Date(e.date).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
    </div>`;
  document.getElementById('conf-ok').onclick = () => doLeaveExGroup(id);
  openModal('modal-confirm');
}

function doLeaveExGroup(id) {
  closeModal('modal-confirm');
  const es = getExs(), i = es.findIndex(e => e.id === id);
  if (i < 0) return;
  const e = es[i];
  const oldMembers = e.members || [];
  // ลบเฉพาะชื่อออกจากสมาชิก — proofLinks ที่เคยแนบไว้ยังคงอยู่ (ไม่แตะ e.proofLinks)
  e.members = oldMembers.filter(m => !(m.type === 'sys' && m.email === cu.email));
  saveExs(es);
  apiSync('updateEx', es[i]);
  renderExShare(); updateQuota(); updateLB(); updateDashboard(); updateBadges();
  toast('✕ ถอนตัวออกจากกลุ่มเรียบร้อย');
}

// ══ LEADERBOARD ══════════════════════════
function updateLB() {
  const allExs = getExs().filter(e => e.status !== 'rejected');

  // Populate month dropdown with available months
  const lbMonthSel = document.getElementById('lb-month-select');
  if (lbMonthSel) {
    const availableMonths = [...new Set(allExs.map(e => monthKey(e.date)).filter(Boolean))].sort((a, b) => b.localeCompare(a));
    const curMk = monthKey(new Date().toISOString().split('T')[0]);
    if (!availableMonths.includes(curMk)) availableMonths.unshift(curMk);
    if (!availableMonths.includes(_lbMonth)) _lbMonth = availableMonths[0] || curMk;
    const fmtMk = (mk) => {
      const [y, m] = mk.split('-').map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    };
    lbMonthSel.innerHTML = availableMonths.map(mk => `<option value="${mk}"${mk === _lbMonth ? ' selected' : ''}>${fmtMk(mk)}</option>`).join('');
  }

  // Filter by selected month
  const a = allExs.filter(e => monthKey(e.date) === _lbMonth);
  const sm = {}, gxm = {}, gem = {};

  a.forEach(e => {
    const et = getExType(e);
    if (et === 'solo') {
      sm[e.email] = (sm[e.email] || 0) + 1;
    } else {
      const partic = [{ email: e.email }, ...(e.members || []).filter(m => m.type === 'sys')];
      partic.forEach(p => {
        if (et === 'group_ex') gxm[p.email] = (gxm[p.email] || 0) + 1;
        else if (et === 'group_eat') gem[p.email] = (gem[p.email] || 0) + 1;
      });
    }
  });

  const renderSection = (data, colorVar, price) => {
    const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return '<div style="color:var(--text3);font-size:18px;padding:32px;text-align:center;font-weight:500;">ยังไม่มีข้อมูลในเดือนนี้</div>';

    const mkRow = (email, count, i) => {
      const u = getUsers().find(x => x.email === email) || { name: 'Unknown', dept: 'Media' };
      const name = u.nickname || u.name;
      const dept = u.dept || 'Media';
      const isTop3 = i < 3;
      const rankHtml = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1;
      const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';

      return `
        <div class="lb-row" style="${!isTop3 ? 'background:transparent; border:none; padding:10px 12px; margin-bottom:0;' : ''}">
          <div class="lb-rank ${rankClass}">${rankHtml}</div>
          <div style="flex:1;min-width:0;margin-left:4px;">
            <div style="font-weight:500;color:var(--text);font-size:19px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
            <div style="font-size:14px;color:var(--text3);font-weight:500;margin-top:-2px;">${dept}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-family:var(--mono);color:var(--text2);font-size:15px;line-height:1.1;">${count} <span style="font-size:12px;color:var(--text3);">ครั้ง</span></div>
            <div style="font-weight:500;color:${colorVar};font-family:var(--mono);font-size:20px;line-height:1.1;margin-top:2px;">฿${count * price}</div>
          </div>
        </div>
      `;
    };

    const top3 = sorted.slice(0, 3);
    const rest = sorted.slice(3);

    let html = top3.map(([email, count], i) => mkRow(email, count, i)).join('');

    if (rest.length) {
      html += `
        <div style="max-height:280px; overflow-y:auto; margin-top:10px; padding-right:6px;" class="custom-scroll">
          ${rest.map(([email, count], i) => mkRow(email, count, i + 3)).join('')}
        </div>
      `;
    }
    return html;
  };

  document.getElementById('lb-solo').innerHTML = renderSection(sm, 'var(--green)', 100);
  document.getElementById('lb-group-ex').innerHTML = renderSection(gxm, 'var(--purple)', 500);
  document.getElementById('lb-group-eat').innerHTML = renderSection(gem, 'var(--orange)', 300);

  // --- ADD SUMMARY TABLE ---
  const fmt = (d) => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  const mk = _lbMonth;
  const allMo = a; // already filtered by _lbMonth above
  const [y, mm] = mk.split('-');
  const dStart = new Date(y, parseInt(mm) - 1, 19), dEnd = new Date(y, parseInt(mm), 18);
  const rangeLabel = `${fmt(dStart)} - ${fmt(dEnd)}`;
  const users = getUsers().sort((a, b) => a.name.localeCompare(b.name, 'th'));
  const userStats = users.map(u => {
    const uExs = allMo.filter(e => isUserInvolved(e, u.email));
    let sC = 0, sA = 0, gexC = 0, gexA = 0, geC = 0, geA = 0;
    uExs.forEach(e => {
      const et = getExType(e);
      const isAppr = e.status === 'approved';
      if (et === 'solo') { sC++; if (isAppr) sA++; }
      else if (et === 'group_ex') { gexC++; if (isAppr) gexA++; }
      else if (et === 'group_eat') { geC++; if (isAppr) geA++; }
    });
    return {
      name: u.name, nick: u.nickname || u.name.split(' ')[0],
      dept: u.dept || '',
      locationType: u.locationType || 'bkk',
      sC, sR: sC * 100, sAR: sA * 100,
      gexC, gexR: gexC * 500, gexAR: gexA * 500,
      geC, geR: geC * 300, geAR: geA * 300,
      groupC: gexC + geC,
      total: (sC * 100) + (gexC * 500) + (geC * 300),
      totalA: (sA * 100) + (gexA * 500) + (geA * 300)
    };
  }).sort((a, b) => {
    let vA = a[_lbSortField], vB = b[_lbSortField];
    if (typeof vA === 'string') return _lbSortDir * vA.localeCompare(vB, 'th');
    return _lbSortDir * (vA - vB);
  });

  const summaryEl = document.getElementById('lb-summary-table');
  if (summaryEl) {
    const sIcon = (f) => _lbSortField === f ? (_lbSortDir === 1 ? ' <i class="fa-solid fa-sort-up"></i>' : ' <i class="fa-solid fa-sort-down"></i>') : ' <i class="fa-solid fa-sort" style="opacity:0.3"></i>';
    summaryEl.innerHTML = `
      <div style="margin-bottom:12px;font-size:16px;color:var(--text3);">รอบการคำนวณเงินรางวัล: <strong style="color:var(--text);">${rangeLabel}</strong> <span style="margin-left:12px;">(ตัวเลขในวงเล็บ = อนุมัติแล้ว)</span></div>
      <div class="table-wrap" style="border:1px solid var(--border);border-radius:12px;overflow-x:auto;">
        <table class="balance-table" style="font-size:15px; min-width: 1000px;">
          <thead style="background:var(--surface3);">
            <tr>
              <th rowspan="2" style="text-align:left;font-size:16px;cursor:pointer;user-select:none;" onclick="setLBSort('nick')">ชื่อเล่น${sIcon('nick')}</th>
              <th rowspan="2" style="text-align:left;font-size:16px;cursor:pointer;user-select:none;" onclick="setLBSort('dept')">แผนก${sIcon('dept')}</th>
              <th rowspan="2" style="text-align:left;font-size:16px;cursor:pointer;user-select:none;" onclick="setLBSort('locationType')">พื้นที่${sIcon('locationType')}</th>
              <th colspan="2" style="background:rgba(61,214,140,0.1);color:var(--green);cursor:pointer;user-select:none;" onclick="setLBSort('sC')">แบบเดี่ยว (100)${sIcon('sC')}</th>
              <th colspan="2" style="background:rgba(191,123,255,0.1);color:var(--purple);cursor:pointer;user-select:none;" onclick="setLBSort('gexC')">แบบกลุ่มออก (500)${sIcon('gexC')}</th>
              <th colspan="2" style="background:rgba(255,171,0,0.1);color:var(--orange);cursor:pointer;user-select:none;" onclick="setLBSort('geC')">แบบกลุ่มกิน (300)${sIcon('geC')}</th>
              <th rowspan="2" style="background:var(--surface2);font-weight:500;font-size:16px;cursor:pointer;user-select:none;" onclick="setLBSort('total')">รวม${sIcon('total')}</th>
            </tr>
            <tr style="font-size:13px;">
              <th style="background:rgba(61,214,140,0.05);">ครั้ง</th><th style="background:rgba(61,214,140,0.05);">เงิน</th>
              <th style="background:rgba(191,123,255,0.05);">ครั้ง</th><th style="background:rgba(191,123,255,0.05);">เงิน</th>
              <th style="background:rgba(255,171,0,0.05);">ครั้ง</th><th style="background:rgba(255,171,0,0.05);">เงิน</th>
            </tr>
          </thead>
          <tbody>
            ${userStats.map(s => `
              <tr style="${s.total > 0 ? 'background:rgba(255,255,255,0.02);' : 'opacity:0.5;'}">
                <td style="text-align:left;">
                  <div style="font-weight:500;font-size:17px;color:var(--text);">${s.nick}</div>
                  <div style="font-size:15px;color:var(--text3);">${s.name}</div>
                </td>
                <td style="text-align:left;color:var(--text2);">${s.dept}</td>
                <td style="text-align:left;">
                  <span style="color:${s.locationType === 'bkk' ? 'var(--accent)' : 'var(--orange)'};font-weight:600;">
                    ${s.locationType === 'bkk' ? 'กทม.' : 'ตจว.'}
                  </span>
                </td>
                <td>${s.sC}</td><td style="color:var(--green);font-family:var(--mono);">฿${s.sR.toLocaleString()}</td>
                <td>${s.gexC}</td><td style="color:var(--purple);font-family:var(--mono);">฿${s.gexR.toLocaleString()}</td>
                <td>${s.geC}</td><td style="color:var(--orange);font-family:var(--mono);">฿${s.geR.toLocaleString()}</td>
                <td style="font-weight:500;background:rgba(255,255,255,0.03);font-family:var(--mono);font-size:16px;">฿${s.total.toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  }
}


// ══ DASHBOARD ════════════════════════════
function updateDashboard() {
  const ve = getVisibleEmails();
  const ls = getLeaves().filter(r => ve === null || ve.has(r.email));
  const es = getExs().filter(e => isUserInvolved(e, cu.email));
  const wk = wkKey(new Date().toISOString().split('T')[0]);
  document.getElementById('d-pending').textContent = ls.filter(r => r.status.startsWith('pending')).length;
  document.getElementById('d-approved').textContent = ls.filter(r => r.status === 'approved').length;
  document.getElementById('d-exweek').textContent = es.filter(e => wkKey(e.date) === wk && e.status !== 'rejected').length;
  const memberCount = ve ? ve.size : getUsers().length;
  document.getElementById('d-members').textContent = memberCount;
  const ch = { pending_lead: '<span class="chip chip-pending">รอหัวหน้า</span>', pending_pm: '<span class="chip chip-escalated">รอ PM</span>', approved: '<span class="chip chip-approved">อนุมัติ</span>', rejected: '<span class="chip chip-rejected">ปฏิเสธ</span>' };
  document.getElementById('d-leaves').innerHTML = ls.slice(0, 4).map(r => '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);"><div><div style="font-weight:500;color:var(--text);">' + uName(r.email, r.name) + '</div><div style="font-size:16px;color:var(--text3);font-family:var(--mono);">' + LT[r.type] + ' • ' + r.start + '</div></div>' + (ch[r.status] || '') + '</div>').join('') || '<div style="color:var(--text3);font-size:17px;">ยังไม่มีรายการ</div>';
  document.getElementById('d-exs').innerHTML = es.slice(0, 4).map(e => '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="viewExDetail(\'' + e.id + '\')"><div><div style="font-weight:500;color:var(--text);">' + uName(e.email, e.name) + ' — ' + e.activity + '</div><div style="font-size:16px;color:var(--text3);font-family:var(--mono);">' + (e.type === 'solo' ? '🏃' : '🏋️') + ' ' + e.date + ' (W' + getWkNum(e.date) + ') • ' + e.duration + 'min</div></div><div style="display:flex;align-items:center;gap:8px;">' + (e.status === 'approved' ? '<span class="chip chip-approved">✓</span>' : e.status === 'rejected' ? '<span class="chip chip-rejected">✕</span>' : '<span class="chip chip-pending">รอ</span>') + '<button class="btn btn-ghost btn-sm" style="padding:4px 8px;font-size:15px;" onclick="event.stopPropagation();viewExDetail(\'' + e.id + '\')"><i class="fa-solid fa-magnifying-glass"></i> รายละเอียด</button></div></div>').join('') || '<div style="color:var(--text3);font-size:17px;">ยังไม่มีรายการ</div>';
  renderHolidayWidget();
}

async function renderHolidayWidget() {
  const el = document.getElementById('d-holidays');
  if (!el) return;

  if (!IAPP_APIKEY) {
    el.innerHTML = `<div style="text-align:center;padding:16px 0;color:var(--text3);font-size:15px;line-height:1.7;">
      ⚙️ ยังไม่ได้ตั้งค่า <code style="background:var(--surface2);padding:2px 6px;border-radius:6px;color:var(--accent);">IAPP_APIKEY</code> ใน <code style="background:var(--surface2);padding:2px 6px;border-radius:6px;color:var(--accent);">api.js</code><br>
      <span style="font-size:13px;">ลงทะเบียนได้ที่ <a href="https://iapp.co.th/dashboard" target="_blank" style="color:var(--accent);">iapp.co.th/dashboard</a></span>
    </div>`;
    return;
  }

  el.innerHTML = '<div style="color:var(--text3);font-size:15px;padding:10px 0;">🔄 กำลังโหลด...</div>';

  const today = new Date().toISOString().slice(0, 10);
  const all = await fetchThaiHolidays();
  const upcoming = all
    .filter(h => h.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8);

  if (!upcoming.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:15px;">ไม่พบข้อมูลวันหยุด</div>';
    return;
  }

  const todayMs = new Date(today + 'T00:00:00').getTime();
  const typeLabel = { financial: 'ธนาคาร', public: 'ราชการ' };
  const typeColor = { financial: 'rgba(108,138,255,.15);color:var(--accent)', public: 'rgba(100,200,120,.12);color:var(--green)' };

  el.innerHTML = upcoming.map(h => {
    const hDate = new Date(h.date + 'T00:00:00');
    const diff = Math.round((hDate.getTime() - todayMs) / 86400000);
    const dateStr = hDate.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
    const diffChip = diff === 0
      ? `<span style="background:var(--red-bg);color:var(--red);padding:3px 10px;border-radius:20px;font-size:13px;font-weight:700;">วันนี้!</span>`
      : diff <= 7
        ? `<span style="background:var(--green-bg);color:var(--green);padding:3px 10px;border-radius:20px;font-size:13px;font-weight:700;">อีก ${diff} วัน</span>`
        : diff <= 30
          ? `<span style="background:rgba(245,200,66,.12);color:var(--yellow);padding:3px 10px;border-radius:20px;font-size:13px;font-weight:600;">อีก ${diff} วัน</span>`
          : `<span style="color:var(--text3);font-size:13px;font-family:var(--mono);">อีก ${diff} วัน</span>`;
    const tc = typeColor[h.type] || typeColor.public;
    const tl = typeLabel[h.type] || h.type;
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border);">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:500;color:var(--text);font-size:16px;display:flex;align-items:center;gap:7px;">
          ${h.name}
          <span style="background:${tc};padding:1px 7px;border-radius:10px;font-size:12px;white-space:nowrap;flex-shrink:0;">${tl}</span>
        </div>
        <div style="font-size:15px;color:var(--text3);margin-top:2px;">${dateStr}</div>
      </div>
      <div style="flex-shrink:0;margin-left:10px;">${diffChip}</div>
    </div>`;
  }).join('') + `<div style="text-align:right;margin-top:10px;font-size:15px;color:var(--text3);">วันหยุดที่กำลังจะมาถึง ${upcoming.length} วัน • <a href="https://iapp.co.th" target="_blank" style="color:var(--accent);text-decoration:none;">ข้อมูลจาก iApp</a></div>`;
}
function updateBadges() {
  const ve = getVisibleEmails();
  const ls = getLeaves().filter(r => ve === null || ve.has(r.email));
  const rc = ls.filter(r => r.status === 'pending_lead').length, pc = ls.filter(r => r.status === 'pending_pm').length;
  const ec = cu.role === 'pm' ? getExs().filter(e => e.status === 'pending').length : 0;
  const br = document.getElementById('badge-review'), bp = document.getElementById('badge-pm'), be = document.getElementById('badge-ex');
  br.textContent = rc; br.style.display = rc > 0 ? 'inline' : 'none';
  bp.textContent = pc; bp.style.display = pc > 0 ? 'inline' : 'none';
  if (be) { be.textContent = ec; be.style.display = ec > 0 ? 'inline' : 'none'; }
}

// ══ UTILS ════════════════════════════════
function getWkLabel() {
  const n = new Date(), s = new Date(n);
  s.setDate(n.getDate() - n.getDay());
  const e = new Date(s); e.setDate(s.getDate() + 6);
  const wkNum = Math.ceil((n.getDate() + new Date(n.getFullYear(), n.getMonth(), 1).getDay()) / 7);
  return `สัปดาห์ที่ ${wkNum} (${s.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })})`;
}
let _tt;
let _lbSortField = 'name';
let _lbSortDir = 1;
let _lbMonth = monthKey(new Date().toISOString().split('T')[0]);

function setLBMonth(val) {
  _lbMonth = val;
  updateLB();
}

function setLBSort(field) {
  if (_lbSortField === field) {
    _lbSortDir *= -1;
  } else {
    _lbSortField = field;
    _lbSortDir = field === 'name' ? 1 : -1;
  }
  updateLB();
}

function toast(msg) { const el = document.getElementById('toast'); el.innerHTML = msg; el.classList.add('show'); clearTimeout(_tt); _tt = setTimeout(() => el.classList.remove('show'), 3200); }
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function openConfirm(title, body, okCb) {
  document.getElementById('conf-title').textContent = title;
  document.getElementById('conf-body').innerHTML = body;
  document.getElementById('conf-ok').onclick = () => {
    okCb();
    closeModal('modal-confirm');
  };
  openModal('modal-confirm');
}

function toggleSidebar() {
  const sb = document.querySelector('.sidebar');
  const ov = document.getElementById('sidebar-overlay');
  sb.classList.toggle('active');
  ov.classList.toggle('active');
}

function closeSidebar() {
  const sb = document.querySelector('.sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (sb) sb.classList.remove('active');
  if (ov) ov.classList.remove('active');
}
// document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open');}));
// ══ EXERCISE DETAILS & DELETE ═════════════════
// ── Source detection helpers for evidence links ──
function _exdDetectSource(url) {
  if (/(?:youtube\.com|youtu\.be)/i.test(url)) return 'youtube';
  if (/drive\.google\.com|docs\.google\.com/i.test(url)) return 'drive';
  if (/photos\.app\.goo\.gl|photos\.google\.com/i.test(url)) return 'photo';
  if (/facebook\.com|fb\.watch|fb\.com/i.test(url)) return 'facebook';
  if (/tiktok\.com/i.test(url)) return 'tiktok';
  return 'link';
}
function _exdSourceIcon(key) {
  const icons = {
    youtube: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 7s0-3-3-3H4S1 4 1 7v10s0 3 3 3h16s3 0 3-3V7zm-13 9V8l6 4z"/></svg>`,
    drive: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.71 3.5L1.15 15l3.42 6h6.85L4.86 9.5l2.85-6zm5.79 0L20 21h-6.85L6.29 9.5l3.42-6h4.79zm.79 6L23 21h-6.85L9.71 9.5h4.58z"/></svg>`,
    photo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>`,
    facebook: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c5.05-.5 9-4.76 9-9.95z"/></svg>`,
    tiktok: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 5.82s.51.5 0 0a4.28 4.28 0 0 1-1.04-2.82V3h-3.34v13.39a2.53 2.53 0 0 1-2.53 2.45c-1.4 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.49V10.4c-3.55-.47-6.65 2.29-6.65 5.84a5.85 5.85 0 0 0 5.99 5.92c3.27 0 5.92-2.65 5.92-5.92V9.4a7.62 7.62 0 0 0 4.42 1.41V7.5s-1.88.09-3.54-1.68z"/></svg>`,
    link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  };
  return icons[key] || icons.link;
}
function _exdAvatarColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${((h % 360) + 360) % 360},55%,55%)`;
}
function _exdInitials(name) {
  if (!name) return '?';
  return (name.trim().split(' ')[0][0] || '?').toUpperCase();
}

function viewExDetail(id) {
  const es = getExs(), e = es.find(x => String(x.id) === String(id));
  if (!e) return;

  const et = getExType(e);
  const isGroup = isGroupEx(et);
  const EX_LABEL_TH = { solo: 'เดี่ยว', group_ex: 'กลุ่มออกกำลังกาย', group_eat: 'กลุ่มกินข้าว' };
  const reward = EX_REWARD[et] || 0;
  const wkNum = getWkNum(e.date);

  const sysMems = (e.members || []).filter(m => m.type === 'sys');
  const allMembers = [
    { kind: 'submitter', email: e.email, name: e.name },
    ...sysMems.map(m => ({ kind: 'member', email: m.email, name: m.name, dept: m.dept }))
  ];

  const statusClass = e.status === 'approved' ? 'approved' : e.status === 'rejected' ? 'rejected' : 'pending';
  const statusLabel = e.status === 'approved' ? 'อนุมัติแล้ว' : e.status === 'rejected' ? 'ไม่อนุมัติ' : 'รออนุมัติ';

  const users = getUsers();
  const submitter = users.find(x => x.email === e.email) || {};
  const submitterName = submitter.name || e.name || '';
  const submitterNick = submitter.nickname || e.nickname || submitterName.split(' ')[0];
  const submitterDept = submitter.dept || e.dept || '';

  const dateStr = new Date(e.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  const submittedStr = e.submittedAt ? new Date(e.submittedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  const primaryLink = e.proofLink || (e.proofDoc?.startsWith('http') ? e.proofDoc : '') || '';
  const extraLinks = e.proofLinks || [];
  const allLinks = [];
  if (primaryLink) allLinks.push({ url: primaryLink, addedBy: e.name, addedByEmail: e.email, isPrimary: true, extraIdx: null });
  extraLinks.forEach((p, i) => allLinks.push({ url: p.url, addedBy: p.addedByName || p.addedBy, addedByEmail: p.addedBy, isPrimary: false, extraIdx: i }));

  const canEdit = (e.email === cu.email && e.status === 'pending') || (cu.role === 'pm' && e.status === 'approved');
  // แนบลิงก์เพิ่มได้เฉพาะสมาชิกปัจจุบันของคำขอนี้เท่านั้น (isUserInvolved ตรวจ members[] ที่ยังอยู่)
  const canUpdateProof = isUserInvolved(e, cu.email) && e.status !== 'rejected';
  const canApprove = cu.role === 'pm' && e.status === 'pending';
  const canDelete = (e.email === cu.email && e.status === 'pending') || cu.role === 'pm';

  const c1 = _exdAvatarColor(e.email), c2 = _exdAvatarColor(e.email + 'x');

  const memberChips = allMembers.map(m => {
    const mu = users.find(x => x.email === m.email) || {};
    const nick = mu.nickname || (m.name || '').split(' ')[0] || m.email;
    const dept = mu.dept || m.dept || '';
    const isLead = m.kind === 'submitter';
    const iconSvg = isLead
      ? `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 16 3 6l5 4 4-6 4 6 5-4-2 10H5Z"></path></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
    return `<span class="exd-member${isLead ? ' lead' : ''}">
      <span class="exd-mem-icon ${isLead ? 'lead' : 'member'}">${iconSvg}</span>
      <span class="exd-mem-name">${nick}</span>
      ${dept ? `<span class="exd-dept">${dept}</span>` : ''}
    </span>`;
  }).join('');

  const evidenceHtml = allLinks.length === 0
    ? `<div class="exd-empty">
        <div class="exd-empty-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></div>
        <div class="exd-empty-t">ยังไม่มีหลักฐาน</div>
      </div>`
    : allLinks.map((link, idx) => {
      const srcKey = _exdDetectSource(link.url);
      let dom = '';
      try { dom = new URL(link.url.startsWith('http') ? link.url : 'https://' + link.url).hostname.replace(/^www\./, ''); } catch { }
      // เจ้าของ = คนที่แนบลิงก์นั้น เท่านั้นที่ลบได้ (PM ลบรวมทั้งใบเบิกผ่าน deleteEx แทน)
      // แก้ไข URL: เจ้าของ หรือ PM
      const isOwner = cu.email === link.addedByEmail;
      const canEditLink = isOwner || cu.role === 'pm';
      const canDeleteLink = isOwner; // เฉพาะเจ้าของเท่านั้น
      return `<div class="exd-ev-item" id="exd-ev-${idx}">
          <div class="exd-ev-thumb ${srcKey}">${_exdSourceIcon(srcKey)}</div>
          <div class="exd-ev-info">
            <div class="exd-ev-title">หลักฐาน #${idx + 1}</div>
            <div class="exd-ev-meta">
              <span class="exd-ev-url">${dom || link.url.slice(0, 30)}</span>
              ${link.addedBy ? `<span class="exd-ev-owner">· โดย ${link.addedBy}</span>` : ''}
            </div>
            <div class="exd-ev-edit-row" id="exd-ev-edit-${idx}" style="display:none;margin-top:6px">
              <input class="exd-add-input" id="exd-ev-input-${idx}" value="${link.url}" style="font-size:12px;flex:1;min-width:0" />
              <button class="exd-ev-btn exd-ev-confirm" onclick="saveEditedProofLink('${e.id}',${link.isPrimary},${link.extraIdx ?? 'null'},${idx})" title="บันทึก">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"></path></svg>
              </button>
              <button class="exd-ev-btn" onclick="_exdCancelEdit(${idx})" title="ยกเลิก">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"></path></svg>
              </button>
            </div>
          </div>
          <div class="exd-ev-actions">
            <a href="${link.url}" target="_blank" class="exd-ev-btn" title="เปิดลิงก์">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>
            </a>
            ${canEditLink ? `
            <button class="exd-ev-btn" onclick="_exdOpenEdit(${idx})" title="แก้ไขลิงก์">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>` : ''}
            ${canDeleteLink ? `
            <button class="exd-ev-btn danger" onclick="deleteProofLink('${e.id}',${link.isPrimary},${link.extraIdx ?? 'null'})" title="ลบลิงก์">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>
            </button>` : ''}
          </div>
        </div>`;
    }).join('');

  const modal = document.querySelector('#modal-ex-detail .modal');
  modal.innerHTML = `
    <div class="exd-top">
      <div class="exd-top-l">
        <span class="exd-label">คำขอเบิกรางวัล</span>
        <span class="exd-id"><span class="k">ID</span> ${e.id}</span>
      </div>
      <div class="exd-top-r">
        <span class="exd-status ${statusClass}"><span class="dot"></span><span>${statusLabel}</span></span>
        <button class="exd-x" onclick="closeModal('modal-ex-detail')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"></path></svg>
        </button>
      </div>
    </div>

    <div class="exd-body">
      <div class="exd-title-row">
        <div>
          <h2 class="exd-title">${e.activity}<span class="exd-week">WEEK ${wkNum}</span></h2>
          <div class="exd-meta-row">
            <span class="exd-meta">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="2"></rect><path d="M3 10h18M8 2v4M16 2v4"></path></svg>
              ${dateStr}
            </span>
            <span class="exd-dot"></span>
            <span class="exd-meta">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3"></circle><path d="M3 20c0-3 2.5-5 6-5s6 2 6 5"></path></svg>
              ${EX_LABEL_TH[et] || et}
            </span>
            ${submittedStr ? `<span class="exd-dot"></span><span class="exd-meta">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>
              ยื่นเมื่อ ${submittedStr}</span>` : ''}
          </div>
        </div>
        <div class="exd-reward">
          <div class="exd-reward-a"><span class="exd-reward-b">฿</span>${reward.toLocaleString()}</div>
          <div class="exd-reward-sub">${isGroup ? 'รางวัลกลุ่ม' : 'รางวัลเดี่ยว'}</div>
        </div>
      </div>

      <div class="exd-sect">
        <div class="exd-sect-h"><div class="exd-sect-title">ผู้ยื่นคำขอ</div></div>
        <div class="exd-submitter">
          <div class="exd-avatar lead" style="background:linear-gradient(135deg,${c1},${c2})">
            ${_exdInitials(submitterName)}
            <svg class="exd-crown" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16 3 6l5 4 4-6 4 6 5-4-2 10H5Z"></path></svg>
          </div>
          <div class="exd-submitter-info">
            <div class="exd-submitter-name">
              ${submitterNick || submitterName}
              ${submitterDept ? `<span class="exd-dept-pill">${submitterDept}</span>` : ''}
              <span class="exd-role-pill">ผู้นำกลุ่ม</span>
            </div>
            <div class="exd-submitter-email">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m3 7 9 6 9-6"></path></svg>
              ${e.email}
            </div>
          </div>
        </div>
      </div>

      ${isGroup ? `<div class="exd-sect">
        <div class="exd-sect-h"><div class="exd-sect-title">สมาชิกร่วมกิจกรรม<span class="exd-ct">${allMembers.length} คน</span></div></div>
        <div class="exd-members">${memberChips}</div>
      </div>` : ''}

      <div class="exd-sect">
        <div class="exd-sect-h"><div class="exd-sect-title">หลักฐาน<span class="exd-ct">${allLinks.length}</span></div></div>
        <div class="exd-evidence">${evidenceHtml}</div>
        ${canUpdateProof ? `<div class="exd-add-area">
          <div class="exd-add-row">
            <div class="exd-add-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;color:#6c7390;flex-shrink:0"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              <input class="exd-add-input" id="exd-proof-input" placeholder="วางลิงก์หลักฐาน..." />
            </div>
            <button class="exd-btn-add" onclick="saveProofLinkFromDetail('${e.id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"></path></svg>แนบ
            </button>
          </div>
        </div>` : ''}
      </div>

      ${e.note ? `<div class="exd-note">📝 ${e.note}</div>` : ''}

      ${e.status === 'rejected' && e.rejectReason ? `
      <div style="display:flex;align-items:flex-start;gap:10px;background:var(--red-bg);border:1px solid rgba(255,107,107,0.25);border-radius:12px;padding:12px 16px;margin-top:4px;">
        <i class="fa-solid fa-circle-xmark" style="color:var(--red);font-size:16px;margin-top:2px;flex-shrink:0;"></i>
        <div>
          <div style="font-size:13px;color:var(--red);opacity:0.75;font-weight:600;margin-bottom:4px;">เหตุผลที่ไม่อนุมัติ${e.rejectedBy ? ` — โดย ${e.rejectedBy}` : ''}</div>
          <div style="font-size:15px;color:var(--red);font-weight:500;">${e.rejectReason}</div>
        </div>
      </div>` : ''}
    </div>

    <div class="exd-foot">
      <div class="exd-foot-l">
        ${canDelete ? `<button class="exd-btn exd-btn-danger" onclick="deleteEx('${e.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>ลบคำขอ
        </button>` : ''}
        ${canEdit ? `<button class="exd-btn exd-btn-edit" onclick="editEx('${e.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>แก้ไข
        </button>` : ''}
      </div>
      <div class="exd-foot-r">
        ${canApprove ? `
          <button class="exd-btn exd-btn-reject" onclick="closeModal('modal-ex-detail');rejEx('${e.id}')">ไม่อนุมัติ</button>
          <button class="exd-btn exd-btn-ok" onclick="appEx('${e.id}');closeModal('modal-ex-detail')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"></path></svg>อนุมัติ
          </button>` : `<button class="exd-btn exd-btn-ghost" onclick="closeModal('modal-ex-detail')">ปิด</button>`}
      </div>
    </div>`;

  openModal('modal-ex-detail');
}

function saveProofLinkFromDetail(id) {
  const link = document.getElementById('exd-proof-input')?.value.trim();
  if (!link) { toast('⚠️ กรุณาใส่ลิงก์หลักฐาน'); return; }
  const es = getExs(), i = es.findIndex(e => String(e.id) === String(id));
  if (i < 0) return;
  // ตรวจสิทธิ์: ต้องเป็นสมาชิกปัจจุบัน (ถอนตัวแล้วไม่สามารถเพิ่มได้)
  if (!isUserInvolved(es[i], cu.email)) { toast('⛔ เฉพาะสมาชิกของคำขอนี้เท่านั้นที่แนบหลักฐานได้'); return; }
  if (es[i].status === 'rejected') { toast('⛔ คำขอที่ไม่อนุมัติแล้วไม่สามารถแนบหลักฐานเพิ่มได้'); return; }
  if (!es[i].proofLink) {
    es[i].proofLink = link;
    es[i].proofDoc = link;
  } else {
    es[i].proofLinks = [...(es[i].proofLinks || []), { url: link, addedBy: cu.email, addedByName: cu.name, addedAt: new Date().toISOString() }];
  }
  saveExs(es);
  apiSync('updateEx', es[i]);
  toast('✅ เพิ่มหลักฐานเรียบร้อย');
  viewExDetail(id);
}

function _exdOpenEdit(idx) {
  const row = document.getElementById('exd-ev-edit-' + idx);
  if (row) row.style.display = 'flex';
}

function _exdCancelEdit(idx) {
  const row = document.getElementById('exd-ev-edit-' + idx);
  if (row) row.style.display = 'none';
}

function saveEditedProofLink(exId, isPrimary, extraIdx, idx) {
  const input = document.getElementById('exd-ev-input-' + idx);
  if (!input) return;
  const newUrl = input.value.trim();
  if (!newUrl) { toast('⚠️ กรุณาใส่ลิงก์'); return; }

  const es = getExs(), i = es.findIndex(e => String(e.id) === String(exId));
  if (i < 0) return;
  // ตรวจสิทธิ์: เจ้าของลิงก์ หรือ PM เท่านั้น (enforce ใน server-side ผ่าน canEditLink ที่ render แล้ว)
  const targetLink = isPrimary ? { addedByEmail: es[i].email } : (es[i].proofLinks || [])[extraIdx];
  if (!targetLink) { toast('⚠️ ไม่พบลิงก์นี้'); return; }
  if (cu.email !== targetLink.addedByEmail && cu.role !== 'pm') { toast('⛔ คุณไม่มีสิทธิ์แก้ไขลิงก์นี้'); return; }

  if (isPrimary) {
    es[i].proofLink = newUrl;
    es[i].proofDoc = newUrl;
  } else {
    if (!es[i].proofLinks || extraIdx === null || es[i].proofLinks[extraIdx] === undefined) return;
    es[i].proofLinks[extraIdx].url = newUrl;
  }

  saveExs(es);
  apiSync('updateEx', es[i]);
  toast('✅ แก้ไขลิงก์เรียบร้อย');
  viewExDetail(exId);
}

function deleteProofLink(exId, isPrimary, extraIdx) {
  if (!confirm('ยืนยันการลบลิงก์หลักฐานนี้?')) return;

  const es = getExs(), i = es.findIndex(e => String(e.id) === String(exId));
  if (i < 0) return;
  // ตรวจสิทธิ์: เฉพาะเจ้าของลิงก์เท่านั้น (PM ลบรวมทั้งใบเบิกผ่าน deleteEx)
  const ownerEmail = isPrimary ? es[i].email : (es[i].proofLinks || [])[extraIdx]?.addedBy;
  if (cu.email !== ownerEmail) { toast('⛔ เฉพาะเจ้าของลิงก์เท่านั้นที่ลบได้'); return; }

  if (isPrimary) {
    // Promote first extra link to primary, or clear entirely
    const extras = es[i].proofLinks || [];
    if (extras.length > 0) {
      const promoted = extras.shift();
      es[i].proofLink = promoted.url;
      es[i].proofDoc = promoted.url;
      es[i].proofLinks = extras;
    } else {
      es[i].proofLink = '';
      es[i].proofDoc = '';
    }
  } else {
    if (!es[i].proofLinks || extraIdx === null || es[i].proofLinks[extraIdx] === undefined) return;
    es[i].proofLinks.splice(extraIdx, 1);
  }

  saveExs(es);
  apiSync('updateEx', es[i]);
  toast('🗑️ ลบลิงก์เรียบร้อย');
  viewExDetail(exId);
}

function deleteEx(id) {
  const es = getExs();
  const target = es.find(e => String(e.id) === String(id));
  if (!target) return;
  if (cu.role !== 'pm' && target.email !== cu.email) { toast('⛔ คุณไม่มีสิทธิ์ลบใบเบิกนี้'); return; }
  if (cu.role !== 'pm' && target.status === 'approved') { toast('⛔ ใบเบิกที่อนุมัติแล้วไม่สามารถลบได้ — กรุณาติดต่อ PM'); return; }
  if (!confirm('ยืนยันการลบคำขอนี้? (การลบจะทำให้โควต้าและสถิติเปลี่ยนกลับทันที)')) return;
  const newEs = es.filter(e => String(e.id) !== String(id));
  saveExs(newEs);
  apiSync('deleteEx', { id, _fbKey: target?._fbKey });
  closeModal('modal-ex-detail');
  toast('🗑️ ลบคำขอเรียบร้อย');
  updateDashboard();
  updateLB();
  updateQuota();
  updateBadges();
  renderExHistory();
  const pageShare = document.getElementById('page-exercise-share');
  if (pageShare && pageShare.classList.contains('active')) renderExShare();
  const pageReview = document.getElementById('page-exercise-review');
  if (pageReview && pageReview.classList.contains('active')) renderExR();
}

function editEx(id) {
  const es = getExs(), e = es.find(x => x.id === id);
  const submitterPending = e.email === cu.email && e.status === 'pending';
  const pmApproved = cu.role === 'pm' && e.status === 'approved';
  if (!e || (!submitterPending && !pmApproved)) return;

  _editingExId = id;

  // Pre-fill form fields — keep original submitter name when PM edits
  document.getElementById('ex-name').value = e.name || cu.name;
  document.getElementById('ex-type').value = e.exType || 'solo';
  document.getElementById('ex-act').value = e.activity || '';
  setVal('ex-date', e.date || '');
  document.getElementById('ex-note').value = e.note || '';
  document.getElementById('ex-link').value = e.proofLink || e.proofDoc || '';

  // Pre-populate member list (re-hydrate displayName from user directory)
  const users = getUsers();
  exMembers = (e.members || []).map(m => {
    if (m.type === 'sys') {
      const u = users.find(x => x.email === m.email);
      const nick = u ? (u.nickname || u.name.split(' ')[0]) : m.name;
      const dept = u?.dept ? ` (${u.dept})` : '';
      return { ...m, displayName: `${nick}${dept}` };
    }
    return { ...m, displayName: `${m.name} (${m.dept})` };
  });

  updateExType();
  renderExMembers();
  updateExSysMemberSelect();

  // Switch form to edit mode
  document.querySelector('#modal-ex-form .modal-title').innerHTML = '<i class="fa-solid fa-pen" style="margin-right:8px;color:var(--accent);"></i>แก้ไขใบเบิก';
  const btn = document.getElementById('btn-submit-ex');
  if (btn) btn.innerHTML = '<i class="fa-solid fa-floppy-disk" style="margin-right:6px;"></i> บันทึกการแก้ไข';

  closeModal('modal-ex-detail');
  openModal('modal-ex-form');
}

function saveProofLink(id) {
  const link = document.getElementById('proof-link-input-' + id)?.value.trim();
  if (!link) { toast('⚠️ กรุณาใส่ลิงก์หลักฐาน'); return; }
  const es = getExs(), i = es.findIndex(e => e.id === id);
  if (i < 0) return;
  if (!es[i].proofLink) {
    es[i].proofLink = link;
    es[i].proofDoc = link;
  } else {
    es[i].proofLinks = [...(es[i].proofLinks || []), { url: link, addedBy: cu.email, addedByName: cu.name, addedAt: new Date().toISOString() }];
  }
  saveExs(es);
  apiSync('updateEx', es[i]);
  toast('✅ เพิ่มหลักฐานเรียบร้อย');
  viewExDetail(id);
}

function getExWkLabel(dateStr) {
  // dateStr is the period-aligned week start date returned by wkKey()
  let s;
  if (typeof dateStr === 'string' && dateStr.length === 10) {
    const [y, m, d1] = dateStr.split('-').map(Number);
    s = new Date(y, m - 1, d1);
  } else {
    s = new Date(dateStr);
  }
  const mk = monthKey(s);
  const [py, pm] = mk.split('-').map(Number);
  const periodEnd = new Date(py, pm, 18);
  const e = new Date(s); e.setDate(s.getDate() + 6);
  if (e > periodEnd) e.setTime(periodEnd.getTime());
  const opt = { day: 'numeric', month: 'short' };
  return `สัปดาห์ ${s.toLocaleDateString('th-TH', opt)} – ${e.toLocaleDateString('th-TH', opt)}`;
}

function renderExHistory() {
  const elList = document.getElementById('ex-history-list');
  if (!elList) return;

  const all = getExs().filter(e => isUserInvolved(e, cu.email));

  // Read month from unified dropdown — fall back to current month if not available
  const unifiedSel = document.getElementById('ex-log-month-select');
  const curMonth = monthKey(new Date().toISOString().split('T')[0]);
  const selMonth = (unifiedSel && unifiedSel.value) ? unifiedSel.value : curMonth;
  const filtered = all.filter(e => monthKey(e.date) === selMonth).sort((a, b) => b.date.localeCompare(a.date));

  // Generate weekOpts for this specific month to determine week numbers
  const [y, m] = selMonth.split('-').map(Number);
  const dStart = new Date(y, m - 1, 19), dEnd = new Date(y, m, 18);
  const weekOpts = [];
  let curr = new Date(dStart);
  while (curr <= dEnd) {
    const wKey = wkKey(curr);
    if (!weekOpts.includes(wKey)) weekOpts.push(wKey);
    curr.setDate(curr.getDate() + 1);
  }

  // แยก rejected ออกจาก active
  const activeFiltered = filtered.filter(e => e.status !== 'rejected');
  const rejectedFiltered = filtered.filter(e => e.status === 'rejected');

  if (!filtered.length) {
    elList.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);font-size:15px;background:var(--surface2);border-radius:12px;border:1px dashed var(--border2);">ยังไม่มีกิจกรรมในเดือนนี้</div>';
    return;
  }

  // ── History Card Helper ─────────────────────────────────────────────────
  const renderHistCard = (e) => {
    const et = getExType(e);
    const reward = EX_REWARD[et] || 100;
    const isRej = e.status === 'rejected';

    const d = new Date(e.date);
    const day = d.getDate();
    const month = d.toLocaleDateString('th-TH', { month: 'short' });
    const fullDate = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });

    const allMembers = [
      { email: e.email, name: e.name, kind: 'submitter' },
      ...(e.members || []).map(m => ({ email: m.email, name: m.name, kind: m.type, dept: m.dept }))
    ];

    const chips = allMembers.map(m => {
      const isSub = m.kind === 'submitter';
      const isCurrent = m.email === cu.email;
      const icon = isSub ? 'fa-crown' : 'fa-user';
      const iconColor = isSub ? '#e6b981' : 'var(--accent)';
      return `
        <div style="display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.04);padding:4px 12px;border-radius:20px;font-size:13px;color:${isCurrent ? 'var(--text)' : 'var(--text2)'};">
          <i class="fa-solid ${icon}" style="color:${iconColor};font-size:11px;"></i>
          <span style="font-weight:500;">${uNick(m.email, m.name)}</span>
        </div>`;
    }).join('');

    const statusCfg = e.status === 'approved'
      ? { label: 'อนุมัติแล้ว', color: 'var(--green)', icon: 'fa-regular fa-circle-check' }
      : e.status === 'rejected'
        ? { label: 'ไม่อนุมัติ', color: 'var(--red)', icon: 'fa-regular fa-circle-xmark' }
        : { label: 'รออนุมัติ', color: 'var(--yellow)', icon: 'fa-regular fa-clock' };

    const typeLabel = et === 'solo' ? 'เดี่ยว' : 'กลุ่ม';
    const typeColor = et === 'solo' ? 'var(--accent)' : 'var(--orange)';
    const typeBg = et === 'solo' ? 'rgba(108, 138, 255, 0.15)' : 'rgba(255, 153, 51, 0.15)';
    const typeIcon = et === 'solo' ? 'fa-user' : 'fa-users';
    const cardBg = isRej
      ? 'rgba(255,107,107,0.06)'
      : et === 'solo' ? 'rgba(155,143,255,0.07)' : 'rgba(255,153,51,0.10)';

    return `
      <div style="background:${cardBg}; border-radius:16px; border:1px solid ${isRej ? 'rgba(255,107,107,0.12)' : 'rgba(255,255,255,0.02)'}; padding:16px; display:flex; flex-direction:column; justify-content:space-between; transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 24px rgba(0,0,0,0.2)'" onmouseout="this.style.transform='none'; this.style.boxShadow='none'">
        <div style="display:flex; gap:20px; align-items:flex-start;">
          <div style="display:flex; flex-direction:column; width: 56px; border-radius: 12px; overflow: hidden; text-align: center; flex-shrink: 0;">
            <div style="background: rgba(61, 69, 76, 0.59); color: var(--text); font-size: 13px; font-weight: 600; padding: 2px 0 4px; text-transform: uppercase;">${month}</div>
            <div style="background: rgba(26, 22, 22, 0.55); font-size: 22px; font-weight: 700; padding: 4px 0 6px; color: var(--text); font-family: var(--mono);">${day}</div>
          </div>
          <div style="flex:1; min-width:0;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
              <div style="font-size: 18px; font-weight: 700; color: var(--text);">${e.activity || 'กิจกรรม'}</div>
              <div style="display:flex; align-items:center; gap: 6px; background: ${typeBg}; color: ${typeColor}; padding: 4px 10px; border-radius: 8px; font-size: 13px; font-weight: 600;">
                <i class="fa-solid ${typeIcon}" style="font-size: 11px;"></i> ${typeLabel}
              </div>
              <div style="display:flex; align-items:center; gap: 6px; color: ${statusCfg.color}; font-size: 14px; font-weight: 600;">
                <i class="${statusCfg.icon}"></i> ${statusCfg.label}
              </div>
            </div>
            <div style="font-size:15px; color:var(--text2); font-family:var(--mono); display:flex; gap:16px;">
              <span>${e.id}</span>
              <span>${fullDate}</span>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:24px; font-weight:700; color:${isRej ? 'var(--text3)' : 'var(--green)'}; font-family:var(--mono); line-height:1;${isRej ? 'text-decoration:line-through;opacity:0.5;' : ''}"><span style="font-size:16px; color:var(--text3); margin-right:4px;">฿</span>${reward.toLocaleString()}</div>
          </div>
        </div>
        ${isRej ? `
        <div style="display:flex;align-items:flex-start;gap:8px;background:var(--red-bg);border:1px solid rgba(255,107,107,0.2);border-radius:8px;padding:8px 12px;margin-top:10px;">
          <i class="fa-solid fa-circle-xmark" style="color:var(--red);font-size:13px;margin-top:3px;flex-shrink:0;"></i>
          <div>
            <div style="font-size:12px;color:var(--red);opacity:0.7;font-weight:600;margin-bottom:2px;">เหตุผลที่ไม่อนุมัติ${e.rejectedBy ? ` — โดย ${e.rejectedBy}` : ''}</div>
            <div style="font-size:14px;color:${e.rejectReason ? 'var(--red)' : 'var(--text3)'};font-weight:500;">${e.rejectReason || 'ไม่ได้ระบุเหตุผล'}</div>
          </div>
        </div>` : ''}
        <div style="margin-top: 12px; display:flex; justify-content:space-between; align-items:flex-end;">
          <div style="display:flex; flex-wrap:wrap; gap:3px;">${chips}</div>
          <div style="font-size:14px; color:var(--text3); cursor:pointer; font-weight:500; display:flex; align-items:center; gap:6px; padding: 4px 8px; transition: color 0.2s;" onmouseover="this.style.color='var(--text)'" onmouseout="this.style.color='var(--text3)'" onclick="viewExDetail('${e.id}')">
            รายละเอียด <i class="fa-solid fa-chevron-right" style="font-size:11px; opacity:0.7;"></i>
          </div>
        </div>
      </div>`;
  };

  // ── Weekly Groups (active only) ─────────────────────────────────────────
  const groups = {};
  activeFiltered.forEach(e => {
    const wk = wkKey(e.date);
    if (!groups[wk]) groups[wk] = [];
    groups[wk].push(e);
  });

  const fmtShort = d => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  const _soloWkLimit = (cu.locationType || 'bkk') === 'bkk' ? 2 : 3;

  const weeklyHtml = Object.keys(groups).sort().reverse().map(wk => {
    const items = groups[wk];
    const wkNum = weekOpts.indexOf(wk) + 1;
    let [wy, wm, wd] = wk.split('-').map(Number);
    let ws = new Date(wy, wm - 1, wd);
    let we = new Date(ws); we.setDate(ws.getDate() + 6);
    if (we > dEnd) we.setTime(dEnd.getTime());

    const wkSolo = items.filter(e => getExType(e) === 'solo').length;
    const wkGrp  = items.filter(e => isGroupEx(getExType(e))).length;
    const soloStatus = wkSolo >= _soloWkLimit ? '<span style="color:var(--green);">ครบ ✓</span>' : `<span style="color:var(--text);font-weight:600;">${wkSolo}/${_soloWkLimit}</span>`;
    const grpStatus  = wkGrp  >= 1            ? '<span style="color:var(--green);">ครบ ✓</span>' : `<span style="color:var(--text);font-weight:600;">${wkGrp}/1</span>`;

    return `
      <div style="background:var(--surface3); border-radius:16px; border:1px solid var(--border2); padding: 24px; margin-bottom: 16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:16px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="background: rgba(126, 102, 15, 0.52); color: var(--text); font-family: var(--mono); font-weight: 700; padding: 2px 6px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">W${wkNum}</div>
            <div>
              <div style="font-size:16px; font-weight:700; color:var(--text);">สัปดาห์ที่ ${wkNum}</div>
              <div style="font-size:13px; color:var(--text3);">${fmtShort(ws)} – ${fmtShort(we)}</div>
            </div>
          </div>
          <div style="display:flex; gap:12px; font-size:13px; background:rgba(255,255,255,0.03); padding:6px 16px; border-radius:24px; border:1px solid var(--border2);">
            <div style="display:flex; gap:6px; align-items:center;"><span style="color:var(--text2);">เดี่ยว</span>${soloStatus}</div>
            <div style="width:1px; height:14px; background:var(--border2); align-self:center;"></div>
            <div style="display:flex; gap:6px; align-items:center;"><span style="color:var(--text2);">กลุ่ม</span>${grpStatus}</div>
          </div>
        </div>
        <div class="review-grid" style="align-items:start;">${items.map(renderHistCard).join('')}</div>
      </div>`;
  }).join('');

  // ── Rejected Section ───────────────────────────────────────────────────
  const rejectedHtml = rejectedFiltered.length ? `
    <div style="margin-top:8px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
        <div style="width:4px;height:22px;background:var(--red);border-radius:4px;"></div>
        <div style="font-size:16px;font-weight:700;color:var(--red);">ไม่อนุมัติ</div>
        <div style="background:var(--red-bg);color:var(--red);font-size:13px;font-weight:700;padding:2px 10px;border-radius:20px;">${rejectedFiltered.length} รายการ</div>
      </div>
      <div style="background:rgba(255,107,107,0.03);border:1px solid rgba(255,107,107,0.12);border-radius:16px;padding:16px;">
        <div class="review-grid" style="align-items:start;">${rejectedFiltered.map(renderHistCard).join('')}</div>
      </div>
    </div>` : '';

  elList.innerHTML = (activeFiltered.length
    ? weeklyHtml
    : '<div style="text-align:center;padding:40px;color:var(--text3);font-size:15px;background:var(--surface2);border-radius:12px;border:1px dashed var(--border2);">ยังไม่มีกิจกรรมที่อนุมัติในเดือนนี้</div>'
  ) + rejectedHtml;
}

window.onload = tryRestore;

function openExModal() {
  _editingExId = null;
  resetExFormUI();
  openModal('modal-ex-form');
  setupExForm();
  document.getElementById('ex-name').value = cu.name;
  const today = new Date().toISOString().split('T')[0];
  setVal('ex-date', today);
  updateQuota();
}
