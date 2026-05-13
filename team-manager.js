
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
        _applyLocalLeaveChanges(); // re-apply local changes overwritten by bootstrap
        initIDs(); // Update lid from fresh data
        // refresh visible page หลัง sync เสร็จ
        const active = document.querySelector('.page.active');
        if (active) {
          const id = active.id.replace('page-', '');
          if (typeof showPage === 'function') showPage(id);
        }
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
  document.getElementById('nav-leave-review').style.display = r === 'lead' ? 'flex' : 'none';
  document.getElementById('nav-leave-pm').style.display = r === 'pm' ? 'flex' : 'none';
  document.getElementById('nav-ex-review').style.display = r === 'pm' ? 'flex' : 'none';
  document.getElementById('nav-balance').style.display = (r === 'lead' || r === 'pm') ? 'flex' : 'none';
  document.getElementById('nav-team-hist').style.display = (r === 'pm' || r === 'lead') ? 'flex' : 'none';
  document.getElementById('nav-my-balance').style.display = 'flex';
  document.getElementById('nav-leaderboard').style.display = (r === 'lead' || r === 'pm') ? 'flex' : 'none';
}

// ══ NAVIGATION ═══════════════════════════
function showPage(id) {
  closeSidebar();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pg = document.getElementById('page-' + id); if (pg) pg.classList.add('active');
  const nv = document.querySelector('[onclick="showPage(\'' + id + '\')"]'); if (nv) nv.classList.add('active');
  ({ dashboard: updateDashboard, members: renderMembers, 'leave-review': renderLR, 'leave-pm': renderLP, 'leave-history': () => { renderMyBal(); renderHist('pending'); }, 'leave-balance': renderBal, 'my-balance': renderMyBal, 'exercise-review': renderExR, 'exercise-share': renderExShare, leaderboard: updateLB, 'exercise-log': updateQuota, 'team-hist': renderTeamHist })[id]?.();
}

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

function fpAddTodayBtn(fp) {
  const monthsEl = fp.calendarContainer.querySelector('.flatpickr-months');
  const nextBtn = fp.calendarContainer.querySelector('.flatpickr-next-month');
  if (!monthsEl || !nextBtn || monthsEl.querySelector('.fp-today-btn')) return;
  const btn = document.createElement('span');
  btn.className = 'fp-today-btn';
  btn.textContent = 'Today';
  btn.addEventListener('click', (e) => { e.stopPropagation(); fp.setDate(new Date(), true); });
  monthsEl.insertBefore(btn, nextBtn);
}

function initDatePickers() {
  const common = {
    locale: 'th',
    dateFormat: 'Y-m-d',
    disableMobile: "true",
    static: true,
    nextArrow: '<i class="fa-solid fa-chevron-right"></i>',
    prevArrow: '<i class="fa-solid fa-chevron-left"></i>',
    monthSelectorType: 'dropdown',
    onReady: function(s, d, fp) { fpAddTodayBtn(fp); }
  };

  flatpickr('#leave-start', common);
  flatpickr('#leave-end', common);
  flatpickr('#new-birth', common);
  flatpickr('#edit-birth', common);
  flatpickr('#ex-date', {
    ...common,
    onChange: function(selectedDates, dateStr, instance) {
      updateQuota();
      clearExErr();
    }
  });
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = val;
  if (el._flatpickr) el._flatpickr.setDate(val, false);
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
  const newUser = { email, name, nickname, discordId, birthday: birth, role, dept, pass: hp(pass), addedBy: cu.name, addedAt: new Date().toISOString(), locationType: document.getElementById('new-loc').value || 'bkk' };
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
  const users = getUsers(), idx = users.findIndex(u => u.email === ek); if (idx < 0) { console.warn('[saveMember] not found ek=', ek, 'users=', users.map(u=>u.email)); toast('⚠️ ไม่พบข้อมูลผู้ใช้ กรุณาลองใหม่'); return; }
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
  let count = 0;
  const d = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function calcEndDateByDays(startStr, numDays) {
  if (!startStr || !numDays || numDays < 1) return '';
  const d = new Date(startStr + 'T00:00:00');
  let count = 0;
  while (count < numDays) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
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
    endEl.value = start || '';
    endEl.disabled = true;
  } else {
    periodEl.value = 'full';
    endEl.disabled = false;
    const numDays = parseInt(val);
    const endGroup = document.getElementById('leave-end-group');
    if (numDays === 1) {
      if (start) endEl.value = start;
      if (endGroup) endGroup.style.display = 'none';
    } else {
      if (endGroup) endGroup.style.display = 'block';
      if (start && numDays >= 2) endEl.value = calcEndDateByDays(start, numDays);
    }
  }
  onLeaveChange();
}

function onLeaveChange() {
  const type = document.getElementById('leave-type').value;
  const start = document.getElementById('leave-start').value;
  const end = document.getElementById('leave-end').value;
  const period = document.getElementById('leave-period').value;
  const hints = document.getElementById('leave-hints');
  const docG = document.getElementById('doc-group');
  // recalc end date when start changes, based on leave-days dropdown
  const leaveVal = document.getElementById('leave-days')?.value;
  if (leaveVal && leaveVal !== 'morning' && leaveVal !== 'afternoon' && start) {
    const numDays = parseInt(leaveVal);
    if (numDays >= 1) document.getElementById('leave-end').value = calcEndDateByDays(start, numDays);
  }
  const endCurrent = document.getElementById('leave-end').value;
  if (!start || !endCurrent || start > endCurrent) { hints.innerHTML = ''; docG.style.display = 'none'; return; }
  document.getElementById('leave-period-group').style.display = 'none';
  const isHalf = document.getElementById('leave-period').value !== 'full';
  const endEl = document.getElementById('leave-end');
  if (isHalf) { endEl.value = start; endEl.disabled = true; } else { endEl.disabled = false; }
  const rawDays = countWorkingDays(start, isHalf ? start : endCurrent);
  const diff = isHalf ? 0.5 : rawDays;
  const needDoc = (type === 'sick' && diff >= 2) || type === 'dental';
  const willEsc = ESC.includes(type) && diff > 3;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const da = Math.ceil((new Date(start) - today) / 864e5);
  const forMember = (document.getElementById('for-member-select')?.value || '') !== '';
  const isMgr = cu.role === 'pm' || cu.role === 'lead';
  const needAdv = type !== 'sick' && !forMember && !isMgr;
  const advOk = !needAdv || da >= 7;
  docG.style.display = needDoc ? 'block' : 'none';
  let hs = [];
  if (isHalf) hs.push('<span style="color:var(--accent);">🌓 ลาครึ่งวัน' + (period === 'morning' ? ' (เช้า)' : ' (บ่าย)') + ' = 0.5 วัน</span>');
  if (isMgr && da < 0) hs.push('<span style="color:var(--yellow);">🕐 ลาย้อนหลัง ' + Math.abs(da) + ' วัน</span>');
  if (needAdv && !advOk) hs.push('<span style="color:var(--red);">⏰ ต้องลาล่วงหน้า 7 วัน — ขาดอีก ' + Math.max(0, 7 - da) + ' วัน</span>');
  else if (needAdv && advOk && !isHalf && da >= 0) hs.push('<span style="color:var(--green);">✓ ลาล่วงหน้า ' + da + ' วัน — ผ่านเกณฑ์</span>');
  if (type === 'sick') {
    const retroOk = isMgr || forMember || da >= -7;
    const retroLabel = !retroOk ? ' &nbsp;|&nbsp; <span style="color:var(--red);">เกินกำหนด ' + Math.abs(da) + ' วัน</span>' : (da < 0 ? ' &nbsp;|&nbsp; <span style="color:var(--yellow);">ย้อนหลัง ' + Math.abs(da) + ' วัน</span>' : '');
    hs.push('<span style="color:' + (!retroOk ? 'var(--red)' : 'var(--accent)') + ';">💊 ลาป่วย — ย้อนหลังได้ไม่เกิน 7 วัน' + retroLabel + (diff >= 2 ? ' &nbsp;|&nbsp; <span style="color:var(--red);">📄 ลา 2 วันขึ้นไปต้องแนบใบรับรองแพทย์</span>' : '') + '</span>');
  }
  if (type === 'dental') hs.push('<span style="color:var(--red);">📄 ลาทำฟัน — ต้องแนบใบรับรองแพทย์ทุกครั้ง</span>');
  if (isMgr && !forMember) hs.push('<span style="color:var(--purple);">🔓 PM/หัวหน้า — ลาย้อนหลังได้ทุกกรณี</span>');
  else if (forMember) hs.push('<span style="color:var(--purple);">✎ ยื่นแทนสมาชิก — ข้ามกฎลาล่วงหน้า</span>');
  if (willEsc) hs.push('<span style="color:var(--orange);">⚡ ลา ' + diff + ' วัน → จะส่งตรงถึง PM อัตโนมัติ</span>');
  if (type === 'birthday') hs.push('<span style="color:var(--purple);">🎂 หัวหน้าพิจารณาเสมอ</span>');
  hints.innerHTML = hs.map(h => '<div style="padding:8px 12px;background:var(--surface3);border-radius:6px;font-size:17px;margin-bottom:6px;">' + h + '</div>').join('');
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
  const diff = isHalf ? 0.5 : rawDays;

  // --- EDIT MODE ---
  if (_editingLeaveId !== null) {
    const ls = getLeaves(), idx = ls.findIndex(r => r.id === _editingLeaveId); if (idx < 0) return;
    const r = ls[idx];
    const conf = leaveConflict(r.email, start, end, isHalf, period, _editingLeaveId);
    if (conf) { toast('⚠️ มีใบลาที่ทับซ้อนกันอยู่แล้ว (' + LT[conf.type] + ' ' + conf.start + (conf.start !== conf.end ? ' → ' + conf.end : '') + ')'); return; }
    if (((type === 'sick' && diff >= 2) || type === 'dental') && !link) { toast('⚠️ กรุณาแนบลิงก์ใบรับรองแพทย์'); return; }
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
  if (RDOC.includes(type) && diff >= 3 && !link) { toast('⚠️ กรุณาใส่ลิงก์หลักฐาน / ใบรับรองแพทย์'); return; }
  let targetEmail = cu.email, targetName = cu.nickname || cu.name.split(' ')[0];
  if (forMemberEmail) { const m = getUsers().find(u => u.email === forMemberEmail); if (m) { targetEmail = m.email; targetName = m.nickname || m.name.split(' ')[0]; } }
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
    if (leave.status === 'approved') {
      const qs = getQs();
      if (!qs[leave.email]) qs[leave.email] = {};
      const def = LQ[leave.type];
      const curQ = qs[leave.email][leave.type] ?? (def?.q ?? 0);
      qs[leave.email][leave.type] = curQ + leave.days;
      saveQs(qs);
      apiSync('updateQuotas', { email: leave.email, data: qs[leave.email] });
    }
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
  const years = [...new Set(allLeaves.map(r => r.start?.slice(0,4)).filter(Boolean))].sort((a,b) => b-a);
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
  if (searchQ) data = data.filter(r => (r.refNo || '').toLowerCase().includes(searchQ));
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

  ['refNo','name','dept','type','start','days'].forEach(col => {
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
                <td><span style="font-weight:600;color:var(--text);">${uName(u.email, u.name)}</span><br><span style="font-size:13px;color:var(--text3);">${u.dept || ''}</span></td>
                <td><span style="font-family:var(--mono);font-size:14px;color:var(--text2);">${h.date || '—'}</span></td>
                <td style="color:var(--text2);">${h.scope || '—'}</td>
                <td style="text-align:center;"><span style="font-family:var(--mono);font-weight:700;color:var(--yellow);">${h.days}d</span></td>
                <td style="font-size:14px;color:var(--text3);">${h.addedBy || '—'}</td>
                <td style="font-size:13px;color:var(--text3);font-family:var(--mono);">${h.addedAt ? h.addedAt.slice(0,10) : '—'}</td>
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
        <div style="display:grid;grid-template-columns:1fr 2fr 60px 32px;gap:8px;align-items:center;padding:6px 8px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:4px;">
          <span style="font-size:13px;color:var(--text2);font-family:var(--mono);">${h.date}</span>
          <span style="font-size:13px;color:var(--text2);">${h.scope}</span>
          <span style="font-size:13px;color:var(--yellow);font-family:var(--mono);font-weight:700;text-align:center;">${h.days}d</span>
          <button onclick="removeAccuHistory('${email}',${i})" style="background:rgba(255,80,80,0.15);border:none;border-radius:6px;color:var(--red);cursor:pointer;font-size:14px;width:28px;height:28px;">✕</button>
        </div>`).join('');
      return `
        <div style="padding:10px 12px;background:rgba(255,255,255,0.02);border-radius:12px;border:1px solid rgba(255,255,255,0.01);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div>
              <div style="font-size:16px;font-weight:700;color:#fff;">${LT['accumulated']}</div>
              <div style="font-size:12px;color:var(--text3);">รวม ${totalDays} วัน · ใช้ไปแล้ว ${used} วัน · คงเหลือ ${Math.max(0, totalDays - used)} วัน</div>
            </div>
            <input type="hidden" class="quota-total-input" data-type="accumulated" data-used="${used}" value="${totalDays}" />
          </div>
          ${history.length ? `<div style="margin-bottom:10px;">${histRows}</div>` : '<div style="font-size:13px;color:var(--text3);margin-bottom:10px;">ยังไม่มีรายการ</div>'}
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
  qs[email].accuHistory.push({ date, scope, days, addedBy: cu.name, addedAt: new Date().toISOString() });
  qs[email].accumulated = qs[email].accuHistory.reduce((s, h) => s + (h.days || 0), 0);
  saveQs(qs);
  apiSync('updateQuotas', { email, data: qs[email] });
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
  const today = document.getElementById('ex-date')?.value || new Date().toISOString().split('T')[0];
  const mk = monthKey(today);
  const es = getExs();

  // Sort by name, filter out current user and already-selected members
  let available = allUsers.filter(u => u.email !== cu.email && !exMembers.some(m => m.email === u.email)).sort((a, b) => a.name.localeCompare(b.name, 'th'));

  sel.innerHTML = '<option value="">— เลือกสมาชิกในระบบ —</option>' + available.map(u => {
    const uMoGrp = es.filter(x => isUserInvolved(x, u.email) && isGroupEx(getExType(x)) && x.status !== 'rejected' && monthKey(x.date) === mk).length;
    const nick = u.nickname || u.name.split(' ')[0];
    const dept = u.dept ? ` (${u.dept})` : '';
    const isFull = uMoGrp >= 4;
    return `<option value="${u.email}" ${isFull ? 'disabled style="color:var(--text3)"' : ''}>${nick}${dept}${isFull ? ' (เต็ม)' : ''}</option>`;
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
  const all = getExs();
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
    <div style="display:flex;align-items:center;gap:6px;flex:1;">
      <div style="display:flex;gap:3px;flex:1;height:8px;">
        ${Array.from({ length: max }, (_, i) => `<div style="flex:1;border-radius:4px;background:${i < used ? color : 'rgba(255,255,255,0.1)'};border:1px solid ${i < used ? 'transparent' : 'rgba(255,255,255,0.05)'};"></div>`).join('')}
      </div>
      <div style="display:flex;align-items:center;gap:4px;min-width:48px;justify-content:flex-end;">
        <div style="font-size:15px;color:${used >= max ? 'var(--green)' : 'var(--text3)'};font-family:var(--mono);">(${used}/${max})</div>
        ${used >= max ? `<span style="color:var(--green);font-size:18px;font-weight:bold;line-height:1;">✓</span>` : ''}
      </div>
    </div>`;

  const qd = document.getElementById('quota-display');
  if (!qd) return;

  const allMo = all.filter(e => isUserInvolved(e, cu.email) && e.status !== 'rejected' && monthKey(e.date) === mk);
  const totalMoMoney = allMo.reduce((sum, e) => sum + (EX_REWARD[getExType(e)] || 100), 0);

  qd.innerHTML = `
  <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:14px 20px;border:1px solid var(--border);margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
    <div>
      <div style="font-size:16px;color:var(--text3);margin-bottom:2px;font-family:var(--mono);">💰 ยอดเงินสะสมเดือนนี้ (คาดการณ์)</div>
      <div style="font-size:32px;font-weight:500;font-family:var(--mono);color:var(--green);">฿${totalMoMoney}</div>
    </div>
    <div style="text-align:right;font-size:16px;color:var(--text3);font-family:var(--mono);background:var(--surface3);padding:8px 12px;border-radius:8px;">
      <div style="margin-bottom:4px;">⏳ ตัดรอบสัปดาห์: <strong style="color:var(--text2);">ทุกวันเสาร์</strong></div>
      <div>📅 ตัดรอบเดือน: <strong style="color:var(--text2);">ทุกวันที่ 18</strong></div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;">
    <!-- CARD 1: SOLO -->
    <div style="background:var(--surface3);border-radius:12px;padding:20px;border:1px solid var(--border);position:relative;overflow:hidden;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <div style="font-size:32px;font-weight:700;color:var(--text);line-height:1;">แบบเดี่ยว (${locLabel})</div>
      </div>
      <div style="display:flex;gap:32px;flex-wrap:wrap;">
        <div style="flex:1;min-width:200px;">
          <div style="font-size:20px;font-weight:500;color:var(--text);margin-bottom:10px;">สัปดาห์ที่ ${curWkNum} (${fmt(ws)} - ${fmt(we)})</div>
          ${segBar(wkSolo, wkLimit, 'var(--green)')}
        </div>
        <div style="flex:1;min-width:200px;">
          <div style="font-size:20px;font-weight:500;color:var(--text);margin-bottom:10px;">เดือน ${moName}</div>
          ${segBar(moSolo, moLimit, 'var(--green)')}
        </div>
      </div>
    </div>

    <!-- CARD 2: GROUP -->
    <div style="background:var(--surface3);border-radius:12px;padding:20px;border:1px solid var(--border);display:flex;flex-direction:column;justify-content:space-between;">
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <div style="font-size:32px;font-weight:700;color:var(--text);line-height:1;">แบบกลุ่ม (${locLabel})</div>
        </div>
        <div style="display:flex;gap:32px;flex-wrap:wrap;">
          <div style="flex:1;min-width:200px;">
            <div style="font-size:20px;font-weight:500;color:var(--text);margin-bottom:10px;">สัปดาห์ที่ ${curWkNum} (${fmt(ws)} - ${fmt(we)})</div>
            ${segBar(wkGrp, 1, 'var(--green)')}
          </div>
          <div style="flex:1;min-width:200px;">
            <div style="font-size:20px;font-weight:500;color:var(--text);margin-bottom:10px;">เดือน ${moName}</div>
            ${segBar(moGrp, 4, 'var(--green)')}
          </div>
        </div>
      </div>
      ${wkGrp >= 1 || moGrp >= 4 ? `<div style="font-size:16px;color:var(--accent);margin-top:12px;">รายสัปดาห์โควต้าครบแล้ว</div>` : ''}
    </div>

    <!-- CARD 3: COLA -->
    <div style="background:var(--surface3);border-radius:12px;padding:20px;border:1px solid var(--border);display:flex;flex-direction:column;justify-content:space-between;">
      <div>
        <div style="font-size:28px;font-weight:700;color:var(--text);margin-bottom:16px;">Cola — ไตรมาสนี้</div>
        <div style="font-size:17px;color:var(--text2);margin-bottom:6px;">แบบกลุ่ม</div>
        ${segBar(qGrp, colaThresh, 'var(--green)')}
        <div style="font-size:15px;color:var(--text3);margin-top:10px;line-height:1.4;">
          * ร่วมกิจกรรมให้ครบ รับเงิน 1,500/เดือน ในไตรมาสถัดไป
        </div>
      </div>
      ${colaOk ? `
        <div style="margin-top:12px;display:flex;align-items:center;gap:6px;color:rgba(108,138,255,0.8);font-size:17px;">
          <span style="background:var(--green);color:#fff;width:16px;height:16px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font-size:14px;">✓</span>
          ได้โบนัสไตรมาสถัดไป ฿1,500/เดือน
        </div>` : ''}
    </div>
  </div>`;
  const warn = document.getElementById('ex-warn');
  if (!warn) return;
  const btnSubmit = document.getElementById('btn-submit-ex');
  if (exType === 'solo') {
    if (wkSolo >= wkLimit) { warn.textContent = `⚠️ โควต้าเดี่ยวสัปดาห์นี้เต็มแล้ว (${wkLimit} ครั้ง/${locLabel}) — แต่ยังสามารถยื่นย้อนหลังได้หากโควต้ารายเดือนยังไม่เต็ม`; warn.style.display = 'block'; }
    else if (moSolo >= moLimit) { warn.textContent = `⚠️ โควต้าเดี่ยวเดือนนี้เต็มแล้ว (${moLimit} ครั้ง/${locLabel})`; warn.style.display = 'block'; if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.style.opacity = '0.5'; btnSubmit.style.cursor = 'not-allowed'; } }
    else { warn.style.display = 'none'; if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.style.opacity = '1'; btnSubmit.style.cursor = 'pointer'; } }
  } else {
    if (wkGrp >= 1) { warn.textContent = '⚠️ โควต้ากิจกรรมกลุ่มสัปดาห์นี้เต็มแล้ว (1 ครั้ง) — แต่ยังสามารถยื่นย้อนหลังได้หากโควต้ารายเดือนยังไม่เต็ม'; warn.style.display = 'block'; }
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
    const all = getExs().filter(e => e.id !== _editingExId);

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

    const reward = EX_REWARD[exType] || 100;
    const sysCount = isGroupEx(exType) ? exMembers.filter(m => m.type === 'sys').length : 0;
    const count = 1 + sysCount;
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
function generateDSID() {
  const es = getExs();
  let max = 0;
  es.forEach(e => {
    if (typeof e.id === 'string' && e.id.startsWith('DS')) {
      const num = parseInt(e.id.substring(2));
      if (!isNaN(num) && num > max) max = num;
    }
  });
  return 'DS' + (max + 1).toString().padStart(4, '0');
}

function migrateExIds() {
  const es = getExs();
  let changed = false;
  let max = 0;
  es.forEach(e => {
    if (typeof e.id === 'string' && e.id.startsWith('DS')) {
      const num = parseInt(e.id.substring(2));
      if (!isNaN(num) && num > max) max = num;
    }
  });

  es.forEach(e => {
    if (!e.id || typeof e.id === 'number' || (typeof e.id === 'string' && !e.id.startsWith('DS'))) {
      max++;
      e.id = 'DS' + max.toString().padStart(4, '0');
      changed = true;
    }
  });
  if (changed) saveExs(es);
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
            <input type="text" id="ex-review-search-input" placeholder="ค้นหาชื่อ, กิจกรรม หรือรหัส DS..." value="${_exReviewSearch || ''}" oninput="setExReviewSearch(this.value)" 
              style="width:100%;height:44px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:0 15px 0 40px;color:#fff;font-size:16px;outline:none;transition:all 0.2s;" />
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

  const inMonth = all.filter(e => monthKey(e.date) === mk);
  const q = (_exReviewSearch || '').toLowerCase();
  const filtered = inMonth.filter(e => {
    if (!q) return true;
    return (e.name || '').toLowerCase().includes(q) || (e.email || '').toLowerCase().includes(q) || (e.activity || '').toLowerCase().includes(q) || (e.id || '').toString().toLowerCase().includes(q);
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
  const totalMoney = approved.reduce((s, e) => s + (EX_REWARD[getExType(e)] || 100) * (1 + (e.members || []).filter(m => m.type === 'sys').length), 0);

  const statBox = (label, val, color) =>
    `<div style="flex:1;min-width:110px;background:#1a1c26;border:1px solid rgba(255,255,255,0.03);border-radius:16px;padding:16px;text-align:center;">
       <div style="font-size:24px;font-weight:500;font-family:var(--mono);color:${color};">${val}</div>
       <div style="font-size:14px;color:var(--text3);margin-top:4px;font-weight:500;">${label}</div>
     </div>`;

  const statsCardEl = document.getElementById('ex-review-stats-card');
  if (statsCardEl) {
    statsCardEl.innerHTML = `
      <div class="card-title" style="margin-bottom:14px; font-size:18px;">📊 สรุปรอบ ${moName}</div>
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
    const sysM = members.filter(m => m.type === 'sys');
    const allMembers = [{ email: e.email, name: e.name, type: 'sys' }, ...sysM];
    const chips = allMembers.map(m => {
      const u = getUsers().find(x => x.email === m.email);
      const nick = u ? (u.nickname || u.name.split(' ')[0]) : m.name.split(' ')[0];
      return `<div class="member-chip" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.03);padding:2px 8px;border-radius:8px;font-size:14px;display:flex;align-items:center;gap:4px;color:#fff;">
        <i class="fa-solid fa-user" style="font-size:10px;opacity:0.5;"></i> ${nick}
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
        <div style="display:flex; align-items:center; gap:8px; color:#5a5e7a; font-size:16px; margin-bottom:12px; font-weight:500;">
          <i class="fa-regular fa-calendar" style="font-size:15px;"></i>
          <span>${new Date(e.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>

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
    const showApprove = status === 'pending';
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
    const sysMems = (e.members || []).filter(m => m.type === 'sys');
    const allPartic = [e.email, ...sysMems.map(m => m.email)];
    if (allPartic.length < 3) { toast(`⚠️ คำขอนี้มีแค่ ${allPartic.length} คน — ต้องครบ 3 คนถึงจะอนุมัติได้`); return; }
    const mk = monthKey(e.date);
    const isInOther = (email) => es.some(x => x.id !== e.id && isGroupEx(getExType(x)) && x.status === 'approved' && monthKey(x.date) === mk && (x.email === email || (x.members || []).some(m => m.type === 'sys' && m.email === email)));
    const newMems = allPartic.filter(email => !isInOther(email));
    if (newMems.length < 3) {
      const notNew = allPartic.filter(email => isInOther(email));
      const names = notNew.map(em => { const u = getUsers().find(x => x.email === em); return u ? u.name : em; });
      toast(`⚠️ จำเป็นต้องมีสมาชิกเพิ่มอีกอย่างน้อย 2 คน ที่ยังไม่ได้ทำกิจกรรมกลุ่มเดือนนี้ — สมาชิกที่ทำไปแล้ว: ${names.join(', ')}`);
      return;
    }
  }
  es[i].status = 'approved';
  saveExs(es);
  apiSync('updateEx', es[i]);
  toast('✅ อนุมัติแล้ว'); updateDashboard(); updateLB(); updateQuota(); renderExR();
}
function rejEx(id) {
  if (cu.role !== 'pm') { toast('⚠️ เฉพาะ PM เท่านั้น'); return; }
  const es = getExs(), i = es.findIndex(e => e.id === id); if (i < 0) return;
  es[i].status = 'rejected';
  saveExs(es);
  apiSync('updateEx', es[i]);
  toast('✕ ไม่อนุมัติ'); renderExR();
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
function renderExShare() {
  const all = getExs().filter(e => isGroupEx(getExType(e)));
  const isInvolved = (e) => isUserInvolved(e, cu.email);
  const memberCount = (e) => 1 + (e.members || []).filter(m => m.type === 'sys').length;
  const isLocked = (e) => e.status !== 'pending';
  const sorted = [...all].sort((a, b) => new Date(b.submittedAt || b.date) - new Date(a.submittedAt || a.date));
  const mine = sorted.filter(isInvolved);
  const others = sorted.filter(e => !isInvolved(e));

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
      ? { label: 'อนุมัติแล้ว', color: 'var(--green)', icon: 'fa-solid fa-circle-check', bg: 'var(--green-bg)' }
      : e.status === 'rejected'
        ? { label: 'ไม่อนุมัติ', color: 'var(--red)', icon: 'fa-solid fa-circle-xmark', bg: 'var(--red-bg)' }
        : { label: 'รออนุมัติ', color: 'var(--yellow)', icon: 'fa-regular fa-clock', bg: 'var(--yellow-bg)' };

    // Member Chips
    const allMembers = [{ kind: 'submitter', email: e.email, name: e.name }, ...(e.members || []).map(m => ({ kind: m.type, email: m.email, name: m.name, dept: m.dept }))];
    const memberChips = allMembers.map(m => {
      const isSubmitter = m.kind === 'submitter';
      const isMe = m.email === cu.email && (isSubmitter || m.kind === 'sys');

      const icon = isSubmitter ? 'fa-crown' : 'fa-user';
      const iconColor = isSubmitter ? 'var(--yellow)' : '#b37fff';

      const bg = isMe ? 'rgba(77, 111, 255, 0.15)' : 'var(--surface3)';
      const border = isMe ? '1px solid rgba(77, 111, 255, 0.07)' : '1px solid var(--border)';
      const fg = isMe ? 'var(--accent)' : 'var(--text2)';

      return `
        <div style="display:flex;align-items:center;gap:6px;background:${bg};border:${border};padding:4px 10px 4px 8px;border-radius:30px;font-size:14px;color:${fg};">
          <i class="fa-solid ${icon}" style="color:${iconColor};font-size:12px;"></i>
          <div style="white-space:nowrap;">
            <span style="font-weight:500;">${uNick(m.email, m.name)}</span>
            <span style="font-size:11px;opacity:0.6;margin-left:2px;">${m.dept || ''}</span>
          </div>
          ${(!locked || (cu.role === 'pm' && e.status === 'approved')) && isMe && !isSubmitter && count > 3 ? `<button onclick="leaveExGroup('${e.id}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;margin-left:4px;padding:0;">✕</button>` : ''}
        </div>`;
    }).join('');

    return `
    <div class="card" style="padding:0;overflow:hidden;border:1px solid var(--border2);background:var(--surface2);">
      <!-- Header Row -->
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;background:rgba(0,0,0,0.15);border-bottom:1px solid var(--border);">
        <div style="display:flex;align-items:center;gap:10px;">
          <i class="fa-solid fa-heart-pulse" style="color:var(--orange);font-size:14px;"></i>
          <span style="font-size:16px;font-weight:700;color:var(--orange);letter-spacing:0.5px;">${EX_LABEL[et]}</span>
          <span style="color:var(--text3);margin:0 4px;">•</span>
          <span style="font-size:14px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1px;">WEEK ${wkNum}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;background:${statusCfg.bg};color:${statusCfg.color};padding:4px 12px;border-radius:20px;font-size:12px;font-weight:500;">
          <i class="${statusCfg.icon}"></i>
          <span>${statusCfg.label}</span>
        </div>
      </div>

      <!-- Main Content -->
      <div style="padding:24px 20px;">
        <div style="display:flex;gap:20px;align-items:center;">
          <!-- Calendar Block -->
          <div style="display:flex;flex-direction:column;width:64px;border-radius:14px;overflow:hidden;text-align:center;background:var(--surface3);border:1px solid var(--border2);flex-shrink:0;">
            <div style="background:var(--orange);color:#000;font-size:14px;font-weight:500;padding:4px 0;text-transform:uppercase;">${month}</div>
            <div style="font-size:24px;font-weight:500;padding:4px 0;color:var(--text);">${day}</div>
          </div>
          <!-- Title & Meta -->
          <div style="flex:1;min-width:0;">
            <div style="font-size:26px;font-weight:500;color:var(--text);margin-bottom:6px;line-height:1.2;">${e.activity}</div>
            <div style="display:flex;align-items:center;gap:12px;color:var(--text3);font-size:14px;">
              <div style="display:flex;align-items:center;gap:6px;"><i class="fa-regular fa-calendar"></i> ${fullDate}</div>
              <span style="opacity:0.3;">•</span>
              <div style="display:flex;align-items:center;gap:6px;"><i class="fa-solid fa-users"></i> ${count} คน</div>
            </div>
          </div>
        </div>

        <!-- Members Section -->
        <div style="margin-top:10px;">
          <div style="font-size:13px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">ผู้เข้าร่วม</div>
          <div style="display:flex;flex-wrap:wrap;gap:5px;">
            ${memberChips}
          </div>
        </div>

        ${e.note ? `<div style="margin-top:16px;padding:12px;background:var(--surface3);border-radius:10px;font-size:14px;color:var(--text2);border-left:3px solid var(--border2);">📝 ${e.note}</div>` : ''}

        <!-- Actions -->
        <div style="margin-top:20px;display:flex;gap:12px;">
          ${(!locked || (cu.role === 'pm' && e.status === 'approved')) && !userInvolved
        ? `<button class="btn btn-primary" style="flex:2;justify-content:center;height:48px;border-radius:14px;font-size:16px;" onclick="joinExGroup('${e.id}')"><i class="fa-solid fa-plus" style="margin-right:8px;"></i> เข้าร่วมกลุ่ม</button>`
        : ''}
          ${(!locked || (cu.role === 'pm' && e.status === 'approved')) && userInvolved && !userIsSubmitter
        ? `<button class="btn btn-red" style="flex:2;justify-content:center;height:48px;border-radius:14px;font-size:16px;" onclick="leaveExGroup('${e.id}')"><i class="fa-solid fa-xmark" style="margin-right:8px;"></i> ถอนตัวออกจากกลุ่ม</button>`
        : ''}
          <button class="btn btn-ghost" style="flex:1;justify-content:center;height:48px;border-radius:14px;background:var(--surface3);font-size:16px;" onclick="viewExDetail('${e.id}')">รายละเอียด <i class="fa-solid fa-chevron-right" style="margin-left:8px;font-size:12px;opacity:0.6;"></i></button>
        </div>
      </div>
    </div>`;
  };
  const mineEl = document.getElementById('ex-share-mine');
  const othersEl = document.getElementById('ex-share-others');
  if (mineEl) mineEl.innerHTML = mine.length ? mine.map(renderCard).join('') : '<div style="color:var(--text3);text-align:center;padding:20px;font-size:17px;">ยังไม่มีคำขอที่มีชื่อคุณ</div>';
  if (othersEl) othersEl.innerHTML = others.length ? others.map(renderCard).join('') : '<div style="color:var(--text3);text-align:center;padding:20px;font-size:17px;">ไม่มีคำขออื่นในทีม</div>';
}
function joinExGroup(id) {
  const es = getExs(), i = es.findIndex(e => e.id === id);
  if (i < 0) return;
  const e = es[i];
  if (e.status !== 'pending' && !(cu.role === 'pm' && e.status === 'approved')) { toast('⚠️ คำขอนี้ถูก' + (e.status === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ') + 'แล้ว'); return; }

  if (isUserInvolved(e, cu.email)) { toast('⚠️ คุณมีชื่ออยู่ในคำขอนี้แล้ว'); return; }
  const mk = monthKey(e.date);
  const wk = wkKey(e.date);
  const wkGrp = es.filter(x => isUserInvolved(x, cu.email) && isGroupEx(getExType(x)) && x.status !== 'rejected' && wkKey(x.date) === wk).length;
  if (wkGrp >= 1) { toast('⚠️ โควต้ากิจกรรมกลุ่มสัปดาห์นี้ของคุณเต็มแล้ว (1/1)'); return; }
  const moGrp = es.filter(x => isUserInvolved(x, cu.email) && isGroupEx(getExType(x)) && x.status !== 'rejected' && monthKey(x.date) === mk).length;
  if (moGrp >= 4) { toast('⚠️ โควต้ากิจกรรมกลุ่มเดือนนี้ของคุณเต็มแล้ว (4/4)'); return; }

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

  const count = 1 + (e.members || []).filter(m => m.type === 'sys').length;
  if (count <= 3) { toast('⚠️ ไม่สามารถลบชื่อได้ ต้องมีสมาชิกในกลุ่มอย่างน้อย 3 คน'); return; }

  const oldMembers = e.members || [];
  e.members = oldMembers.filter(m => !(m.type === 'sys' && m.email === cu.email));
  if (e.members.length === oldMembers.length) { toast('⚠️ ไม่พบชื่อคุณในกลุ่มนี้'); return; }

  saveExs(es);
  apiSync('updateEx', es[i]);
  renderExShare(); updateQuota(); updateLB(); updateDashboard(); updateBadges();
  toast('✕ ถอนตัวออกจากกลุ่มเรียบร้อย');
}

// ══ LEADERBOARD ══════════════════════════
function updateLB() {
  const a = getExs().filter(e => e.status !== 'rejected');
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
  const today = new Date().toISOString().split('T')[0];
  const mk = monthKey(today);
  const allMo = a.filter(e => monthKey(e.date) === mk);
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
      <div style="margin-bottom:12px;font-size:16px;color:var(--text3);">รอบการคำนวณเงินรางวัล: ${rangeLabel} <span style="margin-left:12px;">(ตัวเลขในวงเล็บ = อนุมัติแล้ว)</span></div>
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
              <th rowspan="2" style="background:var(--surface2);font-weight:500;font-size:16px;cursor:pointer;user-select:none;" onclick="setLBSort('totalA')">รวม (อนุมัติ)${sIcon('totalA')}</th>
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
                  <div style="font-size:13px;color:var(--text3);">${s.name}</div>
                </td>
                <td style="text-align:left;color:var(--text2);">${s.dept}</td>
                <td style="text-align:left;">
                  <span style="color:${s.locationType === 'bkk' ? 'var(--accent)' : 'var(--orange)'};font-weight:600;">
                    ${s.locationType === 'bkk' ? 'กทม.' : 'ตจว.'}
                  </span>
                </td>
                <td>${s.sC}</td><td style="color:var(--green);font-family:var(--mono);">฿${s.sR} <span style="opacity:0.6;font-size:13px;">(${s.sAR})</span></td>
                <td>${s.gexC}</td><td style="color:var(--purple);font-family:var(--mono);">฿${s.gexR} <span style="opacity:0.6;font-size:13px;">(${s.gexAR})</span></td>
                <td>${s.geC}</td><td style="color:var(--orange);font-family:var(--mono);">฿${s.geR} <span style="opacity:0.6;font-size:13px;">(${s.geAR})</span></td>
                <td style="font-weight:500;background:rgba(255,255,255,0.03);font-family:var(--mono);font-size:16px;">
                  ฿${s.total.toLocaleString()}
                  <div style="font-size:14px;color:var(--green);opacity:0.8;">(฿${s.totalA.toLocaleString()})</div>
                </td>
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
function viewExDetail(id) {
  const es = getExs(), e = es.find(x => String(x.id) === String(id));
  if (!e) return;
  const et = getExType(e);
  const reward = EX_REWARD[et] || 100;
  const count = 1 + (e.members || []).filter(m => m.type === 'sys').length;
  const totalReward = reward * count;
  const allMembers = [{ kind: 'submitter', email: e.email, name: e.name }, ...(e.members || []).map(m => ({ kind: m.type, email: m.email, name: m.name, dept: m.dept }))];
  const wkNum = getWkNum(e.date);

  // Status config
  const statusCfg = e.status === 'approved'
    ? { label: 'อนุมัติแล้ว', color: 'var(--green)', icon: 'fa-solid fa-circle-check', bg: 'var(--green-bg)' }
    : e.status === 'rejected'
      ? { label: 'ไม่อนุมัติ', color: 'var(--red)', icon: 'fa-solid fa-circle-xmark', bg: 'var(--red-bg)' }
      : { label: 'รออนุมัติ', color: 'var(--yellow)', icon: 'fa-solid fa-circle', bg: 'var(--yellow-bg)' };

  const canEdit = (e.email === cu.email && e.status === 'pending') || (cu.role === 'pm' && e.status === 'approved');
  const canUpdateProof = isUserInvolved(e, cu.email) && e.status !== 'rejected';
  const primaryLink = e.proofLink || (e.proofDoc?.startsWith('http') ? e.proofDoc : '') || '';
  const extraLinks = e.proofLinks || [];

  // Format links into uniform objects
  const allLinks = [];
  if (primaryLink) allLinks.push({ url: primaryLink, addedBy: e.name });
  extraLinks.forEach(p => allLinks.push({ url: p.url, addedBy: p.addedByName || p.addedBy }));

  const getAv = (name, email) => {
    const color = `hsl(${name.length * 40 % 360}, 65%, 65%)`;
    return `<div style="width:36px;height:36px;border-radius:50%;background:${color}33;color:${color};display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;border:1px solid ${color}44;"><i class="fa-solid fa-user"></i></div>`;
  };

  const body = document.getElementById('ex-detail-body');
  const actions = document.getElementById('ex-detail-actions');

  body.innerHTML = `
    <!-- Header Row -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">
      <div>
        <div style="font-size:14px;color:#5a5e7a;margin-bottom:6px;font-weight:500;display:flex;align-items:center;gap:8px;">
          คำขอเบิกรางวัล 
          <span style="background:rgba(255,255,255,0.05);color:var(--text3);padding:2px 8px;border-radius:6px;font-family:var(--mono);font-size:13px;font-weight:700;border:1px solid rgba(255,255,255,0.03);">ID: ${e.id}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:0px;">
          <h2 style="font-size:32px;font-weight:500;color:#fff;margin:0;">${e.activity + (e.note ? ` (${e.note.split('\n')[0].substring(0, 20)})` : '')}</h2>
          <span style="background:#f5c842;color:#000;padding:2px 8px;border-radius:8px;font-size:14px;font-weight:500;white-space:nowrap;">Week ${wkNum}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;color:#9094b8;font-size:20px;font-weight:500;">
          <i class="fa-regular fa-calendar" style="font-size:18px;"></i>
          ${new Date(e.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;">
        <div style="display:flex;align-items:center;gap:8px;background:${statusCfg.bg};color:${statusCfg.color};padding:6px 18px;border-radius:30px;font-size:16px;font-weight:700;">
          <div style="width:10px;height:10px;border-radius:50%;background:${statusCfg.dot || statusCfg.color};"></div>
          ${statusCfg.label}
        </div>
        <button onclick="closeModal('modal-ex-detail')" style="width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,0.08);border:none;color:#5a5e7a;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;">✕</button>
      </div>
    </div>

    <!-- Submitter Card -->
    <div style="background:rgba(255,255,255,0.02);padding:12px;border-radius:20px;display:flex;align-items:center;gap:16px;margin-bottom:24px;">
      <div style="width:48px;height:48px;color:var(--yellow);display:flex;align-items:center;justify-content:center;font-size:36px;flex-shrink:0;">
        <i class="fa-solid fa-crown"></i>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:20px;font-weight:700;color:#fff;display:flex;align-items:center;gap:6px;">
          ผู้ยื่น • ${uNick(e.email, e.name)}
          <span style="font-size:15px;color:#5a5e7a;font-weight:500;">(${(getUsers().find(x => x.email === e.email) || {}).dept || 'Media'})</span>
        </div>
        <div style="font-size:16px;color:#5a5e7a;font-family:var(--mono);">${e.email}</div>
      </div>
    </div>

    <!-- Members Section -->
    <div style="margin-bottom:32px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
        <span style="font-size:16px;font-weight:700;color:#5a5e7a;">สมาชิกทั้งหมด</span>
        <span style="background:rgba(255,255,255,0.08);color:#5a5e7a;padding:2px 8px;border-radius:10px;font-size:14px;font-weight:700;min-width:28px;text-align:center;">${allMembers.length}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;">
         ${allMembers.map(m => {
    const isSubmitter = m.kind === 'submitter';
    const icon = isSubmitter ? 'fa-crown' : 'fa-user';
    const iconColor = isSubmitter ? 'var(--yellow)' : '#b37fff';
    return `
            <div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.03);padding:2px 10px;border-radius:14px;font-size:16px;color:#fff;">
              <i class="fa-solid ${icon}" style="font-size:16px;color:${iconColor};"></i>
              <span style="font-weight:500;">${uNick(m.email, m.name)}</span>
            </div>`;
  }).join('')}
      </div>
    </div>

    <!-- Evidence Section -->
    <div style="margin-bottom:32px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
        <span style="font-size:16px;font-weight:700;color:#5a5e7a;">หลักฐาน</span>
        <span style="background:rgba(255,255,255,0.08);color:#5a5e7a;padding:2px 8px;border-radius:10px;font-size:14px;font-weight:700;min-width:28px;text-align:center;">${allLinks.length}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px;">
        ${allLinks.map((link, idx) => `
          <a href="${link.url}" target="_blank" style="text-decoration:none;background:rgba(255,255,255,0.01);padding:5px 10px;border-radius:24px;display:flex;align-items:center;justify-content:space-between;color:#fff;border:1px solid rgba(255,255,255,0.01);">
            <div style="display:flex;align-items:center;gap:20px;">
              <div style="width:56px;height:44px;border-radius:12px;background:var(--accent-bg);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:28px;">
                <i class="fa-solid fa-circle-play"></i>
              </div>
              <div>
                <div style="font-weight:700;font-size:20px; line-height:1.2;">หลักฐาน #${idx + 1}</div>
                <div style="font-size:14px;color:#5a5e7a;margin-top:0px;">Tog ${link.addedBy || 'Member'}</div>
              </div>
            </div>
            <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:20px;color:#5a5e7a;opacity:0.6;"></i>
          </a>
        `).join('')}
        
        <div style="display:flex;gap:12px;margin-top:8px;">
          <input type="text" id="proof-link-input-${e.id}" placeholder="วางลิงก์เพิ่มเติม..." style="flex:1;height:64px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:14px;padding:0 24px;color:#fff;font-size:18px;" />
          <button class="btn" onclick="saveProofLink('${e.id}')" style="height:64px;padding:0 32px;border-radius:14px;font-weight:700;background:rgba(255,255,255,0.08);color:#fff;border:none;font-size:18px;">แนบเพิ่ม</button>
        </div>
      </div>
    </div>
  `;

  actions.innerHTML = `
    <div style="display:flex;width:100%;justify-content:space-between;align-items:center;margin-top:32px;padding-top:32px;border-top:1px solid rgba(255,255,255,0.03);">
      <button class="btn" onclick="deleteEx('${e.id}')" style="color:#ff6b6b;background:rgba(255,107,107,0.1);border-radius:14px;height:64px;padding:0 32px;font-weight:700;border:none;font-size:20px;">
        <i class="fa-solid fa-trash-can" style="margin-right:12px;"></i> ลบ
      </button>
      <div style="display:flex;gap:16px;">
        <button class="btn" onclick="closeModal('modal-ex-detail')" style="background:rgba(255,255,255,0.08);color:#9094b8;border-radius:14px;height:64px;padding:0 32px;font-weight:700;border:none;font-size:20px;">ปิด</button>
        ${canEdit ? `<button class="btn" onclick="editEx('${e.id}')" style="border-radius:14px;height:64px;padding:0 40px;font-weight:700;background:#738aff;color:#fff;border:none;display:flex;align-items:center;gap:12px;font-size:20px;"><i class="fa-solid fa-pencil"></i> แก้ไขใบเบิก</button>` : ''}
      </div>
    </div>
  `;

  openModal('modal-ex-detail');
}

function deleteEx(id) {
  if (!confirm('ยืนยันการลบคำขอนี้? (การลบจะทำให้โควต้าและสถิติเปลี่ยนกลับทันที)')) return;
  const es = getExs();
  const target = es.find(e => String(e.id) === String(id));
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
  const elMonth = document.getElementById('ex-history-month');
  if (!elList || !elMonth) return;

  const all = getExs().filter(e => isUserInvolved(e, cu.email));

  // Refresh months list every time so it stays in sync after delete/add
  const prevSel = elMonth.value;
  const months = [...new Set(all.map(e => monthKey(e.date)).filter(Boolean))].sort().reverse();
  const curMonth = monthKey(new Date().toISOString().split('T')[0]);
  if (!months.includes(curMonth)) months.unshift(curMonth);
  elMonth.innerHTML = months.map(m => {
    const [y, mm] = m.split('-');
    const d = new Date(parseInt(y), parseInt(mm) - 1, 1);
    const label = d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    return `<option value="${m}">${label}</option>`;
  }).join('');
  // Restore previous selection if still valid, otherwise use most recent
  if (prevSel && months.includes(prevSel)) elMonth.value = prevSel;

  const selMonth = elMonth.value;
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

  if (!filtered.length) {
    elList.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);font-size:18px;">ยังไม่มีกิจกรรมในเดือนนี้</div>';
    return;
  }

  // Group by week
  const groups = {};
  filtered.forEach(e => {
    const wk = wkKey(e.date);
    if (!groups[wk]) groups[wk] = [];
    groups[wk].push(e);
  });

  const sortedWeeks = Object.keys(groups).sort().reverse();

  elList.innerHTML = sortedWeeks.map(wk => {
    const items = groups[wk];
    const wkNum = weekOpts.indexOf(wk) + 1;
    const wkLabel = `สัปดาห์ที่ ${wkNum} (${getExWkLabel(wk).replace('สัปดาห์ ', '')})`;

    const wkSolo = items.filter(e => getExType(e) === 'solo' && e.status !== 'rejected').length;
    const wkGrp = items.filter(e => isGroupEx(getExType(e)) && e.status !== 'rejected').length;

    const soloStatus = wkSolo >= 2 ? '<span style="color:var(--green);">แบบเดี่ยว ครบ</span>' : `<span style="color:var(--text3);">แบบเดี่ยว ${wkSolo}/2</span>`;
    const grpStatus = wkGrp >= 1 ? '<span style="color:var(--purple);">แบบกลุ่ม ครบ</span>' : `<span style="color:var(--text3);">แบบกลุ่ม ${wkGrp}/1</span>`;

    const wkSoloItems = items.filter(e => getExType(e) === 'solo');
    const wkGrpItems = items.filter(e => isGroupEx(getExType(e)));

    // Helper for history card
    const renderHistCard = (e) => {
      const et = getExType(e);
      const reward = EX_REWARD[et] || 100;
      const tcolor = et === 'solo' ? 'var(--green)' : et === 'group_ex' ? 'var(--purple)' : 'var(--orange)';

      const allMembers = [
        { email: e.email, name: e.name, kind: 'submitter' },
        ...(e.members || []).map(m => ({ email: m.email, name: m.name, kind: m.type, dept: m.dept }))
      ];

      const count = 1 + (e.members || []).filter(m => m.type === 'sys').length;

      const chips = allMembers.map(m => {
        const isSub = m.kind === 'submitter';
        const icon = isSub ? 'fa-crown' : 'fa-user';
        const iconColor = isSub ? 'var(--yellow)' : '#b37fff';
        return `
          <div style="display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.06);padding:3px 12px;border-radius:12px;font-size:15px;color:var(--text2);border:1px solid rgba(255,255,255,0.02);">
            <i class="fa-solid ${icon}" style="color:${iconColor};font-size:13px;"></i>
            <span style="font-weight:500;">${uNick(m.email, m.name)}</span>
          </div>`;
      }).join('');

      const statusCfg = e.status === 'approved'
        ? { label: 'อนุมัติแล้ว', color: 'var(--green)', bg: 'var(--green-bg)', icon: 'fa-solid fa-circle-check' }
        : e.status === 'rejected'
          ? { label: 'ปฏิเสธ', color: 'var(--red)', bg: 'var(--red-bg)', icon: 'fa-solid fa-circle-xmark' }
          : { label: 'รออนุมัติ', color: 'var(--yellow)', bg: 'var(--yellow-bg)', icon: 'fa-regular fa-clock' };

      return `
        <div style="background:#1a1c26; border-radius:18px; border:1px solid rgba(255,255,255,0.04); padding:15px; position:relative;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span style="font-size:11px; color:var(--text3); font-weight:700; background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px; font-family:var(--mono); border:1px solid rgba(255,255,255,0.03);">ID: ${e.id}</span>
              <span style="font-size:20px; font-weight:700; color:#fff;">${e.activity || 'กิจกรรม'}</span>
              <div style="display:flex; align-items:center; gap:6px;">
                <div style="display:flex; align-items:center; gap:4px; background:${et === 'solo' ? 'rgba(61, 214, 140, 0.12)' : 'rgba(179, 127, 255, 0.12)'}; color:${et === 'solo' ? 'var(--green)' : 'var(--purple)'}; padding:2px 10px; border-radius:20px; font-size:11px; font-weight:700; text-transform:uppercase; border:1px solid ${et === 'solo' ? 'rgba(61, 214, 140, 0.2)' : 'rgba(179, 127, 255, 0.2)'};">
                  ${et === 'solo' ? '<i class="fa-solid fa-user" style="font-size:10px;"></i> เดี่ยว' : '<i class="fa-solid fa-users" style="font-size:10px;"></i> กลุ่ม'}
                </div>
                <div style="display:flex; align-items:center; gap:4px; background:${statusCfg.bg}; color:${statusCfg.color}; padding:2px 10px; border-radius:20px; font-size:11px; font-weight:700; text-transform:uppercase; border:1px solid ${statusCfg.color}33;">
                  <i class="${statusCfg.icon}"></i> ${statusCfg.label}
                </div>
              </div>
            </div>
            <div style="font-size:20px; font-weight:500; color:${tcolor}; font-family:var(--mono);">฿${reward.toLocaleString()}</div>
          </div>

          <div style="display:flex; align-items:center; gap:8px; color:#5a5e7a; font-size:15px; margin-bottom:8px; font-weight:500;">
            <i class="fa-regular fa-calendar" style="font-size:14px;"></i>
            <span>${new Date(e.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:flex-end;">
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
              ${chips}
            </div>
            <button class="btn btn-ghost btn-sm" style="padding:6px 14px; border-radius:8px; font-size:15px; display:flex; align-items:center; gap:8px; color:#9094b8; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.02);" onclick="viewExDetail('${e.id}')">
                <i class="fa-solid fa-magnifying-glass" style="font-size:13px;"></i> รายละเอียด
            </button>
          </div>
        </div>`;
    };

    return `
      <div style="margin-bottom:40px; border-top:1px solid rgba(255,255,255,0.05); padding-top:24px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:16px;">
           <div style="font-size:22px;font-weight:700;color:var(--accent);">${wkLabel}</div>
           <div style="display:flex;gap:12px;font-size:15px;font-weight:600;background:rgba(255,255,255,0.03);padding:8px 20px;border-radius:24px;border:1px solid rgba(255,255,255,0.03);">
             ${soloStatus}
             <div style="width:1px;height:12px;background:rgba(255,255,255,0.1);align-self:center;"></div>
             ${grpStatus}
           </div>
        </div>

        ${wkGrpItems.length ? `
          <div style="margin-bottom:24px;">
            <div class="group-grid">
              ${wkGrpItems.map(renderHistCard).join('')}
            </div>
          </div>
        ` : ''}

        ${wkSoloItems.length ? `
          <div>
            <div class="review-grid">
              ${wkSoloItems.map(renderHistCard).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
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
