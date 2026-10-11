/* ==========================================================================
   Design Flow v3 — TEAM area (members page, registration screen, login screen)
   READ-ONLY UI layer:
   - never calls api()/apiSync()/fetch/LS.set or any legacy save / setQuota helper;
   - every write is a call to the legacy function the legacy button calls
     (openAddMember, openEdit, confDel, openQuotaModal, openDepartmentManager,
     generateRegistrationInvite, setMemberTab, reviewRegistration,
     submitInviteRegistration, doLogin, doGoogleLogin) with the same args;
   - the registration / login screens re-arrange the EXISTING legacy inputs
     (same ids, same listeners) instead of replacing them.
   ========================================================================== */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.DFV3) return;
  var D = window.DFV3, esc = D.esc;

  /* ---------------- small helpers ---------------- */
  function todayStr() { return toLocalDateString(new Date()); }
  function addDays(ds, n) { var d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + n); return toLocalDateString(d); }
  function dm(ds) { if (!ds) return '—'; var d = new Date(ds + 'T00:00:00'); return isNaN(d) ? '—' : d.getDate() + ' ' + D.TH_MON_S[d.getMonth()]; }
  /* initials avatar; skips Thai leading vowels (เ แ โ ใ ไ) so "เท็น" shows "ท" like the design */
  function av(u, size) {
    var h = D.avatar(u, size);
    if (h.indexOf('df-av-photo') >= 0) return h;
    var src = String(D.nick(u) || (u && u.name) || '?').trim().replace(/^[\u0E40-\u0E44]+/, '');
    var ch = (src.charAt(0) || '?').toUpperCase();
    return h.replace(/>[^<]*<\/span>$/, '>' + esc(ch) + '</span>');
  }
  function roleLabel(r) { return D.ROLE_LABEL[r] || r || '—'; }
  function roleBadge(r) { return '<span class="df-team-role r-' + esc(r) + '">' + esc(roleLabel(r)) + '</span>'; }
  function locText(u) { return (u.locationType || 'bkk') === 'bkk' ? 'กรุงเทพ' : 'ต่างจังหวัด'; }
  /* tenure "x ปี y เดือน"; suspended accounts stop counting at suspendedAt (same idea as legacy employmentDuration) */
  function tenure(u) {
    if (!u.startDate) return '—';
    var s = new Date(u.startDate + 'T00:00:00');
    var e = u.active === false && u.suspendedAt ? new Date(String(u.suspendedAt).slice(0, 10) + 'T00:00:00') : new Date();
    if (isNaN(s) || isNaN(e) || e < s) return '—';
    var m = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) - (e.getDate() < s.getDate() ? 1 : 0);
    var y = Math.floor(m / 12); m = m % 12;
    return (y ? y + ' ปี ' : '') + m + ' เดือน';
  }
  function phoneParts(p) {
    var d = String(p || '').replace(/\D/g, '');
    if (d.length < 7) return null;
    return { a: d.slice(0, 3), b: d.slice(3, d.length - 4), c: d.slice(-4) };
  }

  /* Same user filter as legacy renderMembers() */
  function legacyMemberPool() {
    var all = getUsers();
    var ve = getVisibleEmails(true);
    var users = ve ? all.filter(function (u) { return ve.has(u.email); }) : all.slice();
    if (cu && cu.email.toLowerCase() !== 'kuniiz.ka@gmail.com') users = users.filter(function (u) { return u.email.toLowerCase() !== 'kuniiz.ka@gmail.com'; });
    return users;
  }
  function memberTab() { try { return typeof _memberTab !== 'undefined' ? _memberTab : 'active'; } catch (e) { return 'active'; } }

  /* leave balance for one member — same formula as renderBalOverview() (current year) */
  function memberBalance(email, type) {
    if (typeof LQ === 'undefined' || !LQ[type]) return null;
    var yr = String(new Date().getFullYear());
    var def = LQ[type], qs = getQs(), cq = (qs[email] && qs[email][type] != null) ? qs[email][type] : null;
    if (def.q === null && cq === null) return null;
    var q = cq !== null ? cq : def.q;
    var used = getLeaves().filter(function (r) { return r.email === email && r.type === type && r.status === 'approved' && String(r.start || '').indexOf(yr) === 0; })
      .reduce(function (s, r) { return s + effectiveLeaveDays(r); }, 0);
    var left = Math.max(0, q - used);
    return { type: type, quota: q, left: left, pct: q > 0 ? Math.round(left / q * 100) : 0, low: q > 0 && left / q <= 0.34 };
  }
  function leaveStatus(u) {
    if (u.active === false) return { text: 'ระงับ', cls: 'off' };
    var t = todayStr(), tm = addDays(t, 1);
    var mine = getLeaves().filter(function (r) { return r.email === u.email && r.status === 'approved'; });
    if (mine.some(function (r) { return r.start <= t && r.end >= t; })) return { text: 'ลาวันนี้', cls: 'away' };
    if (mine.some(function (r) { return r.start <= tm && r.end >= tm; })) return { text: 'ลาพรุ่งนี้', cls: 'away' };
    return { text: 'อยู่', cls: 'in' };
  }
  function exerciseThisCycle(email) {
    var mk = monthKey(todayStr());
    var list = getExs().filter(function (e) { return isUserInvolved(e, email) && e.status !== 'rejected' && monthKey(e.date) === mk; });
    var money = list.reduce(function (s, e) { return s + getExerciseReward(e); }, 0);
    var mon = parseInt(String(mk).slice(5, 7), 10);
    return { money: money, count: list.length, label: mon ? D.TH_MON_S[mon - 1] : '' };
  }
  function nextBirthday(users) {
    var t = new Date(todayStr() + 'T00:00:00'), best = null;
    users.forEach(function (u) {
      if (!u.birthday) return;
      var b = new Date(u.birthday + 'T00:00:00'); if (isNaN(b)) return;
      var n = new Date(t.getFullYear(), b.getMonth(), b.getDate());
      if (n < t) n = new Date(t.getFullYear() + 1, b.getMonth(), b.getDate());
      var days = Math.round((n - t) / 86400000);
      if (!best || days < best.days) best = { u: u, days: days, date: n };
    });
    return best;
  }

  /* ---------------- MEMBERS PAGE ---------------- */
  var ST = { q: '', role: 'all', sel: '', showPhone: false, menu: false };
  var ROLE_ORDER = ['pm', 'lead', 'senior', 'junior'];
  var ROLE_CHIP = { pm: 'PM', lead: 'Lead', senior: 'Senior', junior: 'Junior' };
  var ICON = {
    search: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path></svg>',
    mail: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M3 7l9 6 9-6"></path></svg>',
    phone: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"></path></svg>',
    lock: '<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>'
  };

  function filtered(pool) {
    var tab = memberTab(), q = ST.q.trim().toLowerCase();
    return pool.filter(function (u) {
      if (tab === 'active' ? u.active === false : u.active !== false) return false;
      if (ST.role !== 'all' && u.role !== ST.role) return false;
      if (q && ((u.nickname || '') + ' ' + (u.name || '') + ' ' + (u.email || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function rowHtml(u, multiDept) {
    var st = leaveStatus(u), on = u.email === ST.sel;
    return '<button type="button" role="option" class="df-team-row' + (on ? ' on' : '') + '" aria-selected="' + on + '" data-team-pick="' + esc(u.email) + '">' +
      av(u, 44) +
      '<span class="df-team-row-main"><span class="df-team-row-name">' + esc(D.nick(u) || u.name) + roleBadge(u.role) + '</span>' +
      '<span class="df-team-row-sub">' + esc(u.name || '') + (multiDept && u.dept ? ' · ' + esc(u.dept) : '') + '</span></span>' +
      '<span class="df-team-row-side"><span class="df-team-st ' + st.cls + '"><i></i>' + st.text + '</span><span class="df-team-row-ten">' + esc(tenure(u)) + '</span></span></button>';
  }

  function detailHtml(u) {
    if (!u) return '<section class="df-team-detail df-team-detail-empty" aria-label="ข้อมูลสมาชิก"><p>ไม่มีสมาชิกที่เลือก</p></section>';
    var isSelf = u.email === cu.email, isPM = cu.role === 'pm';
    var ph = phoneParts(u.phone);
    var phoneTxt = !u.phone ? '—' : !ph ? u.phone : ST.showPhone ? ph.a + '-' + ph.b + '-' + ph.c : ph.a + '-•••-' + ph.c;
    var facts = [['อายุงาน', tenure(u)], ['เริ่มงาน', u.startDate ? D.thDate(u.startDate, { year: true }) : '—'], ['วันเกิด', dm(u.birthday)], ['พื้นที่', locText(u)]];
    var bal = ['vacation', 'personal', 'sick'].map(function (t) { return memberBalance(u.email, t); }).filter(Boolean);
    var ex = exerciseThisCycle(u.email);
    var menu = [];
    if (isPM) menu.push('<button type="button" role="menuitem" data-team-act="quota">แก้ไขโควต้าวันลา</button>');
    if (!isSelf) menu.push(u.active === false
      ? '<button type="button" role="menuitem" data-team-act="activate">เปิดใช้งานบัญชี</button>'
      : '<button type="button" role="menuitem" data-team-act="suspend">ระงับบัญชี</button>');
    if (!isSelf) menu.push('<button type="button" role="menuitem" class="danger" data-team-act="delete">ลบสมาชิก</button>');
    return '<section class="df-team-detail" aria-label="ข้อมูลสมาชิก" id="df-team-detail">' +
      '<div class="df-team-cover" aria-hidden="true"></div>' +
      '<div class="df-team-detail-body">' +
      '<div class="df-team-dhead">' + av(u, 96).replace('class="df-av"', 'class="df-av df-team-bigav"') +
      '<div class="df-team-dname"><span class="df-team-dnick">' + esc(D.nick(u) || u.name) + roleBadge(u.role) + '</span><span class="df-team-dsub">' + esc(u.name || '') + (u.dept ? ' · ' + esc(u.dept) : '') + '</span></div>' +
      '<div class="df-team-dact"><button type="button" class="df-team-btn primary" data-team-act="edit">แก้ไขข้อมูล</button>' +
      (menu.length ? '<span class="df-team-menuwrap"><button type="button" class="df-team-more" aria-label="ตัวเลือกเพิ่มเติม" aria-haspopup="menu" aria-expanded="' + ST.menu + '" data-team-act="menu">⋯</button>' +
        (ST.menu ? '<div class="df-team-menu" role="menu">' + menu.join('') + '</div>' : '') + '</span>' : '') + '</div></div>' +
      '<div class="df-team-facts">' + facts.map(function (f) { return '<div class="df-team-fact"><span>' + f[0] + '</span><b>' + esc(f[1]) + '</b></div>'; }).join('') + '</div>' +
      '<div class="df-team-cols">' +
      '<div class="df-team-col"><h3>ติดต่อ</h3>' +
      '<div class="df-team-contact"><span class="df-team-cic">' + ICON.mail + '</span><span class="df-team-ctext">' + esc(u.email) + '</span></div>' +
      '<div class="df-team-contact"><span class="df-team-cic">' + ICON.phone + '</span><span class="df-team-ctext">' + esc(phoneTxt) + '</span>' +
      (ph ? '<button type="button" class="df-team-link" data-team-act="phone" aria-pressed="' + ST.showPhone + '">' + (ST.showPhone ? 'ซ่อน' : 'แสดง') + '</button>' : '') + '</div></div>' +
      '<div class="df-team-col"><h3>วันลาคงเหลือ</h3>' +
      (bal.length ? bal.map(function (b) {
        return '<div class="df-team-lv">' + D.tile(D.TYPE_ICON[b.type], 28) + '<span class="df-team-lv-main"><span class="df-team-lv-top"><span>' + esc(D.plainType(b.type)) + '</span><strong' + (b.low ? ' class="low"' : '') + '>' + D.num(b.left) + ' / ' + D.num(b.quota) + '</strong></span>' +
          '<span class="df-team-lv-bar"><span class="' + (b.low ? 'low' : '') + '" style="width:' + b.pct + '%"></span></span></span></div>';
      }).join('') : '<p class="df-muted">ไม่มีข้อมูลโควต้า</p>') + '</div></div>' +
      '<div class="df-team-ex">' + D.tile('ic-run', 32) + '<span>ออกกำลังกายรอบ ' + esc(ex.label) + ' · <strong>฿' + ex.money.toLocaleString() + '</strong>' + (ex.count ? ' · ' + ex.count + ' กิจกรรม' : '') + '</span>' +
      (typeof canAccessPage === 'function' && canAccessPage('leaderboard') ? '<button type="button" class="df-team-link u" data-team-act="lb">ดูอันดับ ›</button>' : '') + '</div>' +
      '</div></section>';
  }

  function listHtml(pool) {
    var list = filtered(pool);
    var multiDept = new Set(pool.map(function (u) { return u.dept || ''; })).size > 1;
    return list.length ? list.map(function (u) { return rowHtml(u, multiDept); }).join('') : '<div class="df-team-empty">' + (ST.q ? 'ไม่พบสมาชิกที่ค้นหา' : memberTab() === 'active' ? 'ไม่มีสมาชิก' : 'ไม่มีบัญชีที่ถูกระงับ') + '</div>';
  }

  function ensureSelection(pool) {
    var list = filtered(pool);
    if (!list.some(function (u) { return u.email === ST.sel; })) { ST.sel = list.length ? list[0].email : ''; ST.showPhone = false; ST.menu = false; }
  }

  function renderMembersV3(view) {
    var pool = legacyMemberPool();
    var active = pool.filter(function (u) { return u.active !== false; });
    var suspended = pool.length - active.length;
    var isPM = cu.role === 'pm';
    ensureSelection(pool);
    var sel = pool.find(function (u) { return u.email === ST.sel; });

    // tiles
    var counts = {}; active.forEach(function (u) { counts[u.role] = (counts[u.role] || 0) + 1; });
    var bkk = active.filter(function (u) { return (u.locationType || 'bkk') === 'bkk'; }).length, prov = active.length - bkk;
    var bd = nextBirthday(active);
    var thisMonth = bd && bd.date.getMonth() === new Date().getMonth() && bd.days < 31;
    var depts = new Set(active.map(function (u) { return u.dept; }).filter(Boolean));
    var eyebrow = cu.role === 'lead' ? (cu.dept ? 'ทีม ' + esc(cu.dept) : 'ทีมของฉัน') : (depts.size > 1 ? 'ทุกแผนก · ' + depts.size + ' แผนก' : depts.size ? 'ทีม ' + esc(Array.from(depts)[0]) : 'ทุกแผนก');

    var actions = (isPM ? '<button type="button" class="df-team-btn" onclick="openDepartmentManager()">จัดการแผนก</button>' +
      '<button type="button" class="df-team-btn" onclick="DFV3Invite.open()">สร้างลิงก์ลงทะเบียน</button>' : '') +
      '<button type="button" class="df-team-btn primary lg" onclick="openAddMember()">+ เพิ่มสมาชิก</button>';

    var rolesPresent = ROLE_ORDER.filter(function (r) { return pool.some(function (u) { return u.role === r; }); });
    if (ST.role !== 'all' && rolesPresent.indexOf(ST.role) < 0) ST.role = 'all';
    var chips = [['all', 'ทั้งหมด']].concat(rolesPresent.map(function (r) { return [r, ROLE_CHIP[r]]; })).map(function (c) {
      return '<button type="button" role="tab" class="df-team-chip' + (ST.role === c[0] ? ' on' : '') + '" aria-selected="' + (ST.role === c[0]) + '" data-team-role="' + c[0] + '">' + c[1] + '</button>';
    }).join('');
    var tab = memberTab();

    // keep the legacy pending-registrations element (approve/reject buttons + role selects live in it)
    var pend = document.getElementById('pending-registrations');
    if (pend && pend.parentNode) pend.parentNode.removeChild(pend);

    view.classList.add('df-team-view');
    view.innerHTML = D.header({ eyebrow: eyebrow, title: 'สมาชิกทีม', actions: actions }) +
      '<section class="df-team-tiles" aria-label="สรุปทีม">' +
      '<div class="df-team-tile"><span class="k">สมาชิกทั้งหมด</span><span class="big">' + active.length + ' <small>คน</small></span></div>' +
      '<div class="df-team-tile"><span class="k">ตำแหน่ง</span><span class="df-team-rolecounts">' + ROLE_ORDER.filter(function (r) { return counts[r]; }).map(function (r) {
        return '<span class="r-' + r + '">' + ROLE_CHIP[r] + ' ' + counts[r] + '</span>'; }).join('') + '</span></div>' +
      '<div class="df-team-tile"><span class="k">พื้นที่ทำงาน</span><span class="df-team-split">' + (bkk ? '<span style="flex:' + bkk + '"></span>' : '') + (prov ? '<span class="p" style="flex:' + prov + '"></span>' : '') + '</span><span class="v">กทม. ' + bkk + ' · ตจว. ' + prov + '</span></div>' +
      '<div class="df-team-tile bday"><span class="k">' + (bd ? (thisMonth ? 'วันเกิดเดือนนี้' : 'วันเกิดถัดไป') : 'วันเกิด') + '</span>' +
      (bd ? '<span class="name">' + esc(D.nick(bd.u) || bd.u.name) + ' · ' + bd.date.getDate() + ' ' + D.TH_MON_S[bd.date.getMonth()] + '</span><span class="s">' + (bd.days === 0 ? 'วันนี้' : 'อีก ' + bd.days + ' วัน') + '</span>' : '<span class="name">—</span><span class="s">ยังไม่มีข้อมูลวันเกิด</span>') + '</div>' +
      '</section>' +
      '<div id="df-team-pend-slot"></div>' +
      '<div class="df-team-md">' +
      '<section class="df-team-list" aria-label="รายชื่อสมาชิก"><div class="df-team-listhead">' +
      '<label class="df-team-search">' + ICON.search + '<span class="df-team-sr">ค้นหาสมาชิก</span><input type="search" id="df-team-q" placeholder="ค้นหาชื่อเล่น ชื่อจริง" value="' + esc(ST.q) + '" autocomplete="off"></label>' +
      '<div class="df-team-filters"><div role="tablist" aria-label="ตำแหน่ง" class="df-team-chips">' + chips + '</div>' +
      '<div role="tablist" aria-label="สถานะบัญชี" class="df-team-seg"><button type="button" role="tab" aria-selected="' + (tab === 'active') + '" class="' + (tab === 'active' ? 'on' : '') + '" data-team-tab="active">ใช้งาน ' + active.length + '</button>' +
      '<button type="button" role="tab" aria-selected="' + (tab !== 'active') + '" class="' + (tab !== 'active' ? 'on' : '') + '" data-team-tab="inactive">ระงับ ' + suspended + '</button></div></div></div>' +
      '<div role="listbox" aria-label="สมาชิก" id="df-team-rows">' + listHtml(pool) + '</div></section>' +
      '<div id="df-team-detail-slot" class="df-team-dslot">' + detailHtml(sel) + '</div></div>';

    if (pend) {
      pend.classList.add('df-team-pend');
      document.getElementById('df-team-pend-slot').appendChild(pend);
    }
    bind(view);
  }

  function refreshParts(view, scrollDetail) {
    var pool = legacyMemberPool();
    ensureSelection(pool);
    var rows = view.querySelector('#df-team-rows'); if (rows) rows.innerHTML = listHtml(pool);
    var slot = view.querySelector('#df-team-detail-slot');
    if (slot) slot.innerHTML = detailHtml(pool.find(function (u) { return u.email === ST.sel; }));
    if (scrollDetail && slot && window.innerWidth < 900) slot.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setActive(email, value) {
    // drive the legacy edit modal: open it exactly like the legacy "แก้ไข" button, then preselect the
    // account-status select. The member is only changed when the user presses the modal's own "บันทึก" (saveMember).
    var p = openEdit(email);
    Promise.resolve(p).then(function () {
      var s = document.getElementById('edit-active');
      if (s) { s.value = value; s.dispatchEvent(new Event('change', { bubbles: true })); s.focus(); }
    });
  }

  function bind(view) {
    if (view.__dfTeamBound) return;
    view.__dfTeamBound = true;
    view.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'df-team-q') { ST.q = e.target.value; refreshParts(view); }
    });
    view.addEventListener('click', function (e) {
      var t = e.target.closest('[data-team-pick],[data-team-role],[data-team-tab],[data-team-act]');
      if (!t || !view.contains(t)) { if (ST.menu && !e.target.closest('.df-team-menu')) { ST.menu = false; refreshParts(view); } return; }
      if (t.hasAttribute('data-team-pick')) { ST.sel = t.getAttribute('data-team-pick'); ST.showPhone = false; ST.menu = false; refreshParts(view, true); return; }
      if (t.hasAttribute('data-team-role')) { ST.role = t.getAttribute('data-team-role'); D.renderPage('members'); return; }
      if (t.hasAttribute('data-team-tab')) { ST.menu = false; setMemberTab(t.getAttribute('data-team-tab')); return; } // legacy re-renders via renderMembers()
      var act = t.getAttribute('data-team-act'), email = ST.sel;
      if (act === 'menu') { ST.menu = !ST.menu; refreshParts(view); return; }
      if (act === 'phone') { ST.showPhone = !ST.showPhone; refreshParts(view); return; }
      ST.menu = false;
      if (act === 'lb') { showPage('leaderboard'); return; }
      if (!email) return;
      refreshParts(view);
      if (act === 'edit') openEdit(email);
      else if (act === 'quota') openQuotaModal(email);
      else if (act === 'suspend') setActive(email, 'false');
      else if (act === 'activate') setActive(email, 'true');
      else if (act === 'delete') confDel(email);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ST.menu) { ST.menu = false; refreshParts(view); } });
  }

  D.registerPage('members', { render: renderMembersV3, refreshOn: ['renderMembers'] });

  /* ---------------- AUTH SCREENS (registration + login) ---------------- */
  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  function versionText() { var v = document.querySelector('.df-version'); return v ? v.textContent.replace(/\s*อัปเดต/, ' · อัปเดต').trim() : 'Design Flow v3'; }
  function themeBtn() {
    var b = el('button', 'df-team-themebtn');
    b.type = 'button';
    var paint = function () {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      b.innerHTML = dark
        ? '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>โหมดสว่าง'
        : '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"></path></svg>โหมดมืด';
    };
    paint();
    b.addEventListener('click', function () {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (typeof window.dfSetTheme === 'function') window.dfSetTheme(dark ? 'light' : 'dark');
      else document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
      document.querySelectorAll('.df-team-themebtn').forEach(function (x) { x.__paint && x.__paint(); });
    });
    b.__paint = paint;
    return b;
  }
  function brandPanel(logoImg, kicker, title, text) {
    var a = el('aside', 'df-team-brand');
    a.innerHTML = '<span class="df-team-shape s1" aria-hidden="true"></span><span class="df-team-shape s2" aria-hidden="true"></span>' +
      '<span class="df-team-shape s3" aria-hidden="true"></span><span class="df-team-shape s4" aria-hidden="true"></span>' +
      '<div class="df-team-brand-logo"></div>' +
      '<div class="df-team-brand-copy">' + (kicker ? '<span class="kicker">' + kicker + '</span>' : '') + '<h1>' + title + '</h1><p>' + text + '</p></div>';
    var logo = a.querySelector('.df-team-brand-logo');
    if (logoImg) logo.appendChild(logoImg);
    logo.appendChild(el('span', '', 'Design Flow'));
    return a;
  }
  function shell(screen, aside, main) {
    var wrap = el('div', 'df-team-auth');
    var card = el('div', 'df-team-auth-card');
    card.appendChild(aside); card.appendChild(main);
    var foot = el('div', 'df-team-auth-foot');
    foot.appendChild(el('span', 'df-team-ver', esc(versionText())));
    foot.appendChild(themeBtn());
    wrap.appendChild(card); wrap.appendChild(foot);
    screen.appendChild(wrap);
    screen.classList.add('df-team-screen');
  }
  function field(input, labelHtml) {
    var g = input.closest('.form-group');
    var lab = g && g.querySelector('label');
    if (lab) lab.innerHTML = labelHtml;
    if (g) g.classList.add('df-team-f');
    return g;
  }
  var REQ = '<span class="df-team-req" aria-hidden="true"> *</span>';

  function inviteDept() {
    try { var d = new URLSearchParams(location.search).get('dept'); return d ? d.trim().slice(0, 60) : ''; } catch (e) { return ''; }
  }

  /* ---------------- INVITE MODAL (M1) ----------------
     Writes only through legacy generateRegistrationInvite() / copyRegistrationInvite().
     The chosen department is appended to the legacy link as ?dept=... (read by the registration screen). */
  var INV = { dept: '', link: '', copied: false, busy: false };
  function deptList() {
    var a = []; try { if (typeof _departments !== 'undefined' && Array.isArray(_departments)) a = _departments.slice(); } catch (e) {}
    if (!a.length) a = ['UXUI', 'Media', 'Art'];
    // the gateway never accepts PM as a self-registration department
    return a.filter(function (d) { return String(d).toLowerCase() !== 'pm'; });
  }
  function invModal() {
    var m = document.getElementById('df-inv');
    if (m) return m;
    m = el('div', 'df-inv-scrim');
    m.id = 'df-inv';
    m.hidden = true;
    m.addEventListener('click', function (e) {
      if (e.target === m || e.target.closest('[data-inv-close]')) { closeInv(); return; }
      var d = e.target.closest('[data-inv-dept]');
      if (d && !INV.link) { INV.dept = d.getAttribute('data-inv-dept'); paintInv(); return; }
      if (e.target.closest('[data-inv-gen]')) { genInv(); return; }
      if (e.target.closest('[data-inv-copy]')) { copyInv(); return; }
      if (e.target.closest('[data-inv-regen]')) { INV.link = ''; INV.copied = false; paintInv(); return; }
      if (e.target.closest('[data-inv-preview]')) { window.open(location.pathname + '?dept=' + encodeURIComponent(INV.dept || deptList()[0] || '') + '#register-preview', '_blank', 'noopener'); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !m.hidden) closeInv(); });
    document.body.appendChild(m);
    return m;
  }
  function closeInv() { var m = document.getElementById('df-inv'); if (m) m.hidden = true; }
  function shortLink(l) { var t = l.replace(/^https?:\/\//, ''); var i = t.indexOf('#register='); return i < 0 ? t : t.slice(0, i) .replace(/\?.*$/, '') + '#register=' + t.slice(i + 10, i + 14) + '…' + t.slice(-6); }
  function paintInv() {
    var m = invModal(), canGen = !!INV.dept && !INV.busy;
    var chips = deptList().map(function (d) {
      var on = INV.dept === d;
      return '<button type="button" role="radio" aria-checked="' + on + '" class="df-inv-chip' + (on ? ' on' : '') + (INV.link && !on ? ' off' : '') + '" data-inv-dept="' + esc(d) + '"' + (INV.link ? ' disabled' : '') + '>' + esc(d) + '</button>';
    }).join('');
    m.innerHTML = '<div class="df-inv" role="dialog" aria-modal="true" aria-labelledby="df-inv-title">' +
      '<div class="df-inv-head"><div class="df-inv-ttl"><span class="df-inv-ic" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"></path><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"></path></svg></span>' +
      '<div><h2 id="df-inv-title">ลิงก์ลงทะเบียนสมาชิกใหม่</h2><span>ใช้ได้ครั้งเดียว · หมดอายุทันทีเมื่อผู้สมัครส่งข้อมูล</span></div></div>' +
      '<button type="button" class="df-inv-x" aria-label="ปิด" data-inv-close>×</button></div>' +
      '<div class="df-inv-body">' +
      '<div class="df-inv-step"><span class="lbl">1. เลือกแผนกของสมาชิกใหม่<span class="df-team-req" aria-hidden="true"> *</span></span>' +
      '<div class="df-inv-chips" role="radiogroup" aria-label="แผนก">' + chips + '</div>' +
      '<span class="note">แผนกจะถูกล็อกในฟอร์ม ผู้สมัครเปลี่ยนเองไม่ได้</span></div>' +
      '<div class="df-inv-step"><span class="lbl">2. สร้างและส่งลิงก์</span>' +
      (INV.link
        ? '<div class="df-inv-linkrow"><span class="df-inv-link" title="' + esc(INV.link) + '">' + esc(shortLink(INV.link)) + '</span>' +
          '<button type="button" class="df-inv-copy' + (INV.copied ? ' done' : '') + '" data-inv-copy>' + (INV.copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์') + '</button></div>' +
          '<span class="note">ลิงก์สำหรับแผนก <strong>' + esc(INV.dept) + '</strong> · <button type="button" class="df-inv-regen" data-inv-regen>เปลี่ยนแผนก / สร้างใหม่</button></span>'
        : '<button type="button" class="df-inv-gen' + (canGen ? ' on' : '') + '" data-inv-gen' + (canGen ? '' : ' aria-disabled="true"') + '>' +
          (INV.busy ? 'กำลังสร้างลิงก์…' : INV.dept ? 'สร้างลิงก์สำหรับแผนก ' + esc(INV.dept) : 'เลือกแผนกก่อน') + '</button>') +
      '</div>' +
      '<div class="df-inv-warn">ผู้สมัครกรอกข้อมูลแล้ว PM ต้องอนุมัติก่อนจึงจะเข้าใช้งานได้ · อย่าโพสต์ลิงก์ในที่สาธารณะ</div>' +
      '</div>' +
      '<div class="df-inv-foot"><button type="button" class="df-inv-prev" data-inv-preview>ดูหน้าที่ผู้สมัครจะเห็น →</button>' +
      '<button type="button" class="df-inv-done" data-inv-close>เสร็จแล้ว</button></div></div>';
  }
  function withDept(link, dept) {
    var i = link.indexOf('#'); if (i < 0) return link;
    var base = link.slice(0, i).replace(/\?.*$/, '');
    return base + '?dept=' + encodeURIComponent(dept) + link.slice(i);
  }
  function genInv() {
    if (!INV.dept || INV.busy || typeof window.generateRegistrationInvite !== 'function') return;
    var out = document.getElementById('invite-link-output');
    if (out) out.value = '';
    INV.busy = true; paintInv();
    document.documentElement.classList.add('df-inv-gen');   // keeps the legacy link modal hidden while it opens
    Promise.resolve(window.generateRegistrationInvite()).then(function () {
      var link = out && out.value;
      if (link) {
        INV.link = withDept(link, INV.dept);
        out.value = INV.link;                                   // legacy copy button / textarea now hold the dept link
        if (typeof window.closeModal === 'function') window.closeModal('modal-invite-link');
      }
    }).catch(function (e) { console.warn('[ui-v3-team] invite', e); }).then(function () {
      INV.busy = false; document.documentElement.classList.remove('df-inv-gen'); paintInv();
    });
  }
  function copyInv() {
    if (!INV.link) return;
    var out = document.getElementById('invite-link-output');
    if (out) out.value = INV.link;
    if (typeof window.copyRegistrationInvite === 'function') window.copyRegistrationInvite();
    INV.copied = true; paintInv();
  }
  window.DFV3Invite = {
    open: function () {
      if (typeof cu === 'undefined' || !cu || cu.role !== 'pm') { if (typeof window.toast === 'function') window.toast('⛔ เฉพาะ PM เท่านั้น'); return; }
      INV.dept = ''; INV.link = ''; INV.copied = false; INV.busy = false;
      paintInv(); invModal().hidden = false;
      // read-only refresh of the department list through the legacy loader
      if (typeof window.loadDepartments === 'function') Promise.resolve(window.loadDepartments()).then(function () { if (!invModal().hidden && !INV.link) paintInv(); }).catch(function () {});
    }
  };

  /* applicant preview: ?dept=X#register-preview — shows the registration screen with submit disabled (no API call) */
  function regPreview() {
    if (location.hash !== '#register-preview') return;
    var H = document.documentElement;
    H.classList.add('df-reg-preview');
    var show = function (id, on) { var n = document.getElementById(id); if (n) n.style.display = on ? '' : 'none'; };
    show('registration-loading', false); show('registration-invalid', false); show('registration-success', false);
    var f = document.getElementById('registration-form'); if (f) f.style.display = 'block';
    var b = document.getElementById('registration-submit'); if (b) { b.disabled = true; b.textContent = 'ตัวอย่างเท่านั้น · ส่งข้อมูลไม่ได้'; }
    var pill = document.querySelector('.df-team-okpill'); if (pill) pill.innerHTML = '<i></i>ตัวอย่างหน้าผู้สมัคร';
  }

  function buildRegistration() {
    var screen = document.getElementById('registration-screen');
    if (!screen || screen.__dfTeam) return;
    var box = screen.querySelector('.login-box');
    var form = document.getElementById('registration-form');
    if (!box || !form) return;
    screen.__dfTeam = true;
    var img = box.querySelector('img');
    var main = el('main', 'df-team-auth-main');
    ['registration-loading', 'registration-invalid', 'registration-success', 'registration-form'].forEach(function (id) {
      var n = document.getElementById(id); if (n) main.appendChild(n);
    });
    var aside = brandPanel(img, 'คุณได้รับลิงก์เชิญเข้าร่วมทีม', 'ยินดีต้อนรับสู่<br>Design Flow', 'กรอกข้อมูลไม่ถึง 2 นาที · PM อนุมัติแล้วเข้าระบบด้วย Google ได้ทันที');
    box.parentNode.removeChild(box);
    shell(screen, aside, main);

    // success state in v3 language (shown/hidden by legacy via style.display)
    var ok = document.getElementById('registration-success');
    if (ok) {
      ok.className = 'df-team-done';
      ok.setAttribute('role', 'status');
      ok.innerHTML = '<span class="df-team-done-ic" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg></span>' +
        '<h2>ส่งข้อมูลเรียบร้อย</h2><p>รอ PM อนุมัติ แล้วเข้าระบบด้วยปุ่ม "เข้าสู่ระบบด้วย Google" โดยใช้ <strong id="df-team-done-email"></strong><br>ลิงก์นี้ใช้งานไม่ได้แล้ว</p>';
      new MutationObserver(function () {
        var e = document.getElementById('reg-email'), s = document.getElementById('df-team-done-email');
        if (e && s) s.textContent = e.value.trim().toLowerCase();
      }).observe(ok, { attributes: true, attributeFilter: ['style'] });
    }
    var loading = document.getElementById('registration-loading');
    if (loading) loading.className = 'df-team-loading';
    var invalid = document.getElementById('registration-invalid');
    if (invalid) invalid.classList.add('df-team-invalid');

    // re-arrange the legacy form (same elements, same ids, same listeners)
    var grid = form.querySelector('.form-grid');
    var get = function (id) { return document.getElementById(id); };
    var gName = field(get('reg-name'), 'ชื่อ–นามสกุล' + REQ), gNick = field(get('reg-nickname'), 'ชื่อเล่น');
    var gMail = field(get('reg-email'), 'อีเมล Gmail' + REQ), gPhone = field(get('reg-phone'), 'โทรศัพท์');
    var gBirth = field(get('reg-birth'), 'วันเกิด'), gDept = field(get('reg-dept'), 'แผนก'), gLoc = field(get('reg-loc'), 'พื้นที่ทำงาน');
    get('reg-name').placeholder = 'เช่น สมชาย ใจดี';
    get('reg-nickname').placeholder = 'ใช้แสดงในระบบ';
    get('reg-phone').placeholder = '0xx-xxx-xxxx';
    var hint = form.querySelector('.reg-email-hint');
    var loginHint = form.querySelector('.reg-login-hint');
    var err = get('registration-error'), submit = get('registration-submit');

    var head = el('div', 'df-team-reghead', '<div><h2>ลงทะเบียน</h2><span>ช่องที่มี <b class="df-team-req">*</b> ต้องกรอก</span></div>' +
      '<span class="df-team-okpill"><i></i>ลิงก์ใช้ได้ · ใช้ครั้งเดียว</span>');
    var g1 = el('div', 'df-team-grid2'), g2 = el('div', 'df-team-grid2');
    [gName, gNick, gMail, gPhone].forEach(function (g) { if (g) g1.appendChild(g); });
    [gBirth, gDept].forEach(function (g) { if (g) g2.appendChild(g); });
    if (hint) {
      hint.className = 'df-team-warnbox';
      hint.innerHTML = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3l9 16H3z"></path><path d="M12 10v4M12 17h.01"></path></svg>' +
        '<span><strong>สำคัญ:</strong> อีเมลนี้ใช้เข้าสู่ระบบด้วย Google และ<strong>เปลี่ยนภายหลังไม่ได้</strong> — ใช้บัญชี Google ที่คุณใช้ประจำ</span>';
    }
    // work-area: segmented control that writes into the legacy #reg-loc select (legacy reads its value on submit)
    var loc = get('reg-loc');
    var seg = el('div', 'df-team-areaseg');
    seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', 'พื้นที่ทำงาน');
    var opts = [['bkk', 'กรุงเทพและปริมณฑล'], ['province', 'ต่างจังหวัด']];
    var paintSeg = function () {
      seg.innerHTML = opts.map(function (o) { var on = loc.value === o[0]; return '<button type="button" role="radio" aria-checked="' + on + '" class="' + (on ? 'on' : '') + '" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('');
    };
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]'); if (!b) return;
      loc.value = b.getAttribute('data-v'); loc.dispatchEvent(new Event('change', { bubbles: true })); paintSeg();
    });
    loc.addEventListener('change', paintSeg);
    paintSeg();
    if (gLoc) { gLoc.classList.add('df-team-locgroup'); gLoc.appendChild(seg); }

    form.innerHTML = '';
    form.classList.add('df-team-regform');
    var sec = function (n, t) { return el('div', 'df-team-sec', '<span>' + n + '</span><h2>' + t + '</h2>'); };
    var mailErr = el('span', 'df-team-mailerr', 'ต้องเป็นอีเมล @gmail.com เพื่อใช้เข้าสู่ระบบด้วย Google');
    mailErr.setAttribute('role', 'alert'); mailErr.hidden = true;
    [head, sec(1, 'ข้อมูลติดต่อ'), g1, mailErr, hint, el('div', 'df-team-divider'), sec(2, 'ข้อมูลการทำงาน'), g2, gLoc, err, submit, loginHint].forEach(function (n) { if (n) form.appendChild(n); });
    // department locked by the invite link (?dept=...): shows a locked chip, writes the legacy #reg-dept select
    var deptSel = get('reg-dept');
    var lock = el('span', 'df-team-deptlock');
    lock.hidden = true;
    if (gDept) gDept.appendChild(lock);
    var applyDept = function () {
      var d = inviteDept();
      if (!d || !deptSel) return;
      if (!Array.prototype.some.call(deptSel.options, function (o) { return o.value === d; })) {
        var o = document.createElement('option'); o.value = d; o.textContent = d; deptSel.appendChild(o);
      }
      deptSel.value = d;
      deptSel.classList.add('df-team-hidden');
      lock.innerHTML = esc(d) + ' <span><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>กำหนดจากลิงก์เชิญ</span>';
      lock.hidden = false;
      var k = screen.querySelector('.df-team-brand .kicker'); if (k) k.textContent = 'คุณได้รับเชิญเข้าแผนก ' + d;
    };
    applyDept();
    new MutationObserver(applyDept).observe(form, { attributes: true, attributeFilter: ['style'] });
    if (deptSel) new MutationObserver(function () { if (inviteDept() && deptSel.value !== inviteDept()) applyDept(); }).observe(deptSel, { childList: true });
    if (submit) submit.className = 'df-team-submit';
    if (loginHint) loginHint.className = 'df-team-foothint';
    if (grid && grid.parentNode) grid.parentNode.removeChild(grid);

    // visual "ready" state only — legacy submitInviteRegistration() still does all validation
    var mailOk = function () { return /^[^\s@]+@gmail\.com$/.test(get('reg-email').value.trim().toLowerCase()); };
    var ready = function () {
      var m = get('reg-email').value.trim();
      var bad = m.length > 0 && !mailOk();
      mailErr.hidden = !bad;
      get('reg-email').classList.toggle('df-team-bad', bad);
      form.classList.toggle('is-ready', !!(get('reg-name').value.trim() && mailOk()));
    };
    // UI guard only: stops the click before legacy submit when the email is not Gmail (no data written)
    if (submit) submit.addEventListener('click', function (e) {
      if (document.documentElement.classList.contains('df-reg-preview') || !mailOk()) {
        e.preventDefault(); e.stopImmediatePropagation(); ready(); if (!mailOk() && get('reg-email').value.trim()) get('reg-email').focus();
      }
    }, true);
    ['reg-name', 'reg-email'].forEach(function (id) { get(id).addEventListener('input', ready); });
    ready();
  }

  function buildLogin() {
    var screen = document.getElementById('login-screen');
    if (!screen || screen.__dfTeam) return;
    var box = screen.querySelector('.login-box');
    if (!box) return;
    screen.__dfTeam = true;
    var img = box.querySelector('img');
    var main = el('main', 'df-team-auth-main df-team-loginmain');
    main.appendChild(el('div', 'df-team-reghead', '<div><h2>เข้าสู่ระบบ</h2><span>ระบบจัดการทีม — ใช้บัญชีที่ได้รับอนุมัติแล้ว</span></div>'));
    var err = document.getElementById('login-err');
    var g = document.getElementById('google-login-btn');
    var groups = box.querySelectorAll('.form-group');
    var loginBtn = box.querySelector('button[onclick="doLogin()"]');
    var divider = g && g.previousElementSibling;
    if (err) main.appendChild(err);
    if (g) {
      g.classList.add('df-team-gbtn');
      main.appendChild(g);
    }
    if (divider && divider !== loginBtn) { divider.className = 'df-team-or'; divider.removeAttribute('style'); main.appendChild(divider); }
    var pw = el('div', 'df-team-pwbox');
    Array.prototype.forEach.call(groups, function (n) { n.classList.add('df-team-f'); n.removeAttribute('style'); pw.appendChild(n); });
    if (loginBtn) { loginBtn.classList.add('df-team-loginbtn'); pw.appendChild(loginBtn); }
    main.appendChild(pw);
    main.appendChild(el('span', 'df-team-foothint', 'สมาชิกใหม่? ขอลิงก์ลงทะเบียนจาก PM ของทีม'));
    var aside = brandPanel(img, 'ระบบจัดการทีม', 'ยินดีต้อนรับกลับสู่<br>Design Flow', 'การลา · ออกกำลังกาย · สมาชิกทีม รวมไว้ในที่เดียว');
    box.parentNode.removeChild(box);
    shell(screen, aside, main);
  }

  function buildAuth() {
    try { buildRegistration(); } catch (e) { console.warn('[ui-v3-team] registration', e); }
    try { buildLogin(); } catch (e) { console.warn('[ui-v3-team] login', e); }
    try { regPreview(); } catch (e) { console.warn('[ui-v3-team] preview', e); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildAuth); else buildAuth();
})();
