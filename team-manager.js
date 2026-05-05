
// ══ CONSTANTS ════════════════════════════
const LT = { sick: '🤒 ลาป่วย', personal: '📋 ลากิจ', vacation: '🏖️ ลาพักร้อน', dental: '🦷 ลาทำฟัน', birthday: '🎂 ลาวันเกิด', funeral: '🕯️ ลาฌาปนกิจ', maternity: '🤱 ลาคลอด', training: '📚 ลาฝึกอบรม', sterilize: '⚕️ ลาทำหมัน', ordain: '🙏 ลาบวช', other: '📌 อื่นๆ' };
const LQ = { sick: { q: 30, n: '' }, personal: { q: 3, n: '' }, vacation: { q: 7, n: '' }, dental: { q: 2, n: 'ส่งบิล' }, birthday: { q: 1, n: '' }, funeral: { q: 7, n: '' }, maternity: { q: 98, n: '' }, training: { q: null, n: 'แจ้ง/อนุมัติ' }, sterilize: { q: null, n: 'แจ้ง/อนุมัติ' }, ordain: { q: null, n: 'แจ้ง/อนุมัติ' }, other: { q: null, n: '' } };
const RDOC = ['sick', 'personal'], ESC = ['sick', 'personal'];
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
  const u = [
    { email: 'pm@team.com', name: 'คุณ PM', role: 'pm', dept: 'Management', pass: hp('admin123'), addedBy: 'system', addedAt: new Date().toISOString() },
    { email: 'lead.uxui@team.com', name: 'คุณหัวหน้า UXUI', role: 'lead', dept: 'UXUI', pass: hp('lead123'), addedBy: 'system', addedAt: new Date().toISOString() },
    { email: 'lead.media@team.com', name: 'คุณหัวหน้า Media', role: 'lead', dept: 'Media', pass: hp('lead123'), addedBy: 'system', addedAt: new Date().toISOString() },
    { email: 'lead.art@team.com', name: 'คุณหัวหน้า Art', role: 'lead', dept: 'Art', pass: hp('lead123'), addedBy: 'system', addedAt: new Date().toISOString() }
  ];
  saveUsers(u); return u;
}

function ensureDefaultAccounts() {
  let users = LS.get('tf_users');
  if (!users || !Array.isArray(users) || !users.length) { initUsers(); return; }
  const adm = hp('admin123'), led = hp('lead123');
  let changed = false;
  const defaults = [
    { email: 'pm@team.com', name: 'คุณ PM', role: 'pm', dept: 'Management', pass: adm },
    { email: 'lead.uxui@team.com', name: 'คุณหัวหน้า UXUI', role: 'lead', dept: 'UXUI', pass: led },
    { email: 'lead.media@team.com', name: 'คุณหัวหน้า Media', role: 'lead', dept: 'Media', pass: led },
    { email: 'lead.art@team.com', name: 'คุณหัวหน้า Art', role: 'lead', dept: 'Art', pass: led }
  ];
  defaults.forEach(d => {
    const existing = users.find(u => u.email === d.email);
    if (existing) { if (existing.pass !== d.pass) { existing.pass = d.pass; changed = true; } }
    else { users.push({ ...d, addedBy: 'system', addedAt: new Date().toISOString() }); changed = true; }
  });
  if (changed) saveUsers(users);
}

// ══ AUTH ═════════════════════════════════
let cu = null, lid = 1, eid = 1;

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
  launchApp();
  if (typeof bootstrap === 'function') {
    bootstrap().then(res => {
      if (res.ok) {
        initIDs(); // Update eid/lid from fresh data
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
function launchApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-app').style.display = 'flex';
  setupSidebar(); initApp();
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
  ({ dashboard: updateDashboard, members: renderMembers, 'leave-review': renderLR, 'leave-pm': renderLP, 'leave-history': () => renderHist('all'), 'leave-balance': renderBal, 'my-balance': renderMyBal, 'exercise-review': renderExR, 'exercise-share': renderExShare, leaderboard: updateLB, 'exercise-log': updateQuota })[id]?.();
}

// ══ INIT ═════════════════════════════════
function initApp() {
  const t = new Date().toISOString().split('T')[0];
  ['leave-start', 'leave-end', 'ex-date'].forEach(id => document.getElementById(id).value = t);
  document.getElementById('leave-name').value = cu.name;
  document.getElementById('ex-name').value = cu.name;
  document.getElementById('bal-year').textContent = new Date().getFullYear();
  document.getElementById('week-label').textContent = '// ' + getWkLabel();
  const ls = getLeaves(), es = getExs();
  lid = ls.length ? Math.max(...ls.map(l => l.id)) + 1 : 1;
  eid = es.length ? Math.max(...es.map(e => e.id)) + 1 : 1;
  setupLeaveFormForRole();
  setupExForm();
  updateDashboard(); updateBadges(); updateQuota();
}

function openLeaveModal() {
  setupLeaveFormForRole();
  clearLeaveForm();
  const t = new Date().toISOString().split('T')[0];
  document.getElementById('leave-start').value = t;
  document.getElementById('leave-end').value = t;
  openModal('modal-leave');
}

function setupLeaveFormForRole() {
  const isMgr = cu.role === 'lead' || cu.role === 'pm';
  document.getElementById('add-for-member-section').style.display = isMgr ? 'block' : 'none';
  if (isMgr) {
    const sel = document.getElementById('for-member-select');
    const members = cu.role === 'pm' ? getUsers().filter(u => ['junior', 'senior', 'lead'].includes(u.role)) : getMyTeamMembers();
    sel.innerHTML = '<option value="">— ยื่นให้ตัวเอง —</option>' + members.map(u => '<option value="' + u.email + '">' + uName(u.email, u.name) + '</option>').join('');
    sel.onchange = () => onLeaveChange();
  }
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
  ['new-name', 'new-nickname', 'new-birth', 'new-email', 'new-pass', 'new-dept'].forEach(id => document.getElementById(id).value = '');
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
  if (users.find(u => u.email.toLowerCase() === email)) { err.textContent = 'อีเมลนี้มีในระบบแล้ว'; err.style.display = 'block'; return; }
  const newUser = { email, name, nickname, birthday: birth, role, dept, pass: hp(pass), addedBy: cu.name, addedAt: new Date().toISOString(), locationType: document.getElementById('new-loc').value || 'bkk' };
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
  document.getElementById('edit-birth').value = u.birthday || '';
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
  const users = getUsers(), idx = users.findIndex(u => u.email === ek); if (idx < 0) return;
  const nickname = document.getElementById('edit-nickname').value.trim(), birth = document.getElementById('edit-birth').value;
  users[idx].name = name; users[idx].nickname = nickname; users[idx].birthday = birth; users[idx].role = role; users[idx].dept = dept; users[idx].locationType = document.getElementById('edit-loc').value || 'bkk'; if (pass && pass.length >= 6) users[idx].pass = hp(pass);
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
function onLeaveChange() {
  const type = document.getElementById('leave-type').value;
  const start = document.getElementById('leave-start').value;
  const end = document.getElementById('leave-end').value;
  const period = document.getElementById('leave-period').value;
  const hints = document.getElementById('leave-hints');
  const docG = document.getElementById('doc-group');
  if (!start || !end || start > end) { hints.innerHTML = ''; docG.style.display = 'none'; return; }
  const isDiff = start && end && start !== end;
  const pGrp = document.getElementById('leave-period-group');
  if (isDiff) {
    pGrp.style.display = 'none';
    document.getElementById('leave-period').value = 'full';
  } else {
    pGrp.style.display = 'block';
  }
  const isHalf = document.getElementById('leave-period').value !== 'full';
  const endEl = document.getElementById('leave-end');
  if (isHalf) { endEl.value = start; endEl.disabled = true; } else { endEl.disabled = false; }
  const rawDays = Math.ceil((new Date(isHalf ? start : end) - new Date(start)) / 864e5) + 1;
  const diff = isHalf ? 0.5 : rawDays;
  const needDoc = RDOC.includes(type) && diff >= 3;
  const willEsc = ESC.includes(type) && diff > 3;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const da = Math.ceil((new Date(start) - today) / 864e5);
  const forMember = (document.getElementById('for-member-select')?.value || '') !== '';
  const needAdv = type !== 'sick' && !forMember;
  const advOk = !needAdv || da >= 7;
  docG.style.display = needDoc ? 'block' : 'none';
  let hs = [];
  if (isHalf) hs.push('<span style="color:var(--accent);">🌓 ลาครึ่งวัน' + (period === 'morning' ? ' (เช้า)' : ' (บ่าย)') + ' = 0.5 วัน</span>');
  if (needAdv && !advOk) hs.push('<span style="color:var(--red);">⏰ ต้องลาล่วงหน้า 7 วัน — ขาดอีก ' + Math.max(0, 7 - da) + ' วัน</span>');
  else if (needAdv && advOk && !isHalf) hs.push('<span style="color:var(--green);">✓ ลาล่วงหน้า ' + da + ' วัน — ผ่านเกณฑ์</span>');
  if (type === 'sick') hs.push('<span style="color:var(--accent);">💊 ลาป่วย — ไม่ต้องลาล่วงหน้า</span>');
  if (forMember) hs.push('<span style="color:var(--purple);">✎ ยื่นแทนสมาชิก — ข้ามกฎลาล่วงหน้า</span>');
  if (willEsc) hs.push('<span style="color:var(--orange);">⚡ ลา ' + diff + ' วัน → จะส่งตรงถึง PM อัตโนมัติ</span>');
  if (needDoc) hs.push('<span style="color:var(--red);">📄 ต้องใส่ลิงก์หลักฐาน / ใบรับรองแพทย์</span>');
  if (type === 'birthday') hs.push('<span style="color:var(--purple);">🎂 หัวหน้าพิจารณาเสมอ</span>');
  if (type === 'dental') hs.push('<span style="color:var(--accent);">🦷 หัวหน้าพิจารณาเสมอ</span>');
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
function submitLeave() {
  const type = document.getElementById('leave-type').value;
  const start = document.getElementById('leave-start').value;
  const period = document.getElementById('leave-period').value;
  const reason = document.getElementById('leave-reason').value.trim();
  const link = document.getElementById('leave-link').value.trim();
  const forMemberEmail = (document.getElementById('for-member-select')?.value || '');
  const isHalf = period !== 'full';
  const end = isHalf ? start : document.getElementById('leave-end').value;
  if (!start || !end) { toast('⚠️ กรุณาเลือกวันที่'); return; }
  if (!reason) { toast('⚠️ กรุณาระบุหมายเหตุ / เหตุผล'); return; }
  if (!isHalf && start > end) { toast('⚠️ วันที่ไม่ถูกต้อง'); return; }
  const rawDays = Math.ceil((new Date(end) - new Date(start)) / 864e5) + 1;
  const diff = isHalf ? 0.5 : rawDays;
  const bypass = type === 'sick' || forMemberEmail !== '';
  if (!bypass) {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const da = Math.ceil((new Date(start) - t) / 864e5);
    if (da < 7) { toast('⏰ ต้องลาล่วงหน้า 7 วัน (ตอนนี้ ' + da + ' วัน)'); return; }
  }
  if (RDOC.includes(type) && diff >= 3 && !link) { toast('⚠️ กรุณาใส่ลิงก์หลักฐาน / ใบรับรองแพทย์'); return; }
  let targetEmail = cu.email, targetName = cu.name;
  if (forMemberEmail) { const m = getUsers().find(u => u.email === forMemberEmail); if (m) { targetEmail = m.email; targetName = m.name; } }
  const isPM = cu.role === 'pm';
  const isLead = cu.role === 'lead';
  let initialStatus = 'pending_lead';
  if (isPM) initialStatus = 'approved';
  else if (isLead) initialStatus = 'pending_pm';

  const ls = getLeaves();
  const newLeave = { id: lid++, name: targetName, email: targetEmail, type, start, end, period, reason, days: diff, isHalf, hasDoc: !!link, docName: link || null, status: initialStatus, autoEscalated: false, isLeadLeave: isLead, addedBy: forMemberEmail ? cu.name : null, submittedAt: new Date().toISOString(), leadAction: null, pmAction: null, leadNote: '', pmNote: '' };
  ls.unshift(newLeave);
  saveLeaves(ls);

  // SYNC TO API
  apiSync('addLeave', newLeave);

  updateBadges(); updateDashboard(); clearLeaveForm(); renderMyBal(); closeModal('modal-leave');
  const who = forMemberEmail ? ' (ให้ ' + targetName + ')' : '';
  let msg = '✅ ยื่นใบลา' + (isHalf ? 'ครึ่งวัน' : ' ' + diff + ' วัน') + who + ' เรียบร้อย';
  if (isPM) msg = '✅ บันทึกใบลา' + (isHalf ? 'ครึ่งวัน' : ' ' + diff + ' วัน') + 'เรียบร้อย (อนุมัติอัตโนมัติ)';
  else if (isLead) msg = '📤 ใบลาของหัวหน้าถูกส่งไปยัง PM เรียบร้อย';
  else msg = '📤 ใบลาถูกส่งไปยังหัวหน้าเพื่อพิจารณาขั้นแรก';
  toast(msg);
}
function clearLeaveForm() {
  ['leave-reason', 'leave-link', 'leave-start', 'leave-end'].forEach(id => {
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
          <div style="font-size:20px;font-weight:700;color:var(--text);">${uName(r.email, r.name)} <span style="font-size:16px;color:var(--text3);font-family:var(--mono);">${r.email}</span></div>
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
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-green btn-sm" onclick="lAct(${r.id},'approve')"><i class="fa-solid fa-check"></i> อนุมัติ</button>
        <button class="btn btn-red btn-sm" onclick="lAct(${r.id},'reject')"><i class="fa-solid fa-xmark"></i> ไม่อนุมัติ</button>
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
  } else {
    r.status = 'rejected';
    toast('✕ ไม่อนุมัติ ' + r.name);
  }
  saveLeaves(ls);
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
          <div style="font-size:20px;font-weight:700;color:var(--text);">${uName(r.email, r.name)} <span style="font-size:16px;color:var(--text3);font-family:var(--mono);">${r.email}</span></div>
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
  apiSync('updateLeave', r);
  toast(action === 'approve' ? '✅ PM อนุมัติ ' + r.name : '✕ PM ไม่อนุมัติ ' + r.name);
  updateBadges(); updateDashboard(); renderLP();
}

// ══ LEAVE HISTORY ════════════════════════
function filterHist(f, btn) { document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); if (btn) btn.classList.add('active'); renderHist(f); }
function renderHist(f) {
  const ve = getVisibleEmails();
  let data = getLeaves().filter(r => ve === null || ve.has(r.email));
  if (f === 'pending') data = data.filter(r => r.status.startsWith('pending'));
  else if (f !== 'all') data = data.filter(r => r.status === f);
  const tb = document.getElementById('hist-tbody');
  if (!data.length) { tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:20px;">ไม่มีรายการ</td></tr>'; return; }
  const ch = { pending_lead: '<span class="chip chip-pending">รอหัวหน้า</span>', pending_pm: '<span class="chip chip-escalated">รอ PM</span>', approved: '<span class="chip chip-approved">อนุมัติ</span>', rejected: '<span class="chip chip-rejected">ปฏิเสธ</span>' };
  tb.innerHTML = data.map(r => {
    const dLabel = r.isHalf ? (r.period === 'morning' ? '½เช้า' : '½บ่าย') : r.days + 'd';
    return `<tr>
      <td><div class="name">${uName(r.email, r.name)}</div>${r.hasDoc ? (r.docName?.startsWith('http') ? `<a href="${r.docName}" target="_blank" style="text-decoration:none;font-size:14px;background:var(--green-bg);color:var(--green);padding:1px 6px;border-radius:20px;">📄</a>` : '<span style="background:var(--green-bg);color:var(--green);font-size:14px;padding:1px 6px;border-radius:20px;">📄</span>') : ''}${r.addedBy ? '<span style="color:var(--purple);font-size:14px;"> ✎' + r.addedBy + '</span>' : ''}</td>
      <td>${LT[r.type]}</td>
      <td><span class="meta">${r.start}${r.start !== r.end ? ' → ' + r.end : ''}</span><br><span style="font-size:15px;color:var(--yellow);font-family:var(--mono);">${dLabel}</span></td>
      <td>${ch[r.status] || ''}</td>
      <td>${bFlow(r)}</td>
    </tr>`;
  }).join('');
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
function renderBal() {
  document.getElementById('bal-year').textContent = new Date().getFullYear();
  const isPM = cu.role === 'pm'; document.getElementById('pm-reset-wrap').style.display = isPM ? 'flex' : 'none';
  const members = getMyTeamMembers();
  const tabs = document.getElementById('bal-tabs'), nd = document.getElementById('bal-nodata'), cont = document.getElementById('bal-content');
  if (!members.length) {
    nd.style.display = 'block'; nd.innerHTML = '<div style="color:var(--text3);text-align:center;padding:32px;"><div style="font-size:36px;">👥</div><div style="font-size:18px;color:var(--text2);margin-top:8px;">ยังไม่มีสมาชิกในทีม</div></div>';
    cont.innerHTML = ''; tabs.innerHTML = ''; const ov = document.getElementById('bal-overview'); if (ov) ov.innerHTML = ''; return;
  }
  nd.style.display = 'none';
  if (!selMember || !members.find(u => u.email === selMember)) selMember = members[0].email;
  renderBalOverview(members, isPM);
  tabs.innerHTML = members.map(u => '<button onclick="selMb(\'' + u.email + '\')" style="padding:7px 16px;border-radius:20px;font-size:17px;font-weight:500;cursor:pointer;border:1px solid ' + (u.email === selMember ? 'rgba(108,138,255,.3)' : 'var(--border)') + ';background:' + (u.email === selMember ? 'rgba(108,138,255,.15)' : 'var(--surface2)') + ';color:' + (u.email === selMember ? 'var(--accent)' : 'var(--text2)') + ';font-family: Google Sans, Noto Sans Thai, sans-serif;transition:all .15s;">' + u.name + '</button>').join('');
  document.getElementById('bal-detail-label').style.display = 'block';
  renderBalTable(selMember, isPM);
}
function selMb(e) { selMember = e; document.getElementById('bal-detail-label').style.display = 'block'; renderBal(); }
function renderBalOverview(members, isPM) {
  const ls = getLeaves(), qs = getQs(), yr = new Date().getFullYear();
  const fixedTypes = Object.keys(LQ).filter(t => LQ[t].q !== null);
  const rows = members.map(u => {
    const cells = fixedTypes.map(type => {
      const def = LQ[type], cq = qs[u.email]?.[type] ?? null, effQ = cq !== null ? cq : def.q;
      const used = ls.filter(r => r.email === u.email && r.type === type && r.status === 'approved').reduce((s, r) => s + r.days, 0);
      const rem = Math.max(0, effQ - used), c = rem === 0 ? 'var(--red)' : rem <= 2 ? 'var(--yellow)' : 'var(--green)';
      return '<td style="text-align:center;font-family:var(--mono);font-size:17px;"><span style="font-weight:700;color:' + c + ';">' + rem + '</span><span style="color:var(--text3);font-size:15px;">/' + effQ + '</span></td>';
    }).join('');
    return '<tr><td><div class="name">' + uName(u.email, u.name) + '</div><div class="meta">' + u.email + '</div></td>' + cells + '</tr>';
  }).join('');
  const ths = fixedTypes.map(t => '<th style="text-align:center;white-space:nowrap;">' + LT[t].replace(/^\S+\s/, '') + '</th>').join('');
  document.getElementById('bal-overview').innerHTML = '<div class="card" style="margin-bottom:16px;"><div class="card-title">◈ ภาพรวมวันลาทั้งทีม — ปี ' + yr + '</div><div style="font-size:16px;color:var(--text3);margin-bottom:12px;">ตัวเลข = วันคงเหลือ/โควต้า &nbsp;|&nbsp; <span style="color:var(--red);">แดง</span>=หมด &nbsp;<span style="color:var(--yellow);">เหลือง</span>=น้อย</div><div class="table-wrap"><table><thead><tr><th>สมาชิก</th>' + ths + '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}
function renderBalTable(email, isPM) {
  const user = getUsers().find(u => u.email === email); if (!user) return;
  const ls = getLeaves(), qs = getQs(), cont = document.getElementById('bal-content');
  const rows = Object.keys(LQ).map(type => {
    const def = LQ[type], cq = qs[email]?.[type] ?? null, effQ = cq !== null ? cq : def.q, isC = cq !== null;
    const used = ls.filter(r => r.email === email && r.type === type && r.status === 'approved').reduce((s, r) => s + r.days, 0);
    const pend = ls.filter(r => r.email === email && r.type === type && r.status.startsWith('pending')).length;
    if (def.q !== null) {
      const rem = Math.max(0, effQ - used), pct = effQ > 0 ? Math.min(100, (used / effQ) * 100) : 0;
      const bc = pct >= 90 ? 'bar-danger' : pct >= 60 ? 'bar-warn' : 'bar-ok', rc = rem === 0 ? 'var(--red)' : rem <= 2 ? 'var(--yellow)' : 'var(--green)';
      const qCell = isPM ? '<div style="display:flex;align-items:center;gap:6px;"><input type="number" min="0" max="365" value="' + effQ + '" id="qi-' + email.replace(/[@.]/g, '-') + '-' + type + '" style="width:60px;padding:4px 8px;font-size:17px;text-align:center;" /><button onclick="saveQ(\'' + email + '\',\'' + type + '\')" style="padding:4px 10px;font-size:16px;background:var(--green);color:#0e0f14;border:none;border-radius:6px;cursor:pointer;font-weight:700;">บันทึก</button>' + (isC ? '<span style="font-size:14px;color:var(--orange);">✎</span>' : '') + '</div>' : '<span style="font-family:var(--mono);color:var(--text2);">' + effQ + '</span>';
      return '<tr><td>' + LT[type] + (def.n ? ' <span style="font-size:15px;color:var(--text3);">(' + def.n + ')</span>' : '') + '</td><td>' + qCell + '</td><td style="font-family:var(--mono);color:var(--text2);">' + used.toFixed(1).replace(/\.0$/, '') + (pend ? '<span style="font-size:14px;background:var(--yellow-bg);color:var(--yellow);padding:1px 6px;border-radius:20px;margin-left:4px;">+' + pend + ' รอ</span>' : '') + '</td><td style="font-weight:700;color:' + rc + ';font-family:var(--mono);">' + rem.toFixed(1).replace(/\.0$/, '') + '</td><td style="min-width:100px;"><div class="bar-track"><div class="bar-fill ' + bc + '" style="width:' + pct.toFixed(0) + '%"></div></div><div style="font-size:14px;color:var(--text3);margin-top:3px;font-family:var(--mono);">' + pct.toFixed(0) + '%</div></td></tr>';
    } else {
      const appr = ls.filter(r => r.email === email && r.type === type && r.status === 'approved').length;
      return '<tr><td>' + LT[type] + ' <span style="font-size:15px;color:var(--text3);">(' + def.n + ')</span></td><td><span class="notify-badge">แจ้ง/อนุมัติ</span></td><td style="font-family:var(--mono);color:var(--text2);">' + appr + ' ครั้ง' + (pend ? '<span style="font-size:14px;background:var(--yellow-bg);color:var(--yellow);padding:1px 6px;border-radius:20px;margin-left:4px;">+' + pend + ' รอ</span>' : '') + '</td><td>—</td><td>—</td></tr>';
    }
  }).join('');
  cont.innerHTML = (isPM ? '<div class="info-box" style="margin-bottom:16px;">✎ PM สามารถแก้ไขโควต้าได้โดยตรง</div>' : '<div style="font-size:16px;color:var(--text3);margin-bottom:12px;font-family:var(--mono);">// แสดงผลเท่านั้น</div>') + '<div class="card"><div class="card-title">◈ รายละเอียดวันลาของ ' + uName(user.email, user.name) + '</div><div class="table-wrap"><table class="balance-table"><thead><tr><th>ประเภท</th><th>โควต้า' + (isPM ? ' (แก้ได้)' : '') + '</th><th>ใช้แล้ว</th><th>คงเหลือ</th><th>%</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}
function saveQ(email, type) {
  const k = 'qi-' + email.replace(/[@.]/g, '-') + '-' + type; const v = parseInt(document.getElementById(k)?.value);
  if (isNaN(v) || v < 0) { toast('⚠️ กรอกตัวเลขที่ถูกต้อง'); return; }
  const q = getQs(); if (!q[email]) q[email] = {}; q[email][type] = v;
  saveQs(q);
  apiSync('updateQuotas', { email, data: q[email] });
  toast('✅ บันทึกโควต้า ' + LT[type] + ' = ' + v + ' วัน'); renderBal();
}
function confirmReset() {
  document.getElementById('conf-title').textContent = 'รีเซตประจำปี';
  document.getElementById('conf-body').innerHTML = 'รีเซตโควต้าทั้งหมดกลับค่าเริ่มต้นสำหรับปี ' + new Date().getFullYear() + '?';
  document.getElementById('conf-ok').onclick = doReset; openModal('modal-confirm');
}
function doReset() { saveQs({}); closeModal('modal-confirm'); toast('🔄 รีเซตโควต้าเรียบร้อย'); renderBal(); }

// ══ MY BALANCE (member) ══════════════════
function renderMyBal() {
  const yr = new Date().getFullYear(); document.getElementById('my-bal-year').textContent = yr;
  const ls = getLeaves(), qs = getQs(), mine = ls.filter(r => r.email === cu.email);
  const chips = [];
  Object.keys(LQ).filter(t => LQ[t].q !== null).forEach(type => {
    const def = LQ[type], cq = qs[cu.email]?.[type] ?? null, effQ = cq !== null ? cq : def.q;
    const used = mine.filter(r => r.type === type && r.status === 'approved').reduce((s, r) => s + r.days, 0);
    const rem = Math.max(0, effQ - used);
    if (rem === 0) chips.push({ label: LT[type], rem, effQ, color: 'var(--red)', bg: 'var(--red-bg)', icon: '⚠️' });
    else if (rem <= 2) chips.push({ label: LT[type], rem, effQ, color: 'var(--yellow)', bg: 'var(--yellow-bg)', icon: '⏰' });
  });
  document.getElementById('my-bal-chips').innerHTML = chips.length
    ? chips.map(c => '<div style="padding:10px 16px;border-radius:var(--radius-sm);background:' + c.bg + ';border:1px solid ' + c.color + '40;display:flex;align-items:center;gap:8px;"><span>' + c.icon + '</span><div><div style="font-size:17px;font-weight:700;color:' + c.color + ';">' + c.label + '</div><div style="font-size:15px;color:' + c.color + ';font-family:var(--mono);">เหลือ ' + c.rem + '/' + c.effQ + '</div></div></div>').join('')
    : '<div style="padding:10px 16px;border-radius:var(--radius-sm);background:var(--green-bg);border:1px solid rgba(61,214,140,.3);display:flex;align-items:center;gap:8px;"><span>✅</span><div style="font-size:17px;font-weight:500;color:var(--green);">วันลาทุกประเภทยังเหลือพอ</div></div>';
  const rows = Object.keys(LQ).map(type => {
    const def = LQ[type], cq = qs[cu.email]?.[type] ?? null, effQ = cq !== null ? cq : def.q;
    const used = mine.filter(r => r.type === type && r.status === 'approved').reduce((s, r) => s + r.days, 0);
    const pend = mine.filter(r => r.type === type && r.status.startsWith('pending')).length;
    const pb = pend ? '<span style="font-size:14px;background:var(--yellow-bg);color:var(--yellow);padding:1px 6px;border-radius:20px;margin-left:4px;">+' + pend + ' รอ</span>' : '';
    if (def.q !== null) {
      const rem = Math.max(0, effQ - used), pct = effQ > 0 ? Math.min(100, (used / effQ) * 100) : 0;
      const bc = pct >= 90 ? 'bar-danger' : pct >= 60 ? 'bar-warn' : 'bar-ok', rc = rem === 0 ? 'var(--red)' : rem <= 2 ? 'var(--yellow)' : 'var(--green)';
      return '<tr><td>' + LT[type] + (def.n ? ' <span style="font-size:15px;color:var(--text3);">(' + def.n + ')</span>' : '') + '</td><td style="font-family:var(--mono);color:var(--text2);">' + effQ + '</td><td style="font-family:var(--mono);color:var(--text2);">' + used.toFixed(1).replace(/\.0$/, '') + pb + '</td><td><span style="font-size:24px;font-weight:500;font-family:var(--mono);color:' + rc + ';">' + rem.toFixed(1).replace(/\.0$/, '') + '</span><span style="font-size:15px;color:var(--text3);"> วัน</span></td><td style="min-width:120px;"><div class="bar-track"><div class="bar-fill ' + bc + '" style="width:' + pct.toFixed(0) + '%"></div></div><div style="font-size:14px;color:var(--text3);margin-top:3px;font-family:var(--mono);">' + pct.toFixed(0) + '%</div></td></tr>';
    } else {
      const appr = mine.filter(r => r.type === type && r.status === 'approved').length;
      return '<tr><td>' + LT[type] + ' <span style="font-size:15px;color:var(--text3);">(' + def.n + ')</span></td><td><span class="notify-badge">แจ้ง/อนุมัติ</span></td><td style="font-family:var(--mono);color:var(--text2);">' + appr + ' ครั้ง' + pb + '</td><td>—</td><td>—</td></tr>';
    }
  }).join('');
  document.getElementById('my-bal-tbody').innerHTML = rows;
  const histEl = document.getElementById('my-leave-hist'), rec = mine.slice(0, 10);
  if (!rec.length) { histEl.innerHTML = '<div style="color:var(--text3);font-size:17px;">ยังไม่มีประวัติการลา</div>'; return; }
  const sc = { pending_lead: '<span class="chip chip-pending">รอหัวหน้า</span>', pending_pm: '<span class="chip chip-escalated">รอ PM</span>', approved: '<span class="chip chip-approved">อนุมัติ</span>', rejected: '<span class="chip chip-rejected">ปฏิเสธ</span>' };
  histEl.innerHTML = '<div class="table-wrap"><table><thead><tr><th>ประเภท</th><th>วันที่</th><th>จำนวน</th><th>สถานะ</th></tr></thead><tbody>' + rec.map(r => '<tr><td>' + LT[r.type] + '</td><td><span class="meta">' + r.start + (r.start !== r.end ? ' → ' + r.end : '') + '</span></td><td><span style="font-family:var(--mono);font-weight:700;color:var(--yellow);">' + (r.isHalf ? (r.period === 'morning' ? '½เช้า' : '½บ่าย') : r.days + 'd') + '</span></td><td>' + (sc[r.status] || '') + '</td></tr>').join('') + '</tbody></table></div>';
}

// ══ EXERCISE ═════════════════════════════
let exMembers = [];
let _editingExId = null;
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
  const vDate = quotaViewDate;
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
    const total = reward * count;
    const summary = `
      <div style="margin-bottom:12px;padding:12px;background:var(--surface3);border-radius:8px;border:1px solid var(--border);">
        <div style="font-size:16px;color:var(--text3);margin-bottom:4px;">ข้อมูลการยื่นเบิก</div>
        <div style="font-size:20px;font-weight:700;color:var(--accent);">${EX_LABEL[exType]}</div>
        <div style="margin-top:8px;"><b>กิจกรรม:</b> ${act}</div>
        <div><b>วันที่:</b> ${date}</div>
        ${isGroupEx(exType) ? `<div><b>สมาชิก:</b> ${count} คน (รวมคุณ)</div>` : ''}
        <div style="margin-top:8px;font-size:22px;color:var(--green);font-weight:500;">ยอดเงินรางวัล: ฿${total}</div>
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
    id: eid++,
    name: cu.name,
    email: cu.email,
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
function setExReviewMonth(mk) { _exReviewMonth = mk; renderExR(); }
function setExReviewTab(t) { _exReviewTab = t; renderExR(); }
function setExReviewSort(s) { _exReviewSort = s; renderExR(); }

function renderExR() {
  const wrap = document.getElementById('ex-review-container');
  if (!wrap) return;
  if (cu.role !== 'pm') {
    wrap.innerHTML = '<div class="card"><div style="color:var(--text3);text-align:center;padding:20px;font-size:17px;">เฉพาะ PM เท่านั้น</div></div>';
    return;
  }

  const all = getExs();
  const today = new Date().toISOString().split('T')[0];

  // ── Month options (last 6 → next 1) ─────────────────────────────────────
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

  const monthSel = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;background:rgba(255,255,255,0.015);padding:16px 20px;border-radius:16px;border:1px solid rgba(255,255,255,0.03);margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:40px;height:40px;background:var(--accent-bg);color:var(--accent);display:flex;align-items:center;justify-content:center;border-radius:10px;font-size:20px;"><i class="fa-solid fa-calendar-days"></i></div>
        <div>
          <div style="font-size:14px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">รอบการเบิก</div>
          <select onchange="setExReviewMonth(this.value)" style="background:transparent;border:none;color:#fff;font-size:18px;font-weight:700;padding:0;cursor:pointer;outline:none;font-family:inherit;">
            ${monthOpts.map(m => {
    const [y2, m2] = m.split('-').map(Number);
    const label = new Date(y2, m2 - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    return `<option value="${m}" ${m === mk ? 'selected' : ''} style="background:#1a1c26;color:#fff;">${label}</option>`;
  }).join('')}
          </select>
        </div>
      </div>
      <div style="background:rgba(255,255,255,0.05);padding:8px 16px;border-radius:12px;font-family:var(--mono);color:#9094b8;font-size:15px;border:1px solid rgba(255,255,255,0.02);">${rangeLabel}</div>
    </div>`;

  // ── Filter & Sort ────────────────────────────────────────────────────────
  const inMonth = all.filter(e => monthKey(e.date) === mk);

  const sorted = [...inMonth].sort((a, b) => {
    if (_exReviewSort === 'week') {
      const wa = wkKey(a.date);
      const wb = wkKey(b.date);
      if (wa !== wb) return wb.localeCompare(wa); // Newer weeks first
    }
    // Default or within same week: Sort by submission date (newest first)
    return new Date(b.submittedAt || b.date) - new Date(a.submittedAt || a.date);
  });

  // Build Week Options for calculation
  const weekOpts = [];
  const [y, m] = mk.split('-').map(Number);
  const dStart = new Date(y, m - 1, 19), dEnd = new Date(y, m, 18);
  let currW = new Date(dStart);
  while (currW <= dEnd) {
    const wKey = wkKey(currW);
    if (!weekOpts.includes(wKey)) weekOpts.push(wKey);
    currW.setDate(currW.getDate() + 1);
  }

  // ── Summary stats ────────────────────────────────────────────────────────
  const pending = sorted.filter(e => e.status === 'pending');
  const approved = sorted.filter(e => e.status === 'approved');
  const rejected = sorted.filter(e => e.status === 'rejected');
  const totalMoney = approved.reduce((s, e) => s + (EX_REWARD[getExType(e)] || 100) * (1 + (e.members || []).filter(m => m.type === 'sys').length), 0);

  const statBox = (label, val, color) =>
    `<div style="flex:1;min-width:110px;background:#1a1c26;border:1px solid rgba(255,255,255,0.03);border-radius:16px;padding:16px;text-align:center;">
       <div style="font-size:24px;font-weight:500;font-family:var(--mono);color:${color};">${val}</div>
       <div style="font-size:14px;color:var(--text3);margin-top:4px;font-weight:500;">${label}</div>
     </div>`;

  const statsHtml = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:32px;">
      ${statBox('รออนุมัติ', pending.length, 'var(--yellow)')}
      ${statBox('อนุมัติแล้ว', approved.length, 'var(--green)')}
      ${statBox('ปฏิเสธ', rejected.length, 'var(--red)')}
      ${statBox('ยอดเงินรางวัล', '฿' + totalMoney.toLocaleString(), 'var(--accent)')}
    </div>`;

  // ── Compact row renderer ─────────────────────────────────────────────────
  // ── Card row renderer ──────────────────────────────────────────────────
  const renderRow = (e, showApproveBtn) => {
    const et = getExType(e);
    const reward = EX_REWARD[et] || 100;
    const tcolor = et === 'solo' ? 'var(--green)' : et === 'group_ex' ? 'var(--purple)' : 'var(--orange)';
    const count = 1 + (e.members || []).filter(m => m.type === 'sys').length;
    const proofLink = e.proofLink || (e.proofDoc?.startsWith('http') ? e.proofDoc : '');
    const proofLinks = e.proofLinks || [];
    const totalLinks = (proofLink ? 1 : 0) + proofLinks.length;
    const wkNum = weekOpts.indexOf(wkKey(e.date)) + 1;
    const isGrp = isGroupEx(et);

    const allMembers = [
      { email: e.email, name: e.name, kind: 'submitter' },
      ...(e.members || []).map(m => ({ email: m.email, name: m.name, kind: m.type, dept: m.dept }))
    ];

    const chips = allMembers.map(m => {
      const isSub = m.kind === 'submitter';
      const icon = isSub ? 'fa-crown' : 'fa-user';
      const iconColor = isSub ? 'var(--yellow)' : '#b37fff';
      return `
        <div style="display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.06);padding:3px 12px;border-radius:12px;font-size:14px;color:var(--text2);border:1px solid rgba(255,255,255,0.02);">
          <i class="fa-solid ${icon}" style="color:${iconColor};font-size:12px;"></i>
          <span style="font-weight:500;">${uNick(m.email, m.name)}</span>
        </div>`;
    }).join('');

    const indicatorColor = showApproveBtn === 'pending' ? 'var(--yellow)' : 'var(--green)';

    return `
      <div style="background:#1a1c26; border-radius:18px; border:1px solid rgba(255,255,255,0.04); padding:15px; margin-bottom:12px; position:relative; box-shadow:0 4px 20px rgba(0,0,0,0.2);">
        <!-- Top Row: Name & Reward -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0px;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span style="font-size:22px; font-weight:700; color:#fff;">${e.activity || 'กิจกรรม'}</span>
            <span style="font-size:17px; color:#9094b8; font-weight:500;">(${EX_LABEL[et]})</span>
            <span style="background:#f5c842; color:#000; padding:1px 8px; border-radius:6px; font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Week ${wkNum}</span>
          </div>
          <div style="font-size:22px; font-weight:500; color:${tcolor}; font-family:var(--mono);">฿${(reward * count).toLocaleString()}</div>
        </div>

        <!-- Meta Row: Date -->
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
              <button class="btn btn-green btn-sm" style="padding:6px 14px; border-radius:8px; font-size:15px; font-weight:500; display:flex; align-items:center; gap:8px;" onclick="event.stopPropagation();apprEx(${e.id})">
                <i class="fa-solid fa-check" style="font-size:13px;"></i> อนุมัติ
              </button>
              <button class="btn btn-red btn-sm" style="padding:6px 14px; border-radius:8px; font-size:15px; font-weight:500; display:flex; align-items:center; gap:8px;" onclick="event.stopPropagation();rejEx(${e.id})">
                <i class="fa-solid fa-xmark" style="font-size:13px;"></i> ไม่อนุมัติ
              </button>
            ` : ''}

            ${showApproveBtn === 'approved' ? `
              <button class="btn btn-ghost btn-sm" style="padding:6px 14px; border-radius:8px; font-size:15px;" onclick="event.stopPropagation();revertExToPending(${e.id})">
                <i class="fa-solid fa-angles-left"></i> รออนุมัติ
              </button>
            ` : ''}

            <button class="btn btn-ghost btn-sm" style="padding:6px 14px; border-radius:8px; font-size:15px; display:flex; align-items:center; gap:8px; color:#9094b8; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.02);" onclick="viewExDetail(${e.id})">
                <i class="fa-solid fa-magnifying-glass" style="font-size:13px;"></i> รายละเอียด
            </button>
          </div>
        </div>
      </div>`;
  };

  // ── Section builder ──────────────────────────────────────────────────────
  const section = (title, items, showApprove, isGrid = false) => {
    if (!items.length) return `
      <div style="margin-bottom:20px;">
        <div style="font-size:22px; font-weight:700; color:#fff; margin-bottom:12px;">${title}</div>
        <div style="padding:16px; font-size:16px; color:#5a5e7a; background:rgba(255,255,255,0.01); border-radius:12px; border:1px dashed rgba(255,255,255,0.05); text-align:center;">— ไม่มีรายการ —</div>
      </div>`;
    return `
      <div style="margin-bottom:32px;">
        <div style="font-size:22px; font-weight:700; color:#fff; margin-bottom:12px;">${title}</div>
        <div class="${isGrid ? 'review-grid' : ''}">
          ${items.map(e => renderRow(e, showApprove)).join('')}
        </div>
      </div>`;
  };

  const pendingGroup = pending.filter(e => isGroupEx(getExType(e)));
  const pendingSolo = pending.filter(e => !isGroupEx(getExType(e)));
  const apprGroup = approved.filter(e => isGroupEx(getExType(e)));
  const apprSolo = approved.filter(e => !isGroupEx(getExType(e)));

  const tabsHtml = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:24px; flex-wrap:wrap;">
      <div style="display:flex; gap:12px; background:rgba(255,255,255,0.02); padding:6px; border-radius:16px; border:1px solid rgba(255,255,255,0.03); flex:1; min-width:300px;">
        <button onclick="setExReviewTab('pending')" style="flex:1; padding:12px; border-radius:12px; border:none; cursor:pointer; font-size:17px; font-weight:600; display:flex; align-items:center; justify-content:center; gap:8px; transition:all 0.2s; background:${_exReviewTab === 'pending' ? 'var(--yellow-bg)' : 'transparent'}; color:${_exReviewTab === 'pending' ? 'var(--yellow)' : '#5a5e7a'};">
          <i class="fa-solid fa-hourglass-half" style="font-size:15px;"></i> รออนุมัติ
          <span style="background:${_exReviewTab === 'pending' ? 'var(--yellow)' : 'rgba(255,255,255,0.05)'}; color:${_exReviewTab === 'pending' ? '#000' : '#5a5e7a'}; padding:0 8px; border-radius:6px; font-size:14px; font-weight:700;">${pending.length}</span>
        </button>
        <button onclick="setExReviewTab('approved')" style="flex:1; padding:12px; border-radius:12px; border:none; cursor:pointer; font-size:17px; font-weight:600; display:flex; align-items:center; justify-content:center; gap:8px; transition:all 0.2s; background:${_exReviewTab === 'approved' ? 'var(--green-bg)' : 'transparent'}; color:${_exReviewTab === 'approved' ? 'var(--green)' : '#5a5e7a'};">
          <i class="fa-solid fa-circle-check" style="font-size:15px;"></i> อนุมัติแล้ว
          <span style="background:${_exReviewTab === 'approved' ? 'var(--green)' : 'rgba(255,255,255,0.05)'}; color:${_exReviewTab === 'approved' ? '#000' : '#5a5e7a'}; padding:0 8px; border-radius:6px; font-size:14px; font-weight:700;">${approved.length}</span>
        </button>
      </div>

      <div style="display:flex;align-items:center;gap:12px;background:rgba(255,255,255,0.02);padding:8px 16px;border-radius:16px;border:1px solid rgba(255,255,255,0.03);height:62px;">
        <div style="width:32px;height:32px;background:rgba(255,255,255,0.05);color:var(--text3);display:flex;align-items:center;justify-content:center;border-radius:8px;font-size:14px;"><i class="fa-solid fa-arrow-down-wide-short"></i></div>
        <div>
          <div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">เรียงตาม</div>
          <select onchange="setExReviewSort(this.value)" style="background:transparent;border:none;color:#fff;font-size:15px;font-weight:600;padding:0;cursor:pointer;outline:none;font-family:inherit;">
            <option value="date" ${_exReviewSort === 'date' ? 'selected' : ''} style="background:#1a1c26;color:#fff;">วันที่ล่าสุด</option>
            <option value="week" ${_exReviewSort === 'week' ? 'selected' : ''} style="background:#1a1c26;color:#fff;">ตามสัปดาห์</option>
          </select>
        </div>
      </div>
    </div>
  `;

  let contentHtml = '';
  if (_exReviewTab === 'pending') {
    contentHtml = section('แบบกลุ่ม', pendingGroup, 'pending') + section('แบบเดี่ยว', pendingSolo, 'pending', true);
  } else {
    contentHtml = section('แบบกลุ่ม', apprGroup, 'approved') + section('แบบเดี่ยว', apprSolo, 'approved', true);
  }

  wrap.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      ${monthSel}
    </div>
    <div class="card" style="margin-bottom:16px;">
      <div class="card-title" style="margin-bottom:14px; font-size:18px;">📊 สรุปรอบ ${moName}</div>
      ${statsHtml}
    </div>
    <div style="margin-top:32px;">
      ${tabsHtml}
      ${contentHtml}
    </div>`;
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
          ${(!locked || (cu.role === 'pm' && e.status === 'approved')) && isMe && !isSubmitter && count > 3 ? `<button onclick="leaveExGroup(${e.id})" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;margin-left:4px;padding:0;">✕</button>` : ''}
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
        ? `<button class="btn btn-primary" style="flex:2;justify-content:center;height:48px;border-radius:14px;font-size:16px;" onclick="joinExGroup(${e.id})"><i class="fa-solid fa-plus" style="margin-right:8px;"></i> เข้าร่วมกลุ่ม</button>`
        : ''}
          ${(!locked || (cu.role === 'pm' && e.status === 'approved')) && userInvolved && !userIsSubmitter
        ? `<button class="btn btn-red" style="flex:2;justify-content:center;height:48px;border-radius:14px;font-size:16px;" onclick="leaveExGroup(${e.id})"><i class="fa-solid fa-xmark" style="margin-right:8px;"></i> ถอนตัวออกจากกลุ่ม</button>`
        : ''}
          <button class="btn btn-ghost" style="flex:1;justify-content:center;height:48px;border-radius:14px;background:var(--surface3);font-size:16px;" onclick="viewExDetail(${e.id})">รายละเอียด <i class="fa-solid fa-chevron-right" style="margin-left:8px;font-size:12px;opacity:0.6;"></i></button>
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
      sC, sR: sC * 100, sAR: sA * 100,
      gexC, gexR: gexC * 500, gexAR: gexA * 500,
      geC, geR: geC * 300, geAR: geA * 300,
      total: (sC * 100) + (gexC * 500) + (geC * 300),
      totalA: (sA * 100) + (gexA * 500) + (geA * 300)
    };
  });

  const summaryEl = document.getElementById('lb-summary-table');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div style="margin-bottom:12px;font-size:16px;color:var(--text3);">รอบการคำนวณเงินรางวัล: ${rangeLabel} <span style="margin-left:12px;">(ตัวเลขในวงเล็บ = อนุมัติแล้ว)</span></div>
      <div class="table-wrap" style="border:1px solid var(--border);border-radius:12px;overflow-x:auto;">
        <table class="balance-table" style="font-size:15px; min-width: 800px;">
          <thead style="background:var(--surface3);">
            <tr>
              <th rowspan="2" style="text-align:left;font-size:16px;">ชื่อ-นามสกุล</th>
              <th colspan="2" style="background:rgba(61,214,140,0.1);color:var(--green);">แบบเดี่ยว (100)</th>
              <th colspan="2" style="background:rgba(191,123,255,0.1);color:var(--purple);">แบบกลุ่มออก (500)</th>
              <th colspan="2" style="background:rgba(255,171,0,0.1);color:var(--orange);">แบบกลุ่มกิน (300)</th>
              <th rowspan="2" style="background:var(--surface2);font-weight:500;font-size:16px;">รวม (อนุมัติ)</th>
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
                  <div style="font-weight:500;">${s.name}</div>
                  <div style="font-size:14px;color:var(--text3);">*${s.nick}*</div>
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
  document.getElementById('d-exs').innerHTML = es.slice(0, 4).map(e => '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="viewExDetail(' + e.id + ')"><div><div style="font-weight:500;color:var(--text);">' + uName(e.email, e.name) + ' — ' + e.activity + '</div><div style="font-size:16px;color:var(--text3);font-family:var(--mono);">' + (e.type === 'solo' ? '🏃' : '🏋️') + ' ' + e.date + ' (W' + getWkNum(e.date) + ') • ' + e.duration + 'min</div></div><div style="display:flex;align-items:center;gap:8px;">' + (e.status === 'approved' ? '<span class="chip chip-approved">✓</span>' : e.status === 'rejected' ? '<span class="chip chip-rejected">✕</span>' : '<span class="chip chip-pending">รอ</span>') + '<button class="btn btn-ghost btn-sm" style="padding:4px 8px;font-size:15px;" onclick="event.stopPropagation();viewExDetail(' + e.id + ')"><i class="fa-solid fa-magnifying-glass"></i> รายละเอียด</button></div></div>').join('') || '<div style="color:var(--text3);font-size:17px;">ยังไม่มีรายการ</div>';
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
function toast(msg) { const el = document.getElementById('toast'); el.innerHTML = msg; el.classList.add('show'); clearTimeout(_tt); _tt = setTimeout(() => el.classList.remove('show'), 3200); }
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

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
  const es = getExs(), e = es.find(x => x.id === id);
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
        <div style="font-size:14px;color:#5a5e7a;margin-bottom:6px;font-weight:500;">คำขอเบิกรางวัล</div>
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
          <button class="btn" onclick="saveProofLink(${e.id})" style="height:64px;padding:0 32px;border-radius:14px;font-weight:700;background:rgba(255,255,255,0.08);color:#fff;border:none;font-size:18px;">แนบเพิ่ม</button>
        </div>
      </div>
    </div>
  `;

  actions.innerHTML = `
    <div style="display:flex;width:100%;justify-content:space-between;align-items:center;margin-top:32px;padding-top:32px;border-top:1px solid rgba(255,255,255,0.03);">
      <button class="btn" onclick="deleteEx(${e.id})" style="color:#ff6b6b;background:rgba(255,107,107,0.1);border-radius:14px;height:64px;padding:0 32px;font-weight:700;border:none;font-size:20px;">
        <i class="fa-solid fa-trash-can" style="margin-right:12px;"></i> ลบ
      </button>
      <div style="display:flex;gap:16px;">
        <button class="btn" onclick="closeModal('modal-ex-detail')" style="background:rgba(255,255,255,0.08);color:#9094b8;border-radius:14px;height:64px;padding:0 32px;font-weight:700;border:none;font-size:20px;">ปิด</button>
        ${canEdit ? `<button class="btn" onclick="editEx(${e.id})" style="border-radius:14px;height:64px;padding:0 40px;font-weight:700;background:#738aff;color:#fff;border:none;display:flex;align-items:center;gap:12px;font-size:20px;"><i class="fa-solid fa-pencil"></i> แก้ไขใบเบิก</button>` : ''}
      </div>
    </div>
  `;

  openModal('modal-ex-detail');
}

function deleteEx(id) {
  if (!confirm('ยืนยันการลบคำขอนี้? (การลบจะทำให้โควต้าและสถิติเปลี่ยนกลับทันที)')) return;
  const es = getExs();
  const newEs = es.filter(e => e.id !== id);
  saveExs(newEs);
  apiSync('deleteEx', { id });
  closeModal('modal-ex-detail');
  toast('🗑️ ลบคำขอเรียบร้อย');
  updateDashboard();
  updateLB();
  updateQuota();
  updateBadges();
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
  document.getElementById('ex-date').value = e.date || '';
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

  // Populate months if first time
  if (elMonth.options.length === 0) {
    const months = [...new Set(all.map(e => monthKey(e.date)))].sort().reverse();
    const curMonth = monthKey(new Date());
    if (!months.includes(curMonth)) months.unshift(curMonth);
    elMonth.innerHTML = months.map(m => {
      const [y, mm] = m.split('-');
      const d = new Date(y, parseInt(mm) - 1, 1);
      const label = d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
      return `<option value="${m}">${label}</option>`;
    }).join('');
  }

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
        <div style="background:#1a1c26; border-radius:18px; border:1px solid rgba(255,255,255,0.04); padding:15px; margin-bottom:12px; position:relative;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:2px;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span style="font-size:20px; font-weight:700; color:#fff;">${e.activity || 'กิจกรรม'}</span>
              <span style="font-size:15px; color:#9094b8; font-weight:500;">(${EX_LABEL[et]})</span>
              <div style="display:flex; align-items:center; gap:4px; background:${statusCfg.bg}; color:${statusCfg.color}; padding:2px 10px; border-radius:20px; font-size:12px; font-weight:700; text-transform:uppercase;">
                <i class="${statusCfg.icon}"></i> ${statusCfg.label}
              </div>
            </div>
            <div style="font-size:20px; font-weight:500; color:${tcolor}; font-family:var(--mono);">฿${(reward * count).toLocaleString()}</div>
          </div>

          <div style="display:flex; align-items:center; gap:8px; color:#5a5e7a; font-size:15px; margin-bottom:8px; font-weight:500;">
            <i class="fa-regular fa-calendar" style="font-size:14px;"></i>
            <span>${new Date(e.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:flex-end;">
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
              ${chips}
            </div>
            <button class="btn btn-ghost btn-sm" style="padding:6px 14px; border-radius:8px; font-size:15px; display:flex; align-items:center; gap:8px; color:#9094b8; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.02);" onclick="viewExDetail(${e.id})">
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
            <div style="font-size:16px; font-weight:700; color:#5a5e7a; margin-bottom:12px; text-transform:uppercase; letter-spacing:1px;">แบบกลุ่ม</div>
            ${wkGrpItems.map(renderHistCard).join('')}
          </div>
        ` : ''}

        ${wkSoloItems.length ? `
          <div>
            <div style="font-size:16px; font-weight:700; color:#5a5e7a; margin-bottom:12px; text-transform:uppercase; letter-spacing:1px;">แบบเดี่ยว</div>
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
  document.getElementById('ex-date').value = today;
  updateQuota();
}
